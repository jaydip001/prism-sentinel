#!/usr/bin/env node
/**
 * PRISM Sentinel — zero-dependency static file server.
 *
 *   node server.js [port]
 *
 * Serves the project root (the directory containing this file) on
 * http://localhost:3000 with correct MIME types. Path-traversal safe,
 * range-safe, and never requires the network for the data itself:
 * all radar data is precomputed by `node engine/index.js` into data/.
 *
 * Live-mode note (documented, not executed): in a production build the
 * same endpoints could be backed by feed adapters that pull SEBI filing
 * RSS, GDS/CIN registry updates, job-board aggregates, power-utilization
 * data and geolocation composites. This server only serves local files.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function safePath(urlPath) {
  // Decode and normalize, then verify we stayed inside ROOT.
  let p;
  try {
    p = decodeURIComponent(urlPath);
  } catch (_e) {
    return null; // bad percent-encoding -> treat as invalid
  }
  const clean = path.normalize(path.join(ROOT, p.replace(/^\/+/, '')));
  if (clean !== ROOT && !clean.startsWith(ROOT + path.sep)) return null;
  return clean;
}

function parseRange(header, size) {
  if (!header || !/^bytes=/.test(header.trim())) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  let start = m[1] === '' ? 0 : parseInt(m[1], 10);
  let end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  // suffix form: bytes=-N means last N bytes
  if (m[1] === '') start = Math.max(0, size - end);
  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  if (start > end) return null;
  return { start, end };
}

const server = http.createServer((req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    let filePath = safePath(url);
    if (filePath === null) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }

    fs.stat(filePath, (statErr, stat) => {
      if (statErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        fs.stat(filePath, (statErr2, stat2) => {
          if (statErr2 || !stat2.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          sendFile(filePath, stat2.size);
        });
        return;
      }
      sendFile(filePath, stat.size);
    });

    function sendFile(file, size) {
      const ext = path.extname(file).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      const range = parseRange(req.headers.range, size);

      if (range) {
        const chunkSize = range.end - range.start + 1;
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Cache-Control': 'no-cache'
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const stream = fs.createReadStream(file, { start: range.start, end: range.end });
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': type,
          'Content-Length': size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        const stream = fs.createReadStream(file);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
      }
    }
  } catch (err) {
    try {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    } catch (_e) {
      /* connection already gone */
    }
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[prism-sentinel] port ${PORT} is in use — try: node server.js ${PORT + 1}`);
    process.exit(1);
  }
  console.error('[prism-sentinel] server error:', err && err.message ? err.message : err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │  PRISM SENTINEL · local quant terminal                    │');
  console.log('  │                                                           │');
  console.log(`  │  Serving ${ROOT}                                   │`);
  console.log(`  │  Open:  http://localhost:${String(PORT).padEnd(5)} (or data/ for raw JSON)         │`);
  console.log('  │  Build offline copy:  npm run build-offline               │');
  console.log('  │  Regenerate radar:    npm run radar                       │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`[prism-sentinel] listening on http://localhost:${PORT} (open a browser there)`);
  console.log('[prism-sentinel] hint: if data/radar.json is missing, run `npm run radar` first');
});
