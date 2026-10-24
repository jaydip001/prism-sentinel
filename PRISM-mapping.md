# PRISM-mapping — how PRISM Sentinel maps to prismxlabs.com

**PRISM's positioning (from the site):** *"PRISM links filings, electricity use, hiring and other alternative data to Indian listed companies, so you see what's changing — and why — before results land."*

**PRISM Sentinel is a local, offline, reproducible slice of that thesis.** It is not a networked research platform; it is the *reference implementation* of the same idea you can run on a laptop with Node + (optionally) Python and no internet. Every PRISM claim maps to a concrete feature here.

## The thesis, in one line

> Alternative data (filings, factory power, on-site headcount, hiring, supply-chain) **leads** reported financials. If you watch those channels, you can read a company's trajectory *before* the quarterly result is published. PRISM Sentinel demonstrates exactly that, deterministically and offline, on Indian public-market tickers.

## Feature → PRISM-thesis mapping

| PRISM thesis element | Where PRISM Sentinel realizes it |
|---|---|
| **"Links filings … to Indian listed companies"** | `filings` channel in `data/radar.json` + `data/sample-signals.csv`. Live stand-in: SEBI e-filing / BSE-NSE announcement RSS (see README → "Where live data would plug in"). |
| **"…electricity use…"** | `factory-power` channel (MWh, current vs prior, z, direction, strength) **and** the dedicated Python pulse engine (`engines/pulse_engine.py` → `data/radar.pulse.json`) that computes a trailing-window z-score on the power feed. Live stand-in: CERC / MoP utilization + DISCOM substation demand. |
| **"…hiring …"** | `hiring-social` channel (open-roles velocity). A surge in operator roles is the classic pre-capacity-expansion tell. Live stand-in: consented job-board / social aggregators. |
| **"…and other alternative data"** | `employee-geolocations` (consented on-site headcount composite) and `supply-chain` (lead-time / input-availability index) — the two channels beyond the site's three examples. |
| **"…so you see what's changing"** | Per-channel **current vs prior-period**, **z-score vs trailing**, **direction** (up/flat/down), and **strength**. The composite **pulse 0–100** collapses all five into one ranked number. |
| **"…and why"** | The **briefs** (`data/briefs/<T>.json`, `brief_text`) and the narrative sample (`data/sample-radar.json`) — deterministic, template-rendered explanations of *why* the channels are moving, with event flags and top divergences. This is the "why" layer PRISM's research does; here it's fully reproducible. |
| **"…before results land"** | The whole radar is a **pre-results** instrument: it reads activity (power, headcount, filings cadence, hiring, lead-times), which leads the reported P&L. Event flags like `capacity-expansion` / `order-book-upturn` name the *upcoming* driver. |
| **Indian public markets** | NIFTY-50 / BSE-500 style tickers (`TITAN`, `ITC`, `RELIANCE`, `HDFCBANK`…), universe metadata in `data/universe/*.json`, Indian ISINs on the narrative records. |

## The "why" layer, concretely (the story records)

`data/sample-radar.json` is the demo's narrative spine. Take the lead record, **CGP — Crompton Greaves (DEMO)**:

- **filings** 5 → 9 (z **+0.90**) — a capex plant-registration pattern ⇒ *filings-acceleration*
- **factory-power** 11,200 → 15,480 MWh (**+38%**, z **+0.71**) — the line is running hot before revenue shows up
- **on-site headcount** 3.62k → 3.94k (**+9%**, z **+0.30**) — new shifts, not HQ seats
- **hiring** 88 → 128 open roles (**+45%**, z **+0.58**) — operator-heavy = capacity build
- **supply-chain** lead-time index 34 → 21 (z **−0.52**) — inputs tightening *as* orders expand

**The brief's read:** *"capacity expansion ahead of order-book upturn — power up + supply-chain tight + capex filings is the signature."* Composite **pulse 82/100**, sentiment **+0.71/10**, and an explicit **watch item: Q2 energy intensity** (confirm vs roll-back). That is the PRISM "see what's changing, and why, before results land" argument, encoded as a deterministic, inspectable record.

The other three records in the file (TTAN moderate-momentum, AIA order-book upturn, DLF cooling) show the *other* sides of the same instrument, so a reader sees the pulse scale is meaningful rather than all-hot.

## What is deliberately NOT in the demo

- **No network, no live scrape.** PRISM's production value is in the live, consented feeds; the demo *documents* those plug-in points (README table) but ships with synthetic CSVs so it's reproducible and sandbox-safe.
- **No model-based reasoning.** The "why" text is template-rendered from the channel deltas, not LLM output — so it's byte-deterministic and auditable. A live build can layer a research model's *cited* narrative on the same schema.
- **Placeholder universes.** The NIFTY-50 / BSE-500 lists are static reference sets; anything not covered by the demo signals resolves to `null` + `"insufficient data"` rather than being guessed at.

## One-sentence tie-back

> **PRISM = the live alternative-data platform; PRISM Sentinel = the offline, reproducible proof that you can link filings + power + hiring + geo + supply-chain into a pre-results "pulse" for Indian listed companies — the same "what's changing, and why" question, minus the network.**
