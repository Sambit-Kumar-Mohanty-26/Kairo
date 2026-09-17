"""Packets in, the model's 30 features out.

This is the whole reason an agent exists. Stock NetFlow and IPFIX supply about
seven of the thirty columns the cascade was trained on — the rest
(`Init_Win_bytes_*`, `min_seg_size_forward`, every IAT standard deviation, the
active/idle split) need per-packet visibility, so nothing a router exports on
its own can produce them. What leaves the customer's network is this: thirty
floats and a five-tuple. Never a payload, never a packet.

Deliberately free of scapy, so the arithmetic can be tested without a capture
device. `agent.py` feeds it tuples; `demo()` at the bottom feeds it tuples too.
"""

from __future__ import annotations

import datetime
import statistics
import uuid
from dataclasses import dataclass, field

#: The model's own column order, from ml/artifacts/selection.json. A missing
#: feature is a hard 422 from the service rather than a zero-filled guess, so
#: this list and that file have to agree exactly —
#: ml/tests/test_pipeline.py::test_agent_emits_exactly_the_selected_features
#: is what keeps them agreeing.
FEATURES = [
    "Packet Length Mean",
    "Packet Length Variance",
    "Init_Win_bytes_backward",
    "Fwd Packet Length Max",
    "Bwd Packet Length Max",
    "Init_Win_bytes_forward",
    "Fwd Packet Length Mean",
    "Flow Duration",
    "Destination Port",
    "Bwd Packets/s",
    "Fwd IAT Mean",
    "Fwd Packets/s",
    "Flow Packets/s",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Fwd IAT Std",
    "Bwd IAT Total",
    "Bwd IAT Mean",
    "min_seg_size_forward",
    "Bwd Packet Length Min",
    "Bwd IAT Std",
    "Fwd IAT Min",
    "Bwd IAT Min",
    "Idle Min",
    "Min Packet Length",
    "Flow IAT Min",
    "Fwd Packet Length Min",
    "Active Min",
    "Active Mean",
    "Active Max",
]

#: A gap longer than this splits a flow into an active period and an idle one.
#: CICFlowMeter's own 5 s, in microseconds — and it is a calibration knob, not
#: a constant of nature: the training set was labelled with this value, so
#: changing it changes what the model sees without changing the model.
ACTIVITY_GAP_US = 5_000_000

#: CICFlowMeter computes its standard deviations with Apache commons-math,
#: which is the sample form (n-1). Matching it matters: on a three-packet flow
#: the population form reads ~18% lower, and the model was trained on the other
#: one. The other half of the same knob.
DDOF = 1

#: Closing rules. A flow the sensor is still holding is a detection that has
#: not happened yet, so these bound latency as much as memory.
IDLE_TIMEOUT_S = 15.0
MAX_DURATION_S = 120.0


def _mean(xs: list[float]) -> float:
    return statistics.fmean(xs) if xs else 0.0


def _std(xs: list[float]) -> float:
    # One sample has no spread to report, and statistics.stdev raises on it.
    return statistics.stdev(xs) if len(xs) > DDOF else 0.0


def _iats(ts: list[float]) -> list[float]:
    """Inter-arrival times in microseconds, which is the unit CICIDS2017 uses
    for every duration. Seconds here would be off by a factor of a million and
    still look entirely plausible on a dashboard."""
    return [(b - a) * 1e6 for a, b in zip(ts, ts[1:])]


def _iso(epoch: float) -> str:
    return datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).isoformat()


