#!/usr/bin/env node
/**
 * PRISM Sentinel — Node radar engine (Node 18+ stdlib only, zero npm deps).
 *
 *   node engine/index.js radar   [--csv <path>]
 *   node engine/index.js nifty50
 *   node engine/index.js bse500
 *   node engine/index.js all
 *
 * Outputs (all written into data/, all deterministic — no Date.now, no Math.random):
 *   data/radar.json               aggregate pulse radar (from data/sample-signals.csv)
 *   data/signals.csv              normalized signal table
 *   data/briefs/<TICKER>.json     top-5 company briefs (template-rendered, deterministic)
 *   data/radar.universe.json       nifty50 + bse500 universe pulse map
 *
 * LIVE-MODE SOURCES (documented only — no network calls are made anywhere in
 * this project; everything runs offline on the CSV/JSON inputs):
 *   1. SEBI e-filing RSS / BSE & NSE corporate-announcement feeds — filing cadence,
 *      buyback/order-book disclosures.
 *   2. CERC / Ministry of Power capacity & plant-utilization releases + DISCOM
 *      unit-substation demand data — factory/office power proxy.
 *   3. GDS (Group for Data on the Economy of India) + CIN registry extracts —
 *      incorporations, plant registrations, capacity statements.
 *   4. Job-board / social aggregators (aggregated, consented data only) — hiring
 *      surge, on-site headcount and geolocation composites (Naucrier-style).
 *   5. Commodity & supply-chain trackers (container volumes, freight indices) —
 *      input-cost and order-book momentum.
 *
 * In live mode the same aggregate() pipeline would ingest those feeds; here the
 * demo CSV below stands in for them, so results are fully reproducible.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BRIEFS_DIR = path.join(DATA_DIR, 'briefs');
const SAMPLE_CSV = path.join(DATA_DIR, 'sample-signals.csv');

/* ---------------------------------------------------------------- *
 *  CSV (default demo source) — kept inline so `node engine/index.js *
 *  radar` works even before data/sample-signals.csv is authored.   *
 *  Columns: ticker,company,channel,period,current,prior,strength   *
 * ---------------------------------------------------------------- */
