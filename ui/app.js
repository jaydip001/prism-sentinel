/**
 * PRISM SENTINEL — UI controller (vanilla JS, zero dependencies).
 *
 * Data resolution order:
 *   1. window.__INLINED_DATA__  (injected by scripts/inline.js into build/build.html)
 *   2. fetch('data/*.json')     (served over http; blocked under file:// in most browsers)
 *   3. embedded __INLINED_DEMO__ copy baked into index.html, so a straight
 *      file:// double-click still renders something useful.
 *
 * If (2) fails and we fell back to the demo, we show a banner pointing the
 * user to build/build.html (`npm run build-offline`).
 *
 * All rendering is defensive: every dataset is optional; malformed JSON or
 * missing fields degrade to hints instead of exceptions. No network, no
 * Date.now(), no Math.random() — output is a pure function of the payload.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Compact, deterministic number formatting (MWh, counts, ...). */
  function fmt(v) {
    if (v === null || v === undefined || !isNum(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + ' M';
    if (a >= 1e4) return (v / 1e3).toFixed(1) + ' k';
    if (a >= 100) return String(Math.round(v));
    if (a >= 1) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
  }
  function fmtPct(v) {
    if (!isNum(v)) return '—';
    var s = v > 0 ? '+' : '';
    return s + (Math.round(v * 10) / 10).toFixed(1) + '%';
  }
  function fmtZ(v) {
    if (!isNum(v)) return 'z n/a';
    var s = v > 0 ? '+' : v < 0 ? '−' : '';
    return 'z ' + s + Math.abs(v).toFixed(2);
  }

  /* ----------------------------------------------------- channel metadata */
  /** Units + friendly names for the five standard alt-data channels.
   *  Unknown channel keys fall back gracefully. */
  var CHANNELS = {
    'filings':                 { label: 'filings',              unit: 'disclosures',   desc: 'SEBI / exchange filing cadence' },
    'factory-power':           { label: 'factory-power',        unit: 'MWh',           desc: 'plant & office electricity use' },
    'employee-geolocations':   { label: 'employee-geolocations', unit: 'on-site count', desc: 'aggregated, consented presence' },
    'hiring-social':           { label: 'hiring-social',        unit: 'open reqs',     desc: 'job-board + social hiring signal' },
    'supply-chain':            { label: 'supply-chain',         unit: 'flow index',    desc: 'vendor / logistics momentum' }
  };
  function chMeta(key) { return CHANNELS[key] || { label: key, unit: 'idx', desc: key }; }

  /* ------------------------------------------------------------- loading */
  var DATA = window.__INLINED_DATA__ || null;

  function load(key, url, parse) {
    return new Promise(function (resolve) {
      if (DATA && DATA[key] !== undefined) return resolve(DATA[key]);
      // file://: fetch of local JSON is blocked in Chrome/Safari — skip it,
      // do NOT attempt: we'd just waste a round-trip that always fails.
      if (location.protocol === 'file:') return resolve(null);
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (t) {
          try {
            if (parse === 'json') resolve(JSON.parse(t));
            else resolve(t);
          } catch (e) { resolve(null); }
        })
        .catch(function () { resolve(null); });
    });
  }

  /** Embedded demo so index.html works from a plain double-click too.
   *  Mirrors data/sample-radar.json (4 companies) — deterministic. */
  var INLINED_DEMO = {
    radar: {
      meta: {
        source: 'embedded-demo (mirror of data/sample-radar.json)',
        generated_by: 'index.html (embedded)',
        deterministic: true,
        as_of: 'FY2025-q4 (quarter ended 2025-03-31)',
        note: 'embedded demo copy — run `node engine/index.js radar` for the full dataset'
      },
      companies: [
        demoCo('CGP', 'NSE:CGP', 'Crompton Greaves Consumer Electricals (DEMO)',
          'Consumer Durables & Appliances', 82, 0.71,
          ['capacity-expansion', 'order-book-upturn', 'filings-acceleration', 'hiring-surge'], 0.82,
          [
            demoCh('filings', 'Corporate Filings', 'disclosures/quarter', 9, 5, 0.9, 78, [3, 4, 4, 5, 9]),
            demoCh('factory-power', 'Factory Power', 'MWh', 15480, 11200, 0.71, 88, [9800, 10400, 10750, 11200, 15480]),
            demoCh('employee-geolocations', 'On-site Headcount', 'employees (000s)', 3.94, 3.62, 0.3, 55, [3.4, 3.5, 3.55, 3.62, 3.94]),
            demoCh('hiring-social', 'Hiring & Social Velocity', 'open roles this quarter', 128, 88, 0.58, 74, [72, 78, 80, 88, 128]),
            demoCh('supply-chain', 'Supply-Chain Lead-time', 'index (lower = tighter)', 21, 34, -0.52, 41, [38, 36, 35, 34, 21])
          ],
          'Pre-results read: **capacity expansion is underway** ahead of an **order-book upturn**; filings, power and hiring are converging while supply-chain lead times tighten.'),
        demoCo('TTAN', 'NSE:TTAN', 'Titan Ltd (DEMO)',
          'Consumer Goods & Jewellery', 54, 0.33, [], 0.66,
          [
            demoCh('filings', 'Corporate Filings', 'disclosures/quarter', 3, 3, 0.0, 40, [3, 3, 3, 3, 3]),
            demoCh('factory-power', 'Factory Power', 'MWh', 4620, 4410, 0.1, 60, [4200, 4300, 4380, 4410, 4620]),
            demoCh('employee-geolocations', 'On-site Headcount', 'employees (000s)', 9.6, 9.4, 0.1, 45, [9.1, 9.2, 9.3, 9.4, 9.6]),
            demoCh('hiring-social', 'Hiring & Social Velocity', 'open roles this quarter', 41, 38, 0.1, 48, [33, 35, 36, 38, 41]),
            demoCh('supply-chain', 'Supply-Chain Lead-time', 'index (lower = tighter)', 28, 29, 0.05, 38, [30, 30, 29, 29, 28])
          ],
          'Broad-based but modest gains across all five channels; a **steady-state growth** read with no sharp event flag this period.'),
        demoCo('AIA', 'BSE:AIA', 'AIA Engineering Ltd (DEMO)',
          'Machinery & Defence', 74, 0.55,
          ['order-book-upturn', 'capacity-expansion'], 0.78,
          [
            demoCh('filings', 'Corporate Filings', 'disclosures/quarter', 7, 5, 0.4, 70, [4, 4, 5, 5, 7]),
            demoCh('factory-power', 'Factory Power', 'MWh', 8300, 6900, 0.5, 80, [6100, 6400, 6600, 6900, 8300]),
            demoCh('employee-geolocations', 'On-site Headcount', 'employees (000s)', 2.9, 2.7, 0.4, 58, [2.5, 2.6, 2.65, 2.7, 2.9]),
            demoCh('hiring-social', 'Hiring & Social Velocity', 'open roles this quarter', 96, 70, 0.42, 72, [58, 61, 64, 70, 96]),
            demoCh('supply-chain', 'Supply-Chain Lead-time', 'index (lower = tighter)', 41, 33, 0.48, 46, [30, 31, 32, 33, 41])
          ],
          'Strong **order-book upturn** signature: supply-chain lead-times lengthening while factory power and hiring both step up. Watch delivery slippage risk.'),
        demoCo('DLF', 'NSE:DLF', 'DLF Ltd (DEMO)',
          'Real Estate & REITs', 38, -0.2,
          ['utilization-softening'], 0.55,
          [
            demoCh('filings', 'Corporate Filings', 'disclosures/quarter', 2, 3, -0.2, 30, [3, 3, 3, 3, 2]),
            demoCh('factory-power', 'Site Power', 'MWh', 5200, 5600, -0.25, 35, [5900, 5800, 5700, 5600, 5200]),
            demoCh('employee-geolocations', 'Site Headcount', 'employees (000s)', 1.8, 1.95, -0.3, 42, [2.1, 2.05, 2.0, 1.95, 1.8]),
            demoCh('hiring-social', 'Hiring & Social Velocity', 'open roles this quarter', 12, 19, -0.4, 33, [24, 22, 21, 19, 12]),
            demoCh('supply-chain', 'Supply-Chain Lead-time', 'index (lower = tighter)', 31, 28, 0.1, 38, [26, 27, 28, 28, 31])
          ],
          'A **cooling** read: headcount and power eking down quarter-on-quarter with flat filings — activity is winding down, not a demand signal.')
      ]
    }
  };

  /** One channel record for the embedded demo (array-based channels + history). */
  function demoCh(key, label, unit, current, prior, z, strength, history) {
    var chg = isNum(prior) && prior !== 0 ? ((current - prior) / prior) * 100 : null;
    var direction = chg === null ? 'flat'
      : chg >= 3 ? 'up' : chg <= -3 ? 'down' : 'flat';
    return {
      key: key, label: label, unit: unit,
      current: current, prior: prior,
      chg_pct: chg === null ? null : Math.round(chg * 10) / 10,
      z: z, direction: direction, strength: strength, history: history
    };
  }
  function demoCo(ticker, code, name, sector, pulse, sentiment, eventFlags, confidence,
                  channels, summary) {
    return {
      ticker: ticker, code: code, company: name,
      sector: sector, market: code ? code.split(':')[0] : null,
      sentiment: sentiment, sentiment_summary: [summary],
      event_flags: eventFlags, flags: eventFlags,
      confidence: confidence,
      data_quality: { channels_present: channels.length, channels_total: 5,
                      coverage_pct: channels.length * 20, note: 'demo subset' },
      channels: Object.keys(channels).reduce(function (acc, i) {
        var ch = channels[i];
        acc[ch.key] = ch;
        return acc;
      }, {}),
      pulse: pulse
    };
  }

  /* ----------------------------------------------------- top panel: market */
  function renderRadar(radar) {
    var counts = { total: 0, pos: 0, neg: 0, pulseSum: 0, withPulse: 0 };
    var companies = [];

    if (!radar || !Array.isArray(radar.companies) || radar.companies.length === 0) {
      clear($('div-body'));
      $('div-body').appendChild(el('tr', null, mkTd('muted',
        'no radar data yet — run "node engine/index.js radar" (or npm run radar)', 5)));
      clear($('heat-strip'));
      $('detail-empty').hidden = false;
      $('detail-body').hidden = true;
      setPills(radar && radar.meta ? radar.meta.source : null,
               radar && radar.meta ? radar.meta.generated_by : null, false,
               radar && radar.meta ? radar.meta.as_of : null);
      fillKpis(counts, null);
      renderStripAll([]);
      return;
    }

    radar.companies.forEach(function (c) {
      companies.push(c);
      counts.total += 1;
      if (isNum(c.pulse)) { counts.pulseSum += c.pulse; counts.withPulse += 1; }
      if (c.sentiment === 'positive') counts.pos += 1;
      else if (c.sentiment === 'negative') counts.neg += 1;
    });

    setPills((radar.meta && radar.meta.source) || null,
             (radar.meta && radar.meta.generated_by) || null, false,
             (radar.meta && radar.meta.as_of) || null);
    fillKpis(counts, companies[0]);
    renderHeat(companies);
    renderDivergences(companies);

    $('detail-empty').hidden = true;
    $('detail-body').hidden = false;
    renderStripAll(companies);
    selectCompany(companies[0], null);
  }

  /** Header pills: "data as of" + engine used; demo suffix when embedded.
   *  Real datasets expose meta.as_of; the embedded demo exposes meta.source,
   *  so fall back to that when as_of is absent. */
  function setPills(src, engine, isDemo, asOf) {
    var asof = $('asof-pill'), eng = $('engine-pill');
    eng.textContent = 'engine: ' + (engine || 'unknown');
    asof.textContent = 'data as of: ' + (asOf || src || 'unavailable') +
      (isDemo ? ' · embedded demo' : '');
  }

  function mkTd(cls, text, colSpan) {
    var td = el('td', cls, text);
    if (colSpan) td.colSpan = colSpan;
    return td;
  }

  function fillKpis(counts, top) {
    $('kpi-count').textContent = String(counts.total);
    // avg pulse over companies that actually carry a pulse (nulls excluded,
    // else null-pulse rows drag the mean down and misreport the market).
    $('kpi-avg').textContent = counts.withPulse
      ? String(Math.round(counts.pulseSum / counts.withPulse)) : '–';
    $('kpi-pos').textContent = String(counts.pos);
    $('kpi-neg').textContent = String(counts.neg);
    $('kpi-top').textContent = top && top.ticker ? top.ticker : '—';
    $('kpi-top').classList.toggle('hot', !!(top && Array.isArray(top.flags) && top.flags.length));
  }

  function pulseClass(p) {
    if (!isNum(p)) return 'cold';
    if (p >= 70) return 'hot';
    if (p >= 45) return 'warm';
    return 'cold';
  }

  /* --------------------------------------------------- top panel: heat strip
   *  Sector heat: group companies by sector (c.sector when present, else
   *  sentiment), score each group by mean pulse → one heat cell per group.
   */
  function renderHeat(companies) {
    var strip = $('heat-strip');
    clear(strip);
    if (!companies.length) {
      strip.appendChild(el('div', 'muted', 'no market data yet'));
      return;
    }
    var groups = {};
    companies.forEach(function (c) {
      var key = c.sector || (c.sentiment === 'negative' ? 'negative'
                : c.sentiment === 'positive' ? 'positive' : 'neutral');
      if (!groups[key]) groups[key] = { key: key, sum: 0, n: 0 };
      groups[key].sum += (isNum(c.pulse) ? c.pulse : 0);
      groups[key].n += 1;
    });
    Object.keys(groups).sort(function (a, b) {
      return (groups[b].sum / groups[b].n) - (groups[a].sum / groups[a].n);
    }).forEach(function (k) {
      var g = groups[k];
      var p = g.n ? Math.round(g.sum / g.n) : 0;
      var t = g.key === 'negative' ? 'neg' : pulseClass(p);
      var cell = el('div', 'heat-cell');
      cell.setAttribute('data-t', t);
      cell.title = g.key + ' · avg pulse ' + p + '/100 (' + g.n + ' cos)';
      cell.appendChild(el('div', 'hc-name', g.key));
      cell.appendChild(el('div', 'hc-score', String(p)));
      var bar = el('div', 'hc-bar');
      var i = el('i');
      i.style.width = clamp(p, 0, 100) + '%';
      bar.appendChild(i);
      cell.appendChild(bar);
      cell.addEventListener('click', function () {
        // jump to first company in this group
        companies.forEach(function (other) {
          var okey = other.sector || (other.sentiment === 'negative' ? 'negative'
                      : other.sentiment === 'positive' ? 'positive' : 'neutral');
          if (okey === g.key) selectCompany(other, null);
        });
      });
      strip.appendChild(cell);
    });
  }

  /* ------------------------------------------ top panel: divergences table */
  /** Aggregate every company's divergence records, rank by |gap| desc, take 8. */
  function renderDivergences(companies) {
    var body = $('div-body');
    clear(body);
    var rows = [];
    companies.forEach(function (c) {
      if (!Array.isArray(c.divergences)) return;
      c.divergences.forEach(function (dv) { rows.push({ c: c, dv: dv }); });
    });
    rows.sort(function (a, b) {
      return Math.abs(b.dv.gap || 0) - Math.abs(a.dv.gap || 0);
    });
    rows = rows.slice(0, 8);
    if (!rows.length) {
      body.appendChild(el('tr', null,
        mkTd('muted', 'no divergence records in this dataset', 5)));
      return;
    }
    rows.forEach(function (r, i) {
      var tr = el('tr', 'click');
      var pair = Array.isArray(r.dv.pair) ? r.dv.pair : [];
      tr.appendChild(el('td', 'num', String(i + 1)));
      var coTd = el('td', 'tk', r.c.ticker || '—');
      coTd.title = r.c.company || '';
      tr.appendChild(coTd);
      tr.appendChild(el('td', null, pair.join(' ⇄ ') || '—'));
      tr.appendChild(el('td', 'num', isNum(r.dv.gap) ? (r.dv.gap > 0 ? '+' : '') + r.dv.gap : '—'));
      var reading = el('td', 'pair', r.dv.reading || '');
      reading.style.fontSize = '11px';
      tr.appendChild(reading);
      tr.addEventListener('click', function () {
        selectCompany(r.c, null);
        document.getElementById('panel-company')
          .scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      body.appendChild(tr);
    });
  }

  /* ------------------------------------------------------ company detail */
  function selectCompany(c, rowEl) {
    if (!c) return;
    document.querySelectorAll('.co-item.active').forEach(function (n) { n.classList.remove('active'); });
    var item = document.querySelector('.co-item[data-tk="' + String(c.ticker || '').replace(/"/g, '') + '"]');
    if (item) item.classList.add('active');
    renderDetail(c);
  }

  /** Company strip (left rail): clickable list of all companies on the radar. */
  function renderStripAll(companies) {
    var host = $('company-strip');
    clear(host);
    var sorted = companies.slice().sort(function (a, b) {
      var pa = isNum(a.pulse) ? a.pulse : -1, pb = isNum(b.pulse) ? b.pulse : -1;
      if (pa !== pb) return pb - pa;
      return (a.ticker || '').localeCompare(b.ticker || '');
    });
    sorted.forEach(function (c) {
      var b = el('button', 'co-item');
      b.setAttribute('data-tk', c.ticker || '');
      b.appendChild(el('span', 'co-tk', c.ticker || '??'));
      b.appendChild(el('span', 'co-pulse', isNum(c.pulse) ? String(c.pulse) : '—'));
      b.title = c.company || c.ticker || '';
      b.addEventListener('click', function () { selectCompany(c, b); });
      host.appendChild(b);
    });
    $('company-strip-meta').textContent =
      sorted.length + ' companies · sorted by pulse';
  }

  /** Normalize a company record (either engine shape or sample shape) into
   *  the internal shape every renderer below consumes. */
  function normCompany(c) {
    var pulse = isNum(c.pulse) ? c.pulse : (isNum(c.composite_pulse) ? c.composite_pulse : null);
    var sentiment = c.sentiment;                 // string in engine data, number in sample data
    var channels = {};
    if (Array.isArray(c.channels)) {
      c.channels.forEach(function (ch) {
        if (ch && ch.key) channels[ch.key] = ch;
      });
    } else if (c.channels && typeof c.channels === 'object') {
      for (var k in c.channels) if (Object.prototype.hasOwnProperty.call(c.channels, k)) {
        channels[k] = c.channels[k];
      }
    }
    return {
      ticker: c.ticker, code: c.code, company: c.company,
      sector: c.sector, isin: c.isin, market: c.market,
      data_as_of: c.data_as_of,
      pulse: pulse, sentiment: sentiment,
      event_flags: c.event_flags || c.flags || [],
      divergences: c.divergences || [],
      confidence: c.confidence,
      data_quality: c.data_quality,
      quality_notes: c.quality_notes,
      sentiment_summary: c.sentiment_summary,
      channels: channels,
      // sample/brief shape: an array of {..., markdown, sources, notes}
      briefs: Array.isArray(c.briefs) ? c.briefs : null,
      // briefs.json / data/briefs/<T>.json shape: pre-rendered markdown brief
      brief_text: c.brief_text
    };
  }

  function renderDetail(c) {
    var body = $('detail-body');
    if (!c) {
      body.hidden = true;
      $('detail-empty').hidden = false;
      return;
    }
    var d = normCompany(c);
    body.hidden = false;
    $('detail-empty').hidden = true;

    /* masthead */
    $('d-name').textContent = d.company || d.ticker || '—';
    $('d-ticker').textContent = d.ticker ? (d.ticker + (d.code ? ' · ' + d.code : '')) : '';
    $('d-sector').textContent = [d.sector, d.isin, d.market,
      d.data_as_of ? ('as of ' + d.data_as_of) : null]
      .filter(Boolean).join('  ·  ');

    /* gauge */
    drawGauge(d);

    /* sentiment line: prefer a summary sentence; fall back to the raw value
       (engine data uses strings "positive"/"negative"; sample uses -1..1). */
    var sentTxt = $('d-sentiment');
    clear(sentTxt);
    if (Array.isArray(d.sentiment_summary) && d.sentiment_summary.length) {
      markdownLite(sentTxt, d.sentiment_summary.join('\n'));
    } else if (d.sentiment) {
      if (isNum(d.sentiment)) {
        var cls = d.sentiment > 0 ? 'pos' : d.sentiment < 0 ? 'neg' : '';
        sentTxt.appendChild(el('strong', cls,
          'score ' + (d.sentiment > 0 ? '+' : '') + d.sentiment + ' / 1'));
      } else {
        var cls2 = d.sentiment === 'positive' ? 'pos' : d.sentiment === 'negative' ? 'neg' : '';
        sentTxt.appendChild(el('strong', cls2, String(d.sentiment)));
      }
    } else {
      sentTxt.textContent = '—';
    }

    /* event-flag chips (one row; both shapes funnel into d.event_flags) */
    clear($('d-flags'));
    clear($('d-events'));
    d.event_flags.forEach(function (f) {
      var cls = /retrench|softening|down|slow|miss|cool/i.test(String(f)) ? 'down'
                : /accel|expansion|upturn|surge|capex|capacity/i.test(String(f)) ? 'event'
                : 'flat';
      var chip = el('span', 'chip ' + cls, String(f).replace(/-/g, ' '));
      $('d-events').appendChild(chip);
    });

    /* channel cards */
    renderChannels(d);

    /* brief / quality / sources */
    renderBriefBox(d);
  }

  /** Semi-circular gauge: SVG arc colored by pulse zone + needle. */
  function drawGauge(c) {
    var host = $('d-gauge');
    // remove any prior SVG (keep the number/zone overlays)
    var old = host.querySelector('svg');
    if (old) old.remove();

    var p = isNum(c.pulse) ? clamp(c.pulse, 0, 100) : null;
    var SVGNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 190 100');
    svg.setAttribute('width', '190');
    svg.setAttribute('height', '100');

    // zone arcs: 4 bands (cold → hot) drawn behind the value arc
    var zones = [
      [0, 44, 'var(--cold)'],
      [44, 64, '#2f8a5f'],
      [64, 82, 'var(--accent)'],
      [82, 100, 'var(--hot)']
    ];
    zones.forEach(function (z) {
      var a = document.createElementNS(SVGNS, 'path');
      a.setAttribute('d', arcPath(z[0], z[1]));
      a.setAttribute('stroke', z[2]);
      a.setAttribute('stroke-width', '10');
      a.setAttribute('fill', 'none');
      a.setAttribute('opacity', '0.16');
      svg.appendChild(a);
    });

    if (p !== null) {
      var v = document.createElementNS(SVGNS, 'path');
      v.setAttribute('d', arcPath(0, p));
      v.setAttribute('stroke', pulseStroke(p));
      v.setAttribute('stroke-width', '10');
      v.setAttribute('stroke-linecap', 'round');
      v.setAttribute('fill', 'none');
      svg.appendChild(v);
    }

    $('d-gauge-num').textContent = p === null ? '—' : String(p);
    $('d-gauge-num').style.color = p === null ? 'var(--dim)' : pulseStroke(p);
    $('d-gauge-zone').textContent = p === null ? 'N/A' :
      (p < 44 ? 'COOL' : p < 64 ? 'MILD' : p < 82 ? 'STRONG' : 'SURGING');
    // SVG first, overlays (number/zone divs) stay on top via CSS position.
    // Guarded: some minimal DOM stubs lack insertBefore — fall back to append.
    if (typeof host.insertBefore === 'function') host.insertBefore(svg, host.firstChild);
    else host.appendChild(svg);
  }

  function pulseStroke(p) {
    if (p < 44) return 'var(--cold)';
    if (p < 64) return '#2f8a5f';
    if (p < 82) return 'var(--accent)';
    return 'var(--hot)';
  }

  /** Arc path for a 0-100 value mapped onto a 180° semicircle (r=80, cx=95, cy=95). */
  function arcPath(v0, v1) {
    var cx = 95, cy = 95, r = 80;
    function pt(v) {
      var ang = Math.PI * (1 - v / 100);
      return (cx + r * Math.cos(ang)).toFixed(2) + ' ' + (cy - r * Math.sin(ang)).toFixed(2);
    }
    return 'M ' + pt(v0) + ' A ' + r + ' ' + r + ' 0 0 1 ' + pt(v1);
  }

  /** Channel cards: current vs prior, delta %, sparkline, z, strength bar. */
  function renderChannels(c) {
    var host = $('d-channels');
    clear(host);
    var chans = c.channels || {};
    var keys = Object.keys(chans);
    if (!keys.length) {
      host.appendChild(el('div', 'muted', 'no channels reported for this company'));
      return;
    }
    keys.forEach(function (k) {
      var v = (chans[k] && typeof chans[k] === 'object') ? chans[k] : {};
      var m = chMeta(k);
      var card = el('div', 'ch-card');

      var nameRow = el('div', 'ch-name');
      nameRow.appendChild(document.createTextNode(m.label));
      var st = el('span', 'chip ' +
        (v.status === 'missing' ? 'miss' : (v.direction || 'flat')));
      st.textContent = v.status === 'missing' ? 'no data' : (v.direction || '—');
      nameRow.appendChild(st);
      card.appendChild(nameRow);
      card.title = m.desc || '';

      var valRow = el('div', 'ch-val');
      valRow.appendChild(el('span', 'ch-cur', fmt(v.current)));
      valRow.appendChild(el('span', 'ch-prior', 'prev ' + fmt(v.prior) + ' ' + (m.unit || '')));
      valRow.appendChild(el('span', 'ch-delta ' +
        (isNum(v.chg_pct) ? (v.chg_pct > 0 ? 'pos' : v.chg_pct < 0 ? 'neg' : 'flat') : 'flat'),
        fmtPct(v.chg_pct)));
      card.appendChild(valRow);

      card.appendChild(spark(v));

      var sRow = el('div', 'strength');
      sRow.appendChild(el('span', null, 'STR'));
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      // two conventions in the repo: engine object-map channels carry 0..1
      // strength; array-record channels (sample/INLINED_DEMO) carry 0..100.
      var raw = isNum(v.strength) ? v.strength : 0;
      var sv = raw > 1 ? clamp(raw, 0, 100) / 100 : clamp(raw, 0, 1);
      fill.style.width = (sv * 100).toFixed(0) + '%';
      fill.style.background = 'linear-gradient(90deg,#1c5c3a,var(--accent))';
      track.appendChild(fill);
      sRow.appendChild(track);
      sRow.appendChild(el('span', null, String(Math.round(sv * 100))));
      card.appendChild(sRow);

      card.appendChild(el('div', 'ch-z',
        fmtZ(v.z) + ' · ' + (v.period || '—') + ' · ' + m.unit));
      host.appendChild(card);
    });
  }

  /** "Why this matters" narrative + data quality & confidence + sources. */
  function renderBriefBox(c) {
    var body = $('d-brief-body');
    var q = $('d-quality-body');
    var s = $('d-sources-body');
    clear(body); clear(q); clear(s);

    /* narrative (markdown-lite: **bold**, *italic*, `code`, "- " bullets, ## headers).
       Sources of narrative, in order: engine brief_text (briefs.json /
       data/briefs/<T>.json), briefs[0].markdown|narrative (sample-radar shape),
       then sentiment_summary (both engine & sample shapes carry it as text). */
    var md = c.brief_text ||
      (Array.isArray(c.briefs) && c.briefs.length && c.briefs[0]
        ? (c.briefs[0].markdown || c.briefs[0].narrative || null) : null) ||
      (Array.isArray(c.sentiment_summary) ? c.sentiment_summary.join('\n') : null);
    if (md) {
      markdownLite(body, md);
    } else {
      body.appendChild(el('p', 'muted',
        'No narrative brief for this company — flags and divergences below are the raw read.'));
    }

    /* divergences inside the brief */
    if (Array.isArray(c.divergences) && c.divergences.length) {
      body.appendChild(el('h4', null, 'divergences'));
      c.divergences.forEach(function (dv) {
        if (!dv || typeof dv !== 'object') return;
        var pair = Array.isArray(dv.pair) ? dv.pair : [];
        var p = el('p', 'divergence-line');
        p.appendChild(el('span', 'pair', pair.join(' ⇄ ')));
        p.appendChild(document.createTextNode(' · ' + (dv.reading || '')));
        body.appendChild(p);
      });
    }

    /* quality + confidence */
    if (c.data_quality && typeof c.data_quality === 'object') {
      var dq = c.data_quality;
      q.appendChild(el('div', 'qnote',
        'coverage: ' + (isNum(dq.coverage_pct) ? dq.coverage_pct + '%' : '—') +
        ' (' + (isNum(dq.channels_present) ? dq.channels_present : '?') + '/' +
        (isNum(dq.channels_total) ? dq.channels_total : '?') + ' channels) — ' +
        (dq.note || '')));
    }
    if (isNum(c.confidence)) {
      var bar = el('div', 'conf');
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = (clamp(c.confidence, 0, 1) * 100).toFixed(0) + '%';
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(el('span', 'pct', Math.round(c.confidence * 100) + '%'));
      q.appendChild(el('h4', null, 'confidence'));
      q.appendChild(bar);
    }

    /* quality_notes (sample shape: string[]; engine shape: none) */
    if (Array.isArray(c.quality_notes) && c.quality_notes.length) {
      var qn = el('h4', null, 'quality notes');
      q.appendChild(qn);
      c.quality_notes.forEach(function (note) {
        q.appendChild(inlineMd(el('p', 'qnote'), String(note)));
      });
    }

    /* sources */
    var sources = c.sources ||
      (Array.isArray(c.briefs) && c.briefs[0] && Array.isArray(c.briefs[0].sources)
        ? c.briefs[0].sources : null) ||
      ['DEMO — synthetic alternative-data stand-ins (see engine/index.js header)'];
    if (!Array.isArray(sources)) sources = [String(sources)];
    sources.forEach(function (src) {
      s.appendChild(el('li', null, String(src)));
    });
  }

  /** Minimal, safe markdown-lite renderer: **b**, *i*, `code`, "- " lists,
   *  "## " subheads. Everything else is plain text (escaped). */
  function markdownLite(container, text) {
    var lines = String(text).split('\n');
    var listOpen = false;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) { return; }
      if (t.charAt(0) === '-' || t.charAt(0) === '*') {
        if (!listOpen) {
          var ul = el('ul');
          container.appendChild(ul);
          listOpen = true;
          container._list = ul;
        }
        container._list.appendChild(inlineMd(el('li'), t.replace(/^[-*]\s*/, '')));
        return;
      }
      if (listOpen) { listOpen = false; container._list = null; }
      if (t.indexOf('## ') === 0) {
        container.appendChild(el('h4', null, t.slice(3)));
      } else {
        container.appendChild(inlineMd(el('p'), t));
      }
    });
  }

  /** Inline markdown (**bold**, *italic*, `code`) appended as safe nodes. */
  function inlineMd(node, text) {
    var re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.charAt(0) === '*') {
        node.appendChild(el(tok.slice(0, 2) === '**' ? 'strong' : 'em', null,
          tok.slice(2, -2)));
      } else {
        node.appendChild(el('code', null, tok.slice(1, -1)));
      }
      last = m.index + tok.length;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    return node;
  }

  /** Sparkline: uses the channel's real history[] series when present
   *  (array-of-channel-records shape, e.g. data/sample-radar.json / embedded
   *  demo), otherwise 2-point prior→current with deterministic interpolated
   *  midpoints (engine object-map shape). Never throws on missing values. */
  function spark(v) {
    var W = 120, H = 34, pad = 4;
    var pts = (Array.isArray(v.history) ? v.history : [])
      .filter(isNum).slice(0, 32);
    if (pts.length < 2) {
      var a = isNum(v.prior) ? v.prior : 0;
      var b = isNum(v.current) ? v.current : 0;
      // deterministic midpoints: linear ramp + fixed sine wobble (no randomness)
      var n = 6;
      pts = [];
      for (var i = 0; i < n; i++) {
        var t = i / (n - 1);
        var base = a + (b - a) * t;
        var wobble = Math.sin(t * Math.PI * 2 + (b >= a ? 0 : 2.1)) * (Math.abs(b - a) * 0.08 + 0.5);
        pts.push(base + wobble * (i === 0 || i === n - 1 ? 0 : 1));
      }
      pts[0] = a; pts[n - 1] = b;
    }
    var nn = pts.length;
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var span = (max - min) || 1;
    var X = function (i) { return pad + (W - 2 * pad) * (i / (nn - 1)); };
    var Y = function (p) { return H - pad - (H - 2 * pad) * ((p - min) / span); };
    var coords = [];
    for (var j = 0; j < nn; j++) coords.push(X(j).toFixed(1) + ',' + Y(pts[j]).toFixed(1));

    var dir = v.direction || 'flat';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'spark');
    svg.setAttribute('data-dir', dir);
    svg.setAttribute('preserveAspectRatio', 'none');
    var base = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    base.setAttribute('class', 'spark-base');
    base.setAttribute('points', '0,' + Y(min).toFixed(1) + ' ' + W + ',' + Y(min).toFixed(1));
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', 'main');
    line.setAttribute('points', coords.join(' '));
    var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', X(nn - 1).toFixed(1));
    dot.setAttribute('cy', Y(pts[nn - 1]).toFixed(1));
    dot.setAttribute('r', '2');
    dot.setAttribute('class', 'main');
    svg.appendChild(base); svg.appendChild(line); svg.appendChild(dot);
    return svg;
  }

  /* ------------------------------------------------------ universe / pulse */
  function renderUniverse(doc) {
    var wrap = $('universe-rows');
    clear(wrap);
    if (!doc || !(doc.nifty50 || doc.bse500)) {
      wrap.appendChild(el('div', 'muted',
        'No universe data — run "node engine/index.js all" then reload.'));
      return;
    }
    ['nifty50', 'bse500'].forEach(function (key) {
      var list = Array.isArray(doc[key]) ? doc[key] : [];
      var col = el('div', 'uni-col');
      var withPulse = list.filter(function (t) {
        return t && t.pulse != null;
      }).length;
      col.appendChild(el('h3', null, key + ' — ' + withPulse + '/' + list.length + ' with sample pulse'));
      var table = el('table', 'uni-table');
      var thead = el('thead');
      var hr = el('tr');
      ['ticker', 'company', 'pulse', 'status'].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      var tbody = el('tbody');
      list.forEach(function (t) {
        if (!t || typeof t !== 'object') return;
        var tr = el('tr');
        tr.appendChild(el('td', 'tk', t.ticker || '—'));
        tr.appendChild(el('td', null, t.company || t.ticker || '—'));
        var ptd = el('td', 'num', t.pulse != null ? String(t.pulse) : 'null');
        tr.appendChild(ptd);
        var ok = t.data === 'sample-signals' || t.data === 'ok';
        tr.appendChild(el('td', ok ? 'status-ok' : 'status-miss', t.data || '—'));
        tbody.appendChild(tr);
      });
      table.appendChild(thead); table.appendChild(tbody);
      col.appendChild(table);
      wrap.appendChild(col);
    });
  }

  /* One compact pulse table (title row + 6-col body). Feeds: power=MWh,
   * geo=headcount, filings=disclosure counts. All share the engine schema. */
  function pulseTable(doc, title) {
    var col = el('div', 'uni-col');
    var eng = (doc.meta && doc.meta.engine) || 'pulse_engine';
    col.appendChild(el('h3', null, title + ' · z vs trailing window · engine: ' + eng));
    var table = el('table', 'uni-table pulse-table');
    var thead = el('thead');
    var hr = el('tr');
    ['ticker', 'period', 'value', 'prior', 'z', 'trend'].forEach(function (h) {
      hr.appendChild(el('th', null, h));
    });
    thead.appendChild(hr);
    var tbody = el('tbody');
    doc.companies.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var tr = el('tr');
      tr.appendChild(el('td', 'tk', c.ticker || '—'));
      tr.appendChild(el('td', null, c.period || '—'));
      tr.appendChild(el('td', 'num', isNum(c.value) ? String(c.value) : 'null'));
      tr.appendChild(el('td', 'num', c.prior != null ? String(c.prior) : 'null'));
      tr.appendChild(el('td', 'num', isNum(c.z) ? c.z.toFixed(2) : 'null'));
      var cls = c.trend === 'up' ? 'status-ok' : c.trend === 'down' ? 'neg' : '';
      tr.appendChild(el('td', cls || null, c.trend || '—'));
      tbody.appendChild(tr);
    });
    table.appendChild(thead); table.appendChild(tbody);
    col.appendChild(table);
    return col;
  }

  function renderPulse() {
    var wrap = $('pulse-rows');
    clear(wrap);
    var feeds = [
      { doc: PULSE_DOCS.pulse, title: 'power feed · MWh' },
      { doc: PULSE_DOCS.pulseGeo, title: 'geo feed · headcount' },
      { doc: PULSE_DOCS.pulseFilings, title: 'filings feed · disclosures' }
    ].filter(function (f) {
      return f.doc && Array.isArray(f.doc.companies) && f.doc.companies.length > 0;
    });
    if (feeds.length === 0) {
      wrap.appendChild(el('div', 'muted',
        'No pulse data — run "npm run pulse" (python3, or node fallback) then reload.'));
      return;
    }
    feeds.forEach(function (f) { wrap.appendChild(pulseTable(f.doc, f.title)); });
  }

  var PULSE_DOCS = {};
  function attachPulse(key, doc) { PULSE_DOCS[key] = doc; }

  /* ----------------------------------------------------------------- boot */
  function boot() {
    load('radar', 'data/radar.json', 'json').then(function (radar) {
      var used = radar || null;
      if (!used) {
        // fall back to the embedded demo so file:// is never blank;
        // surface the banner (index.html #fallback-banner) when it exists.
        used = INLINED_DEMO.radar;
        var banner = $('fallback-banner');
        if (banner && 'hidden' in banner) banner.hidden = false;
      }
      renderRadar(used);
      renderStripAll((used && used.companies) || []);
    });
    load('universe', 'data/radar.universe.json', 'json').then(renderUniverse);
    // pulse feeds load independently; renderPulse() re-renders the panel each
    // time one lands so a partially-arrived set still shows what's present.
    ['pulse', 'pulseGeo', 'pulseFilings'].forEach(function (key) {
      load(key, 'data/radar.pulse' + (key === 'pulse' ? '' : key === 'pulseGeo' ? '.geo' : '.filings') + '.json', 'json')
        .then(function (d) { PULSE_DOCS[key] = d; renderPulse(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
