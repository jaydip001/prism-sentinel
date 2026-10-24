#!/usr/bin/env python3
"""Self-test for pulse_engine.py.

Asserts the engine's output matches hand-computed expected JSON EXACTLY on:
  1. a tiny in-memory CSV covering every edge case
     (up trend, flat, z=None when trailing < 3, prior==0 -> trend None,
      single-row ticker -> prior None);
  2. a CSV with malformed rows + comment lines (skipped_rows counting);
  3. a missing input file (exit code 1, clear stderr, no crash);
  4. the real data/samples/electricity.csv against an independent
     hand-derivation of the expected JSON.

Exits 0 on full success, 1 on any failure.
"""

import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SELFTEST_DIR = HERE / ".selftest"
ENGINE = HERE / "pulse_engine.py"
SAMPLE_ELEC = ROOT / "data" / "samples" / "electricity.csv"
failures = []


def _check(name, cond, detail=""):
    if cond:
        print("PASS  %s" % name)
    else:
        failures.append(name)
        print("FAIL  %s  %s" % (name, detail))


def _selftest_dir():
    SELFTEST_DIR.mkdir(parents=True, exist_ok=True)
    return SELFTEST_DIR


def _run_engine(csv_text, out_path):
    """Write csv_text to a file in engines/.selftest, run the engine CLI,
    return (returncode, stdout, stderr, payload_or_None). Cleans up after."""
    d = _selftest_dir()
    tmp = d / "case.csv"
    tmp.write_text(csv_text, encoding="utf-8")
    out = Path(out_path)
    try:
        proc = subprocess.run(
            [sys.executable, str(ENGINE), "--csv", str(tmp), "--out", str(out)],
            capture_output=True, text=True,
        )
        payload = None
        if out.exists():
            with open(out, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
        return proc.returncode, proc.stdout, proc.stderr, payload
    finally:
        tmp.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


def test_hand_case():
    """Required hand case: one ticker, values 10,20,30,40,last=50.

    trailing=[10,20,30,40] -> mean 25, pop-std sqrt(125)=11.1803...,
    z = 25/sqrt(125) = 2.23607; rel = 10/40 = 25% -> trend 'up'.
    """
    csv_text = "ticker,company,period,value\n" + "\n".join([
        "HT,Handcase,2025-01-01,10",
        "HT,Handcase,2025-02-01,20",
        "HT,Handcase,2025-03-01,30",
        "HT,Handcase,2025-04-01,40",
        "HT,Handcase,2025-05-01,50",
    ]) + "\n"
    out = _selftest_dir() / "hand_case.json"
    rc, so, se, payload = _run_engine(csv_text, out)
    _check("hand: engine exit 0", rc == 0, se)
    if payload is None:
        return
    assert len(payload["companies"]) == 1, payload["companies"]
    c = payload["companies"][0]
    _check("hand: z == 25/sqrt(125) within 1e-9",
           c["z"] is not None and abs(c["z"] - 25.0 / math.sqrt(125.0)) < 1e-9,
           "got %s expected ~2.23606797749979" % c["z"])
    _check("hand: trend up (rel 10/40=25%)", c["trend"] == "up", json.dumps(c))
    _check("hand: value/prior", c["value"] == 50.0 and c["prior"] == 40.0,
           json.dumps(c))


def test_tiny_deterministic():
    csv_text = """ticker,company,period,value
AA,Alpha,2025-01-01,100
AA,Alpha,2025-04-01,110
AA,Alpha,2025-07-01,120
AA,Alpha,2025-10-01,140
BB,Beta,2025-01-01,50
BB,Beta,2025-04-01,50
BB,Beta,2025-07-01,50
CC,Gamma,2025-01-01,0
CC,Gamma,2025-04-01,0
DD,Delta,2025-01-01,90
"""
    out = _selftest_dir() / "tiny.json"
    rc, so, se, payload = _run_engine(csv_text, out)
    _check("tiny: engine exit 0", rc == 0, se)
    if payload is None:
        return

    m = payload["meta"]
    _check("meta shape",
           m["source"] == "demo" and m["generated_by"] == "pulse_engine"
           and m["engine"] == "python" and m["skipped_rows"] == 0,
           json.dumps(m))
    _check("ticker order sorted",
           [c["ticker"] for c in payload["companies"]] == ["AA", "BB", "CC", "DD"],
           json.dumps(payload["companies"]))

    comp = {c["ticker"]: c for c in payload["companies"]}

    # AA: 100,110,120,140 -> last=140 prior=120 trailing=[100,110,120]
    #    mean=110, pop std=sqrt(200/3); z=(140-110)/std; rel=20/120=16.7% -> up
    exp_aa_mean = 110.0
    exp_aa_std = math.sqrt((10.0 ** 2 + 0.0 ** 2 + 10.0 ** 2) / 3)
    exp_aa_z = 30.0 / exp_aa_std
    a = comp["AA"]
    _check("AA value/prior/period",
           a["value"] == 140.0 and a["prior"] == 120.0 and a["period"] == "2025-10-01",
           json.dumps(a))
    _check("AA z matches hand math", math.isclose(a["z"], exp_aa_z, rel_tol=1e-12),
           "got %s expected %s" % (a["z"], exp_aa_z))
    _check("AA trend up", a["trend"] == "up", json.dumps(a))
    _check("AA company name", a["company"] == "Alpha", json.dumps(a))

    # BB: 50,50,50 -> last=50 prior=50 trailing=[50,50] (<3) -> z None; flat
    b = comp["BB"]
    _check("BB z None (trailing<3)", b["z"] is None, json.dumps(b))
    _check("BB trend flat", b["trend"] == "flat", json.dumps(b))

    # CC: 0,0 -> prior==0 -> trend None; trailing=[0] -> z None
    c = comp["CC"]
    _check("CC trend None (prior==0)", c["trend"] is None, json.dumps(c))
    _check("CC z None", c["z"] is None, json.dumps(c))

    # DD: single row -> prior None, z None, trend None
    d = comp["DD"]
    _check("DD prior None (single row)", d["prior"] is None, json.dumps(d))
    _check("DD z None", d["z"] is None, json.dumps(d))
    _check("DD trend None", d["trend"] is None, json.dumps(d))


def test_malformed_counted():
    csv_text = """# demo data comment line - must be ignored
ticker,company,period,value
XX,X,2025-01-01,10
XX,X,2025-04-01,20
XX,X,2025-07-01,30
BAD,only-two-fields
YY,Y,2025-01-01,not-a-number
YY,Y,2025-04-01,
ZZ,Z,2025-07-01,40
ZZ,Z,2025-10-01,40
ZZ,Z,2025-10-02,50
"""
    out = _selftest_dir() / "mal.json"
    rc, so, se, payload = _run_engine(csv_text, out)
    _check("malformed: engine exit 0", rc == 0, se)
    if payload is None:
        return
    m = payload["meta"]
    # skipped: "BAD,only-two-fields" (len<4) + "YY,...,not-a-number" + "YY,...,"
    _check("skipped_rows == 3", m["skipped_rows"] == 3, json.dumps(m))
    _check("rows == 6 (XX:3 + ZZ:3)", m["rows"] == 6, json.dumps(m))
    _check("tickers == 2", m["tickers"] == 2, json.dumps(m))
    _check("only XX + ZZ survive",
           [c["ticker"] for c in payload["companies"]] == ["XX", "ZZ"],
           json.dumps(payload["companies"]))


def test_missing_file():
    out = _selftest_dir() / "missing.json"
    proc = subprocess.run(
        [sys.executable, str(ENGINE),
         "--csv", str(ROOT / "data" / "does_not_exist.csv"), "--out", str(out)],
        capture_output=True, text=True,
    )
    _check("missing file -> exit 1", proc.returncode == 1,
           "rc=%s stderr=%s" % (proc.returncode, proc.stderr))
    _check("missing file -> clear error message",
           "not found" in proc.stderr.lower(), proc.stderr)
    _check("missing file -> no output written", not os.path.exists(out))


def test_sample_electricity():
    """Independent hand-derivation for the real sample file, exact match."""
    if not SAMPLE_ELEC.exists():
        _check("sample electricity.csv exists", False, str(SAMPLE_ELEC))
        return

    by = {}
    with open(SAMPLE_ELEC, "r", encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            parts = s.split(",")
            if parts[0] == "ticker":
                continue
            by.setdefault(parts[0], []).append((parts[1], parts[2], float(parts[3])))

    expected = []
    for ticker in sorted(by):
        recs = sorted(by[ticker], key=lambda r: r[1])
        last = recs[-1]
        prior = recs[-2][2] if len(recs) >= 2 else None
        trailing = [g[2] for g in recs[:-1]]
        z = None
        if len(trailing) >= 3:
            mean = sum(trailing) / len(trailing)
            std = math.sqrt(sum((x - mean) ** 2 for x in trailing) / len(trailing))
            if std > 0:
                z = (last[2] - mean) / std
        if prior:
            rel = (last[2] - prior) / abs(prior)
            trend = "up" if rel >= 0.05 else ("down" if rel <= -0.05 else "flat")
        else:
            trend = None
        expected.append({
            "ticker": ticker,
            "company": last[0],
            "period": last[1],
            "value": last[2],
            "prior": prior,
            "z": z,
            "trend": trend,
        })

    out = _selftest_dir() / "elec.json"
    proc = subprocess.run(
        [sys.executable, str(ENGINE), "--csv", str(SAMPLE_ELEC), "--out", str(out)],
        capture_output=True, text=True,
    )
    _check("electricity: engine exit 0", proc.returncode == 0, proc.stderr)
    with open(out, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    out.unlink(missing_ok=True)

    _check("electricity: companies match hand-computed JSON EXACTLY",
           payload["companies"] == expected,
           "got=%s\nexp=%s" % (json.dumps(payload["companies"]), json.dumps(expected)))
    _check("electricity: JSON parses", True)  # reached only if json.load succeeded


def main():
    test_hand_case()
    test_tiny_deterministic()
    test_malformed_counted()
    test_missing_file()
    test_sample_electricity()
    try:
        if failures:
            print("selftest: %d FAILURE(S): %s" % (len(failures), ", ".join(failures)))
            return 1
        print("PASS: selftest: all assertions passed")
        return 0
    finally:
        shutil.rmtree(SELFTEST_DIR, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