const DEMO_SIGNALS_CSV = `ticker,company,channel,period,current,prior,strength
TITAN,Titan Ltd,filings,q2,3,2,0.6
TITAN,Titan Ltd,factory-power,q2,412,380,0.8
TITAN,Titan Ltd,employee-geolocations,q2,11840,11610,0.5
TITAN,Titan Ltd,hiring-social,q2,142,121,0.7
TITAN,Titan Ltd,supply-chain,q2,87,82,0.6
ITC,ITC Ltd,filings,q2,5,3,0.9
ITC,ITC Ltd,factory-power,q2,1930,1760,0.9
ITC,ITC Ltd,employee-geolocations,q2,24110,23890,0.4
ITC,ITC Ltd,hiring-social,q2,310,205,0.8
ITC,ITC Ltd,supply-chain,q2,95,71,0.8
HDFCBANK,HDFC Bank,filings,q2,2,1,0.5
HDFCBANK,HDFC Bank,factory-power,q2,2210,2190,0.3
HDFCBANK,HDFC Bank,employee-geolocations,q2,41020,40800,0.4
HDFCBANK,HDFC Bank,hiring-social,q2,95,88,0.5
HDFCBANK,HDFC Bank,supply-chain,q2,64,60,0.4
INFY,Infosys,filings,q2,4,2,0.7
INFY,Infosys,factory-power,q2,1540,1610,0.6
INFY,Infosys,employee-geolocations,q2,30110,30240,0.5
INFY,Infosys,hiring-social,q2,410,520,0.7
INFY,Infosys,supply-chain,q2,55,58,0.3
WIPRO,Wipro,filings,q2,2,1,0.4
WIPRO,Wipro,factory-power,q2,890,920,0.5
WIPRO,Wipro,employee-geolocations,q2,48700,49100,0.5
WIPRO,Wipro,hiring-social,q2,210,340,0.7
WIPRO,Wipro,supply-chain,q2,40,46,0.4
TCS,Tata Consultancy Services,filings,q2,1,1,0.3
TCS,Tata Consultancy Services,factory-power,q2,2350,2380,0.4
TCS,Tata Consultancy Services,employee-geolocations,q2,56400,56200,0.3
TCS,Tata Consultancy Services,hiring-social,q2,85,120,0.6
TCS,Tata Consultancy Services,supply-chain,q2,30,35,0.3
RELIANCE,Reliance Industries,filings,q2,6,4,0.8
RELIANCE,Reliance Industries,factory-power,q2,8810,8450,0.9
RELIANCE,Reliance Industries,employee-geolocations,q2,12750,12600,0.4
RELIANCE,Reliance Industries,hiring-social,q2,240,190,0.7
RELIANCE,Reliance Industries,supply-chain,q2,92,85,0.8
TATAMOTORS,Tata Motors,filings,q2,3,2,0.6
TATAMOTORS,Tata Motors,factory-power,q2,3980,3560,0.9
TATAMOTORS,Tata Motors,employee-geolocations,q2,9450,8800,0.7
TATAMOTORS,Tata Motors,hiring-social,q2,175,150,0.5
TATAMOTORS,Tata Motors,supply-chain,q2,88,74,0.7
SUNPHARMA,Sun Pharma,filings,q2,4,2,0.7
SUNPHARMA,Sun Pharma,factory-power,q2,1120,1010,0.8
SUNPHARMA,Sun Pharma,employee-geolocations,q2,6730,6580,0.4
SUNPHARMA,Sun Pharma,hiring-social,q2,160,135,0.6
SUNPHARMA,Sun Pharma,supply-chain,q2,71,66,0.6
DRREDDY,Dr Reddys Labs,filings,q2,3,1,0.7
DRREDDY,Dr Reddys Labs,factory-power,q2,940,910,0.6
DRREDDY,Dr Reddys Labs,employee-geolocations,q2,5120,5090,0.3
DRREDDY,Dr Reddys Labs,hiring-social,q2,98,85,0.5
DRREDDY,Dr Reddys Labs,supply-chain,q2,60,55,0.5
ADANIPORTS,Adani Ports & SEZ,filings,q2,2,1,0.5
ADANIPORTS,Adani Ports & SEZ,factory-power,q2,1470,1430,0.6
ADANIPORTS,Adani Ports & SEZ,employee-geolocations,q2,3260,3210,0.3
ADANIPORTS,Adani Ports & SEZ,hiring-social,q2,55,48,0.4
ADANIPORTS,Adani Ports & SEZ,supply-chain,q2,74,70,0.6
LT,Larsen & Toubro,filings,q2,3,2,0.6
LT,Larsen & Toubro,factory-power,q2,1210,1150,0.7
LT,Larsen & Toubro,employee-geolocations,q2,15200,14900,0.4
LT,Larsen & Toubro,hiring-social,q2,205,185,0.5
LT,Larsen & Toubro,supply-chain,q2,81,77,0.6
BAJFINANCE,Bajaj Finance,filings,q2,2,1,0.5
BAJFINANCE,Bajaj Finance,factory-power,q2,640,610,0.6
BAJFINANCE,Bajaj Finance,employee-geolocations,q2,4310,4150,0.5
BAJFINANCE,Bajaj Finance,hiring-social,q2,220,180,0.7
BAJFINANCE,Bajaj Finance,supply-chain,q2,45,42,0.4
MARUTI,Maruti Suzuki,filings,q2,2,1,0.5
MARUTI,Maruti Suzuki,factory-power,q2,2130,2050,0.7
MARUTI,Maruti Suzuki,employee-geolocations,q2,5890,5670,0.5
MARUTI,Maruti Suzuki,hiring-social,q2,90,72,0.5
MARUTI,Maruti Suzuki,supply-chain,q2,69,61,0.7
ASHOKLEY,Shriram Transport,filings,q2,1,0,0.4
ASHOKLEY,Shriram Transport,factory-power,q2,310,290,0.5
ASHOKLEY,Shriram Transport,employee-geolocations,q2,1450,1430,0.2
ASHOKLEY,Shriram Transport,hiring-social,q2,35,30,0.4
ASHOKLEY,Shriram Transport,supply-chain,q2,52,48,0.5
HCLTech,HCLTech,filings,q2,3,1,0.6
HCLTech,HCLTech,factory-power,q2,1180,1240,0.5
HCLTech,HCLTech,employee-geolocations,q2,21350,21480,0.4
HCLTech,HCLTech,hiring-social,q2,180,230,0.6
HCLTech,HCLTech,supply-chain,q2,38,42,0.4
`;

