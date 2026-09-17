# Kairo sensor agent

Watches one network interface and reports flow statistics to Kairo. It holds no
model and makes no decisions: it computes 30 numbers per flow and posts them.
Classification happens in Kairo, so a retrained model reaches every sensor at
once and you never redeploy this.

## Install

Python 3.10+ on a host that can see the traffic you care about.

```sh
pip install -r requirements.txt          # scapy
export KAIRO_URL=https://api.kairo.example
export KAIRO_SENSOR_KEY=ksk_...          # Console > Settings > Add sensor
sudo -E python agent.py --interface eth0
```

`-E` keeps the environment across `sudo`; without it the key is not there and
the agent exits with an explanation. Packet capture is privileged everywhere —
either run as root or grant the capability once and drop the `sudo`:

```sh
sudo setcap cap_net_raw,cap_net_admin=eip "$(readlink -f "$(which python3)")"
```

The key is per sensor. One host, one key; if you lose it, register a new sensor
in Settings and revoke the old one — Kairo stores only a hash and cannot give it
back.

### Where to run it

The agent sees what the interface sees, so placement is the whole job:

- **A mirror/SPAN port** on the switch, into a dedicated NIC. Best coverage,
  invisible to the traffic.
- **The gateway or router** itself, if you can run Python on it. Sees everything
  leaving and entering the subnet.
- **A single host**, for a pilot. Sees that host only. Fine for proving the
  pipeline, not for covering an office.

Register the sensor under the network whose CIDR it actually watches. That
mapping is what turns a detection into "the Bangalore DMZ is being scanned"
rather than "something happened somewhere".

### Running as a service

```ini
# /etc/systemd/system/kairo-agent.service
[Unit]
Description=Kairo sensor agent
After=network-online.target

[Service]
Environment=KAIRO_URL=https://api.kairo.example
Environment=KAIRO_SENSOR_KEY=ksk_...
Environment=KAIRO_INTERFACE=eth0
ExecStart=/usr/bin/python3 /opt/kairo/agent/agent.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

`chmod 600` the unit file: it contains the key.

## What leaves your network

Per finished flow, one JSON object:

- the 5-tuple — source IP and port, destination IP and port, protocol
- when it started, and its byte count
- the 30 statistics in `FEATURES` (durations, inter-arrival times, packet-length
  moments, TCP window and header sizes, active/idle periods)

**Never** payloads, hostnames, URLs, DNS names, usernames, certificates, or
anything about the host the agent runs on. Packets are counted and measured, not
stored — `store=False` on the sniffer, and nothing is written to disk.

Flows are batched (up to 100) and posted every 10 s over HTTPS with the sensor
key as a bearer token. A quiet site still checks in every 30 s so the console
can tell "nothing is happening" from "the sensor is gone".

## Knobs

Defaults match how the training data was captured. Changing them changes what
the model sees, so change them for a reason.

| Where | Name | Default | What it does |
|---|---|---|---|
| `agent.py` | `FLUSH_S` | 10 s | How often finished flows are posted. |
| `agent.py` | `BATCH` | 100 | Flows per request; the API caps at this. |
| `agent.py` | `HEARTBEAT_S` | 30 s | Presence when there is nothing to send. |
| `agent.py` | `MAX_PENDING` | 5000 | Backlog bound while Kairo is unreachable. Oldest are dropped. |
| `flow.py` | `IDLE_TIMEOUT_S` | 15 s | Silence before a flow is considered finished. |
| `flow.py` | `MAX_DURATION_S` | 120 s | A long-lived connection is cut and reported here. |
| `flow.py` | `ACTIVITY_GAP_US` | 5 s | Gap that separates an active period from an idle one. **Calibration:** this is CICFlowMeter's value and the model was trained against it. |
| `flow.py` | `DDOF` | 1 | Sample standard deviation, matching the Java extractor. |

`KAIRO_BPF` overrides the capture filter. The default is
`(tcp or udp) and not host <your Kairo host>` — the exclusion matters: without
it the agent measures its own uplink, which produces more reports, which
produces more traffic.

## Checks

```sh
python flow.py                # the extractor's self-check
python agent.py --selfcheck   # flow keying, the BPF, the backlog bound
```

`ml/tests/test_pipeline.py::test_agent_emits_exactly_the_selected_features`
asserts `FEATURES` here equals the model's selected columns. If that ever fails,
every batch this agent sends will be rejected.

## What it detects, honestly

The model scores 99.45% macro-F1 on held-out CICIDS2017 flows and 32%
cross-dataset. In practice:

- Traffic that resembles that benchmark is classified well.
- A SYN flood is **missed** — CICIDS2017's DDoS day used HTTP floods, and a
  60-byte SYN storm looks nothing like them.
- Port scans are recognised against port 80 and unreliably elsewhere, because
  that campaign targeted port 80.
- A scan is a pattern *across* flows. The model sees one flow at a time and
  structurally cannot count how many ports one source touched.

Triage everything the console shows you. A resolved or false-positive verdict is
a labelled flow from your network, and that is what closes the gap above.

## When it is not working

| Symptom | Cause |
|---|---|
| `could not register: 401` | Wrong or revoked key. Register a new sensor. |
| `could not reach ...` | `KAIRO_URL` or egress. The agent retries at 1 s, 3 s, 9 s, then drops the batch and says so. |
| `packet capture needs root` | Run under `sudo -E`, or `setcap` as above. |
| Sensor shows live, no detections | Normal. Benign flows become counters, not rows — check "flows analysed" is climbing. |
| No packets at all | The interface is not seeing the traffic. `sudo tcpdump -i eth0 -c 5` first; if that is empty, the problem is the mirror, not the agent. |
