#!/usr/bin/env node
/**
 * PRISM Sentinel — Node fallback for engines/pulse_engine.py.
 *
 * Invoked by scripts/engine-dispatch.js when python3 is absent or broken.
 * MUST stay mathematically identical to pulse_engine.py (see that file's
 * docstring for the canonical contract) — if you change the pulse math,
 * change both.
 *
 * Contract (identical to pulse_engine.py):
 *   Input CSV columns: ticker,company,period,value
 *     ('#' comment lines and blank lines ignored; malformed rows are
 *      skipped and counted in meta.skipped_rows; BOM-tolerant)
 *   Per ticker (tickers emitted in sorted order):
 *     rows sorted by period; last = newest row, prior = second-newest row
 *     z      : z-score of `last` against the trailing window = every row
 *              up to (but not including) last. Population std. Requires >= 3
 *              trailing points, else null; null also when std == 0.
 *     trend  : 'up' if (last-prior)/prior >= +5%; 'down' if <= -5%;
 *              'flat' otherwise; null when prior is 0 or missing.
 *   Output schema:
 *     {meta:{source:"demo",generated_by:"pulse_engine",engine:"node-fallback",
 *            skipped_rows,N,tickers:N,rows:N},
 *      companies:[{ticker,company,period,value,prior,z,trend}]}
 *
 * Graceful: missing input CSV -> clear message + exit 1; empty/zero-valid-row
 * input -> clear message + exit 1; missing --out dir is created. No network,
 * no Date.now(), no Math.random().
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TREND_THRESHOLD = 0.05; // 5%
const MIN_WINDOW = 3; // min trailing points required for a z-score

function toFloat(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const f = Number(s);
  return Number.isFinite(f) ? f : null; // rejects NaN/Infinity, matching python
}

function meanStd(values) {
  if (!values.length) return [null, null];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varr = values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length;
  return [mean, Math.sqrt(varr)];
}

function zscore(last, trailing) {
  if (trailing === null || trailing.length < MIN_WINDOW) return null;
  const [mean, std] = meanStd(trailing);
  if (mean === null || std === null || std === 0) return null;
  return (last - mean) / std;
}

function trend(last, prior) {
  if (last === null) return null;
  if (!prior) return null; // None or 0 -> division guard (matches python)
  const rel = (last - prior) / Math.abs(prior);
  if (rel >= TREND_THRESHOLD) return 'up';
  if (rel <= -TREND_THRESHOLD) return 'down';
  return 'flat';
}

/* Minimal CSV read: BOM-tolerant, quotes optional (demo feeds are plain
 * comma-separated, but we still do a quote-aware split for safety). */
function parseCsv(csvPath) {
  let text;
  try {
    text = fs.readFileSync(csvPath, 'utf8');
  } catch (err) {
    process.stderr.write(`pulse_engine: error: cannot read ${csvPath} (${err.code || err.message})\n`);
    process.exit(1);
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const rows = [];
  let skipped = 0;
  let headerSeen = false;
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells.length === 0 || cells.every((c) => c.trim() === '')) continue; // blank
    if (cells[0].trimStart().startsWith('#')) continue; // comment
    if (!headerSeen) {
      headerSeen = true;
      if (cells[0].trim().toLowerCase() === 'ticker') continue; // known header row
    }
    if (cells.length < 4) { skipped += 1; continue; }
    const ticker = cells[0].trim();
    const company = cells[1].trim();
    const period = cells[2].trim();
    const value = toFloat(cells[3]);
    if (!ticker || !period || value === null) { skipped += 1; continue; }
    rows.push({ ticker, company, period, value });
  }
  return { rows, skipped };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function buildCompanies(rows) {
  const byTicker = new Map();
  for (const r of rows) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, []);
    byTicker.get(r.ticker).push(r);
  }
  const companies = [];
  for (const ticker of [...byTicker.keys()].sort()) {
    const recs = byTicker.get(ticker).slice().sort((a, b) => a.period.localeCompare(b.period));
    const last = recs[recs.length - 1];
    const prior = recs.length >= 2 ? recs[recs.length - 2].value : null;
    const trailing = recs.slice(0, -1).map((g) => g.value);
    companies.push({
      ticker,
      company: last.company,
      period: last.period,
      value: last.value,
      prior,
      z: zscore(last.value, trailing),
      trend: trend(last.value, prior)
    });
  }
  return companies;
}

function main() {
  const args = process.argv.slice(2);
  let csv = null;
  let out = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--csv') csv = args[i + 1];
    else if (args[i] === '--out') out = args[i + 1];
  }
  if (!csv || !out) {
    process.stderr.write('usage: node engines/fallback.js --csv <path> --out <path>\n');
    process.exit(1);
  }

  if (!fs.existsSync(csv)) {
    process.stderr.write(`pulse_engine: error: input CSV not found: ${csv}\n`);
    process.exit(1);
  }
  const { rows, skipped } = parseCsv(csv);
  if (rows.length === 0) {
    process.stderr.write(
      `pulse_engine: error: no valid data rows in ${csv} (${skipped} malformed row(s) skipped)\n`
    );
    process.exit(1);
  }

  const companies = buildCompanies(rows);
  const payload = {
    meta: {
      source: 'demo',
      generated_by: 'pulse_engine',
      engine: 'node-fallback',
      skipped_rows: skipped,
      tickers: companies.length,
      rows: rows.length
    },
    companies
  };

  const outDir = path.dirname(path.resolve(out));
  fs.mkdirSync(outDir, { recursive: true });
  try {
    fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`pulse_engine: error: cannot write ${out} (${err.message})\n`);
    process.exit(1);
  }
  console.log(`pulse_engine: ${companies.length} ticker(s), ${rows.length} row(s), ${skipped} skipped -> ${out}`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`pulse_engine: error: unexpected failure: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
