# PRISM Sentinel

**A fully local, zero-dependency alternative-data "company pulse" radar for NIFTY-50 / BSE-500 style Indian listed companies — the pre-results layer of PRISM's thesis you can run on a laptop.**

## What this is

PRISM (https://prismxlabs.com/) builds an "AI-native research & intelligence platform for Indian public markets" that **links filings, electricity use, hiring and other alternative data to Indian listed companies, so you see what is changing — and why — before results land**. PRISM Sentinel is a self-contained slice of exactly that thesis:

- **Five alternative channels per company**: `filings` · `factory-power` · `employee-geolocations` · `hiring-social` · `supply-chain`
- **Per channel**: current value vs prior-period value, z-score vs trailing window, direction, strength
- **Per company**: composite **pulse 0–100**, sentiment, event flags (`capacity-expansion`, `order-book-upturn`, `filings-acceleration`, …), top divergences, confidence + data-quality notes
- **The "why" layer**: deterministic, template-rendered **briefs** that explain *why* a company's channels are moving the way they are

**What makes it cool:**

1. **Offline-first** — everything (engines, UI, build) runs with no network. Node 18+ stdlib and Python 3.8+ stdlib only; **zero `npm install`, zero `pip install`**, no CDN, no external fonts.
2. **Dual deterministic engines** — a Node radar engine and a Python pulse engine (with a Node fallback that computes the same pulse math) that are fully deterministic on the demo CSVs: same input → byte-identical output. No `Date.now()`, no `Math.random()` in any workflow script.
3. **Self-contained, buildable UI** — a dark "quant terminal" (`index.html` + `app.js` + `styles.css`, vanilla JS/CSS) that loads `data/*.json` via `fetch()` over HTTP **and** works from `file://`: `node scripts/inline.js` produces `build/build.html`, a single-file bundle with all data inlined under `window.__INLINED_DATA__`.

> **Demo data disclaimer.** All numbers in `data/samples/`, `data/radar*.json` and the briefs are **synthetic/illustrative**, labelled DEMO. Nothing here is sourced from any real company, regulator or utility, and nothing is investment advice.

---

## Quick Start

Prerequisites: **Node 18+** (engines & UI). **python3 3.8+** is optional — if absent, the pulse step automatically degrades to the Node fallback engine (identical math).

```bash
# 0. (optional) regenerate the radar from the demo CSVs — deterministic
node engine/index.js radar        # -> data/radar.json, data/signals.csv, data/briefs/*.json

# 1. build the self-contained offline bundle
node scripts/inline.js            # -> build/build.html (all data inlined)

# 2. open the terminal
#    • offline single file (no server):   open build/build.html
#    • or a local static server:         node server.js   # -> http://localhost:3000

# 3. pulse engine (power feed). Use python3 if present, else Node fallback:
python3 engines/pulse_engine.py --csv data/samples/electricity.csv --out data/radar.pulse.json
#    (equivalent, and auto-falls-back to Node when python3 is missing:)
node scripts/engine-dispatch.js pulse
```

Then open `build/build.html` (double-click, works from `file://`), or run `node server.js` and browse to `http://localhost:3000`.

### COMMAND CONTRACT

The exact command surface. Every path referenced here exists and was verified by running these commands:

| Key | Command | What it does |
|-----|---------|--------------|
| **start** | `node server.js` | zero-dep static server on `http://localhost:3000` (pass a port: `node server.js 3001`) |
| **radar** | `node engine/index.js radar` | writes `data/radar.json`, `data/signals.csv`, `data/briefs/<TICKER>.json`, `data/briefs.json` |
| **all** | `node engine/index.js all` | `radar` **plus** nifty50 + bse500 universe → `data/radar.universe.json` |
| **pulse** | `python3 engines/pulse_engine.py --csv data/samples/electricity.csv --out data/radar.pulse.json` | Python pulse engine; `node scripts/engine-dispatch.js pulse` auto-falls-back to Node when python3 is missing/broken |
| **offline build** | `node scripts/inline.js` | produces `build/build.html` with all `data/*.json` inlined (`window.__INLINED_DATA__`) |

Universe sub-commands also exist: `node engine/index.js nifty50` and `node engine/index.js bse500`.

---

## Architecture

```
   DEMO INPUTS (synthetic CSVs)                     ENGINES (deterministic, stdlib-only, offline)
 ┌──────────────────────────────────┐            ┌────────────────────────────────────────────┐
 │ data/sample-signals.csv          │            │ Node radar engine                          │
 │   ticker,company,channel,        │  CSV  ───▶ │   node engine/index.js radar|all           │
 │   period,current,prior,strength  │            │   · aggregate 5 channels per company       │
 │ data/samples/*.csv               │            │   · pulse 0-100 · flags · divergences     │
 │   electricity / filings /        │            │ Python pulse engine (optional)             │
 │   geolocations (power/headcount) │  CSV  ───▶ │   python3 engines/pulse_engine.py          │
 └──────────────────────────────────┘            │   └ Node fallback engines/fallback.js      │
                                                 │     (auto-selected by scripts/            │
   UNIVERSE METADATA                            │      engine-dispatch.js when python3       │
 ┌──────────────────────────────────┐            │      is missing/broken)                    │
 │ data/universe/nifty50.json       │  JSON ───▶ │                                            │
 │ data/universe/bse500.json        │            │                                            │
 └──────────────────────────────────┘            │                                            │
                                                 ▼                                            ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 │ ARTIFACTS (all written to data/, all deterministic)                                        │
 │   data/radar.json          composite pulse per company + per-channel current/prior/z/dir/  │
 │   data/signals.csv         normalized channel signal table                                  │
 │   data/briefs/<T>.json     top-5 template-rendered briefs        +  data/briefs.json       │
 │   data/radar.universe.json nifty50 + bse500 pulse map (null + "insufficient data" where    │
 │   data/radar.pulse.json     absent; computed where sample-signals cover the ticker)        │
 │   data/sample-radar.json   hand-authored rich narrative sample (e.g. CGP story)            │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 │ UI  —  index.html + app.js + styles.css (vanilla, dark quant-terminal, zero deps)          │
 │                                                                                          │
 │   data source resolution, in order:                                                       │
 │     1. window.__INLINED_DATA__  → build/build.html (made by node scripts/inline.js)        │
 │     2. fetch("data/*.json")     → served by node server.js (or any static host)           │
 │   file:// blocks fetch → the offline bundle (build.html) is the intended zero-server path  │
 └────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow in one line:** CSVs / universe JSONs → engines (Node radar + Python/Node-fallback pulse) → `data/*.json` → UI (via `fetch()` over HTTP **or** inlined into a single-file `build/build.html`).

---

## Data Schema Reference

All artifacts live under `data/` and are regenerated deterministically. `schema_version` is stable; engines never mutate inputs.

### `data/radar.json` (composite pulse radar)
```jsonc
{
  "meta": {
    "source": "data/sample-signals.csv",
    "generated_by": "engine/index.js (node, stdlib only)",
    "deterministic": true,
    "schema_version": 1,
    "note": "DEMO synthetic signals …"
  },
  "companies": [
    {
      "ticker": "ITC",
      "company": "ITC Ltd",
      "pulse": 52,                 // 0-100 composite
      "sentiment": "positive",     // "positive" | "neutral" | "negative"
      "flags": ["capacity-expansion-signal", "order-book-upturn", "disclosure-acceleration"],
      "divergences": [
        { "pair": ["filings","employee-geolocations"], "gap": 0.7,
          "reading": "strongest signal (filings, up) vs weakest (…) — …" }
      ],
      "confidence": 0.7,           // 0-1
      "data_quality": { "channels_present": 5, "channels_total": 5, "coverage_pct": 100,
                        "note": "all five channels present" },
      "channels": {
        "filings":                { "status":"ok", "period":"q2", "current":5,   "prior":3,     "chg_pct":66.7, "z":0.7, "direction":"up",   "strength":0.9 },
        "factory-power":          { "status":"ok", "period":"q2", "current":1930,"prior":1760,  "chg_pct":9.7,  "z":0.1, "direction":"up",   "strength":0.9 },
        "employee-geolocations":  { "status":"ok", "period":"q2", "current":24110,"prior":23890,"chg_pct":0.9,  "z":0.0, "direction":"flat", "strength":0.4 },
        "hiring-social":          { "status":"ok", "period":"q2", "current":310, "prior":205,   "chg_pct":51.2, "z":0.5, "direction":"up",   "strength":0.8 },
        "supply-chain":           { "status":"ok", "period":"q2", "current":95,  "prior":71,    "chg_pct":33.8, "z":0.3, "direction":"up",   "strength":0.8 }
      }
    }
  ]
}
```
Per-channel fields: `current` vs `prior` (prior-period value), `chg_pct` (Δ% vs prior), `z` (simplified z = relative change vs prior period), `direction` (`up`/`flat`/`down`; ±1% band), `strength` (0–1 signal reliability). Missing channels are `{ "status": "missing" }` and excluded from the composite.

### `data/briefs/<TICKER>.json` + `data/briefs.json`
`briefs.json` is `{ meta, top5: [ … ] }` where `top5` are the top-5 companies by pulse, each rendered to:
```jsonc
{ "ticker","company","pulse","sentiment","confidence","flags","divergences",
  "brief_text": "<markdown, template-rendered>", "data_quality": { … } }
```
`brief_text` is deterministic markdown (channels → flags → divergences → demo disclaimer).

### `data/radar.universe.json` (nifty50 + bse500)
```jsonc
{ "meta": { "universes": ["nifty50","bse500"], "deterministic": true, "note": "…" },
  "nifty50":  [ { "ticker","company","pulse","sentiment","flags","data" }, … ],
  "bse500":   [ … ],
  "coverage": { "nifty50_with_pulse": 15, "bse500_with_pulse": 0 } }
```
`data` is `"sample-signals"` where the demo CSV covers a ticker, else `"insufficient data"` with `pulse: null`. These are **placeholders**, not a live index scrape.

### `data/radar.pulse.json` (power-feed pulse, Python or Node fallback)
```jsonc
{ "meta": { "source":"demo","generated_by":"pulse_engine","engine":"python",
            "skipped_rows":0, "tickers":4, "rows":20 },
  "companies": [
    { "ticker","company","period","value",       // last row value
      "prior",                                   // second-to-last row value
      "z",                                       // (last-mean(trailing))/pop-std; null if <3 trailing or std==0
      "trend" } ] }                              // "up" | "down" | "flat" | null
```
The Node fallback (`engines/fallback.js`) emits the same `companies` shape via `--csv … --out …`.

### `data/sample-radar.json` (hand-authored narrative seed)
Rich, read-only demo records (e.g. **CGP — Crompton Greaves (DEMO)**) that *tell a story*: filings + power + hiring converging while supply-chain lead-times tighten ⇒ a **capacity-expansion ahead of order-book upturn**, pulse **82/100**, "watch Q2 energy intensity." Each company carries full channel detail (`current`, `prior`, `z`, `direction`, `strength`, `history`) plus a `briefs[0].markdown` narrative. See **PRISM-mapping.md**.

### `data/signals.csv` (normalized signal table)
```
ticker,channel,period,current,prior,chg_pct,z,direction,strength,status
ITC,filings,q2,5,3,66.7,0.7,up,0.9,ok
…
```
One row per (company, channel); missing channels emit `status=missing`.

### Demo input CSVs (`data/samples/`, `data/sample-signals.csv`)
Header comment marks them **DEMO**. The pulse-engine input contract is `ticker,company,period,value` (period = ISO date or `q1..ytd`, value = a magnitude like MWh/headcount). The radar input contract is `ticker,company,channel,period,current,prior,strength`.

---

## Where live data would plug in

The engines are **fully offline**: the demo CSVs stand in for live feeds. No code in this repo makes a network call at runtime. When going live, swap the CSV/JSON inputs for these adapters — the aggregate pipeline and schemas stay identical:

| Live source | Channel it feeds | What you get | Integration note |
|---|---|---|---|
| **SEBI e-filing / BSE & NSE corporate-announcement RSS** | `filings` | Filing cadence, buyback / order-book disclosures, capex plant registrations | Emit `ticker,company,channel,period,current,prior,strength` rows; count disclosures per quarter. |
| **CERC / MoP plant-utilization + state DISCOM substation demand** | `factory-power` | GWh/MWh of factory & sub-office power — the classic "is the line running hot?" proxy | Aggregate to a `MWh` value per quarter; feeds the Python pulse engine (`value` column). |
| **GDS / CIN registry + capacity statements** | `filings`, `supply-chain` | Incorporations, plant registrations, input-lead-time signals | Enrich the `supply-chain` index (lower = tighter lead times). |
| **Consented, anonymized on-site headcount / transit & fintech pings** | `employee-geolocations` | On-site presence composite (Naucrier-style). **No raw GPS.** | Aggregate to `employees (000s)`; must be consented & de-identified (see ethics note below). |
| **Job-board / social aggregators** | `hiring-social` | Open-roles velocity, operator-vs-HQ mix, social buzz | Count `open roles this quarter`; a surge in operator roles is the capacity signal. |
| **Commodity & supply-chain trackers** | `supply-chain` | Container volumes, freight indices, input-cost momentum | Map to a lead-time / input-availability index. |
| **News / graph feeds** | brief narrative | The "why" layer | Deterministic templates in this demo; a live build can attach a research LLM's *cited* reasoning here. |

> In live mode, `data/sample-signals.csv` and `data/samples/*.csv` are simply replaced by feed-adapter exports. Everything downstream (aggregate, pulse math, briefs, UI, offline build) is unchanged — which is why the whole thing stays reproducible.

---

## Limitations & Disclaimers

- **Demo data.** Every number is synthetic and labelled DEMO. It is *not* sourced from any real company, regulator, utility or board, and the universe lists are **static placeholder reference sets** (a representative ~38 NIFTY-50 + ~15 BSE-500), not a live index scrape.
- **Not investment advice, research or a recommendation.** This is a software demonstration of an alternative-data pipeline. Do not trade on it.
- **Simplified pulse math.** The Node radar `z` is a simplified relative-change-vs-prior-period score; the Python pulse engine uses a true trailing-window population z-score. They are intentionally different, per-channel, instruments.
- **Divergences are heuristic.** They flag the largest gap between strongest and weakest *present* channels; that is a pattern detector, not a causal model.
- **Geolocation ethics note.** The `employee-geolocations` channel models **consented, anonymized, aggregated on-site headcount composites only**. No raw GPS, no per-individual tracking, no non-consented location data — and any live build must keep this invariant. If a live source can't guarantee consent + aggregation + de-identification, that channel should be left `missing` rather than fed with sketchy data.
- **Determinism.** No timestamps or randomness are baked into outputs; regenerate at will and diff-check. `data_as_of` is a fixed demo quarter, not a live wall-clock.
- **Zero network, by design.** There is no runtime internet access anywhere. "Live" is documented above, not executed here.

---

*PRISM Sentinel — a local, offline, reproducible slice of PRISM's "see what's changing before results land" thesis. See **PRISM-mapping.md** for the feature-by-feature tie-back to https://prismxlabs.com/.*