@dataclass
class Flow:
    """One bidirectional conversation, accumulated packet by packet.

    Forward is whichever direction sent the first packet — not whichever has
    the lower port. On a SYN that is the client, which is what the training set
    means by forward.
    """

    src: str
    sport: int
    dst: str
    dport: int
    protocol: str
    first: float
    id: str = field(default_factory=lambda: uuid.uuid4().hex)

    fwd_ts: list[float] = field(default_factory=list)
    bwd_ts: list[float] = field(default_factory=list)
    fwd_len: list[float] = field(default_factory=list)
    bwd_len: list[float] = field(default_factory=list)
    #: Every packet in arrival order, both directions, for the flow-level stats.
    all_ts: list[float] = field(default_factory=list)
    all_len: list[float] = field(default_factory=list)
    #: On-wire bytes. Not a feature — it is what makes the console's traffic
    #: counter a real number rather than a packet count.
    bytes: int = 0

    init_win_fwd: int = -1
    init_win_bwd: int = -1
    min_seg_fwd: int = 0
    last: float = 0.0
    #: FIN or RST seen. The flow is over; nothing is gained by waiting 15 s.
    finished: bool = False

    def add(
        self,
        ts: float,
        forward: bool,
        payload: int,
        wire: int,
        window: int,
        header: int,
        fin_or_rst: bool = False,
    ) -> None:
        self.last = ts
        self.bytes += wire
        self.all_ts.append(ts)
        self.all_len.append(payload)
        if forward:
            self.fwd_ts.append(ts)
            self.fwd_len.append(payload)
            if self.init_win_fwd < 0:
                self.init_win_fwd = window
            if header:
                self.min_seg_fwd = header if not self.min_seg_fwd else min(self.min_seg_fwd, header)
        else:
            self.bwd_ts.append(ts)
            self.bwd_len.append(payload)
            if self.init_win_bwd < 0:
                self.init_win_bwd = window
        if fin_or_rst:
            self.finished = True

    def expired(self, now: float) -> bool:
        return self.finished or now - self.last > IDLE_TIMEOUT_S or now - self.first > MAX_DURATION_S

    def _active_idle(self) -> tuple[list[float], list[float]]:
        """Split the flow into bursts and the silences between them.

        A port scan is a hundred tiny bursts with nothing between; a download
        is one long burst. That difference is four of the thirty columns.

        A period is recorded at a gap boundary and nowhere else — the trailing
        burst is deliberately dropped, which is why a flow with no gap at all
        reports zero for all four columns rather than its own duration. That
        is CICFlowMeter's behaviour, and it is checked rather than assumed:
        `Active Mean > 0` holds for 11,803 of the first 40,001 rows of
        Monday-WorkingHours and `Idle Min > 0` for 11,823 — the two track each
        other because neither exists without the other. Appending the trailing
        burst would have put a value in all 40,001, i.e. in 70% of flows the
        model would see a number the training set never carried.
        """
        active: list[float] = []
        idle: list[float] = []
        start = prev = self.all_ts[0]
        for t in self.all_ts[1:]:
            gap = (t - prev) * 1e6
            if gap > ACTIVITY_GAP_US:
                active.append((prev - start) * 1e6)
                idle.append(gap)
                start = t
            prev = t
        return active, idle

    def features(self) -> dict[str, float]:
        dur_us = (self.last - self.first) * 1e6

        def per_s(n: int) -> float:
            # A single-packet flow has no duration, and dividing by it gives
            # inf — which serialises to JSON as `null` and reaches the model as
            # a crash rather than a verdict.
            return n / (dur_us / 1e6) if dur_us > 0 else 0.0

        flow_iat, fwd_iat, bwd_iat = _iats(self.all_ts), _iats(self.fwd_ts), _iats(self.bwd_ts)
        active, idle = self._active_idle()

        f = {
            "Destination Port": float(self.dport),
            "Flow Duration": dur_us,
            "Flow Packets/s": per_s(len(self.all_ts)),
            "Fwd Packets/s": per_s(len(self.fwd_ts)),
            "Bwd Packets/s": per_s(len(self.bwd_ts)),
            "Packet Length Mean": _mean(self.all_len),
            # Variance, not standard deviation — a different column, and the
            # one selection kept.
            "Packet Length Variance": (
                statistics.variance(self.all_len) if len(self.all_len) > DDOF else 0.0
            ),
            "Min Packet Length": min(self.all_len, default=0.0),
            "Fwd Packet Length Max": max(self.fwd_len, default=0.0),
            "Fwd Packet Length Min": min(self.fwd_len, default=0.0),
            "Fwd Packet Length Mean": _mean(self.fwd_len),
            # 0 when nothing came back, not -1: that is the single heaviest
            # column in the model at 47% of the weight, and a target that never
            # answered is exactly what it is reading.
            "Bwd Packet Length Max": max(self.bwd_len, default=0.0),
            "Bwd Packet Length Min": min(self.bwd_len, default=0.0),
            "Flow IAT Mean": _mean(flow_iat),
            "Flow IAT Std": _std(flow_iat),
            "Flow IAT Min": min(flow_iat, default=0.0),
            "Fwd IAT Mean": _mean(fwd_iat),
            "Fwd IAT Std": _std(fwd_iat),
            "Fwd IAT Min": min(fwd_iat, default=0.0),
            "Bwd IAT Total": sum(bwd_iat),
            "Bwd IAT Mean": _mean(bwd_iat),
            "Bwd IAT Std": _std(bwd_iat),
            "Bwd IAT Min": min(bwd_iat, default=0.0),
            # -1 for UDP, which has no window. The training set encodes it the
            # same way, so this is a value the model has seen rather than a
            # sentinel it has to interpret.
            "Init_Win_bytes_forward": float(self.init_win_fwd),
            "Init_Win_bytes_backward": float(self.init_win_bwd),
            "min_seg_size_forward": float(self.min_seg_fwd),
            "Active Min": min(active, default=0.0),
            "Active Mean": _mean(active),
            "Active Max": max(active, default=0.0),
            "Idle Min": min(idle, default=0.0),
        }
        assert set(f) == set(FEATURES), "feature set drifted from selection.json"
        return f

    def report(self) -> dict:
        """The wire shape POST /ingest/flows takes."""
        return {
            "id": self.id,
            "started_at": _iso(self.first),
            "source_ip": self.src,
            "source_port": self.sport,
            "target_ip": self.dst,
            "target_port": self.dport,
            "protocol": self.protocol,
            "bytes": self.bytes,
            "features": self.features(),
        }


