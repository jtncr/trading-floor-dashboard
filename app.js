'use strict';
// Trading Floor dashboard — reads data.json written by the paper trader every minute.
const TZ = 'America/Edmonton';
let DATA = null, RANGE_H = 24;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https:\/\//.test(u || '') ? esc(u) : '#';
const usd = (v, d = 2) => v == null ? '—' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const sgnUsd = v => v == null ? '—' : (v >= 0 ? '+' : '') + usd(v);
const pct = (v, d = 1) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const cls = v => v == null ? '' : v >= 0 ? 'up' : 'down';
const big = v => v == null ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v.toFixed(0);
function price(p) {
  if (p == null) return '—';
  if (p >= 100) return '$' + p.toFixed(2);
  if (p >= 1) return '$' + p.toFixed(4);
  const d = Math.max(4, -Math.floor(Math.log10(p)) + 3);
  return '$' + p.toFixed(Math.min(d, 12));
}
const fmtTime = (iso, opts = {}) => iso ? new Date(iso).toLocaleString('en-CA', {timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, ...opts}) : '—';
const tzAbbr = () => new Intl.DateTimeFormat('en-US', {timeZone: TZ, timeZoneName: 'short'}).formatToParts(new Date()).find(p => p.type === 'timeZoneName').value;
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return Math.max(0, Math.round(s)) + 's ago';
  if (s < 5400) return Math.round(s / 60) + ' min ago';
  if (s < 172800) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
    render();
  } catch (e) {
    $('updated-text').textContent = 'No data yet — is the trader running?';
    document.querySelector('.dot').className = 'dot dead';
  }
}

function render() {
  const d = DATA, a = (d.momentum && d.momentum.account) || d.account;
  const age = (Date.now() - new Date(d.generated_at).getTime()) / 1000;
  document.querySelector('.dot').className = 'dot' + (age > 900 ? ' dead' : age > 180 ? ' stale' : '');
  $('updated-text').innerHTML = `Updated ${esc(fmtTime(d.generated_at, {second: '2-digit'}))} ${esc(tzAbbr())}<br><span class="muted">${esc(ago(d.generated_at))}</span>`;
  $('equity').textContent = usd(a.equity);
  $('pnl').className = 'pnl ' + cls(a.pnl);
  $('pnl').textContent = `${sgnUsd(a.pnl)} (${pct(a.pnl_pct, 2)}) vs ${usd(a.starting_balance, 0)} start`;
  const mo = d.momentum || {};
  const meta = [`<span class="pill">Cash ${usd(a.cash)}</span>`, `<span class="pill b">${(mo.open||[]).length} open</span>`, `<span class="pill g">● Momentum 60M</span>`];
  if (d.scan && d.scan.scanning) meta.push(`<span class="pill a">Rescanning…</span>`);
  $('hero-meta').innerHTML = meta.join('');
  renderChart();
  renderStats();
  renderPositions();
  renderWatchlist();
  renderTrades();
  renderEvents();
  renderRules();
  renderBlocked();
  renderDegen();
  try { renderMomentum(); } catch (e) { console.error(e); }
}

function renderChart() {
  const mo = DATA.momentum || {}, a = mo.account || DATA.account;
  const start = a.starting_balance;
  let pts = (mo.equity_history || DATA.equity_history || []).slice();
  if (RANGE_H) { const cut = Date.now() / 1000 - RANGE_H * 3600; pts = pts.filter(p => p[0] >= cut); }
  if (pts.length < 2) { $('chart').innerHTML = '<div class="empty">Chart fills in as the trader runs.</div>'; return; }
  const W = 600, H = 170, P = 6;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let lo = Math.min(start, ...ys), hi = Math.max(start, ...ys);
  const padv = Math.max((hi - lo) * 0.15, start * 0.004); lo -= padv; hi += padv;
  const x = t => P + (t - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0]) * (W - 2 * P);
  const y = v => H - P - (v - lo) / (hi - lo) * (H - 2 * P);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  const last = ys[ys.length - 1], col = last >= start ? 'var(--green)' : 'var(--red)';
  const area = line + `L${x(xs[xs.length - 1]).toFixed(1)},${H}L${x(xs[0]).toFixed(1)},${H}Z`;
  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${W}" y1="${y(start)}" y2="${y(start)}" stroke="#ffc400" stroke-dasharray="5 5" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".7"/>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${x(xs[xs.length - 1])}" cy="${y(last)}" r="4" fill="${col}"/></svg>`;
}

function stat(label, value, sub, c = '') { return `<div class="stat"><div class="label">${label}</div><div class="v ${c}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`; }
function renderStats() {
  const mo = DATA.momentum || {}, a = mo.account || DATA.account, s = mo.stats || DATA.stats || {};
  const closed = (s.wins || 0) + (s.losses || 0);
  $('stats').innerHTML = [
    stat('Win rate', s.win_rate == null ? '—' : s.win_rate.toFixed(0) + '%', `${s.wins ?? 0}W / ${s.losses ?? 0}L · ${s.closed_trades ?? closed} closed`),
    stat('Realized P&L', sgnUsd(s.realized_pnl), 'closed trades, after costs', cls(s.realized_pnl)),
    stat('Unrealized P&L', sgnUsd(s.unrealized_pnl), 'open marks', cls(s.unrealized_pnl)),
    stat('Buys', s.buys == null ? '—' : String(s.buys), `fees ${usd(s.fees_paid || 0)}`),
    stat('Open', `${(mo.open || DATA.positions || []).length}`, 'Momentum positions'),
    stat('Since', esc(fmtTime(a.created_at, {hour: undefined, minute: undefined})), 'Momentum paper wallet'),
  ].join('');
}