/* ---------------------------------------------------------------- *
 *  Utilities — defensive, never-throw helpers                      *
 * ---------------------------------------------------------------- */

function safeReadText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_err) {
    return null;
  }
}

function safeReadJson(file) {
  const raw = safeReadText(file);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function safeWriteJson(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function fmtNum(x) {
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
}

function pct(cur, prior) {
  if (!Number.isFinite(cur) || !Number.isFinite(prior) || prior === 0) return null;
  return fmtNum(((cur - prior) / Math.abs(prior)) * 100);
}

/* Parse CSV text defensively: strips BOM, skips blank/# comment lines,
 * splits on comma, trims cells. Malformed rows (wrong column count or
 * non-numeric values) are skipped, never thrown. */
function parseCsvTable(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  const cells = (l) => l.split(',').map((c) => c.trim());
  if (lines.length === 0) return [];
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const c = cells(lines[i]);
    if (c.length < header.length) continue; // short / malformed row
    const rec = {};
    for (let j = 0; j < header.length; j += 1) rec[header[j]] = c[j];
    rec.__ok = true;
    rows.push(rec);
  }
  return rows;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------- *
 *  Aggregation + pulse math                                          *
 * ---------------------------------------------------------------- */

const CHANNELS = ['filings', 'factory-power', 'employee-geolocations', 'hiring-social', 'supply-chain'];

function aggregate(records) {
  // group by ticker -> channel -> latest row (periods assumed sortable; take max period string, tie: last row)
  const map = new Map();
  for (const r of records) {
    if (!r.ticker || !r.channel) continue;
    const cur = num(r.current);
    if (cur === null) continue;
    const rec = {
      ticker: String(r.ticker).toUpperCase(),
      company: r.company ? String(r.company) : r.ticker,
      channel: String(r.channel).toLowerCase(),
      period: r.period || 'q2',
      current: cur,
      prior: num(r.prior),
      strength: clamp01(num(r.strength)),
      rows: 0
    };
    let g = map.get(rec.ticker);
    if (!g) {
      g = { company: rec.company, channels: {}, rowcount: 0 };
      map.set(rec.ticker, g);
    }
    g.rowcount += 1;
    if (rec.company && g.company !== rec.company) g.company = rec.company;
    const ch = g.channels[rec.channel];
    // keep the latest period per channel (deterministic: max period string, ties keep first-seen highest)
    if (!ch || (rec.period || '') > (ch.period || '')) {
      g.channels[rec.channel] = rec;
    }
  }

  const companies = [];
  for (const [ticker, g] of map.entries()) {
    const channelDetails = {};
    let pulse = 0;
    let up = 0;
    let down = 0;
    let present = 0;
    for (const ch of CHANNELS) {
      const c = g.channels[ch];
      if (!c) {
        channelDetails[ch] = { status: 'missing' };
        continue;
      }
      present += 1;
      const chg = pct(c.current, c.prior);
      const z = chg !== null ? chg / 100 : null; // simplified z: relative change vs prior period
      const dir = chg === null ? 'flat' : chg > 1 ? 'up' : chg < -1 ? 'down' : 'flat';
      up += dir === 'up' ? 1 : 0;
      down += dir === 'down' ? 1 : 0;
      const contribution = 0.5 + clamp01(z === null ? 0 : Math.abs(z)) * 0.5; // 0.5 neutral, +momentum
      pulse += c.strength * contribution;
      channelDetails[ch] = {
        status: 'ok',
        period: c.period,
        current: c.current,
        prior: c.prior,
        chg_pct: chg,
        z: fmtNum(z),
        direction: dir,
        strength: c.strength
      };
    }
    const pulseScore = present > 0 ? Math.round((pulse / present) * 100) : 0;
    const sentiment = up > down ? 'positive' : down > up ? 'negative' : 'neutral';
    const flags = deriveFlags(channelDetails, pulseScore);
    const divergences = deriveDivergences(channelDetails);
    const coverage = Math.round((present / CHANNELS.length) * 100);

    companies.push({
      ticker,
      company: g.company,
      pulse: pulseScore, // 0-100 composite
      sentiment,
      flags,
      divergences,
      confidence: clamp01(coverage / 100) * 0.6 + (g.rowcount > 10 ? 0.2 : 0.1),
      data_quality: {
        channels_present: present,
        channels_total: CHANNELS.length,
        coverage_pct: coverage,
        note: coverage === 100 ? 'all five channels present' : `only ${present} of 5 channels present; composite weighted accordingly`
      },
      channels: channelDetails
    });
  }

  companies.sort((a, b) => b.pulse - a.pulse || a.ticker.localeCompare(b.ticker));
  return companies;
}

function clamp01(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

/* Deterministic template-based event flags (no randomness). */
function deriveFlags(d, pulseScore) {
  const flags = [];
  const fp = d['factory-power'];
  if (fp && fp.chg_pct !== null && fp.chg_pct >= 8) flags.push('capacity-expansion-signal');
  else if (fp && fp.chg_pct !== null && fp.chg_pct <= -8) flags.push('utilization-softening');
  const sc = d['supply-chain'];
  if (sc && sc.chg_pct !== null && sc.chg_pct >= 10) flags.push('order-book-upturn');
  const hs = d['hiring-social'];
  if (hs && hs.chg_pct !== null && hs.chg_pct <= -15) flags.push('hiring-retrenchment');
  const f = d.filings;
  if (f && f.chg_pct !== null && f.chg_pct >= 50) flags.push('disclosure-acceleration');
  if (pulseScore >= 70) flags.push('momentum-accumulation');
  return flags;
}

/* Largest signal gaps between the strongest and weakest present channels. */
function deriveDivergences(d) {
  const present = CHANNELS.filter((c) => d[c] && d[c].status === 'ok');
  if (present.length < 2) return [];
  const scored = present.map((c) => ({ c, z: d[c].z || 0, dir: d[c].direction }));
  scored.sort((a, b) => b.z - a.z);
  const top = scored[0];
  const bot = scored[scored.length - 1];
  const out = [];
  if (Math.abs(top.z - bot.z) >= 0.05) {
    out.push({
      pair: [top.c, bot.c],
      gap: fmtNum(top.z - bot.z),
      reading: `strongest signal (${top.c}, ${top.dir}) vs weakest (${bot.c}, ${bot.dir}) — ${top.dir === 'up' && bot.dir === 'down' ? 'fundamentals and activity are diverging' : 'asymmetric momentum across channels'}`
    });
  }
  return out.slice(0, 3);
}

/* Deterministic, template-rendered brief (no randomness, no timestamps). */
function makeBrief(co) {
  const lines = [];
  lines.push(`# ${co.ticker} — ${co.company} (DEMO BRIEF)`);
  lines.push('');
  lines.push(`Composite pulse: ${co.pulse}/100 · sentiment ${co.sentiment} · confidence ${fmtNum(co.confidence)}`);
  lines.push(`Coverage: ${co.data_quality.note}`);
  lines.push('');
  lines.push('## Channels');
  for (const ch of CHANNELS) {
    const c = co.channels[ch];
    if (!c || c.status === 'missing') {
      lines.push(`- ${ch}: no data in demo feed`);
    } else {
      lines.push(
        `- ${ch}: ${c.current} vs prior ${c.prior} (${c.chg_pct === null ? 'n/a' : c.chg_pct + '%'}; z=${c.z === null ? 'n/a' : c.z}; ${c.direction})`
      );
    }
  }
  lines.push('');
  lines.push('## Flags');
  lines.push(co.flags.length ? co.flags.map((f) => `- ${f}`).join('\n') : '- none');
  if (co.divergences.length) {
    lines.push('');
    lines.push('## Divergences');
    for (const dv of co.divergences) lines.push(`- ${dv.pair.join(' <-> ')}: ${dv.reading}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('DEMO DATA — synthetic demo signals; not investment research. Live mode would source SEBI/GDS filings, MoP power data, consented geolocation & hiring aggregates.');
  return {
    ticker: co.ticker,
    company: co.company,
    pulse: co.pulse,
    sentiment: co.sentiment,
    confidence: fmtNum(co.confidence),
    flags: co.flags,
    divergences: co.divergences,
    brief_text: lines.join('\n'),
    data_quality: co.data_quality
  };
}

/* ---------------------------------------------------------------- *
 *  Subcommands                                                       *
 * ---------------------------------------------------------------- */

function runRadar(csvArg) {
  let csvText = null;
  let csvPath = csvArg ? path.resolve(csvArg) : null;
  if (csvPath) {
    csvText = safeReadText(csvPath);
    if (csvText === null) {
      console.error(`[prism-sentinel] radar: cannot read ${csvPath} (file missing or unreadable)`);
      process.exitCode = 1;
      return;
    }
  } else {
    csvText = safeReadText(SAMPLE_CSV); // data/sample-signals.csv, written below
    if (csvText === null) csvText = DEMO_SIGNALS_CSV; // built-in fallback so radar always works
  }
  const rows = parseCsvTable(csvText);
  if (rows.length === 0) {
    console.error('[prism-sentinel] radar: no valid data rows in CSV (expected header: ticker,company,channel,period,current,prior,strength)');
    process.exitCode = 1;
    return;
  }

  // persist the demo sample CSV if it didn't exist (so later runs have the input on disk)
  if (!safeReadText(SAMPLE_CSV) && csvPath === null) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SAMPLE_CSV, DEMO_SIGNALS_CSV, 'utf8');
  }

  const companies = aggregate(rows);
  if (companies.length === 0) {
    console.error('[prism-sentinel] radar: parsed 0 companies from CSV — check header row and cell values');
    process.exitCode = 1;
    return;
  }

  const radar = {
    meta: {
      source: csvPath || 'data/sample-signals.csv',
      generated_by: 'engine/index.js (node, stdlib only)',
      deterministic: true,
      schema_version: 1,
      note: 'DEMO synthetic signals; live mode replaces CSV with SEBI/GDS/MoP/job-board/geolocation feed adapters — no network access is required by this engine.'
    },
    companies
  };
  safeWriteJson(path.join(DATA_DIR, 'radar.json'), radar);

  // normalized signals table
  const sigLines = ['ticker,channel,period,current,prior,chg_pct,z,direction,strength,status'];
  for (const co of companies) {
    for (const ch of CHANNELS) {
      const c = co.channels[ch];
      if (!c || c.status === 'missing') {
        sigLines.push(`${co.ticker},${ch},, , , , , ,missing`);
      } else {
        sigLines.push(
          [co.ticker, ch, c.period, c.current, c.prior === null ? '' : c.prior, c.chg_pct === null ? '' : c.chg_pct, c.z === null ? '' : c.z, c.direction, c.strength, 'ok'].join(',')
        );
      }
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'signals.csv'), sigLines.join('\n') + '\n', 'utf8');

  // top-5 briefs (deterministic sort above already ranks by pulse desc, ticker asc)
  fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  const top5 = companies.slice(0, 5);
  for (const co of top5) safeWriteJson(path.join(BRIEFS_DIR, `${co.ticker}.json`), makeBrief(co));
  safeWriteJson(path.join(DATA_DIR, 'briefs.json'), { meta: { generated_by: 'engine/index.js' }, top5: top5 });

  console.log(`[prism-sentinel] radar: ${companies.length} companies -> data/radar.json, data/signals.csv, top-5 briefs -> data/briefs/${top5.map((c) => c.ticker).join(', ')}.json`);
}

/* Universe placeholder pulses: use only what's present in sample-signals;
 * everything else is null + "insufficient data". No network. */
function samplePulseMap() {
  // per-ticker pulse from the sample-signals source (or built-in demo fallback)
  const sampleText = safeReadText(SAMPLE_CSV);
  let sampleRows = sampleText ? parseCsvTable(sampleText) : [];
  if (sampleRows.length === 0) sampleRows = parseCsvTable(DEMO_SIGNALS_CSV);
  const byTicker = new Map();
  if (sampleRows.length) for (const co of aggregate(sampleRows)) byTicker.set(co.ticker, co);
  return byTicker;
}

/* `which` is 'nifty50', 'bse500', or 'all' (writes the combined file). */
function runUniverse(which) {
  const buildList = (name, byTicker) => {
    const uniFile = path.join(DATA_DIR, 'universe', `${name}.json`);
    const uni = safeReadJson(uniFile);
    if (!uni || !Array.isArray(uni.tickers)) {
      console.error(`[prism-sentinel] universe: missing or malformed ${uniFile} (expected {"tickers":[...]})`);
      process.exitCode = 1;
      return null;
    }
    const out = [];
    let withPulse = 0;
    const tickers = uni.tickers.slice().sort((a, b) => {
      const at = String(typeof a === 'string' ? a : (a && a.ticker) || '');
      const bt = String(typeof b === 'string' ? b : (b && b.ticker) || '');
      return at.localeCompare(bt); // deterministic order
    });
    for (const t of tickers) {
      const key = String(typeof t === 'string' ? t : (t && t.ticker) || '').toUpperCase().trim();
      if (!key) continue;
      const name = (typeof t === 'object' && t && t.name) ? t.name : key;
      const hit = byTicker.get(key);
      if (hit) {
        withPulse += 1;
        out.push({ ticker: key, company: name, pulse: hit.pulse, sentiment: hit.sentiment, flags: hit.flags, data: 'sample-signals' });
      } else {
        out.push({ ticker: key, company: name, pulse: null, sentiment: null, flags: [], data: 'insufficient data' });
      }
    }
    return { list: out, withPulse };
  };

  const byTicker = samplePulseMap();
  const whichs = which === 'all' ? ['nifty50', 'bse500'] : [which];
  const sections = {};
  const coverage = {};
  let failed = false;
  for (const w of whichs) {
    const res = buildList(w, byTicker);
    if (!res) { failed = true; continue; }
    sections[w] = res.list;
    coverage[`${w}_with_pulse`] = res.withPulse;
  }
  if (failed) return;

  safeWriteJson(path.join(DATA_DIR, 'radar.universe.json'), {
    meta: {
      generated_by: 'engine/index.js',
      deterministic: true,
      universes: whichs,
      note: 'Placeholders only: pulse computed where sample-signals.csv covers a ticker, else null + "insufficient data". Live mode would pull SEBI filing RSS, CERC/MoP power data, GDS/CIN registry, job-board and consented geolocation aggregates — listed in the engine header; no network calls are made anywhere in this project.'
    },
    ...sections,
    coverage
  });
  const summary = whichs.map((w) => `${w}:${coverage[`${w}_with_pulse`]}`).join(' ');
  console.log(`[prism-sentinel] universe (${whichs.join('+')}) -> data/radar.universe.json (${summary} with sample pulse, rest null/"insufficient data")`);
}

/* ---------------------------------------------------------------- *
 *  CLI                                                               *
 * ---------------------------------------------------------------- */

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const opt = {};
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--csv') opt.csv = args[i + 1];
    else if (args[i] === '--help' || args[i] === '-h') opt.help = true;
  }
  if (opt.help || !cmd) {
    console.log('usage: node engine/index.js <radar|nifty50|bse500|all> [--csv <path>]');
    if (!cmd) process.exitCode = 1;
    return;
  }
  switch (cmd) {
    case 'radar':
      runRadar(opt.csv);
      break;
    case 'nifty50':
    case 'bse500':
      runUniverse(cmd === 'nifty50' ? 'nifty50' : 'bse500');
      break;
    case 'all': {
      // one pass writes the combined universe file; keep exit status explicit
      let ec = 0;
      runRadar(opt.csv);
      ec = process.exitCode || 0;
      if (ec === 0) {
        runUniverse('all'); // writes both universes into data/radar.universe.json
        ec = process.exitCode || 0;
      }
      process.exitCode = ec;
      break;
    }
    default:
      console.error(`[prism-sentinel] unknown command "${cmd}" — use radar | nifty50 | bse500 | all`);
      process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  // never let an uncaught throw escape the CLI
  console.error(`[prism-sentinel] unexpected error: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
}
