# Kairo — what a user can actually do

A walkthrough of the whole product from the outside, screen by screen, click by
click. Two modes exist and they are not the same product: **Test Mode** is a
fixture-driven demo that needs nothing but a browser tab, **Live Mode** is your
real network reporting through a real sensor into a real database. Every
feature below says which mode it works in, and where a control looks real but
only records an intention, it says that too.

---

## 0. The two modes at a glance

| | Test Mode | Live Mode |
|---|---|---|
| Needs an account | No | Yes — the Live pill is disabled without a session |
| Where the data comes from | `frontend/src/lib/demo.ts` fixtures, generated in the browser | `GET /live` against Postgres, polled every 5 s |
| Starting state | 42 detections across 24 h, 7 of them critical, 3 offices, 8 sources | Empty. Nothing until a sensor reports |
| Traffic counter | A fake number that ticks up every 1.6 s | Sum of real per-minute flow counters, last 24 h |
| Survives a reload | Yes, in `sessionStorage` (a *new tab* starts clean) | Yes — it is in the database |
| Offices and sources | Invented by typing a name | Created as `Office › Network (CIDR) › Sensor`, each sensor with its own key |
| Triage | Changes a number in the tab | `PATCH /live/detections/:id`, plus an audit row that becomes a training label |
| Can be wrong about your network | It is not about your network | Yes — read §6 before you trust a verdict |

The two feeds are held in **separate buckets and never merged**. Switching to
Live does not wipe the demo, and switching back restores it exactly. That is
the whole point of the switch.

---

## 1. Before you sign in

`/` is a single scrolling document in seven parts: the hero, then **Signal
transformation** (packets → 78 columns → 30), **Detection**, **Investigation**,
**Test Mode**, **Network fabric** and **Research**. Nothing is gated, nothing
needs an account, and the figures quoted in it are read off the trained
artifact rather than written by hand.

`/login`, `/register`, `/forgot-password` and `/reset-password` all work.
Google sign-in is wired, and proxied through this origin so the whole flow
reads as one site: `/api/auth/google/start` → Google → `/auth/callback`. The
API's own hostname never appears in the address bar.

---

## 2. Creating the account

`/register` asks for four things:

| Field | Example | Why |
|---|---|---|
| **Organization** | `Sundar Textiles Pvt Ltd` | Appears on every alert and scopes everything in the console. Renameable later in Settings |
| Email | `ops@sundartextiles.in` | Your login |
| Password | — | Argon2 on the server |
| Confirm password | — | — |

One request creates the organisation and you as its owner, and hands back a
session. You land on `/dashboard` in **Test Mode**.

> The organisation name is asked for here on purpose. Ask for it later and
> every alert in between says "My Organization".

**Forgot the password?** `/forgot-password` emails a reset link;
`/reset-password?token=…` sets a new one and signs you straight in.

---

## 3. The frame around every page

Present on all eight console screens.

### The rail (left, desktop)

`01 Overview · 02 Threats · 03 Simulation · 04 Network · 05 Alerts · 06 Model ·
07 Reports`, then **Settings** pinned at the bottom. Below `lg` the same index
runs horizontally under the header. The active item gets a green dot and a
green number.

The last line of the rail is the honesty indicator:

- Test Mode → `FIXTURE DATA`
- Live Mode → `1 OF 1 LIVE` — live sensors out of total

### The scope bar (top)

`Sundar Textiles Pvt Ltd › ALL OFFICES` — the office picker is a native
`<select>`, so keyboard support, the mobile sheet and screen-reader labelling
come for free. **Choosing an office filters every page at once**: the Overview
headline, the timeline, Threats, Alerts and the Reports document all narrow to
it. The org name is the first thing dropped when the window is narrow.

### The mode switch (top right)

Two pills, `TEST` and `LIVE`. The dot next to the active one means something:

| Dot | Meaning |
|---|---|
| Green (Test) | Fixtures are running |
| Amber (Live) | Connecting, or connected and **no sensor has reported** |
| Green (Live) | At least one sensor reported inside the last two minutes |
| Rose (Live) | The live feed itself is failing — hover for the error |

