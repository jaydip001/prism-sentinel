#!/usr/bin/env node
/**
 * PRISM Sentinel — offline single-file build (zero-dep).
 *
 *   node scripts/inline.js
 *
 * Reads index.html plus all data/*.json artifacts and writes build/build.html:
 * a fully self-contained copy of the UI with all radar data inlined into
 * a `window.__INLINED_DATA__` object. index.html checks that global first
 * and only falls back to fetch() when it is absent — so build.html works
 * from file:// with no server and no network.
 *
 * Deterministic: fixed dataset list, no timestamps in the build payload.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* Datasets the UI is allowed to consume. Missing files are simply omitted
 * (the UI must tolerate absent datasets, e.g. pre-`npm run radar`). */
const DATASETS = [
  { key: 'radar', file: 'data/radar.json' },
  { key: 'pulse', file: 'data/radar.pulse.json' },
  { key: 'pulseGeo', file: 'data/radar.pulse.geo.json' },
  { key: 'pulseFilings', file: 'data/radar.pulse.filings.json' },
  { key: 'universe', file: 'data/radar.universe.json' },
  { key: 'briefs', file: 'data/briefs.json' },
  { key: 'sampleRadar', file: 'data/sample-radar.json' },
  { key: 'signalsCsv', file: 'data/signals.csv' }, // string, not JSON
];

function loadText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (_e) {
    return null;
  }
}

function main() {
  let html = loadText('index.html');
  if (html === null) {
    console.error('[prism-sentinel:build] index.html not found — run from the project root');
    process.exit(1);
  }

  const inlined = {};
  for (const d of DATASETS) {
    const raw = loadText(d.file);
    if (raw === null) continue;
    if (d.key === 'signalsCsv') {
      inlined.signalsCsv = raw;
    } else {
      try {
        inlined[d.key] = JSON.parse(raw);
      } catch (_e) {
        console.error(`[prism-sentinel:build] ${d.file} is not valid JSON — skipping that dataset`);
      }
    }
  }

  // Replace the marker line with the payload (or drop the placeholder script tag
  // entirely when nothing is available — UI then uses fetch() with a file:// note).
  const payload = `window.__INLINED_DATA__ = ${JSON.stringify(inlined, null, 2)};`;
  const marker = '/*__INLINED_DATA__*/';
  let out;
  if (html.includes(marker)) {
    out = html.replace(marker, payload);
  } else {
    // no marker found — inject before </head>
    out = html.replace('</head>', `<script>\n${payload}\n</script>\n</head>`);
  }

  const buildDir = path.join(ROOT, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'build.html'), out, 'utf8');
  console.log(`[prism-sentinel:build] build/build.html written (${(out.length / 1024).toFixed(1)} kB, datasets: ${Object.keys(inlined).join(', ') || 'none — UI will fetch()'})`);
}

try {
  main();
} catch (err) {
  console.error(`[prism-sentinel:build] unexpected error: ${err && err.message ? err.message : err}`);
  process.exit(1);
}