def demo() -> None:
    """The arithmetic, checked without a network card.

    Three forward packets a second apart, one reply, then ten seconds of
    silence and a fifth — so the active/idle split has something to find.
    """
    f = Flow(src="10.0.0.5", sport=51234, dst="10.0.0.9", dport=443, protocol="TCP", first=1000.0)
    #     ts       fwd    payload  wire   win     hdr
    f.add(1000.0, True, 0, 74, 64240, 32)
    f.add(1000.5, False, 0, 74, 65535, 32)
    f.add(1001.0, True, 100, 154, 64240, 20)
    f.add(1002.0, True, 200, 254, 64240, 20)
    f.add(1012.0, True, 300, 354, 64240, 20)

    v = f.features()
    assert set(v) == set(FEATURES), sorted(set(FEATURES) ^ set(v))
    assert v["Destination Port"] == 443.0
    assert v["Flow Duration"] == 12_000_000.0, v["Flow Duration"]
    assert abs(v["Flow Packets/s"] - 5 / 12) < 1e-9, v["Flow Packets/s"]
    assert v["Init_Win_bytes_forward"] == 64240.0
    assert v["Init_Win_bytes_backward"] == 65535.0
    # Smallest TCP header seen forward: the handshake carried options, the rest
    # did not.
    assert v["min_seg_size_forward"] == 20.0
    # One reply, so no backward inter-arrival time exists at all.
    assert v["Bwd IAT Total"] == 0.0 and v["Bwd IAT Std"] == 0.0
    assert v["Bwd Packet Length Max"] == 0.0
    # The ten-second gap is the only one over the threshold, so there is one
    # active period (1000.0 to 1002.0) and one idle. The burst after the gap
    # is the trailing one and is not recorded — see _active_idle.
    assert v["Idle Min"] == 10_000_000.0, v["Idle Min"]
    assert v["Active Min"] == v["Active Max"] == 2_000_000.0, (v["Active Min"], v["Active Max"])
    # active + idle accounts for the flow up to the last burst, never past it:
    # the identity the real CSVs satisfy to within a tenth of a percent.
    assert v["Active Max"] + v["Idle Min"] <= v["Flow Duration"]

    # No gap at all means all four columns read zero, not the duration — which
    # is what 70% of real rows look like.
    quiet = Flow(src="10.0.0.1", sport=2, dst="10.0.0.2", dport=80, protocol="TCP", first=0.0)
    for i in range(6):
        quiet.add(i * 0.5, i % 2 == 0, 500, 560, 64240, 20)
    q = quiet.features()
    assert q["Flow Duration"] == 2_500_000.0
    assert q["Active Max"] == q["Active Mean"] == q["Active Min"] == q["Idle Min"] == 0.0
    assert f.bytes == 74 + 74 + 154 + 254 + 354
    # Sample, not population: pvariance would read 12_800 on this flow.
    assert v["Packet Length Variance"] == statistics.variance([0, 0, 100, 200, 300])

    # A one-packet flow must not divide by zero.
    lone = Flow(src="10.0.0.5", sport=1, dst="10.0.0.1", dport=53, protocol="UDP", first=5.0)
    lone.add(5.0, True, 40, 68, -1, 0)
    w = lone.features()
    assert w["Flow Packets/s"] == 0.0 and w["Flow IAT Std"] == 0.0
    assert w["Init_Win_bytes_backward"] == -1.0
    assert w["Active Mean"] == 0.0 and w["Idle Min"] == 0.0
    print("flow.py: ok")


if __name__ == "__main__":
    demo()