With no session, `LIVE` is greyed out and its tooltip reads *"Sign in to
connect a network."* When a poll fails, Kairo **keeps the last good snapshot on
screen** and marks the feed stale rather than blanking the console.

---

## 4. Test Mode, screen by screen

Nothing here touches your network or the server. Use it to learn the console,
demo the product, or see what an attack looks like before one happens.

### 01 — Overview

```
Kairo Console // 01 — Overview
7 incidents still need you.
Across all offices, over the last 24 hours.
```

- **Status band** — Traffic, Threats, Critical, Risk Score. Critical turns rose
  above zero; the risk score is coloured by band.
- **Live Signal panel** (dark) — the **risk dial** on the left, a **waveform**
  on the right, headed `TEST MODE · FIXTURE FEED` with a `FLOWS / SECOND`
  figure. Both are decoration in this mode, and the header says so.
- **Attack mix** — a 6-pixel rule, not a pie, with one segment and one legend
  entry per family **that actually occurred**. A family with zero detections is
  not listed at all.
- **Attack timeline · 24 h** — one hairline per detection, positioned by age,
  height scaled by risk, critical ones at full opacity. **Click any tick** to
  open the investigation pane.
- **Recent detections** — the newest six, and a link to all of them.

### 02 — Threats

Every verdict, one row per classified flow window, with three filters that
compose:

- **Attack** — All, DDoS, DoS, Port Scan, Brute Force, Web Attack, Botnet
- **Severity** — all / critical (risk ≥ 88) / high (70–87) / low (< 70)
- **Confidence ≥ N%** — a slider, 0–99

The count on the right reads `18 of 42`, so you always know what the filter is
hiding. Clicking a row opens the investigation pane.

### The investigation pane (Overview, Threats, Network)

Slides in from the right, dims the page, closes on the backdrop or the ✕.

1. **Verdict** on the dark face — `CRITICAL · DDoS`, confidence to one decimal,
   risk out of 100, and a one-line evidence string.
2. **Where** — source, target, office, sensor, time.
3. **Important features** — the five flow statistics that drove the verdict, as
   bars. Real CICIDS2017 column names (`Fwd Packet Length Mean`,
   `Init_Win_bytes_forward`, …), never invented ones.
4. **Timeline** — five stages, first contact through to risk scoring.
5. **Kairo recommends** — e.g. *Block source · Rate-limit edge · Isolate
   target*. Clicking one moves the detection to **investigating**. Labelled
   **"Responses are recorded, not executed"** — Kairo never touches your
   firewall.
6. **Resolution** — acknowledged / resolved / false positive.

### 03 — Simulation

```
Feed it traffic. Watch it decide.
```

Pick an **office**, a **source**, and one of the **seven scenarios** (including
`Normal`), each showing its expected risk. Press **Simulate DDoS**.

A six-stage pipeline rail animates in order — Flow ingestion → Preprocessing →
ML model → Detection → Database → Dashboard, about 3.3 s in total — and **the
counters only move when the rail reaches "Dashboard"**, not a beat earlier.
Then the verdict card rises: class, confidence, risk,
`192.168.10.42 → 192.168.10.100`, the evidence line, and **Open in Threats**.

Every run appends to the **Run log** (last 8, timestamped). The rail carries a
`FIXTURE` badge. The new detection appears immediately on the Overview
timeline, in Threats, and — if risk ≥ 70 — at the top of the Alerts queue,
**pre-selected for you**.

> ⚠️ **Simulation writes to the Test bucket only.** Run it while Live Mode is
> active and the verdict card and run log still appear, but nothing reaches the
> console, because the console is showing your real feed. Switch to Test first.

### 04 — Network

One row per office: the source list, then **Threats / Open / Peak risk**.
Selecting a row also sets the global office scope.

Below it, a **topology diagram** on the dark face: the office fans out to its
sources, and the header reads either `ALL PATHS NOMINAL` in green or
`PORT SCAN ON ROUTER-01` in rose, with the hot path highlighted, the offending
flow named underneath, and a **Triage** link into Alerts.