// ---- intel (contract safety / news / social)
const SAFETY = {pass: ['SAFE ✓', 'g'], warn: ['SAFETY ⚠', 'a'], block: ['BLOCKED ⛔', 'r'], unknown: ['SAFETY ?', '']};
function safetyBadge(it) {
  if (!it) return '';
  const [l, c] = SAFETY[it.safety] || ['SAFETY ?', ''];
  const tip = (it.flags || []).filter(f => f.cat === 'safety' && f.sev !== 'good').map(f => f.msg).join(' · ');
  return `<span class="pill ${c}" title="${esc(tip)}">${l}</span>`;
}
function adjChip(w) {
  if (w.intel_adj == null) return '';
  const a = w.intel_adj;
  return `<span class="pill ${a > 0 ? 'g' : a < 0 ? 'r' : ''}" title="quality ${w.base_quality} before intel">intel ${a > 0 ? '+' : ''}${a}</span>`;
}
const SEV_ICON = {block: '⛔', warn: '⚠️', info: '•', good: '✅'};
function flagList(fl) {
  return (fl || []).map(f => `<li class="f-${esc(f.sev)}">${SEV_ICON[f.sev] || '•'} ${esc(f.msg)}${f.pts ? ` <span class="muted">(${f.pts > 0 ? '+' : ''}${f.pts})</span>` : ''}</li>`).join('');
}
function newsList(ns) {
  if (!ns || !ns.length) return '<li class="muted">No relevant headlines in the last 7 days.</li>';
  return ns.map(n => `<li class="tone-${esc(n.tone)}"><a href="${safeUrl(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
    <span class="muted"> · ${esc(n.source || '')}${n.time ? ' · ' + esc(ago(n.time)) : ''}</span></li>`).join('');
}
function socialLine(so) {
  if (!so || so.sentiment == null) return '';
  const s = so.sentiment;
  const hl = (so.highlights || []).map(h => `<li><a href="${safeUrl(h.url)}" target="_blank" rel="noopener">${esc(h.text)}</a></li>`).join('');
  const rf = (so.red_flags || []).map(r => `<li class="f-warn">⚠️ ${esc(r)}</li>`).join('');
  return `<div class="ilabel">X / social</div><div class="mini"><span class="pill ${s > 0.2 ? 'g' : s < -0.2 ? 'r' : ''}">sentiment ${s > 0 ? '+' : ''}${(+s).toFixed(2)}</span><span class="pill">${so.mentions_1h ?? 0} mentions / 1h</span></div>${hl || rf ? `<ul>${rf}${hl}</ul>` : ''}`;
}
function linksLine(it) {
  const L = it.links || {}, out = [];
  if (it.x_handle) out.push(`<a class="pill b" href="${safeUrl('https://x.com/' + it.x_handle.slice(1))}" target="_blank" rel="noopener">${esc(it.x_handle)} ↗</a>`);
  if (L.website) out.push(`<a class="pill b" href="${safeUrl(L.website)}" target="_blank" rel="noopener">Website ↗</a>`);
  if (L.telegram) out.push(`<a class="pill b" href="${safeUrl(L.telegram)}" target="_blank" rel="noopener">Telegram ↗</a>`);
  return out.length ? `<div class="mini">${out.join('')}</div>` : '';
}
function intelDetails(it, open = false) {
  if (!it) return '';
  return `<details class="intel"${open ? ' open' : ''}><summary>Safety, news &amp; social ▾</summary>
    <div class="ilabel">Checks${it.checked_at ? ` <span class="muted">· ${esc(ago(it.checked_at))}</span>` : ''}</div><ul>${flagList(it.flags)}</ul>
    <div class="ilabel">Latest headlines</div><ul class="news">${newsList(it.news)}</ul>
    ${socialLine(it.social)}${linksLine(it)}</details>`;
}
function renderBlocked() {
  const bl = DATA.blocked || [], im = (DATA.intel || {}).meta || {};
  $('bl-count').textContent = bl.length;
  $('bl-list').innerHTML = bl.length ? bl.map(b => `<div class="card blocked">
      <div class="row"><div><span class="sym">${esc(b.symbol)}</span> ${chainPill(b.chain)} <span class="pill r">BLOCKED ⛔</span>
      <div class="name">${esc(b.name)} · was ${esc(b.was)} · ${esc(fmtTime(b.at))}</div></div>${b.dex_url ? `<a class="pill b" href="${safeUrl(b.dex_url)}" target="_blank" rel="noopener">Chart ↗</a>` : ''}</div>
      <ul class="reasons">${(b.reasons || []).map(r => `<li>⛔ ${esc(r)}</li>`).join('')}</ul>
      ${(b.flags || []).length || (b.news || []).length ? `<details><summary>All checks ▾</summary><ul>${flagList(b.flags)}</ul><div class="ilabel">Headlines</div><ul class="news">${newsList(b.news)}</ul></details>` : ''}</div>`).join('')
    : `<div class="card empty">${(DATA.intel || {}).enabled ? 'No tokens blocked — every watchlist / near-cutoff token passed the hard safety checks.' : 'Intel watcher not running.'}</div>`;
  const src = im.sources || {};
  const NAMES = {goplus: 'GoPlus (contract security)', rugcheck: 'RugCheck (Solana)', coingecko: 'CoinGecko detail', google_news: 'Google News RSS', reddit: 'Reddit search', social_json: 'X / social.json', unlocks: 'Token unlocks'};
  $('src-list').innerHTML = Object.keys(src).length ? `<div class="card srcs">${Object.entries(src).map(([k, v]) =>
    `<div class="src"><span class="pill ${v.ok === true ? 'g' : v.ok === false ? 'r' : ''}">${v.ok === true ? 'OK' : v.ok === false ? 'DOWN' : 'OFF'}</span> <b>${esc(NAMES[k] || k)}</b>${v.note ? ` <span class="muted">— ${esc(v.note)}</span>` : ''}</div>`).join('')}
    <div class="muted" style="font-size:11px;margin-top:6px">Last intel pass: ${im.tokens ?? '?'} tokens in ${im.seconds ?? '?'}s. Cached 30–60 min per source.</div></div>` : '';
}

