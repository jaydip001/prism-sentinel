#!/usr/bin/env python3
"""PRISM Sentinel — pulse engine (Python 3.8+ stdlib only, zero dependencies).

Usage:
    python3 engines/pulse_engine.py --csv <path> --out <path>

Contract (MUST mirror engines/fallback.js — keep both identical):
    Input CSV columns: ticker,company,period,value
      (electricity feed: value = MWh; geolocations feed: value = headcount)
      '#' comment lines and blank lines are ignored; malformed rows are
      skipped and counted in meta.skipped_rows.
    Per ticker (tickers emitted in sorted order):
      rows sorted by period; last = newest row, prior = second-newest row
      z      : z-score of `last` against the trailing window = every row
               up to (but not including) last. Population std. Requires >= 3
               trailing points, else null; null also when std == 0.
      trend  : 'up' if (last-prior)/prior >= +5%; 'down' if <= -5%;
               'flat' otherwise; null when prior is 0 or missing
               (division guard).
    Output schema:
      {"meta":{"source":"demo","generated_by":"pulse_engine","engine":"python",
                "skipped_rows":N,"tickers":N,"rows":N},
       "companies":[{"ticker","company","period","value","prior","z","trend"}]}

Deterministic: no time, no randomness — pure functions of the input file.
Graceful: missing/empty/zero-row input -> clear stderr message + exit 1
 (empty-but-present file still yields valid JSON with zero companies? No:
 a file with zero data rows is treated as malformed input -> exit 1),
 missing --out dir is created. No network access of any kind.

Live-mode note (documented, never executed): the electricity CSV would be
replaced by CERC / DISCOM plant-usage or substation-demand exports; the
headcount feed by job-board / consented on-site geolocation aggregates.
Engines work offline on CSVs by design — the CSV path is the only seam
where live sources would plug in.
"""

import argparse
import csv
import json
import math
import sys
from pathlib import Path

TREND_THRESHOLD = 0.05  # 5%
MIN_WINDOW = 3          # min trailing points required for a z-score


def _to_float(raw):
    """Defensive float parse: blank/None/NaN/inf -> None."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s == "":
        return None
    try:
        f = float(s)
    except (ValueError, OverflowError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _mean_std(values):
    """Population mean and population std. (None, None) for empty list."""
    if not values:
        return None, None
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return mean, math.sqrt(var)


def _zscore(last, trailing):
    """z of `last` vs trailing window; None unless >= MIN_WINDOW points & std>0."""
    if trailing is None or len(trailing) < MIN_WINDOW:
        return None
    mean, std = _mean_std(trailing)
    if std is None or std == 0:
        return None
    return (last - mean) / std


def _trend(last, prior):
    """'up'/'down'/'flat' or None (prior missing or zero -> None)."""
    if last is None:
        return None
    if not prior:  # None or 0 -> division guard
        return None
    rel = (last - prior) / abs(prior)
    if rel >= TREND_THRESHOLD:
        return "up"
    if rel <= -TREND_THRESHOLD:
        return "down"
    return "flat"


def _parse_csv(csv_path):
    """Read the CSV. Returns (rows, skipped) — '#' lines and blank lines are
    ignored silently; malformed data rows are counted in skipped."""
    rows, skipped = [], 0
    with open(csv_path, "r", newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh)
        header_seen = False
        for line in reader:
            if not line or all(c.strip() == "" for c in line):
                continue  # blank line — ignore silently
            if line[0].lstrip().startswith("#"):
                continue  # comment line — ignore silently
            if not header_seen:
                header_seen = True
                if line[0].strip().lower() == "ticker":
                    continue  # the known header row
            if len(line) < 4:
                skipped += 1
                continue
            ticker = line[0].strip()
            company = line[1].strip()
            period = line[2].strip()
            value = _to_float(line[3])
            if not ticker or not period or value is None:
                skipped += 1
                continue
            rows.append(
                {"ticker": ticker, "company": company, "period": period, "value": value}
            )
    return rows, skipped


def build_companies(rows):
    """Group by ticker (sorted), sort rows by period, compute per-ticker pulse."""
    by_ticker = {}
    for r in rows:
        by_ticker.setdefault(r["ticker"], []).append(r)

    companies = []
    for ticker in sorted(by_ticker):
        recs = sorted(by_ticker[ticker], key=lambda r: r["period"])
        last = recs[-1]
        prior = recs[-2]["value"] if len(recs) >= 2 else None
        trailing = [g["value"] for g in recs[:-1]]
        companies.append(
            {
                "ticker": ticker,
                "company": last["company"],
                "period": last["period"],
                "value": last["value"],
                "prior": prior,
                "z": _zscore(last["value"], trailing),
                "trend": _trend(last["value"], prior),
            }
        )
    return companies


def run(csv_path, out_path):
    p = Path(csv_path)
    if not p.is_file():
        sys.stderr.write("pulse_engine: error: input CSV not found: %s\n" % csv_path)
        sys.exit(1)

    try:
        rows, skipped = _parse_csv(csv_path)
    except OSError as exc:
        sys.stderr.write("pulse_engine: error: cannot read %s (%s)\n" % (csv_path, exc))
        sys.exit(1)

    if not rows:
        sys.stderr.write(
            "pulse_engine: error: no valid data rows in %s "
            "(%d malformed row(s) skipped)\n" % (csv_path, skipped)
        )
        sys.exit(1)

    companies = build_companies(rows)
    payload = {
        "meta": {
            "source": "demo",
            "generated_by": "pulse_engine",
            "engine": "python",
            "skipped_rows": skipped,
            "tickers": len(companies),
            "rows": len(rows),
        },
        "companies": companies,
    }

    out = Path(out_path)
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
            fh.write("\n")
    except OSError as exc:
        sys.stderr.write("pulse_engine: error: cannot write %s (%s)\n" % (out_path, exc))
        sys.exit(1)

    print(
        "pulse_engine: %d ticker(s), %d row(s), %d skipped -> %s"
        % (len(companies), len(rows), skipped, out_path)
    )
    return payload


def main():
    ap = argparse.ArgumentParser(description="PRISM Sentinel pulse engine (python)")
    ap.add_argument("--csv", required=True, help="input CSV (ticker,company,period,value)")
    ap.add_argument("--out", required=True, help="output JSON path")
    args = ap.parse_args()
    run(args.csv, args.out)


if __name__ == "__main__":
    main()