### 05 — Alerts

Threats is the record; **Alerts is the queue** — only unresolved detections at
risk ≥ 70, which is what is actually worth a decision.

```
4 alerts waiting on a decision.
Across all offices. Closing an alert is not bookkeeping — your verdict
becomes a training label.
```

Six state filters with live counts: `Open · New · Acknowledged ·
Investigating · Resolved · False positive`. The queue reads as sentences —
*"Critical DDoS detected in Bhubaneswar Office."* — with time, sensor, source
and a risk number coloured by severity.

The decision panel on the right is sticky and offers:

- **Kairo recommends** — the per-family response list (recorded, not executed)
- **Decision** — the legal next states only. `new` can be acknowledged or
  investigated; `investigating` has no forward step but can still be closed.
  **Resolve** and **False positive** are always available.

### 06 — Model

```
It gets better every time you answer.
```

- **Deployed** — `v1.0-cascade`, `CICIDS2017 · 253,240 flows`, accuracy
  **99.9%**, macro-F1 **0.9945**, trained 2026-09-17. **These are read from the
  real trained artifact, in both modes.**
- **Gate 02 · stacked, weights fitted** — Random Forest 32%, Extra Trees 36%,
  XGBoost 32%. Fitted by the meta-learner, not hand-set. (Gate 01 is a single
  binary XGBoost and has no weight to draw.)
- **Per class** — precision / recall / F1 / support for all seven. Botnet is
  the weakest at 0.9746 F1 on 389 samples, and the table shows it.
- **What it looks at** — the cascade's own feature importances over the 30
  selected columns. `Bwd Packet Length Min` takes **47%** on its own: it is the
  gate's first split, and a flow with nothing coming back is most of what the
  gate needs to know.
- **Retraining pool** — the seed pool plus **your closed alerts**, counted
  separately in green as `FROM YOUR CONSOLE`, against a 25,000-flow threshold.
  That number moves when you triage, in either mode.
- **Candidate `v1.1-rc1 (not run)`** — a class-by-class F1 diff against what is
  deployed, three automatically derived gate findings, and **Promote / Keep**
  buttons. The tag says *not run* because it has not been trained: the buttons
  record a decision for the training service and change nothing today.

### 07 — Reports

A document, not a dashboard with an export button bolted on. It reads top to
bottom and **prints as it reads** — the rail and scope bar drop out of print.

- Period: **24 hours / 7 days / All**
- **CSV** download — `kairo-sundar-textiles-24hours.csv`, nine columns (time,
  attack, source, target, office, sensor, confidence, risk, status)
- **Print** — `window.print()`, so Save-as-PDF is your browser's
- **Summary in a sentence**: *"Kairo classified 42 threats in the organisation,
  7 of them critical. You closed 19, calling 3 a false positive."*
- Then: Threats / Critical / Closed / Mean confidence · attack mix · **Worst
  sources** (source, classified as, flows, peak risk) · **By office**

### Settings (Test Mode)

```
What Kairo is watching.
```

- **Coverage** — Offices / **Sources** / Detections. Sources turns amber at zero.
- **Organisation** — rename inline; saved to the tab.
- **Offices & sources** — numbered rows. Type a name → **Add office**. Each
  office carries dashed-outline pills: type into `Add source` and press Enter.
  ✕ removes a source; **Remove** deletes the office — *history is kept, and
  detections are not erased.*
- **Not here yet** — says plainly that nothing leaves the tab.

---

## 5. Live Mode — connecting a real network

Press **LIVE**. The console empties, because nothing has reported yet. Go to
Settings.

### Step 1 — Settings becomes the install wizard

```
Connect your network.
Offices, subnets and sensors. A detection is attributed to exactly this tree,
which is why it is built before anything is watched.
```

Same URL, same layout, same place the demo was — deliberately not a second
page. The Coverage strip now counts **Sensors** instead of Sources.