function chainPill(c) { return `<span class="pill ${c === 'SOL' ? 'v' : 'a'}">${esc(c)}</span>`; }
function renderPositions() {
  const mo = DATA.momentum;
  if (mo) {
    const ps = mo.open || [];
    $('pos-count').textContent = ps.length;
    if (!ps.length) { $('pos-list').innerHTML = '<div class="card empty">No open Momentum positions.</div>'; return; }
    $('pos-list').innerHTML = ps.map(p => `<div class="card"><div class="row"><div><span class="sym">${esc(p.symbol)}</span> ${chainPill(p.chain)}<div class="name">${esc(p.name)} · bought ${esc(fmtTime(p.entry_time))}</div></div>
      <div><div class="big ${cls(p.unrealized_pnl)}">${sgnUsd(p.unrealized_pnl)}</div><div class="name" style="text-align:right">${mult(p.multiple)} · value ${usd(p.value_usd)}</div></div></div>
      <div class="mini"><span class="pill">In ${price(p.entry_price)}</span><span class="pill">Now ${price(p.current_price)}</span><span class="pill">Size ${usd(p.cost_usd)}</span>${p.dex_url ? `<a class="pill b" href="${safeUrl(p.dex_url)}" target="_blank" rel="noopener">Chart ↗</a>` : ''}</div></div>`).join('');
    return;
  }
  const ps = DATA.positions;
  $('pos-count').textContent = ps.length;
  if (!ps.length) { $('pos-list').innerHTML = `<div class="card empty">No open positions — waiting for a ${DATA.rules.large_cap_entry_drop_pct != null ? `${DATA.rules.large_cap_entry_drop_pct}% (mcap > ${big(DATA.rules.large_cap_threshold_usd)}) / ` : ''}${DATA.rules.entry_drop_pct}% dip with a bounce on a top-${DATA.rules.top_n} token.</div>`; return; }
  $('pos-list').innerHTML = ps.map(p => {
    const span = p.target_price - p.stop_price;
    const m = Math.min(100, Math.max(0, (p.current_price - p.stop_price) / span * 100));
    const e = (p.entry_price - p.stop_price) / span * 100;
    return `<div class="card">
      <div class="row"><div><span class="sym">${esc(p.symbol)}</span> ${chainPill(p.chain)} ${p.safety ? safetyBadge({safety: p.safety}) : ''}<div class="name">${esc(p.name)} · opened ${esc(fmtTime(p.entry_time))}</div></div>
        <div><div class="big ${cls(p.unrealized_pnl)}">${sgnUsd(p.unrealized_pnl)}</div><div class="name" style="text-align:right">${pct(p.unrealized_pct)} after exit costs</div></div></div>
      <div class="grid4">
        <div class="kv"><div class="k">Entry</div><div class="v">${price(p.entry_price)}</div></div>
        <div class="kv"><div class="k">Current</div><div class="v ${cls(p.price_change_pct)}">${price(p.current_price)} <small>${pct(p.price_change_pct)}</small></div></div>
        <div class="kv"><div class="k">Target</div><div class="v up">${price(p.target_price)}</div></div>
        <div class="kv"><div class="k">Stop</div><div class="v down">${price(p.stop_price)}</div></div>
      </div>
      <div class="bar"><div class="e" style="left:${e}%"></div><div class="m" style="left:calc(${m}% - 2px)"></div></div>
      <div class="barlbl"><span>Stop −${DATA.rules.stop_loss_pct}%</span><span>entry</span><span>Target +${DATA.rules.take_profit_pct}%</span></div>
      <div class="mini"><span class="pill">Size ${usd(p.cost_usd)}</span><span class="pill">Value ${usd(p.value_usd)}</span><span class="pill">Pool liq ${big(p.liquidity_usd)}</span>${p.dex_url ? `<a class="pill b" href="${safeUrl(p.dex_url)}" target="_blank" rel="noopener">Chart ↗</a>` : ''}</div>
      <div class="why"><b>Why bought:</b> ${esc(p.entry_reason)}</div></div>`;
  }).join('');
}

