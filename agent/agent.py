#!/usr/bin/env python3
"""The Kairo sensor agent.

Runs on the customer's network, watches one interface, and posts flow
statistics to Kairo. It holds no model and no thresholds: it computes the 30
columns in flow.py and sends them. Classification happens server-side, so
adding a site never means shipping a model to it, and a retrain reaches every
sensor at once without touching any of them.

    export KAIRO_URL=https://api.kairo.example
    export KAIRO_SENSOR_KEY=ksk_...
    sudo -E python agent.py --interface eth0

Root (or CAP_NET_RAW) is required — packet capture is a privileged operation
everywhere. Nothing else about the host is read, written or reported.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from flow import Flow

#: Matches MAX_FLOWS in api/src/model.ts. The service accepts 500, the API caps
#: at 100, and inference is ~140 ms regardless of batch size — so a bigger
#: batch buys latency, not throughput.
BATCH = 100

#: How often expired flows are swept and posted. Ten seconds is the worst-case
#: delay between a flow closing and the console showing it, on top of the
#: 15 s idle timeout in flow.py.
FLUSH_S = 10.0

#: Presence, when there is nothing to send. The API calls a sensor live if it
#: has reported within two minutes, so a quiet site must still say something.
HEARTBEAT_S = 30.0

#: Backoff between send attempts, in seconds. Three tries over 13 s covers a
#: deploy or a cold start; past that the batch is dropped and said so out loud.
#: Flow ids are stable, so a retry that does land is deduplicated server-side
#: rather than double-counted.
RETRIES = (1.0, 3.0, 9.0)

#: A bound on memory when Kairo is unreachable. Dropping the oldest pending
#: flows is better than an agent that OOMs the box it was installed to watch.
MAX_PENDING = 5_000


def _key(src: str, sport: int, dst: str, dport: int, proto: str) -> tuple:
    """A direction-agnostic flow key, so both halves of a conversation land on
    one Flow. Which half is *forward* is decided by whichever packet arrived
    first, not by this ordering."""
    a, b = (src, sport), (dst, dport)
    return (proto, a, b) if a <= b else (proto, b, a)


class Sender:
    """Owns the HTTP side. One connection's worth of state, no dependencies."""

    def __init__(self, base: str, key: str) -> None:
        self.base = base.rstrip("/")
        self.key = key

    def _post(self, path: str, payload: dict | None) -> dict:
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=body,
            method="POST" if body else "GET",
            headers={"authorization": f"Bearer {self.key}", "content-type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read() or b"{}")

    def identify(self) -> dict:
        """Called once at boot, so a wrong key fails in the first second
        instead of silently at the first flush — and it registers presence, so
        the console shows the sensor as live before any traffic arrives."""
        return self._post("/ingest", None)

    def send(self, flows: list[dict]) -> bool:
        # One id for the batch, held across every retry of it. The server keys
        # its "already did this" on exactly this value, so generating a fresh
        # one per attempt would defeat the whole mechanism.
        batch_id = uuid.uuid4().hex
        for attempt, wait in enumerate((*RETRIES, None)):
            try:
                r = self._post("/ingest/flows", {"batch_id": batch_id, "flows": flows})
                print(f"sent {r['accepted']} flows, {r['attacks']} attack(s)", flush=True)
                return True
            except urllib.error.HTTPError as e:
                # 4xx is our bug — a malformed feature, a revoked key — and no
                # amount of retrying fixes it. 429 is the exception: that one
                # is a request to wait, which is what the backoff already does.
                if 400 <= e.code < 500 and e.code != 429:
                    print(f"dropped {len(flows)} flows: {e.code} {e.read()[:200]!r}", file=sys.stderr)
                    return False
                why = f"{e.code}"
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                why = str(e)
            if wait is None:
                print(f"dropped {len(flows)} flows after {attempt} tries: {why}", file=sys.stderr)
                return False
            print(f"retrying in {wait:.0f}s ({why})", file=sys.stderr)
            time.sleep(wait)
        return False


class Agent:
    def __init__(self, sender: Sender) -> None:
        self.sender = sender
        self.flows: dict[tuple, Flow] = {}
        # ponytail: one lock over the whole table. The capture thread appends
        # and the flush thread sweeps; at interface rates the critical section
        # is a dict lookup. Shard by key hash if a single sensor ever needs
        # more than one capture thread.
        self.lock = threading.Lock()
        self.pending: list[dict] = []
        self.last_contact = 0.0
        self.stop = threading.Event()

    def on_packet(self, pkt) -> None:
        from scapy.layers.inet import IP, TCP, UDP
        from scapy.layers.inet6 import IPv6

        ip = pkt.getlayer(IP) or pkt.getlayer(IPv6)
        if ip is None:
            return
        seg = pkt.getlayer(TCP) or pkt.getlayer(UDP)
        if seg is None:
            return

        tcp = seg.name == "TCP"
        ts = float(pkt.time)
        payload = len(seg.payload)
        wire = len(pkt)
        # TCP data offset is in 32-bit words; UDP has no window and a header
        # that never varies, so both those columns stay at their -1/0 encoding.
        window = int(seg.window) if tcp else -1
        header = int(seg.dataofs) * 4 if tcp else 0
        fin_or_rst = bool(int(seg.flags) & 0x05) if tcp else False

        k = _key(ip.src, int(seg.sport), ip.dst, int(seg.dport), seg.name)
        with self.lock:
            f = self.flows.get(k)
            if f is None:
                f = Flow(
                    src=ip.src,
                    sport=int(seg.sport),
                    dst=ip.dst,
                    dport=int(seg.dport),
                    protocol=seg.name,
                    first=ts,
                )
                self.flows[k] = f
            f.add(ts, (ip.src, int(seg.sport)) == (f.src, f.sport), payload, wire, window, header, fin_or_rst)

    def sweep(self, now: float, force: bool = False) -> None:
        """Move finished flows out of the table and into the send queue."""
        with self.lock:
            done = [k for k, f in self.flows.items() if force or f.expired(now)]
            reports = [self.flows.pop(k).report() for k in done]
        if not reports:
            return
        self.pending.extend(reports)
        if len(self.pending) > MAX_PENDING:
            dropped = len(self.pending) - MAX_PENDING
            self.pending = self.pending[-MAX_PENDING:]
            print(f"backlog full, dropped {dropped} oldest flows", file=sys.stderr)

    def flush(self) -> None:
        while self.pending:
            batch, self.pending = self.pending[:BATCH], self.pending[BATCH:]
            self.sender.send(batch)
            self.last_contact = time.time()

    def run(self, iface: str | None, bpf: str) -> None:
        from scapy.sendrecv import AsyncSniffer

        who = self.sender.identify()
        print(f"sensor {who['sensor']} on {who['network']} ({who['cidr']})", flush=True)
        self.last_contact = time.time()
        print(f"capturing on {iface or 'default'}: {bpf}", flush=True)

        sniffer = AsyncSniffer(iface=iface, filter=bpf, prn=self.on_packet, store=False)
        sniffer.start()
        try:
            while not self.stop.wait(FLUSH_S):
                self.sweep(time.time())
                self.flush()
                if time.time() - self.last_contact > HEARTBEAT_S:
                    try:
                        self.sender.identify()
                        self.last_contact = time.time()
                    except (urllib.error.URLError, OSError) as e:
                        print(f"heartbeat failed: {e}", file=sys.stderr)
        except KeyboardInterrupt:
            pass
        finally:
            # Report what is in hand rather than losing it. A flow cut short is
            # still a flow, and an operator stopping the agent mid-incident
            # wants the last minute, not a clean exit.
            print("stopping, flushing open flows", flush=True)
            sniffer.stop()
            self.sweep(time.time(), force=True)
            self.flush()


def default_bpf(url: str) -> str:
    """TCP and UDP, minus our own uplink.

    Without the exclusion the agent classifies its own reports, which produces
    more reports — a loop that looks like a traffic spike and is in fact the
    sensor talking to itself.
    """
    host = urllib.parse.urlparse(url).hostname
    base = "tcp or udp"
    return f"({base}) and not host {host}" if host else base


def main() -> int:
    p = argparse.ArgumentParser(description="Kairo sensor agent")
    p.add_argument("--interface", "-i", default=os.getenv("KAIRO_INTERFACE"))
    p.add_argument("--url", default=os.getenv("KAIRO_URL", "http://localhost:8000"))
    p.add_argument("--key", default=os.getenv("KAIRO_SENSOR_KEY", ""))
    p.add_argument("--filter", dest="bpf", default=os.getenv("KAIRO_BPF"))
    args = p.parse_args()

    if not args.key:
        print(
            "No sensor key. Create a sensor in Settings > Network, then:\n"
            "  export KAIRO_SENSOR_KEY=ksk_...",
            file=sys.stderr,
        )
        return 1

    agent = Agent(Sender(args.url, args.key))
    try:
        agent.run(args.interface, args.bpf or default_bpf(args.url))
    except urllib.error.HTTPError as e:
        print(f"could not register: {e.code} {e.read()[:200]!r}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"could not reach {args.url}: {e}", file=sys.stderr)
        return 1
    except PermissionError:
        print("packet capture needs root: try sudo -E python agent.py", file=sys.stderr)
        return 1
    return 0


def demo() -> None:
    """The two bits of logic here that are not plumbing."""
    # Both directions of one conversation must hash to one flow.
    assert _key("10.0.0.1", 5, "10.0.0.2", 80, "TCP") == _key("10.0.0.2", 80, "10.0.0.1", 5, "TCP")
    # Different protocols on the same endpoints must not.
    assert _key("10.0.0.1", 5, "10.0.0.2", 80, "TCP") != _key("10.0.0.1", 5, "10.0.0.2", 80, "UDP")

    assert default_bpf("https://api.kairo.example") == "(tcp or udp) and not host api.kairo.example"

    # The backlog bound keeps the newest, because the oldest flows are the ones
    # whose detection has already missed its moment.
    a = Agent.__new__(Agent)
    a.lock, a.flows, a.pending = threading.Lock(), {}, list(range(MAX_PENDING + 10))
    f = Flow(src="10.0.0.1", sport=1, dst="10.0.0.2", dport=80, protocol="TCP", first=0.0)
    f.add(0.0, True, 0, 60, 1024, 20, fin_or_rst=True)
    a.flows[("TCP", ("10.0.0.1", 1), ("10.0.0.2", 80))] = f
    a.sweep(now=1.0)
    assert not a.flows, "a finished flow must leave the table"
    assert len(a.pending) == MAX_PENDING
    assert a.pending[-1]["source_ip"] == "10.0.0.1", "the new flow is at the newest end"
    print("agent.py: ok")


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        demo()
    else:
        raise SystemExit(main())