### Step 2 — Add an office

`Bhubaneswar`. → `POST /fleet/offices`

### Step 3 — Add a network under it

| Field | Example |
|---|---|
| Name | `Core VLAN` |
| CIDR | `10.20.0.0/16` |

→ `POST /fleet/offices/:id/networks`

The CIDR is what turns a verdict into *"the Bhubaneswar core VLAN is being
scanned"* rather than *"something happened somewhere."* A network with no
sensor shows, in amber: **`NO SENSOR — NOTHING IS BEING WATCHED HERE`**.

### Step 4 — Register a sensor

`Router-01`. → `POST /fleet/networks/:id/sensors`

The server mints `ksk_` + 32 random bytes and stores **only its SHA-256**. The
response is the one and only time the key exists in readable form, and the
panel says so:

> *Copy this now. Only a hash of the key is stored, so this is the one time it
> can be read — if it is lost, register a new sensor and revoke this one.*

A copy button is provided (the icon becomes a tick for 1.6 s), and the command
is ready to paste:

```sh
pip install scapy
export KAIRO_URL=https://api.kairo.example
export KAIRO_SENSOR_KEY=ksk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
sudo -E python agent.py --interface eth0
```

Labelled **`NEEDS ROOT — PACKET CAPTURE ALWAYS DOES`**. `-E` keeps the
environment across `sudo`; without it the agent exits and explains why. The
`setcap` alternative is in [`agent/README.md`](../agent/README.md).

### Step 5 — Run it where it can see the traffic

The agent sees what the interface sees, so placement is the whole job:

| Placement | Coverage |
|---|---|
| **Mirror / SPAN port** into a dedicated NIC | Best. Invisible to the traffic |
| **The gateway or router** itself | Everything entering and leaving the subnet |
| **A single host** | That host only. Fine for a pilot, not for an office |

Within seconds the sensor pill in Settings turns from amber to green and the
rail reads `1 OF 1 LIVE`. The panel re-reads the fleet whenever the dashboard's
own poll sees it change, so one screen never shows two answers.

### What the agent sends, and what it never sends

Per finished flow, one JSON object: the 5-tuple, the start time, the byte
count, and the 30 statistics the model was trained on.

**Never** payloads, hostnames, URLs, DNS names, usernames, certificates, or
anything about the host it runs on. `store=False` on the sniffer; nothing is
written to disk.

Batches of up to 100 flows every 10 s over HTTPS. A quiet site still checks in
every 30 s, so the console can tell *"nothing is happening"* from *"the sensor
is gone."* Unreachable Kairo → up to 5,000 flows are held, oldest dropped.

### What happens to a batch

```
agent → POST /ingest/flows   (Authorization: Bearer ksk_…)
        │
        ├─ same batch_id as last time? → answer yes again, no inference, done
        │
        ├─ classify() → the cascade: XGBoost gate, then the stacking namer
        │
        └─ one transaction:
             attacks    → one Detection row each (deduped on sensor + flow)
             every flow → per-minute FlowRollup counters (flows / attacks / bytes)
             the sensor → lastSeenAt, lastBatchId
```

Only attacks become rows. A million benign flows is 1,440 counter rows a day,
not a million detection rows — and the same batch at a quiet site writes one
increment and nothing else.

Retries are safe by construction. Replaying an identical batch answers
`{"accepted": 12, "attacks": 0, "duplicate": true}` and touches nothing.

### Step 6 — The console, now real

`GET /live` every 5 s returns the whole dashboard in one request — there is
nothing to reconcile, the snapshot simply replaces the previous one. Polling
faster cannot surface anything sooner: the agent flushes every 10 s and a flow
waits 15 s for its idle timeout.

What changes versus Test Mode:

| Screen | In Live Mode |
|---|---|
| Rail footer | `1 OF 1 LIVE` |
| **01** Live Signal header | `LIVE MODE · 1 OF 1 SENSORS` |
| **01** figure | `FLOWS ANALYSED · 24H — 27` — the real counter sum, not an invented rate |
| **01** risk score | The **worst thing still standing**, not an average. One critical among a hundred quiet flows is the number you need |
| **01/02** detections | Real verdicts, capped at 500 rows over 24 h, newest first |
| Investigation pane | Feature weights are **the model's own** for that flow |
| **04** Network | Your offices and your sensor names |
| **05** Alerts | Triage writes to the server, and an audit row records who decided what, when |
| **06** Model | `FROM YOUR CONSOLE` counts your real closed alerts |
| **07** Reports | Exports your real detections |
| Settings | The fleet tree, with key minting and revocation |

### Triage, and why it matters

Resolving an alert or calling it a false positive persists immediately
(optimistically on screen; the next poll is the authority, so a rejected write
corrects itself within five seconds) and writes a `DetectionEvent`. **That is a
labelled flow from your own network, and it is what the next model trains on.**
False positives are worth the most.

### Managing the fleet afterwards

- **Revoke a sensor** — the ✕ on its pill. Revoked, *not deleted*: the
  detections it already reported are evidence. Its key stops working instantly.
- **Delete a network or an office** — available in the tree.
- **Rename the organisation** — Settings, on blur rather than per keystroke (a
  keystroke would be a PATCH). `PATCH /fleet/org`. The URL slug is left alone on
  purpose: changing an identifier to match a display name is how links break.

---

## 6. What Live Mode actually detects — read this

The model scores **99.45% macro-F1** on held-out CICIDS2017 flows and **32%
cross-dataset**. Concretely:

- Traffic that resembles that benchmark is classified well.
- **A SYN flood is missed.** CICIDS2017's DDoS day used HTTP floods, and a
  60-byte SYN storm looks nothing like one.
- **Port scans** are recognised against port 80 and unreliably elsewhere,
  because that campaign targeted port 80.
- A scan is a pattern *across* flows. The model sees one flow at a time and
  structurally cannot count how many ports one source touched.

Treat Live Mode as a detector for traffic resembling that benchmark, not as a
guarantee — and triage everything, because triage is what closes the gap. The
same warning is printed in Settings under **What the model covers** and in
`agent/README.md`.

---

## 7. Things that look finished and are not

Stated here so nothing in the UI has to be taken on faith.

| Where | What |
|---|---|
| Investigation pane, Alerts | The one-line **evidence** string and the 5-step **timeline** are per-family canned text, not measured from your flow. The feature bars *are* real |
| **03** Simulation | Fixtures only, and its pipeline rail describes a *"weighted soft voting ensemble"* — the deployed model is a two-stage cascade |
| **05** Alerts, pane | *Responses are recorded, not executed.* Kairo never touches a firewall |
| **06** Model | `v1.1-rc1` has not been trained. Promote/Keep records a decision and nothing more. The seed retraining pool is a fixture |
| **07** Reports | The footer still says *fixture data* even in Live Mode |
| Landing page, Test Mode section | Lists five classes and some invented evidence strings; the model has seven |
| Permissions | One role. Per-user roles and SSO are not built |
| `/privacy`, `/terms`, `/security` | Linked from the register form, and 404 |
| Live feed transport | Polling, not server-sent events. SSE is the upgrade when a detection needs to arrive the instant it exists |

---

## 8. When it is not working

| Symptom | Cause |
|---|---|
| `LIVE` pill greyed out | No session. Sign in |
| Live dot amber, forever | No sensor has reported in the last two minutes. Is the agent running? |
| Live dot rose | The API or database is unreachable — hover the pill for the message. The last good snapshot stays on screen |
| `could not register: 401` | Wrong or revoked key. Register a new sensor |
| `packet capture needs root` | Run under `sudo -E`, or `setcap` once |
| Sensor is live, no detections | Normal. Benign flows become counters, not rows — check *flows analysed* is climbing |
| No packets at all | The interface cannot see the traffic. `sudo tcpdump -i eth0 -c 5` first; if that is empty, the problem is the mirror, not the agent |
| Simulation appears to do nothing | You are in Live Mode. Simulation is Test Mode only |