function ring(score) {
  const r = 20, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, score)) / 100;
  const col = score >= 65 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)';
  return `<div class="score"><svg width="48" height="48"><circle cx="24" cy="24" r="${r}" stroke="#2a323d" stroke-width="5" fill="none"/>
   <circle cx="24" cy="24" r="${r}" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/></svg><b>${Math.round(score)}</b></div>`;
}
function renderWatchlist() {
  const wl = DATA.watchlist, sc = DATA.scan || {};
  $('wl-count').textContent = wl.length;
  const st = sc.stats || {};
  $('scan-info').innerHTML = sc.last_scan ? `Last scan ${esc(fmtTime(sc.last_scan))} · ${st.markets ?? '?'} coins → ${st.prefilter ?? '?'} pre-filtered → ${st.volume_liq_pass ?? '?'} pass volume+liquidity → ${st.qualified ?? '?'} qualified. Next ≈ ${esc(fmtTime(sc.next_scan))}. Only the top ${DATA.rules.top_n} by quality are traded.` : (sc.scanning ? 'First scan in progress (CoinGecko free tier is slow — a few minutes)…' : 'Waiting for first scan…');
  if (!wl.length) { $('wl-list').innerHTML = `<div class="card empty">${sc.last_scan ? 'No token meets every criterion right now — quality over quantity.' : 'Scanning…'}</div>`; return; }
  $('wl-list').innerHTML = wl.map(w => {
    const sig = /^signal|position open/.test(w.status || '');
    return `<div class="card wl">
    <div class="wl-head">${ring(w.quality)}
      <div style="flex:1;min-width:0"><div class="row"><div><span class="sym">#${w.rank} ${esc(w.symbol)}</span> ${chainPill(w.chain)} ${w.tradeable ? '<span class="pill g">TRADEABLE</span>' : '<span class="pill">watch only</span>'} ${safetyBadge(w.intel)} ${adjChip(w)}</div>
      <div class="v" style="font-weight:700">${price(w.price)}</div></div>
      <div class="name">${esc(w.name)} · mcap ${big(w.market_cap)} · liq ${big(w.liquidity_usd)} · vol ${big(w.volume_24h)}</div></div></div>
    <div class="status ${sig ? 'sig' : ''}">${esc(w.status)}</div>
    <div class="mini">${w.dip_trigger_pct != null ? `<span class="pill a" title="Entry trigger: price ≥ ${w.dip_trigger_pct}% below the ${DATA.rules.lookback_h}h high (${DATA.rules.large_cap_entry_drop_pct}% if mcap > ${big(DATA.rules.large_cap_threshold_usd)}, else ${DATA.rules.entry_drop_pct}%)">buy dip ${w.dip_trigger_pct}%</span>` : ''}<span class="pill g">${w.up_swings}↑ ${w.down_swings}↓ swings</span><span class="pill">24h range ${w.range_24h_pct}%</span><span class="pill">vol/mcap ${w.vol_mcap_pct}%</span><span class="pill">6h vol ${w.last6h_share_pct ?? '—'}%</span>${w.dex_url ? `<a class="pill b" href="${safeUrl(w.dex_url)}" target="_blank" rel="noopener">Chart ↗</a>` : ''}</div>
    <details><summary>Why it qualified ▾</summary><ul>${(w.reasons || []).map(r => `<li>${esc(r)}</li>`).join('')}
      <li>Score parts: ${Object.entries(w.components || {}).map(([k, v]) => esc(k.replace('_', ' ')) + ' ' + Math.round(v * 100)).join(' · ')}</li>
      ${w.intel_adj != null ? `<li>Quality ${w.base_quality} ${w.intel_adj >= 0 ? '+' : '−'} ${Math.abs(w.intel_adj)} intel = ${w.quality}</li>` : ''}</ul></details>
    ${intelDetails(w.intel)}
  </div>`;
  }).join('');
}

const KIND = {take_profit: ['TAKE PROFIT', 'g'], stop_loss: ['STOP LOSS', 'r'], risk_volume: ['RISK · VOLUME', 'a'], risk_liquidity: ['RISK · LIQUIDITY', 'a'], risk_intel: ['RISK · INTEL', 'r'], stop_loss_corrected: ['STOP (CORRECTED)', 'a']};
function renderTrades() {
  const ts = DATA.trades;
  $('tr-count').textContent = ts.length;
  if (!ts.length) { $('tr-list').innerHTML = '<div class="card empty">No closed trades yet.</div>'; return; }
  $('tr-list').innerHTML = ts.map(t => {
    const [lbl, c] = KIND[t.exit_kind] || [t.exit_kind, ''];
    return `<div class="card"><div class="row"><div><span class="sym">${esc(t.symbol)}</span> ${chainPill(t.chain)} <span class="pill ${c}">${esc(lbl)}</span>
      <div class="name">${esc(fmtTime(t.entry_time))} → ${esc(fmtTime(t.exit_time))}</div></div>
      <div><div class="big ${cls(t.pnl_usd)}">${sgnUsd(t.pnl_usd)}</div><div class="name" style="text-align:right">${pct(t.pnl_pct)} net</div></div></div>
      <div class="mini"><span class="pill">In ${price(t.entry_price)}</span><span class="pill">Out ${price(t.exit_price)}</span><span class="pill">Size ${usd(t.cost_usd)}</span><span class="pill">Fees ${usd(t.fees_usd)}</span></div>
      <div class="why"><b>Entry:</b> ${esc(t.entry_reason)}<br><b>Exit:</b> ${esc(t.exit_reason)}</div></div>`;
  }).join('');
}

function renderEvents() {
  const ev = DATA.events;
  $('ev-list').innerHTML = ev.length ? ev.map(e => `<div class="ev ${esc(e.kind)} ${esc(e.level)}"><div class="t">${esc(fmtTime(e.time, {second: '2-digit'}))}</div><span class="k">${esc(e.kind)}</span>${e.token ? `<b>${esc(e.token)}</b> ` : ''}${esc(e.msg)}</div>`).join('') : '<div class="empty">Nothing logged yet.</div>';
}

function renderRules() {
  if (DATA.momentum) { $('rules-box').innerHTML = '<div class="muted">Swing rules archived — see Momentum Rules below.</div>'; return; }
  const r = DATA.rules;
  $('rules-box').innerHTML = `<b>Universe:</b> BSC + Solana, mcap ≥ $5M, ≥2 up &amp; ≥2 down 10% swings in 24h (5-min zigzag), 24h vol ≥ $500K, vol/mcap ≥ 5%, last-6h ≥ 12.5% of 24h vol, main-pool liquidity ≥ ${big(r.min_liquidity)}. No stables / wrapped / staked.<br>
  <b>Entry:</b> top ${r.top_n} by quality, ≥ ${r.entry_drop_pct}% below the ${r.lookback_h}h high${r.large_cap_entry_drop_pct != null ? ` (≥ ${r.large_cap_entry_drop_pct}% if mcap &gt; ${big(r.large_cap_threshold_usd)})` : ''}, bounced off the low and last 5-min up. Max ${r.max_open_positions} positions, ${r.position_size_pct}% of equity each, 1 entry/token/hour.<br>
  <b>Exit:</b> +${r.take_profit_pct}% take profit · −${r.stop_loss_pct}% stop · exit &amp; drop if volume criteria fail or liquidity &lt; floor. New entries pause below 80% of start.<br>
  <b>Costs:</b> ${r.fee_pct}% swap fee + slippage (≥ ${r.min_slippage_pct}%, scaled by size / pool liquidity) on both sides.`;
}

$('range-tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  RANGE_H = +b.dataset.r;
  document.querySelectorAll('#range-tabs button').forEach(x => x.classList.toggle('on', x === b));
  if (DATA) renderChart();
});

