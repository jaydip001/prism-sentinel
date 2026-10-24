#!/usr/bin/env node
/**
 * PRISM Sentinel — engine dispatcher (tiny bin shim, zero-dep).
 *
 *   node scripts/engine-dispatch.js pulse [--csv <path>] [--out <path>]
 *
 * Picks the best available pulse engine:
 *   1. python3 engines/pulse_engine.py   (if python3 is present AND can run the engine)
 *   2. node engines/fallback.js          (identical math — see fallback.js header)
 *
 * python3 is probed with `python3 -c "import sys"` (bounded, stdlib only, no
 * network). Detection uses a fixed default when no --csv/--out given, and is
 * cached per process only — no state written to disk.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--csv' || a === '--out') out[a.slice(2)] = argv[i + 1];
    else out._.push(a);
  }
  return out;
}

function python3Works() {
  try {
    const r = spawnSync('python3', ['-c', 'import sys'], {
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return r.status === 0 && !r.error;
  } catch (_e) {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args._[0] !== 'pulse') {
    console.error(`[prism-sentinel] unknown engine "${args._[0]}" (expected: pulse)`);
    process.exit(1);
  }
  const csv = args.csv ? path.resolve(args.csv) : path.join(ROOT, 'data', 'samples', 'electricity.csv');
  const out = args.out ? path.resolve(args.out) : path.join(ROOT, 'data', 'radar.pulse.json');

  let used = null;
  let result;
  if (python3Works()) {
    result = spawnSync(
      'python3',
      [path.join(ROOT, 'engines', 'pulse_engine.py'), '--csv', csv, '--out', out],
      { stdio: 'inherit', timeout: 60000 }
    );
    if (result.error) {
      // timed out / spawn failure -> fall through to node fallback
      console.error(`[prism-sentinel] python3 spawn failed (${result.error.message}); using node fallback`);
    } else if (result.status === 0) {
      used = 'python3 engines/pulse_engine.py';
    }
  } else {
    console.log('[prism-sentinel] python3 not available — using node fallback engine (identical math)');
  }

  if (used === null) {
    // node fallback only kicks in when the python path did NOT report success
    // (python3 absent, spawn failed, timed out, OR engine exited non-zero).
    const fb = spawnSync(process.execPath, [path.join(ROOT, 'engines', 'fallback.js'), '--csv', csv, '--out', out], {
      stdio: 'inherit'
    });
    process.exit(fb.status === 0 ? 0 : 1);
    return;
  }
  process.exit(0);
}

main();