// ---------- Degen Gambles (separate paper wallet) ----------
const VIEWS = ['momentum'];
let VIEW = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : (VIEWS.includes(localStorage.getItem('tf-view')) ? localStorage.getItem('tf-view') : 'momentum');
function setView(v) {
  VIEW = v; try { localStorage.setItem('tf-view', v); } catch (e) {}
  document.querySelectorAll('[id^="view-"]').forEach(el => { el.hidden = el.id !== ('view-' + v); });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setView(b.dataset.v); window.scrollTo(0, 0); } });
setView(VIEW);
const mult = v => v == null ? '—' : v.toFixed(2) + 'x';
function lineChart(el, pts, start) {
  if (pts.length < 2) { $(el).innerHTML = '<div class="empty">Chart fills in as the trader runs.</div>'; return; }
  const W = 600, H = 170, P = 6, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let lo = Math.min(start, ...ys), hi = Math.max(start, ...ys);
  const pad = Math.max((hi - lo) * 0.15, start * 0.004); lo -= pad; hi += pad;
  const x = t => P + (t - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0]) * (W - 2 * P);
  const y = v => H - P - (v - lo) / (hi - lo) * (H - 2 * P);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join('');
  const col = ys[ys.length - 1] >= start ? 'var(--green)' : 'var(--red)';
  $(el).innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${y(start)}" y2="${y(start)}" stroke="#555" stroke-dasharray="4 4"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function countdown(ts) {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return 'selling now';
  return Math.floor(s / 60) + 'm ' + String(Math.floor(s % 60)).padStart(2, '0') + 's';
}
const chartLink = u => u ? `<a class="pill b" href="${safeUrl(u)}" target="_blank" rel="noopener">DexScreener ↗</a>` : '';
const flagsHtml = p => (p.flags || []).map(f => `<div class="flag">⚠ ${esc(f)}</div>`).join('') + (p.dead ? '<div class="flag">☠ liquidity drained — valued at ~$0</div>' : '');
function renderDegen() {
  const g = DATA.degen;
  if (!g) { $('tab-degen').textContent = 'off'; return; }
  const a = g.account, st = g.stats, r = g.rules;
  $('tab-degen').innerHTML = `<span class="${cls(a.pnl)}">${usd(a.equity, 0)} ${pct(a.pnl_pct)}</span>`;
  $('tab-swing').innerHTML = `<span class="${cls(DATA.account.pnl)}">${usd(DATA.account.equity, 0)} ${pct(DATA.account.pnl_pct)}</span>`;
  $('d-equity').textContent = usd(a.equity);
  $('d-pnl').className = 'pnl ' + cls(a.pnl);
  $('d-pnl').textContent = `${sgnUsd(a.pnl)} (${pct(a.pnl_pct, 2)}) vs ${usd(a.starting_balance, 0)} start`;
  const sc = g.scan || {};
  $('d-meta').innerHTML = [`<span class="pill">Cash ${usd(a.cash)}</span>`, `<span class="pill b">${g.open.length} open</span>`,
    `<span class="pill v">🌙 ${g.moon_bags.length} moon bags</span>`,
    sc.buy_block ? `<span class="pill a">⏸ ${esc(sc.buy_block)}</span>` : `<span class="pill g">● Ready to buy next hot qualifier</span>`,
    sc.scanning ? '<span class="pill a">Scanning…</span>' : ''].join('');
  lineChart('d-chart', g.equity_history, a.starting_balance);
  const bm = st.biggest_multiple, bt = st.best_trade, wt = st.worst_trade;
  const stat = (k, v, s, c = '') => `<div class="stat"><div class="label">${k}</div><div class="v ${c}">${v}</div><div class="s">${s}</div></div>`;
  $('d-stats').innerHTML = [
    stat('Realized P&amp;L', sgnUsd(st.realized_pnl), `${st.partial_sells} main sells`, cls(st.realized_pnl)),
    stat('Unrealized P&amp;L', sgnUsd(st.unrealized_pnl), 'open + moon bags', cls(st.unrealized_pnl)),
    stat('Win rate', st.win_rate == null ? '—' : st.win_rate.toFixed(0) + '%', `${st.wins}W / ${st.losses}L · ${st.tp_hits} hit ${r.take_profit_multiple}x`),
    stat('Buys', st.buys, `fees ${usd(st.fees_paid)}`),
    stat('Best trade', bt ? sgnUsd(bt.pnl) : '—', bt ? `${esc(bt.symbol)} · ${mult(bt.multiple)}` : 'no sells yet', bt ? cls(bt.pnl) : ''),
    stat('Worst trade', wt ? sgnUsd(wt.pnl) : '—', wt ? `${esc(wt.symbol)} · ${mult(wt.multiple)}` : 'no sells yet', wt ? cls(wt.pnl) : ''),
    stat('Biggest multiple', bm ? mult(bm.multiple) : '—', bm ? `${esc(bm.symbol)} peak since buy` : '—', bm && bm.multiple >= 1 ? 'up' : ''),
    stat('Equity', usd(a.equity, 0), `cash ${usd(a.cash, 0)}`)].join('');
  $('d-open-count').textContent = g.open.length;
  $('d-open-list').innerHTML = g.open.length ? g.open.map(p => {
    const tp = Math.min(100, Math.max(0, ((p.multiple || 0) - 1) / (r.take_profit_multiple - 1) * 100));
    const el = Math.min(100, Math.max(0, (Date.now() / 1000 - p.entry_ts) / (r.sell_after_minutes * 60) * 100));
    return `<div class="card"><div class="row"><div><span class="sym">${esc(p.symbol)}</span> ${chainPill(p.chain)}<div class="name">${esc(p.name)} · bought ${esc(fmtTime(p.entry_time))}</div></div>
      <div><div class="big ${cls(p.unrealized_pnl)}">${sgnUsd(p.unrealized_pnl)}</div><div class="name" style="text-align:right">${mult(p.multiple)} · value ${usd(p.value_usd)}</div></div></div>
      <div class="name">Progress to ${r.take_profit_multiple}x (${price(p.target_price)})</div><div class="prog"><i style="width:${tp}%"></i></div>
      <div class="name">⏱ ${Math.round(r.sell_after_minutes)}-min sell in <b class="cd" data-due="${p.sell_due_ts}">${countdown(p.sell_due_ts)}</b></div><div class="prog t"><i style="width:${el}%"></i></div>
      <div class="mini"><span class="pill">In ${price(p.entry_price)}</span><span class="pill">Now ${price(p.current_price)}</span><span class="pill">Peak ${mult(p.peak_multiple)}</span><span class="pill">Liq ${big(p.liquidity_usd)}</span>${chartLink(p.dex_url)}</div>
      ${flagsHtml(p)}<div class="why"><b>Why:</b> ${esc(p.entry_reason)}</div></div>`;
  }).join('') : `<div class="card empty">No open gambles — ${esc(sc.buy_block || 'waiting for the next hot token that passes every filter')}.</div>`;
  $('d-moon-count').textContent = g.moon_bags.length;
  $('d-moon-list').innerHTML = g.moon_bags.length ? g.moon_bags.map(p => `<div class="card"><div class="row"><div><span class="sym">🌙 ${esc(p.symbol)}</span> ${chainPill(p.chain)}<div class="name">bought ${esc(fmtTime(p.entry_time))} · main sell ${esc(fmtTime(p.partial && p.partial.time))}</div></div>
      <div><div class="big ${p.multiple >= 1 ? 'up' : 'down'}">${mult(p.multiple)}</div><div class="name" style="text-align:right">bag ${usd(p.value_usd)} (cost ${usd(p.basis_usd)})</div></div></div>
      <div class="mini"><span class="pill">Peak ${mult(p.peak_multiple)}</span><span class="pill">Liq ${big(p.liquidity_usd)}</span><span class="pill">Price ${price(p.current_price)}</span>${chartLink(p.dex_url)}</div>${flagsHtml(p)}</div>`).join('')
    : '<div class="card empty">No moon bags yet.</div>';
  const top = sc.top || [], near = sc.near || [];
  $('d-scan-count').textContent = sc.qualified ?? 0;
  const fc = Object.entries(sc.fail_counts || {}).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
  $('d-scan-info').innerHTML = sc.last_scan ? `Last scan ${esc(fmtTime(sc.last_scan))}: ${sc.candidates} hot tokens → ${sc.evaluated} with DexScreener pairs → ${sc.qualified} qualified. Next ≈ ${esc(fmtTime(sc.next_scan))}.${fc ? `<br>Filter fails: ${fc}` : ''}` : 'First scan pending…';
  const crow = (c, q) => `<div class="card"><div class="row"><div><span class="sym">${esc(c.symbol)}</span> ${chainPill(c.chain)} ${q ? '<span class="pill g">QUALIFIES</span>' : '<span class="pill">near miss</span>'}<div class="name">6h ${pct(c.h6, 0)} · 1h ${pct(c.h1, 0)} · 6h vol ${big(c.vol_h6)} · 1h vol ${big(c.vol_h1)} · liq ${big(c.liquidity)} · age ${c.age_h ?? '?'}h</div></div><div>${chartLink(c.dex_url)}</div></div>${c.fails && c.fails.length ? `<div class="why">✗ ${esc(c.fails.join('; '))}</div>` : ''}</div>`;
  $('d-scan-list').innerHTML = top.map(c => crow(c, true)).join('') + near.map(c => crow(c, false)).join('') || '<div class="card empty">Nothing hot enough right now.</div>';
  $('d-hist-count').textContent = g.history.length;
  $('d-hist-list').innerHTML = g.history.length ? g.history.map(t => { const q = t.partial; return `<div class="card"><div class="row"><div><span class="sym">${esc(t.symbol)}</span> ${chainPill(t.chain)} <span class="pill ${q.kind === 'tp_2_5x' ? 'g' : q.kind === 'stop_30' ? 'r' : 'b'}">${q.kind === 'tp_2_5x' ? r.take_profit_multiple + 'x HIT' : q.kind === 'stop_30' ? '-30% STOP (100% SOLD)' : r.sell_after_minutes + '-MIN SELL'}</span>
      <div class="name">${esc(fmtTime(t.entry_time))} → ${esc(fmtTime(q.time))}</div></div>
      <div><div class="big ${cls(q.pnl)}">${sgnUsd(q.pnl)}</div><div class="name" style="text-align:right">sold at ${mult(q.multiple)}</div></div></div>
      <div class="mini"><span class="pill">In ${price(t.entry_price)}</span><span class="pill">Out ${price(q.price)}</span><span class="pill">Proceeds ${usd(q.proceeds)}</span><span class="pill v">Bag now ${t.status === 'moon' ? usd(t.value_usd) + ' · ' + mult(t.multiple) : 'closed'}</span>${chartLink(t.dex_url)}</div>${flagsHtml(t)}</div>`; }).join('')
    : '<div class="card empty">No main sells yet.</div>';
  const f = r.filters;
  $('d-rules-box').innerHTML = `<b>Wallet:</b> separate fake ${usd(a.starting_balance, 0)}; ${usd(r.buy_usd, 0)} per buy (no buy if cash is short); max 1 buy per ${r.min_minutes_between_buys} min; no re-buy of a token within 24h.<br>
  <b>Hot list:</b> DexScreener boosted / latest-profile / community-takeover tokens + GeckoTerminal 6h trending pools on ${esc(r.chains.join(' + '))}, rescanned every ${r.scan_minutes} min.<br>
  <b>Filters:</b> pair ≥ ${f.min_pair_age_hours}h old · 6h change ≥ +${f.min_change_h6_pct}% · |1h| ≥ ${f.min_abs_change_h1_pct}% (and 1h ≥ ${f.min_change_h1_pct}%) · 6h vol ≥ ${big(f.min_volume_h6_usd)} · 1h vol ≥ ${big(f.min_volume_h1_usd)} · 1h ≥ ${f.min_buys_h1} buys &amp; ${f.min_sells_h1} sells · liquidity ≥ ${big(f.min_liquidity_usd)}. Hottest qualifier is bought immediately. No due diligence; BSC honeypot result is shown as a flag only.<br>
  <b>Sell:</b> ${r.sell_fraction * 100}% at ${r.take_profit_multiple}x entry or ${r.sell_after_minutes} min after the buy, whichever first; ${100 - r.sell_fraction * 100}% moon bag held${r.moon_bag_exit && r.moon_bag_exit.enabled ? ' (auto bag exit on)' : ' indefinitely'}.<br>
  <b>Costs:</b> same fee + liquidity-based slippage model as Swing.`;
}
const MKIND = { stop_25: ['r', '-25% STOP'], early_falling: ['r', 'EARLY EXIT (falling)'], profit_60m: ['g', '100% SOLD @60m'], profit_60m_late: ['g', '100% SOLD (back in profit)'], trail: ['g', 'TRAIL EXIT 100%'] };
function renderMomentum() {
  const g = DATA.momentum;
  if (!g) { $('tab-momentum').textContent = 'off'; return; }
  const a = g.account, st = g.stats, r = g.rules, x = r.exits, sc = g.scan || {};
  $('m-tabname').textContent = $('m-name').textContent = g.name || 'Momentum 60M';
  $('tab-momentum').innerHTML = `<span class="${cls(a.pnl)}">${usd(a.equity, 0)} ${pct(a.pnl_pct)}</span>`;
  $('m-equity').textContent = usd(a.equity);
  $('m-pnl').className = 'pnl ' + cls(a.pnl);
  $('m-pnl').textContent = `${sgnUsd(a.pnl)} (${pct(a.pnl_pct, 2)}) vs ${usd(a.starting_balance, 0)} start`;
  const meta = [`<span class="pill">Cash ${usd(a.cash)}</span>`, `<span class="pill b">${g.open.length} open</span>`];
  if ((g.runners || []).length) meta.push(`<span class="pill v">${g.runners.length} legacy runners</span>`);
  meta.push(sc.buy_block ? `<span class="pill a">⏸ ${esc(sc.buy_block)}</span>` : `<span class="pill g">● Ready to buy next qualifier</span>`);
  if (sc.scanning) meta.push('<span class="pill a">Scanning…</span>');
  $('m-meta').innerHTML = meta.join('');
  lineChart('m-chart', g.equity_history, a.starting_balance);
  const bt = st.best_trade, wt = st.worst_trade;
  const stat = (k, v, s, c = '') => `<div class="stat"><div class="label">${k}</div><div class="v ${c}">${v}</div><div class="s">${s}</div></div>`;
  $('m-stats').innerHTML = [
    stat('Realized P&amp;L', sgnUsd(st.realized_pnl), `${st.profit_sells} profit sells · ${st.stops} stops`, cls(st.realized_pnl)),
    stat('Unrealized P&amp;L', sgnUsd(st.unrealized_pnl), 'open marks', cls(st.unrealized_pnl)),
    stat('Win rate', st.win_rate == null ? '—' : st.win_rate.toFixed(0) + '%', `${st.wins}W / ${st.losses}L`),
    stat('Buys', st.buys, `fees ${usd(st.fees_paid)}`),
    stat('Best trade', bt ? sgnUsd(bt.pnl) : '—', bt ? `${esc(bt.symbol)} · ${mult(bt.multiple)}` : 'no sells yet', bt ? cls(bt.pnl) : ''),
    stat('Worst trade', wt ? sgnUsd(wt.pnl) : '—', wt ? `${esc(wt.symbol)} · ${mult(wt.multiple)}` : 'no sells yet', wt ? cls(wt.pnl) : '')].join('');
  $('m-open-count').textContent = g.open.length;
  $('m-open-list').innerHTML = g.open.length ? g.open.map(p => {
    const el = Math.min(100, Math.max(0, (Date.now() / 1000 - p.entry_ts) / (r.sell_after_minutes * 60) * 100));
    const toStop = p.current_price ? (p.current_price / p.stop_price - 1) * 100 : null;
    const late = Date.now() / 1000 >= p.sell_due_ts;
    return `<div class="card"><div class="row"><div><span class="sym">${esc(p.symbol)}</span> ${chainPill(p.chain)}<div class="name">${esc(p.name)} · bought ${esc(fmtTime(p.entry_time))}</div></div>
      <div><div class="big ${cls(p.unrealized_pnl)}">${sgnUsd(p.unrealized_pnl)}</div><div class="name" style="text-align:right">${mult(p.multiple)} · value ${usd(p.value_usd)}</div></div></div>
      <div class="name">🛑 Stop ${price(p.stop_price)} (-${x.hard_stop_pct}%) — ${toStop == null ? '?' : toStop.toFixed(1) + '% away'}</div><div class="prog"><i style="width:${Math.min(100, Math.max(0, (toStop || 0) / (100 / (1 - x.hard_stop_pct / 100) - 100) * 100))}%"></i></div>
      <div class="name">${late ? `⏳ Past ${r.sell_after_minutes} min — firm 100% exit due` : `⏱ ${r.sell_after_minutes}-min check in <b class="cd" data-due="${p.sell_due_ts}">${countdown(p.sell_due_ts)}</b>`}</div><div class="prog t"><i style="width:${el}%"></i></div>
      <div class="mini"><span class="pill">In ${price(p.entry_price)}</span><span class="pill">Now ${price(p.current_price)}</span><span class="pill">Peak ${mult(p.peak_multiple)}</span><span class="pill">Liq ${big(p.liquidity_usd)}</span>${chartLink(p.dex_url)}</div>
      ${flagsHtml(p)}<div class="why"><b>Why:</b> ${esc(p.entry_reason)}</div></div>`;
  }).join('') : `<div class="card empty">No open positions — ${esc(sc.buy_block || 'waiting for a qualifier that passes every filter')}.</div>`;
  $('m-run-count').textContent = g.runners.length;
  $('m-run-list').innerHTML = g.runners.length ? g.runners.map(p => `<div class="card"><div class="row"><div><span class="sym">🏃 ${esc(p.symbol)}</span> ${chainPill(p.chain)}<div class="name">bought ${esc(fmtTime(p.entry_time))} · partial sold ${esc(fmtTime(p.partial && p.partial.time))}</div></div>
      <div><div class="big ${p.multiple >= 1 ? 'up' : 'down'}">${mult(p.multiple)}</div><div class="name" style="text-align:right">runner ${usd(p.value_usd)} · sells at ${x.runner_take_profit_multiple}x</div></div></div>
      <div class="mini"><span class="pill">Peak ${mult(p.peak_multiple)}</span><span class="pill">Liq ${big(p.liquidity_usd)}</span>${chartLink(p.dex_url)}</div>${flagsHtml(p)}</div>`).join('') : '<div class="card empty">No runners — Momentum sells 100% (no moon bag).</div>';
  const top = sc.top || [], near = sc.near || [];
  $('m-scan-count').textContent = sc.qualified ?? 0;
  const fc = Object.entries(sc.fail_counts || {}).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
  $('m-scan-info').innerHTML = sc.last_scan ? `Last scan ${esc(fmtTime(sc.last_scan))}: ${sc.candidates} candidates → ${sc.evaluated} with pairs → ${sc.qualified} qualified. Next ≈ ${esc(fmtTime(sc.next_scan))}.${fc ? `<br>Filter fails: ${fc}` : ''}` : 'First scan pending…';
  const crow = (c, q) => `<div class="card"><div class="row"><div><span class="sym">${esc(c.symbol)}</span> ${chainPill(c.chain)} ${q ? '<span class="pill g">QUALIFIES</span>' : '<span class="pill">near miss</span>'}<div class="name">mcap ${big(c.mcap)} · 1h ${pct(c.h1, 1)} · 6h ${pct(c.h6, 0)} · 24h vol ${big(c.vol_h24)} · 1h vol ${big(c.vol_h1)} · liq ${big(c.liquidity)}</div></div><div>${chartLink(c.dex_url)}</div></div>${c.fails && c.fails.length ? `<div class="why">✗ ${esc(c.fails.join('; '))}</div>` : ''}</div>`;
  $('m-scan-list').innerHTML = top.map(c => crow(c, true)).join('') + near.map(c => crow(c, false)).join('') || '<div class="card empty">Nothing qualifies right now.</div>';
  $('m-hist-count').textContent = g.history.length;
  $('m-hist-list').innerHTML = g.history.length ? g.history.map(t => { const q = t.partial, k = MKIND[q.kind] || ['b', q.kind]; return `<div class="card"><div class="row"><div><span class="sym">${esc(t.symbol)}</span> ${chainPill(t.chain)} <span class="pill ${k[0]}">${k[1]}</span>
      <div class="name">${esc(fmtTime(t.entry_time))} → ${esc(fmtTime(q.time))}</div></div>
      <div><div class="big ${cls(q.pnl)}">${sgnUsd(q.pnl)}</div><div class="name" style="text-align:right">at ${mult(q.multiple)}</div></div></div>
      <div class="mini"><span class="pill">In ${price(t.entry_price)}</span><span class="pill">Out ${price(q.price)}</span><span class="pill">Proceeds ${usd(q.proceeds)}</span>${t.status === 'moon' ? `<span class="pill v">Runner ${usd(t.value_usd)} · ${mult(t.multiple)}</span>` : ''}${chartLink(t.dex_url)}</div>${flagsHtml(t)}</div>`; }).join('')
    : '<div class="card empty">No exits yet.</div>';
  const f = r.filters;
  $('m-rules-box').innerHTML = `<b>Wallet:</b> separate fake ${usd(a.starting_balance, 0)}; ${usd(r.buy_usd, 0)} per buy (none if cash is short); buys every qualifier while cash allows; no re-buy within 24h.<br>
  <b>Candidates:</b> GeckoTerminal trending (1h/6h/24h) + top pools by 24h volume &amp; tx count + DexScreener boosts on ${esc(r.chains.join(' + '))}, every ${r.scan_minutes} min; majors/stables excluded.<br>
  <b>Entry:</b> mcap (or FDV) ≥ ${big(f.min_market_cap_usd)} · 24h vol ≥ ${big(f.min_volume_h24_usd)} · liquidity ≥ ${big(f.min_liquidity_usd)} · 24h vol/liq ≤ ${f.max_volume_to_liquidity}x · 24h ≥ ${f.min_buys_h24} buys &amp; ${f.min_sells_h24} sells · |1h| ≥ ${f.min_abs_change_h1_pct}% · 1h vol ≥ ${f.min_h1_volume_vs_hourly_avg}x hourly avg. Best momentum (1h, 6h, volume surge) bought immediately; skips tokens falling on <b>both</b> 1h and 6h.<br>
  <b>Anytime:</b> once up ${x.trail_arm_pct}%+, sells 100% if it falls ${x.trail_pct}% off its high.<br><b>Before 60 min:</b> full exit at -${x.hard_stop_pct}%, or${x.early_exit_enabled ? '' : ' (off)'} at -${x.early_exit_drawdown_pct}% while the last 5 min is ≤ -${x.early_exit_m5_drop_pct}%.<br>
  <b>At 60 min:</b> sell 100% regardless of P&amp;L (firm exit, no runner).<br>
  <b>Costs:</b> same fee + slippage model.`;
}
setInterval(() => document.querySelectorAll('.cd').forEach(e => { e.textContent = countdown(+e.dataset.due); }), 1000);

load();
setInterval(load, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
