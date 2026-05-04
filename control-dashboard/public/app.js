// OpenClaw Control — operations console client.

// ─────────────────────────── Tiny utilities ───────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}
async function apiText(path) {
  const r = await fetch(path);
  return { ok: r.ok, status: r.status, text: await r.text() };
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function dt(s) { return s ? new Date(s).toLocaleString() : '—'; }
function timeOnly(s) { return s ? new Date(s).toLocaleTimeString() : '—'; }
function relTime(s) {
  if (!s) return '—';
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 0) {
    const sec = Math.round(-ms / 1000);
    if (sec < 90) return `in ${sec}s`;
    const min = Math.round(sec / 60);
    if (min < 90) return `in ${min}m`;
    const hr = Math.round(min / 60);
    return `in ${hr}h`;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 90) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 90) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}
function formatElapsed(ms) {
  if (!ms || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function chip(text, kind) {
  const k = kind || 'mute';
  return `<span class="chip ${k}">${escapeHtml(text)}</span>`;
}
function headlineKind(h) {
  if (!h || h === 'UNKNOWN') return 'mute';
  if (h === 'OK') return 'ok';
  if (h === 'ATTENTION') return 'warn';
  return 'bad';
}
function flattenFiles(filesObj, prefix = '') {
  const out = [];
  if (!filesObj || typeof filesObj !== 'object') return out;
  for (const [k, v] of Object.entries(filesObj)) {
    const label = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push({ label, path: v });
    else if (v && typeof v === 'object') out.push(...flattenFiles(v, label));
  }
  return out;
}

// Safer mini markdown → HTML (escape first, then enable a subset of inline + block).
function renderMarkdown(src) {
  if (!src) return '<div class="empty">empty</div>';
  let s = escapeHtml(src);
  // fenced code blocks
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, body) =>
    `<pre><code data-lang="${escapeHtml(lang || '')}">${body.replace(/\n/g, '\n')}</code></pre>`);
  // headings
  s = s.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^##\s+(.+)$/gm,  '<h2>$1</h2>');
  s = s.replace(/^#\s+(.+)$/gm,   '<h1>$1</h1>');
  // horizontal rule
  s = s.replace(/^-{3,}$/gm, '<hr>');
  // blockquote (single-line)
  s = s.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  // unordered list
  s = s.replace(/(^|\n)((?:\s*[-*]\s+.+(?:\n|$))+)/g, (_, lead, blk) => {
    const items = blk.trim().split(/\n/).map(l => l.replace(/^\s*[-*]\s+/, '')).map(t => `<li>${t}</li>`).join('');
    return `${lead}<ul>${items}</ul>`;
  });
  // ordered list
  s = s.replace(/(^|\n)((?:\s*\d+\.\s+.+(?:\n|$))+)/g, (_, lead, blk) => {
    const items = blk.trim().split(/\n/).map(l => l.replace(/^\s*\d+\.\s+/, '')).map(t => `<li>${t}</li>`).join('');
    return `${lead}<ol>${items}</ol>`;
  });
  // bold + italic + inline code
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>');
  // paragraphs (split on blank lines) — but skip lines already starting with a block tag
  const blocks = s.split(/\n{2,}/).map(b => {
    const t = b.trim();
    if (!t) return '';
    if (/^<(h\d|ul|ol|pre|blockquote|hr|table)/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  });
  return blocks.join('\n');
}

// ─────────────────────────── Confirm modal ───────────────────────────
function confirmAction(title, text) {
  return new Promise(resolve => {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    const overlay = $('#confirm-overlay');
    overlay.classList.add('show');
    const cleanup = (ok) => {
      overlay.classList.remove('show');
      $('#confirm-ok').onclick = null;
      $('#confirm-cancel').onclick = null;
      resolve(ok);
    };
    $('#confirm-ok').onclick = () => cleanup(true);
    $('#confirm-cancel').onclick = () => cleanup(false);
  });
}

// ─────────────────────────── App state ───────────────────────────
const state = {
  route: { page: null, sub: null },
  registry: null,                     // /api/systems
  status: {},                         // alias -> status payload
  summary: null,                      // /api/summary
  liveActions: {},                    // alias -> {name, startedAt, status, result, output, durationMs}
  lastActivity: [],
  selectedClaudeTaskId: null,
  fileViewers: {}                     // path -> {text, ts}
};

// ─────────────────────────── Routing ───────────────────────────
function parseHash() {
  const raw = (location.hash || '#news').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean);
  return { page: parts[0] || 'news', sub: parts[1] || null };
}
function navigate(page, sub) {
  const next = sub ? `#${page}/${sub}` : `#${page}`;
  if (location.hash !== next) location.hash = next;
  else onRouteChange();
}
window.addEventListener('hashchange', onRouteChange);

async function onRouteChange() {
  state.route = parseHash();
  highlightSidebar();
  await render();
}

function highlightSidebar() {
  const { page, sub } = state.route;
  $$('#sidebar-nav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === page);
  });
  $$('#sidebar-nav .nav-children').forEach(c => {
    c.classList.toggle('expanded', c.dataset.children === page);
  });
  $$('#sidebar-nav .nav-child').forEach(el => {
    el.classList.toggle('active', el.dataset.route === `${page}/${sub || 'overview'}`);
  });
  // Crumbs
  const PAGE_TITLES = {
    news: 'News Dashboard', organizer: 'Organizer V2', 'system-map': 'System Map',
    'traffic-law': 'Traffic Appeal IL',
    claude: 'Claude Code', activity: 'Activity', telegram: 'Telegram / Topics'
  };
  const ORG_TITLES = { overview: 'Overview', computer: 'Computer', gmail: 'Gmail', photos: 'Photos' };
  let label = PAGE_TITLES[page] || page;
  if (page === 'organizer' && sub) label = `Organizer V2 / ${ORG_TITLES[sub] || sub}`;
  $('#crumb-page').textContent = label.toUpperCase();
}

// ─────────────────────────── Render dispatcher ───────────────────────────
async function render() {
  const { page, sub } = state.route;
  const host = $('#page-host');

  if (page === 'news')         return renderNewsPage(host);
  if (page === 'organizer')    return renderOrganizerPage(host, sub || 'overview');
  if (page === 'system-map')   return renderSystemMapPage(host);
  if (page === 'traffic-law')  return renderTrafficLawPage(host);
  if (page === 'claude')       return renderClaudePage(host);
  if (page === 'activity')     return renderActivityPage(host);
  if (page === 'telegram')     return renderTelegramPage(host);

  host.innerHTML = `<div class="empty">UNKNOWN ROUTE: ${escapeHtml(page)}</div>`;
}

// ─────────────────────────── Data loaders ───────────────────────────
async function loadRegistry() {
  if (state.registry) return state.registry;
  const r = await api('/api/systems');
  if (r.ok) state.registry = r.data;
  return state.registry;
}
async function loadStatus(alias, force = false) {
  if (!force && state.status[alias]) return state.status[alias];
  const r = await api(`/api/system/${alias}/status`);
  if (r.ok) state.status[alias] = r.data;
  return state.status[alias];
}
async function loadSummary() {
  const r = await api('/api/summary');
  if (r.ok) state.summary = r.data;
  return state.summary;
}
async function loadActivity(filter = {}) {
  const params = new URLSearchParams({ limit: filter.limit || 200 });
  if (filter.alias) params.set('alias', filter.alias);
  if (filter.mode)  params.set('mode', filter.mode);
  if (filter.status) params.set('status', filter.status);
  const r = await api('/api/activity?' + params.toString());
  if (r.ok) state.lastActivity = r.data.entries;
  return state.lastActivity;
}

function findActionDef(alias, name) {
  const sys = (state.registry?.systems || []).find(s => s.alias === alias);
  return sys?.actions?.find(a => a.name === name) || null;
}

// ─────────────────────────── Action runner ───────────────────────────
function liveActionPanel(alias) {
  const live = state.liveActions[alias];
  if (!live) return '';
  const cls = live.status === 'running' ? '' : (live.status === 'ok' ? 'done' : 'fail');
  const barCls = live.status === 'running' ? '' : (live.status === 'ok' ? 'done' : 'fail');
  const elapsed = live.endedAt
    ? new Date(live.endedAt).getTime() - new Date(live.startedAt).getTime()
    : Date.now() - new Date(live.startedAt).getTime();
  const statusLabel = live.status === 'running' ? 'EXECUTING' : (live.status === 'ok' ? 'COMPLETE' : 'FAILED');
  const statusKind = live.status === 'running' ? 'cyan' : (live.status === 'ok' ? 'ok' : 'bad');
  let outputBlock = '';
  if (live.output) {
    outputBlock = `<div class="live-output">${escapeHtml(live.output).slice(0, 12000)}</div>`;
  }
  return `
    <div class="live-action ${cls}" data-live="${escapeHtml(alias)}">
      <div class="live-row">
        <span class="chip ${statusKind} chip-large">${statusLabel}</span>
        <span class="live-name">${escapeHtml(live.label || live.name)}</span>
        <span class="live-meta" data-live-elapsed>${formatElapsed(elapsed)} elapsed</span>
      </div>
      <div class="progress ${barCls}"><div class="progress-bar"></div></div>
      ${outputBlock}
    </div>`;
}

async function runAction(alias, name, opts = {}) {
  const def = findActionDef(alias, name);
  if (!def) { alert(`Unknown action: ${alias}/${name}`); return; }

  if (def.requiresConfirmation) {
    const ok = await confirmAction(
      `RUN  ${name.toUpperCase()}?`,
      def.mode === 'send'
        ? 'This action sends data outside this machine. Confirm to proceed.'
        : 'This action is marked as destructive. Confirm to proceed.'
    );
    if (!ok) return;
  }

  state.liveActions[alias] = {
    name, label: def.label || name, mode: def.mode,
    status: 'running', startedAt: new Date().toISOString(),
    output: '', endedAt: null, result: null
  };
  await render();
  ensureTicker();

  const r = await api(`/api/system/${alias}/action/${name}`, { method: 'POST', body: { confirm: true } });
  const live = state.liveActions[alias];
  if (live) {
    live.endedAt = new Date().toISOString();
    live.result = r.data;
    if (r.ok && (r.data?.ok !== false)) live.status = 'ok';
    else live.status = 'fail';
    // Try to extract stdout/stderr from runProcess result
    const inner = r.data?.result || r.data;
    let combined = '';
    if (inner?.stdout) combined += inner.stdout;
    if (inner?.stderr) combined += (combined ? '\n--- stderr ---\n' : '') + inner.stderr;
    if (!combined && typeof inner === 'object') {
      try { combined = JSON.stringify(inner, null, 2); } catch {}
    } else if (!combined && typeof inner === 'string') {
      combined = inner;
    }
    live.output = combined;
  }
  // Refresh status for this system after a brief delay
  setTimeout(async () => {
    await loadStatus(alias, true);
    await loadSummary();
    if (state.route.page === alias.split('-')[0] || state.route.page === alias) await render();
    paintGlobalPulse();
    paintNavBadges();
  }, 400);
  await render();
}

let tickerInterval = null;
function ensureTicker() {
  if (tickerInterval) return;
  tickerInterval = setInterval(() => {
    // Update elapsed counters in any visible live panels
    $$('[data-live-elapsed]').forEach(el => {
      const wrap = el.closest('[data-live]');
      if (!wrap) return;
      const alias = wrap.dataset.live;
      const live = state.liveActions[alias];
      if (!live) return;
      const elapsed = live.endedAt
        ? new Date(live.endedAt).getTime() - new Date(live.startedAt).getTime()
        : Date.now() - new Date(live.startedAt).getTime();
      el.textContent = `${formatElapsed(elapsed)} elapsed`;
    });
    // Sidebar clock
    const c = $('#sidebar-clock'); if (c) c.textContent = new Date().toLocaleTimeString();
    const t = $('#topbar-clock'); if (t) t.textContent = new Date().toLocaleTimeString();
  }, 1000);
}

// ─────────────────────────── Sidebar wiring ───────────────────────────
function closeMobileDrawer() {
  document.body.classList.remove('drawer-open');
  const sc = $('#nav-scrim'); if (sc) sc.hidden = true;
}
function openMobileDrawer() {
  document.body.classList.add('drawer-open');
  const sc = $('#nav-scrim'); if (sc) sc.hidden = false;
}
function wireSidebar() {
  $$('#sidebar-nav .nav-item, #sidebar-nav .nav-child').forEach(el => {
    el.onclick = (e) => {
      e.preventDefault();
      const route = el.dataset.route;
      if (!route) return;
      const [page, sub] = route.split('/');
      navigate(page, sub);
      closeMobileDrawer();
    };
  });
  $('#refresh-btn').onclick = async () => {
    state.registry = null;
    state.status = {};
    state.summary = null;
    await Promise.all([loadRegistry(), loadSummary()]);
    paintGlobalPulse();
    paintNavBadges();
    await render();
  };
  const navToggle = $('#nav-toggle');
  if (navToggle) navToggle.onclick = () => {
    document.body.classList.contains('drawer-open') ? closeMobileDrawer() : openMobileDrawer();
  };
  const scrim = $('#nav-scrim');
  if (scrim) scrim.onclick = closeMobileDrawer;
  // Esc closes drawer
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileDrawer(); });
}
async function paintGlobalPulse() {
  const pulse = $('#global-pulse');
  const stateEl = $('#global-state');
  const metaEl = $('#global-meta');
  const sum = state.summary;
  if (!sum) {
    pulse.classList.add('cold');
    stateEl.textContent = '—';
    metaEl.textContent = 'no data';
    return;
  }
  pulse.classList.remove('attention', 'bad', 'cold');
  const w = sum.worstState || 'OK';
  if (w === 'ATTENTION') pulse.classList.add('attention');
  else if (w !== 'OK') pulse.classList.add('bad');
  stateEl.textContent = w;
  const parts = [];
  parts.push(`${sum.openIssuesCount || 0} open`);
  if (sum.nextCron) parts.push(`next: ${timeOnly(sum.nextCron.at)}`);
  metaEl.textContent = parts.join(' · ');
}
async function paintNavBadges() {
  const sum = state.summary;
  $$('#sidebar-nav .nav-badge').forEach(b => { b.className = 'nav-badge cold'; });
  if (!sum) return;
  for (const sys of sum.systems || []) {
    const el = $(`#sidebar-nav .nav-badge[data-badge="${sys.alias}"]`);
    if (!el) continue;
    el.className = 'nav-badge ' + (sys.openIssues > 0 ? 'warn' : 'ok');
    if (sys.headline === 'CRITICAL' || sys.headline === 'ERROR') el.className = 'nav-badge bad';
  }
}

// ─────────────────────────── Page widgets ───────────────────────────
function pageHero({ title, sub, status }) {
  const k = headlineKind(status);
  return `
    <div class="hero">
      <div>
        <h1 class="hero-title">${escapeHtml(title)}</h1>
        ${sub ? `<div class="hero-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
      <div class="hero-status">
        <span class="chip ${k} chip-large">${escapeHtml(status || 'UNKNOWN')}</span>
      </div>
    </div>`;
}

function kpi(label, value, opts = {}) {
  const cls = opts.kind ? ` ${opts.kind}` : '';
  return `
    <div class="kpi${cls}">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${value}</div>
      ${opts.sub ? `<div class="kpi-sub">${opts.sub}</div>` : ''}
    </div>`;
}

function actionsCluster(alias, actions, opts = {}) {
  const filter = opts.filter || (() => true);
  const buttons = (actions || []).filter(filter).map(a => {
    const cls = a.mode === 'send' ? 'btn-danger' : a.mode === 'exec' ? 'btn-primary' : 'btn-ghost';
    return `<button class="${cls}" data-action data-alias="${escapeHtml(alias)}" data-name="${escapeHtml(a.name)}">${escapeHtml(a.label || a.name)}</button>`;
  }).join('');
  return `<div class="btn-cluster">${buttons}</div>`;
}

function panel(title, body, meta) {
  return `
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">${escapeHtml(title)}</div>
        ${meta ? `<div class="panel-meta">${meta}</div>` : ''}
      </div>
      ${body}
    </div>`;
}

function filesPanel(alias, files) {
  if (!files || !files.length) return '';
  const items = files.map(f =>
    `<li><span class="file-key">${escapeHtml(f.label)}</span><span class="file-link" data-file-open data-path="${escapeHtml(f.path)}">${escapeHtml(f.path.split(/[\\/]/).pop())}</span></li>`
  ).join('');
  return panel('FILES & REPORTS', `
    <ul class="files-list">${items}</ul>
    <div class="md" data-file-viewer="${escapeHtml(alias)}" hidden></div>
  `, `${files.length} files`);
}

function recentActivityPanel(alias) {
  const rows = (state.lastActivity || []).filter(e => !alias || e.alias === alias).slice(0, 8);
  if (!rows.length) return panel('RECENT ACTIVITY', `<div class="empty">no activity yet</div>`);
  const list = rows.map(e => {
    const k = e.ok === true ? 'ok' : e.ok === false ? 'bad' : 'mute';
    const dur = e.durationMs != null ? ` · ${e.durationMs}ms` : '';
    return `<li>${chip(e.ok===true?'ok':e.ok===false?'fail':'—', k)} <b>${escapeHtml(e.name||'')}</b> <span style="color:var(--muted)">${escapeHtml(timeOnly(e.ts))} · ${escapeHtml(relTime(e.ts))}${dur}</span>${e.error?` <span style="color:var(--red)">${escapeHtml(e.error)}</span>`:''}</li>`;
  }).join('');
  return panel('RECENT ACTIVITY', `<ul class="list">${list}</ul>`);
}

function issuesPanel(issues) {
  if (!issues || !issues.length) return panel('OPEN ISSUES', `<div class="empty">no open issues</div>`);
  const items = issues.map(i => `<li>${escapeHtml(i)}</li>`).join('');
  return panel('OPEN ISSUES', `<ul class="list bad">${items}</ul>`, `${issues.length}`);
}

function recommendedPanel(items) {
  const arr = (items || []).map(i => typeof i === 'string' ? i : (i.title ? `${i.title}${i.rationale?` — ${i.rationale}`:''}` : JSON.stringify(i)));
  if (!arr.length) return '';
  return panel('RECOMMENDED NEXT', `<ul class="list next">${arr.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
}

// ─────────────────────────── Next-step banner ───────────────────────────
// A persistent, prominent "what to do next" hint shown above the pipeline.
// `hint` is an object: { label, action, alias }.
function nextStepBanner(hint) {
  if (!hint || !hint.label) return '';
  const btn = (hint.action && hint.alias)
    ? `<button class="btn-primary" data-action data-alias="${escapeHtml(hint.alias)}" data-name="${escapeHtml(hint.action)}">${escapeHtml(hint.actionLabel || hint.action.toUpperCase())}</button>`
    : '';
  return `
    <div class="next-step">
      <div class="next-step-tag">NEXT STEP</div>
      <div class="next-step-text">${escapeHtml(hint.label)}</div>
      ${btn ? `<div class="next-step-cta">${btn}</div>` : ''}
    </div>`;
}

// ─────────────────────────── Findings cards ───────────────────────────
// Generic "finding" card used by structured scan views.
// kind: 'safe' (green), 'review' (amber), 'info' (cyan), 'none' (mute)
function findingCard({ kind = 'info', value, label, hint, sub }) {
  const k = ['safe','review','info','none'].includes(kind) ? kind : 'info';
  return `
    <div class="finding finding-${k}">
      <div class="finding-value">${escapeHtml(String(value))}</div>
      <div class="finding-label">${escapeHtml(label)}</div>
      ${hint ? `<div class="finding-hint">${escapeHtml(hint)}</div>` : ''}
      ${sub ? `<div class="finding-sub">${escapeHtml(sub)}</div>` : ''}
    </div>`;
}

// Render a structured Computer scan summary as Findings cards + sections.
// Replaces the raw markdown dump as the primary UX. The raw report stays
// available in a collapsed "advanced" drawer below.
function renderComputerFindings(summary) {
  if (!summary) {
    return panel('FINDINGS', `<div class="empty">no scan summary yet — click SCAN to populate</div>`);
  }
  const t = summary.totals || {};
  const a = summary.fromDiskAudit || {};
  const wh = summary.windowsHealth || {};

  const cards = [];
  if (t.largeFiles != null) {
    cards.push(findingCard({
      kind: t.largeFiles > 0 ? 'review' : 'none',
      value: t.largeFiles, label: 'Large files',
      hint: t.largeFiles > 0 ? `${t.largeFiles} files over 200MB found for review` : 'no large files over 200MB',
      sub: 'Manual review required'
    }));
  }
  if (a.emptyDirCandidates != null) {
    cards.push(findingCard({
      kind: a.emptyDirCandidates > 0 ? 'safe' : 'none',
      value: a.emptyDirCandidates, label: 'Empty folders',
      hint: a.emptyDirCandidates > 0 ? `${a.emptyDirCandidates} empty folder candidates — safe to review, not auto-deleted` : 'no empty folder candidates',
      sub: 'Safe cleanup candidates'
    }));
  }
  if (a.zeroByteCandidates != null) {
    cards.push(findingCard({
      kind: a.zeroByteCandidates > 0 ? 'review' : 'none',
      value: a.zeroByteCandidates, label: 'Zero-byte files',
      hint: a.zeroByteCandidates > 0 ? `${a.zeroByteCandidates} zero-byte file candidates — review before cleanup` : 'no zero-byte files flagged',
      sub: 'Needs review'
    }));
  }
  if (a.coldFileCandidates != null) {
    cards.push(findingCard({
      kind: a.coldFileCandidates > 0 ? 'review' : 'none',
      value: a.coldFileCandidates, label: 'Cold files',
      hint: a.coldFileCandidates > 0 ? `${a.coldFileCandidates} files not touched in 3+ years — archive candidates` : 'no cold files flagged',
      sub: 'Archive candidates'
    }));
  }
  if (t.duplicateGroups != null && t.duplicateGroups > 0) {
    cards.push(findingCard({
      kind: 'review', value: t.duplicateGroups, label: 'Duplicate groups',
      hint: `${t.duplicateGroups} duplicate file groups found${t.duplicateReclaimableHuman ? `, ~${t.duplicateReclaimableHuman} reclaimable` : ''}`,
      sub: 'Needs review'
    }));
  }
  if (t.tempCache != null && t.tempCache > 0) {
    cards.push(findingCard({
      kind: 'safe', value: t.tempCache, label: 'Temp / cache files',
      hint: `${t.tempCache} temp/cache files older than 14 days`,
      sub: 'Safe cleanup candidates'
    }));
  }

  // Disk usage panel
  const diskRows = (summary.disk || []).map(d => {
    const pct = d.pctUsed != null ? d.pctUsed : 0;
    const barCls = pct > 90 ? 'bad' : pct > 75 ? 'warn' : 'ok';
    return `
      <div class="disk-row">
        <div class="disk-row-head">
          <span class="disk-name">${escapeHtml(d.name)}:</span>
          <span class="disk-stat"><b>${escapeHtml(d.freeHuman)}</b> free of ${escapeHtml(d.usedHuman)} used</span>
          <span class="disk-pct">${pct}%</span>
        </div>
        <div class="disk-bar"><div class="disk-bar-fill ${barCls}" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  // Inventory + Windows health
  const inventoryRows = [];
  if (t.startupApps != null)   inventoryRows.push(['Startup apps', `${t.startupApps} apps launch at boot`]);
  if (t.installedApps != null) inventoryRows.push(['Installed apps', `${t.installedApps} apps installed`]);
  if (wh.osCaption)            inventoryRows.push(['OS', `${wh.osCaption} ${wh.osVersion || ''} (${wh.osArchitecture || ''})`.trim()]);
  if (wh.uptimeHours != null)  inventoryRows.push(['Uptime', `${wh.uptimeHours}h since last boot`]);
  if (wh.totalMemoryGb != null) inventoryRows.push(['Memory', `${wh.freeMemoryGb} GB free of ${wh.totalMemoryGb} GB`]);
  if (wh.defenderRealTimeProtection != null) {
    inventoryRows.push(['Defender', `${wh.defenderRealTimeProtection ? 'realtime ON' : 'realtime OFF'}, signatures ${wh.defenderSignaturesAgeDays}d old`]);
  }
  if (wh.pendingRebootApprox != null) {
    inventoryRows.push(['Pending reboot', wh.pendingRebootApprox ? 'YES — restart recommended' : 'no']);
  }

  const inventoryList = inventoryRows.map(([k, v]) =>
    `<li><span class="inv-k">${escapeHtml(k)}</span><span class="inv-v">${escapeHtml(v)}</span></li>`).join('');

  const findingsHtml = cards.length
    ? `<div class="findings-grid">${cards.join('')}</div>`
    : `<div class="empty">no findings — click SCAN to populate</div>`;

  return `
    ${panel('DISK USAGE', diskRows ? `<div class="disk-list">${diskRows}</div>` : `<div class="empty">no disk data</div>`)}
    ${panel('FINDINGS', findingsHtml, summary.scanRoot ? `scan root: ${escapeHtml(summary.scanRoot)}` : '')}
    ${panel('SYSTEM INVENTORY', inventoryList ? `<ul class="kv-list">${inventoryList}</ul>` : `<div class="empty">no inventory data</div>`)}
  `;
}


// ─────────────────────────── PAGE: News ───────────────────────────
async function renderNewsPage(host) {
  const [, , , , issuesResp] = await Promise.all([
    loadRegistry(),
    loadStatus('news', true),
    loadActivity({ alias: 'news', limit: 30 }),
    loadSummary(),
    api('/api/issues')
  ]);
  paintGlobalPulse(); paintNavBadges();
  const reg = (state.registry?.systems || []).find(s => s.alias === 'news');
  const s = state.status.news || {};
  const sched = s.scheduler || s.cron || {};
  const tg = s.telegram || {};
  const newsAckMap = new Map(
    ((issuesResp && issuesResp.ok && issuesResp.data && issuesResp.data.issues) || [])
      .filter(i => i.alias === 'news')
      .map(i => [i.issue, i])
  );
  const activeRaw = Array.isArray(s.issues) ? s.issues : [];
  const openIssues = activeRaw.filter(t => !(newsAckMap.get(t) || {}).acknowledged);
  const ackedIssues = activeRaw
    .map(t => newsAckMap.get(t))
    .filter(i => i && i.acknowledged);
  const isPrimaryWinTask = sched.schedulerType === 'windows-task';
  const legacy = sched.legacyDockerCron || null;

  const desc = "Daily morning news digest pipeline. Aggregates sources, builds the dashboard, sends a morning ping to your Telegram DM at 07:30 IL.";

  // Next-step guidance: derive from current state.
  let nextHint;
  if (openIssues.length) {
    nextHint = { label: `Review the ${openIssues.length} open issue${openIssues.length > 1 ? 's' : ''} below — start with Run doctor`, action: 'doctor', alias: 'news', actionLabel: 'RUN DOCTOR' };
  } else if (s.hoursSincePublish != null && s.hoursSincePublish > 26) {
    nextHint = { label: 'Last publish is stale — run a dry-run pipeline to verify sources', action: 'dry-run-pipeline', alias: 'news', actionLabel: 'DRY-RUN PIPELINE' };
  } else if (sched.nextRunAt) {
    nextHint = { label: `Healthy — next scheduled run ${relTime(sched.nextRunAt)} at ${timeOnly(sched.nextRunAt)}` };
  } else {
    nextHint = { label: 'Healthy — no scheduled run found, run doctor to verify', action: 'doctor', alias: 'news', actionLabel: 'RUN DOCTOR' };
  }

  const kpis = `
    <div class="kpis">
      ${kpi('PIPELINE', escapeHtml((s.summary || '—').toUpperCase()), { kind: headlineKind(s.headline) })}
      ${kpi('LAST BUILD', escapeHtml((s.lastBuildId || '—').slice(0, 22)), { sub: s.hoursSincePublish != null ? `${s.hoursSincePublish}h since publish` : '—' })}
      ${kpi('NEXT RUN', escapeHtml(sched.nextRunAt ? timeOnly(sched.nextRunAt) : '—'), { sub: sched.nextRunAt ? relTime(sched.nextRunAt) : 'no schedule' })}
      ${kpi('LAST RUN', escapeHtml(sched.lastRunAt ? timeOnly(sched.lastRunAt) : '—'), { sub: sched.lastStatus ? `status ${sched.lastStatus}` : '—', kind: sched.lastStatus === 'ok' ? 'ok' : sched.lastStatus === 'error' ? 'bad' : '' })}
    </div>`;

  const perTopic = (s.perTopicStatus || []).map(t =>
    `<li><b>${escapeHtml(t.topic)}</b> — got ${t.got}/${t.min} · failed sources ${t.sourcesFailedCount}</li>`).join('');

  // Primary scheduler block — always shown, marked as the live source-of-truth.
  const primaryLabel = isPrimaryWinTask
    ? `Windows Scheduled Task <span class="chip ok" style="margin-left:6px">PRIMARY</span>`
    : sched.schedulerType === 'docker-cron'
      ? `Legacy Docker cron <span class="chip warn" style="margin-left:6px">PRIMARY (pre-migration)</span>`
      : '—';

  const schedulerPanel = panel('SCHEDULER', `
    <dl class="kv2">
      <dt>Type</dt><dd>${primaryLabel}</dd>
      <dt>Name</dt><dd>${escapeHtml(sched.taskName || sched.schedulerType || '—')}</dd>
      <dt>Schedule</dt><dd>${escapeHtml(sched.schedule?.cronExpr || JSON.stringify(sched.schedule || {}) )}</dd>
      <dt>Last run</dt><dd>${dt(sched.lastRunAt)} ${chip(sched.lastStatus || '—', sched.lastStatus === 'ok' ? 'ok' : sched.lastStatus === 'error' ? 'bad' : 'mute')}</dd>
      <dt>Next run</dt><dd>${dt(sched.nextRunAt)} <span style="color:var(--muted)">${escapeHtml(relTime(sched.nextRunAt))}</span></dd>
      <dt>Last delivery</dt><dd>${escapeHtml(sched.lastDeliveryStatus || '—')} ${sched.lastDelivered ? chip('delivered','ok') : ''}</dd>
      <dt>Errors</dt><dd>${sched.consecutiveErrors || 0}${sched.lastError ? ` · <span style="color:var(--red)">${escapeHtml(sched.lastError)}</span>` : ''}</dd>
    </dl>`);

  // Deprecated scheduler block — only shown when the Windows task is primary
  // AND the legacy Docker cron has any residual error/disabled state.
  const legacyPanel = (isPrimaryWinTask && legacy && (legacy.lastStatus === 'error' || legacy.consecutiveErrors > 0 || legacy.enabled === false))
    ? panel('DEPRECATED SCHEDULER (HISTORICAL)', `
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">
          The legacy Docker-based OpenClaw cron has been superseded by the Windows Scheduled Task above.
          The state below is kept for history only and does <b>not</b> drive the page status.
        </div>
        <dl class="kv2">
          <dt>Type</dt><dd>Docker cron <span class="chip mute" style="margin-left:6px">DEPRECATED</span></dd>
          <dt>Enabled</dt><dd>${legacy.enabled ? chip('enabled','warn') : chip('disabled','mute')}</dd>
          <dt>Last status</dt><dd>${chip(legacy.lastStatus || '—', legacy.lastStatus === 'ok' ? 'ok' : legacy.lastStatus === 'error' ? 'mute' : 'mute')}</dd>
          <dt>Errors</dt><dd>${legacy.consecutiveErrors || 0}${legacy.lastError ? ` · <span style="color:var(--muted)">${escapeHtml(legacy.lastError)}</span>` : ''}</dd>
        </dl>`)
    : '';

  // Last doctor block — shows the most recent run-doctor result with timestamp,
  // so the user can see live confirmation right after clicking Run doctor.
  const ld = s.lastDoctor;
  const lastDoctorPanel = ld
    ? panel('LAST DOCTOR', `
        <div class="row" style="margin-bottom:6px">
          ${chip(ld.ok ? 'HEALTHY' : 'ATTENTION', ld.ok ? 'ok' : 'warn')}
          <span style="color:var(--muted);font-size:12px">ran ${escapeHtml(relTime(ld.ranAt))} · ${escapeHtml(dt(ld.ranAt))}</span>
        </div>
        ${ld.ok
          ? '<div style="color:var(--text-dim);font-size:12px">no current issues reported by doctor.</div>'
          : `<ul class="list">${(ld.issues||[]).map(i=>`<li>${escapeHtml(i)}</li>`).join('') || '<li>—</li>'}</ul>`
        }`)
    : panel('LAST DOCTOR', `<div class="empty">click <b>Run doctor</b> to perform a live health check</div>`);

  const left = `
    ${liveActionPanel('news')}
    ${nextStepBanner(nextHint)}
    ${schedulerPanel}
    ${legacyPanel}
    ${panel('TELEGRAM', `
      <dl class="kv2">
        <dt>Group / topic</dt><dd>${escapeHtml(tg.groupChatId || '—')} · topic ${tg.topicId ?? '—'}</dd>
        <dt>Delivery DM</dt><dd>${escapeHtml(tg.deliveryDmId || '—')}</dd>
        <dt>Live URL</dt><dd>${s.publicLatestUrl ? `<a href="${escapeHtml(s.publicLatestUrl)}" target="_blank" rel="noopener" style="color:var(--cyan)">latest.html ↗</a>` : '—'}</dd>
      </dl>
      ${tg.pendingAlert ? `<details class="fold" open><summary style="color:var(--amber)">⚠ Pending alert</summary><pre>${escapeHtml(tg.pendingAlert)}</pre></details>` : ''}
      <details class="fold"><summary>Prepared morning ping</summary><pre>${escapeHtml(tg.preparedSummary || '(empty)')}</pre></details>`)}
    ${perTopic ? panel('PER-TOPIC STATUS', `<ul class="list">${perTopic}</ul>`) : ''}
  `;

  // Render historical/fallback issues collapsed under a separate section so
  // they remain visible without inflating the active OPEN ISSUES panel.
  const hist = Array.isArray(s.historicalIssues) ? s.historicalIssues : [];
  const historicalPanel = hist.length
    ? panel('HISTORICAL · FALLBACK', `
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:6px">
          Past or deprecated-scheduler issues. Informational — does not drive page status.
        </div>
        <ul class="list">${hist.map(h => {
          const txt = typeof h === 'string' ? h : (h.text || JSON.stringify(h));
          const detail = (h && h.detail) ? `<br><span style="color:var(--muted);font-size:11.5px">${escapeHtml(h.detail)}</span>` : '';
          return `<li>${chip(h && h.category || 'historical', 'mute')} ${escapeHtml(txt)}${detail}</li>`;
        }).join('')}</ul>`, `${hist.length}`)
    : '';

  const ackedPanel = ackedIssues.length
    ? panel('ACKNOWLEDGED', `
        <div style="color:var(--text-dim);font-size:12px;margin-bottom:6px">
          Active issues you have acknowledged. Still real, but silenced for the global pulse.
        </div>
        <ul class="list">${ackedIssues.map(i =>
          `<li>${chip('acked', 'mute')} ${escapeHtml(i.issue)}<br><span style="color:var(--muted);font-size:11.5px">acked ${escapeHtml(relTime(i.ackedAt))}${i.ackNote ? ` · ${escapeHtml(i.ackNote)}` : ''}</span></li>`
        ).join('')}</ul>`, `${ackedIssues.length}`)
    : '';

  const right = `
    ${panel('ACTIONS', actionsCluster('news', reg?.actions))}
    ${lastDoctorPanel}
    ${issuesPanel(openIssues)}
    ${historicalPanel}
    ${ackedPanel}
    ${recommendedPanel(s.recommendedNext)}
    ${recentActivityPanel('news')}
  `;

  host.innerHTML = `
    ${pageHero({ title: 'News Dashboard', sub: 'Daily morning news digest · /news', status: s.headline })}
    ${kpis}
    <div class="split">
      <div>${left}</div>
      <div>${right}</div>
    </div>
    ${filesPanel('news', flattenFiles(s.files))}
  `;
  bindPageInteractions();
}

// ─────────────────────────── PAGE: Organizer V2 ───────────────────────────
async function renderOrganizerPage(host, sub) {
  await Promise.all([loadRegistry(), loadStatus('organizer', true), loadActivity({ alias: 'organizer', limit: 40 }), loadSummary()]);
  paintGlobalPulse(); paintNavBadges();
  const reg = (state.registry?.systems || []).find(s => s.alias === 'organizer');
  const s = state.status.organizer || {};

  const tabs = ['overview', 'computer', 'gmail', 'photos'];
  const tabsBar = `
    <div class="subtabs">
      ${tabs.map(t => `<div class="subtab ${sub === t ? 'active' : ''}" data-route="organizer/${t}">${t.toUpperCase()}</div>`).join('')}
    </div>`;

  let body = '';
  if (sub === 'overview') body = renderOrgOverview(reg, s);
  else if (['computer','gmail','photos'].includes(sub)) body = renderOrgModule(reg, s, sub);
  else body = `<div class="empty">unknown subpage</div>`;

  host.innerHTML = `
    ${pageHero({ title: 'Organizer V2', sub: 'Three-module local optimization suite — Computer · Gmail · Photos', status: s.headline })}
    ${tabsBar}
    ${body}
  `;
  bindPageInteractions();
}

function renderOrgOverview(reg, s) {
  const mods = s.modules || {};
  const modsCard = ['computer', 'gmail', 'photos'].map(name => {
    const m = mods[name] || {};
    const h = m.highlights || {};
    const k = m.enabled ? 'ok' : 'mute';
    const headline = h.headline || (m.enabled ? 'No scan yet — click OPEN to run one' : 'Module disabled');
    return `
      <div class="step org-card ${m.enabled ? '' : 'stale'}" data-route="organizer/${name}" tabindex="0">
        <div class="step-tag">${name.toUpperCase()}</div>
        <div class="org-card-headline">${escapeHtml(headline)}</div>
        <div class="step-meta">
          ${chip(m.enabled ? 'enabled' : 'disabled', k)}
          <span style="color:var(--muted);font-size:11.5px">last scan ${escapeHtml(relTime(m.lastScanAt))}</span>
        </div>
        <div class="step-action"><button class="btn-ghost btn-block" data-route="organizer/${name}">OPEN ${name.toUpperCase()} →</button></div>
      </div>`;
  }).join('');

  // Cross-module actions are doctor + tick — they do NOT duplicate the per-module pipeline.
  const orgActions = (reg?.actions || []).filter(a => !a.name.includes('.'));

  // Pick the most pressing module to surface in the next-step banner.
  const order = ['computer', 'gmail', 'photos'];
  const focusName = order.find(n => {
    const m = mods[n]; return m && m.enabled && m.nextStep && m.nextStep.step !== 'rerun';
  }) || order.find(n => mods[n] && mods[n].enabled) || 'computer';
  const focus = mods[focusName] || {};
  const focusHint = focus.nextStep ? {
    label: `${focusName.toUpperCase()} — ${focus.nextStep.label}`,
    action: null  // navigation, handled below
  } : null;

  const kpis = `
    <div class="kpis">
      ${kpi('MODULES ON', `${Object.values(mods).filter(m => m.enabled).length} / 3`, { sub: 'computer · gmail · photos' })}
      ${kpi('OPEN ISSUES', `${(s.issues||[]).length}`, { kind: (s.issues||[]).length ? 'warn' : 'ok', sub: (s.issues||[]).length ? 'review below' : 'none' })}
      ${kpi('ORCHESTRATOR', `v${escapeHtml(String(s.orchestratorVersion || '—'))}`, { sub: `updated ${relTime(s.orchestratorUpdatedAt)}` })}
    </div>`;

  // Banner with a deep-link to the focus module instead of a raw action button.
  const banner = focusHint ? `
    <div class="next-step">
      <div class="next-step-tag">NEXT STEP</div>
      <div class="next-step-text">${escapeHtml(focusHint.label)}</div>
      <div class="next-step-cta"><button class="btn-primary" data-route="organizer/${focusName}">OPEN ${focusName.toUpperCase()} →</button></div>
    </div>` : '';

  return `
    ${liveActionPanel('organizer')}
    ${banner}
    ${kpis}
    <div class="split">
      <div>
        ${panel('MODULES', `<div class="pipeline">${modsCard}</div>`)}
        ${issuesPanel(s.issues)}
        ${recommendedPanel(s.recommendedNext)}
      </div>
      <div>
        ${panel('CROSS-MODULE ACTIONS', actionsCluster('organizer', orgActions),
          'Run on all modules')}
        ${recentActivityPanel('organizer')}
      </div>
    </div>
  `;
}

function moduleStepClasses(mod) {
  // Decide which step is "next" based on which timestamp is most recent / missing
  const scan = mod.lastScanAt ? new Date(mod.lastScanAt).getTime() : 0;
  const plan = mod.lastPlanAt ? new Date(mod.lastPlanAt).getTime() : 0;
  const appr = mod.lastApprovalAt ? new Date(mod.lastApprovalAt).getTime() : 0;
  const appl = mod.lastApplyAt ? new Date(mod.lastApplyAt).getTime() : 0;
  const cls = { scan: '', plan: '', approve: '', apply: '' };
  // Mark complete if has timestamp; mark "next" the first one missing or older than the previous
  if (scan) cls.scan = 'complete';
  if (plan && plan >= scan) cls.plan = 'complete'; else if (scan && !plan) cls.plan = '';
  if (appr && appr >= plan) cls.approve = 'complete'; else if (plan && !appr) cls.approve = '';
  if (appl && appl >= appr) cls.apply = 'complete';
  // Highlight the next pending step
  if (!scan) cls.scan = 'next';
  else if (!plan || plan < scan) cls.plan = 'next';
  else if (!appr || appr < plan) cls.approve = 'next';
  else cls.apply = 'next'; // apply is always re-runnable (dry-run by default)
  return cls;
}

// ─────────────────────────── Module highlight renderers ───────────────────────────
// What each module ACTUALLY did for the user — the answer to "is this useful?"

function renderComputerInsights(h) {
  if (!h) return panel('FINDINGS', `<div class="empty">no scan yet — click SCAN to find space hogs</div>`);
  const fileItems = (h.topFiles || []).map(f => {
    const folder = (f.path || '').split(/\\|\//).slice(0, -1).join('\\');
    const name = (f.path || '').split(/\\|\//).pop() || f.path;
    return `
      <li class="hilite-row" data-file-row data-path="${escapeHtml(f.path || '')}">
        <div class="hilite-row-main">
          <div class="hilite-row-title">${escapeHtml(name)}</div>
          <div class="hilite-row-sub">${escapeHtml(folder)}</div>
        </div>
        <div class="hilite-row-side">
          <div class="hilite-row-badge">${escapeHtml(f.sizeHuman || '')}</div>
          <div class="hilite-row-meta">${f.lastTouched ? escapeHtml(relTime(f.lastTouched) + ' · ' + new Date(f.lastTouched).toLocaleDateString()) : '—'}</div>
        </div>
        <button class="btn-ghost btn-tiny" data-reveal-file data-path="${escapeHtml(f.path || '')}">REVEAL</button>
      </li>`;
  }).join('');
  const reclaimLine = h.reclaimableHuman
    ? `Free up ~<b>${escapeHtml(h.reclaimableHuman)}</b> by reviewing the ${h.manualReviewCount} files below.`
    : 'Drive looks healthy — no large files flagged for review.';
  return panel('SPACE HOGS', `
    <div class="hilite-headline">${escapeHtml(h.headline || '—')}</div>
    <div class="hilite-sub">${reclaimLine}</div>
    ${fileItems ? `<ul class="hilite-list">${fileItems}</ul>` : `<div class="empty">no candidates</div>`}
    <div class="hilite-foot">REVEAL opens the folder in Windows Explorer · safe — never deletes anything</div>
  `, h.topFiles && h.topFiles.length > 0 ? `top ${h.topFiles.length} of ${h.manualReviewCount}` : '');
}

function renderGmailInsights(h) {
  if (!h) return panel('CLEANUP BUCKETS', `<div class="empty">no scan yet — click SCAN to fetch Gmail bucket counts</div>`);
  const cards = (h.buckets || []).map(b => {
    const k = b.itemCount > 0 ? 'review' : 'none';
    return `
      <a class="hilite-card hilite-card-${k}" href="${escapeHtml(b.gmailUrl)}" target="_blank" rel="noopener">
        <div class="hilite-card-num">${b.itemCount}</div>
        <div class="hilite-card-label">${escapeHtml(b.label)}</div>
        <div class="hilite-card-hint">${escapeHtml(b.why)}</div>
        <div class="hilite-card-cta">OPEN IN GMAIL ↗</div>
      </a>`;
  }).join('');
  return panel('CLEANUP BUCKETS', `
    <div class="hilite-headline">${escapeHtml(h.headline || '—')}</div>
    <div class="hilite-sub">Tap a bucket to open the Gmail search in a new tab. Apply will add <code>Cleanup/*</code> labels — never deletes.</div>
    <div class="hilite-cards">${cards}</div>
  `, h.total ? `${h.total} candidate messages` : '');
}

function renderPhotosInsights(h) {
  if (!h) return panel('PHOTOS LIBRARY', `<div class="empty">no scan yet — click SCAN to inspect your Google Photos library</div>`);
  if (h.empty) {
    return panel('PHOTOS LIBRARY', `
      <div class="hilite-headline">${escapeHtml(h.headline)}</div>
      <div class="hilite-sub">
        Auth is OK (mode <b>${escapeHtml(h.authMode || '—')}</b>). The scan found 0 media items in the current scan window.
        That usually means: (a) no media uploaded recently, or (b) scan window is too narrow.
        Click SCAN again or check the photos module config.
      </div>
    `);
  }
  const cards = (h.buckets || []).map(b => {
    const k = b.count > 0 ? 'review' : 'none';
    return `
      <div class="hilite-card hilite-card-${k}">
        <div class="hilite-card-num">${b.count}</div>
        <div class="hilite-card-label">${escapeHtml(b.label)}</div>
        <div class="hilite-card-hint">${escapeHtml(b.action)}</div>
      </div>`;
  }).join('');
  return panel('PHOTOS LIBRARY', `
    <div class="hilite-headline">${escapeHtml(h.headline)}</div>
    <div class="hilite-sub">Apply will create curation albums and tag candidates — never deletes media.</div>
    <div class="hilite-cards">${cards}</div>
  `);
}

function renderOrgModule(reg, s, modName) {
  const mod = (s.modules || {})[modName] || {};
  const files = (s.files || {})[modName] || {};
  const desc = {
    computer: 'Finds the biggest files on your disk so you know where the space is going. APPLY only marks for review — nothing is ever auto-deleted.',
    gmail:    'Surfaces large attachments, old unread, newsletters and promotions you can clean. APPLY only adds Cleanup/* labels — never deletes or sends mail.',
    photos:   'Inspects your Google Photos library and groups screenshots / downloads / pre-2020 into curation albums. APPLY only adds metadata — never deletes media.'
  }[modName];
  const moduleActions = (reg?.actions || []).filter(a => a.name.startsWith(modName + '.'));
  const cls = moduleStepClasses(mod);

  const scanActDef = moduleActions.find(a => a.name === `${modName}.scan`);
  const planActDef = moduleActions.find(a => a.name === `${modName}.plan`);
  const apprActDef = moduleActions.find(a => a.name === `${modName}.approve`);
  const applActDef = moduleActions.find(a => a.name === `${modName}.apply`);
  // Auxiliary actions (auth/doctor) — kept separately so they don't clutter the pipeline
  // and don't duplicate the pipeline buttons.
  const auxActions = moduleActions.filter(a => !/\.(scan|plan|approve|apply)$/.test(a.name));

  function btn(def) {
    if (!def) return '';
    return `<button class="btn-primary" data-action data-alias="organizer" data-name="${escapeHtml(def.name)}">${escapeHtml((def.label||def.name).replace(/^[^:]+:\s*/,''))}</button>`;
  }

  const pipeline = `
    <div class="pipeline">
      <div class="step ${cls.scan}">
        <div class="step-tag">01 · SCAN</div>
        <div class="step-title">Scan</div>
        <div class="step-meta">
          ${mod.lastScanAt ? `${dt(mod.lastScanAt)}<br>items: <b>${mod.lastScanItems || 0}</b><br>mode: <b>${escapeHtml(mod.lastScanMode || '—')}</b>` : '<span style="color:var(--muted)">no scan yet</span>'}
        </div>
        <div class="step-action">${btn(scanActDef)}</div>
      </div>
      <div class="step ${cls.plan}">
        <div class="step-tag">02 · PLAN</div>
        <div class="step-title">Plan</div>
        <div class="step-meta">
          ${mod.lastPlanAt ? `${dt(mod.lastPlanAt)}<br>items: <b>${mod.lastPlanItems || 0}</b>` : '<span style="color:var(--muted)">no plan yet</span>'}
        </div>
        <div class="step-action">${btn(planActDef)}</div>
      </div>
      <div class="step ${cls.approve}">
        <div class="step-tag">03 · APPROVE</div>
        <div class="step-title">Approve</div>
        <div class="step-meta">
          ${mod.lastApprovalAt ? `${dt(mod.lastApprovalAt)}<br>sha: <b>${escapeHtml((mod.lastApprovalSha||'').slice(0,12))}</b>` : '<span style="color:var(--muted)">no approval pkg yet</span>'}
        </div>
        <div class="step-action">${btn(apprActDef)}</div>
      </div>
      <div class="step ${cls.apply}">
        <div class="step-tag">04 · APPLY (DRY-RUN)</div>
        <div class="step-title">Apply</div>
        <div class="step-meta">
          ${mod.lastApplyAt ? `${dt(mod.lastApplyAt)}<br>dry-run: <b>${mod.lastApplyDryRun ? 'yes' : 'no'}</b>` : '<span style="color:var(--muted)">never applied</span>'}
          <br><span style="color:var(--amber);font-size:10.5px;letter-spacing:0.14em">UI APPLY IS DRY-RUN ONLY</span>
        </div>
        <div class="step-action">${btn(applActDef)}</div>
      </div>
    </div>`;

  // Map the next-step name to the actual action name on this module
  const nextActionName = mod.nextStep && mod.nextStep.action
    ? `${modName}.${mod.nextStep.action}` : null;

  const kpis = `
    <div class="kpis">
      ${kpi('LAST SCAN', escapeHtml(relTime(mod.lastScanAt)), { sub: `items: ${mod.lastScanItems || 0}` })}
      ${kpi('LAST PLAN', escapeHtml(relTime(mod.lastPlanAt)), { sub: `items: ${mod.lastPlanItems || 0}` })}
      ${kpi('LAST APPROVE', escapeHtml(relTime(mod.lastApprovalAt)), { sub: mod.lastApprovalSha ? 'package built' : '—' })}
      ${kpi('LAST APPLY', escapeHtml(relTime(mod.lastApplyAt)), { sub: mod.lastApplyDryRun ? 'dry-run' : (mod.lastApplyAt ? 'real' : '—') })}
    </div>`;

  // Module-specific "insights" — the actionable view. Computer additionally
  // gets the disk-usage + system-inventory cards (rendered separately).
  const insightsBlock = modName === 'computer'
    ? renderComputerInsights(mod.highlights)
    : modName === 'gmail'
      ? renderGmailInsights(mod.highlights)
      : renderPhotosInsights(mod.highlights);
  const computerExtras = modName === 'computer' ? renderComputerFindings(mod.scanSummary) : '';

  // Auxiliary actions panel: only shown if there are non-pipeline actions
  // (auth, doctor). Pipeline actions are NEVER duplicated here.
  const auxBlock = auxActions.length
    ? panel('AUTH / DOCTOR', actionsCluster('organizer', auxActions),
        'Module-level helpers — not part of the main pipeline')
    : '';

  return `
    ${liveActionPanel('organizer')}
    ${nextStepBanner({
      label: mod.nextStep?.label || 'Click SCAN to start',
      action: nextActionName,
      alias: 'organizer',
      actionLabel: (mod.nextStep?.action || 'scan').toUpperCase()
    })}
    <div class="purpose-text" style="margin-bottom:18px">${escapeHtml(desc)}</div>
    ${insightsBlock}
    ${computerExtras}
    <details class="fold pipeline-fold">
      <summary>PIPELINE · scan → plan → approve → apply (dry-run)</summary>
      ${kpis}
      ${pipeline}
      ${auxBlock || ''}
    </details>
    <details class="fold">
      <summary>RAW REPORTS (advanced)</summary>
      <div class="row" style="margin-top:8px">
        <button class="btn-ghost" data-md-load data-target="md-${modName}-approve" data-path="${escapeHtml(files.approvalPackage || '')}">LOAD APPROVAL PACKAGE</button>
        <button class="btn-ghost" data-md-load data-target="md-${modName}-scan" data-path="${escapeHtml(files.scanReport || '')}">LOAD SCAN REPORT</button>
      </div>
      <details class="fold" id="md-${modName}-approve-fold"><summary>Approval package (raw)</summary><div class="md" id="md-${modName}-approve"><div class="empty">click LOAD APPROVAL PACKAGE</div></div></details>
      <details class="fold" id="md-${modName}-scan-fold"><summary>Scan report (raw)</summary><div class="md" id="md-${modName}-scan"><div class="empty">click LOAD SCAN REPORT</div></div></details>
    </details>
  `;
}

// ─────────────────────────── PAGE: System Map ───────────────────────────
async function renderSystemMapPage(host) {
  await Promise.all([loadRegistry(), loadStatus('system-map', true), loadSummary()]);
  paintGlobalPulse(); paintNavBadges();
  const reg = (state.registry?.systems || []).find(s => s.alias === 'system-map');
  const s = state.status['system-map'] || {};

  const aliases = Object.entries(s.aliases || {}).map(([a, info]) =>
    `<li><b style="color:var(--cyan)">/${escapeHtml(a)}</b> — ${escapeHtml(info.name)} <span style="color:var(--muted)">topic ${info.telegramTopic ?? '—'}</span></li>`).join('');
  const skills = (s.customSkills || []).map(sk =>
    `<li><b>${escapeHtml(sk.name)}</b>${sk.description ? `<br><span style="color:var(--text-dim)">${escapeHtml(sk.description)}</span>` : ''}</li>`).join('');
  const todos = (s.todos || []).map(t => {
    const k = t.severity === 'high' ? 'bad' : t.severity === 'medium' ? 'warn' : 'mute';
    return `<li>${chip(t.severity || '—', k)} <b>${escapeHtml(t.title)}</b><br><span style="color:var(--text-dim)">${escapeHtml(t.detail || '')}</span></li>`;
  }).join('');
  const next = (s.recommendedNext || []).map(n =>
    `<li><b>${escapeHtml(n.title || '')}</b> <span style="color:var(--muted)">(${escapeHtml(n.system || '')})</span><br><span style="color:var(--text-dim)">${escapeHtml(n.rationale || '')}</span></li>`).join('');

  const kpis = `
    <div class="kpis">
      ${kpi('SYSTEMS', String((s.registry||[]).length), { sub: 'registered aliases' })}
      ${kpi('CUSTOM SKILLS', String((s.customSkills||[]).length), { sub: 'in skills/_custom' })}
      ${kpi('OPEN TODOS', String((s.todos||[]).length), { kind: (s.todos||[]).filter(t=>t.severity==='high').length ? 'bad' : (s.todos||[]).length ? 'warn' : 'ok', sub: (s.todos||[]).length ? 'see list below' : 'all clear' })}
      ${kpi('NEXT WORK', String((s.recommendedNext||[]).length), { sub: 'on backlog' })}
    </div>`;

  // Pick the most pressing todo (or first backlog item) as the next-step focus.
  const focusTodo = (s.todos || []).find(t => t.severity === 'high')
                 || (s.todos || []).find(t => t.severity === 'medium')
                 || (s.recommendedNext || [])[0];
  const focusLabel = focusTodo
    ? (focusTodo.title
        ? `${focusTodo.severity ? `[${focusTodo.severity}] ` : ''}${focusTodo.title}`
        : `Review the ${(s.recommendedNext||[]).length} next-work items`)
    : 'No open TODOs — system map is clean';

  host.innerHTML = `
    ${pageHero({ title: 'System Map', sub: 'Registry of systems, aliases, custom skills, TODOs, and next-work backlog.', status: s.headline })}
    ${liveActionPanel('system-map')}
    ${nextStepBanner({ label: focusLabel })}
    ${kpis}
    <div class="split">
      <div>
        ${(s.todos||[]).length ? panel('OPEN TODOS', `<ul class="list">${todos}</ul>`, `${(s.todos||[]).length}`) : ''}
        ${next ? panel('NEXT WORK BACKLOG', `<ul class="list next">${next}</ul>`) : ''}
        ${panel('REGISTERED SYSTEMS', `<ul class="list">${aliases || '<li>none</li>'}</ul>`, `${(s.registry||[]).length}`)}
      </div>
      <div>
        ${panel('CUSTOM SKILLS', `<ul class="list">${skills || '<li>none</li>'}</ul>`, `${(s.customSkills||[]).length}`)}
      </div>
    </div>
  `;
  bindPageInteractions();
}

// ─────────────────────────── PAGE: Traffic Appeal IL ───────────────────────────
// Reuses the existing Claude runner: "OPEN CHAT WITH AGENT" navigates to the
// Claude tab and prefills the textarea with prompts/start-appeal.md. The user
// can edit (e.g. paste ticket details) before hitting RUN.

async function renderTrafficLawPage(host) {
  await Promise.all([loadRegistry(), loadStatus('traffic-law', true), loadSummary()]);
  paintGlobalPulse(); paintNavBadges();
  const s = state.status['traffic-law'] || {};

  const fileLinks = [
    { label: 'AGENT.md (persona + flow)', path: s.files?.agent },
    { label: 'Start prompt',              path: s.files?.startPrompt },
    { label: 'Intake form',               path: s.files?.intakeForm },
    { label: 'Sources',                   path: s.files?.sources },
    { label: 'Deadlines',                 path: s.files?.deadlines },
    { label: 'Points system',             path: s.files?.pointsSystem },
    { label: '2026 reform',               path: s.files?.reform2026 },
    { label: 'Disclaimer',                path: s.files?.disclaimer }
  ].filter(f => !!f.path);

  const skillCheck = s.skillCheck || { present: [], missing: [] };
  const allSkills = [...skillCheck.present, ...skillCheck.missing];
  const skills = allSkills.map(sk => {
    const short = sk.replace(/^_custom\//, '');
    const ok = skillCheck.present.includes(sk);
    return `<li>${ok ? '☑' : '⚠'} <b>${escapeHtml(short)}</b>${ok ? '' : ' <span style="color:var(--amber)">(missing)</span>'}</li>`;
  }).join('');

  const drafts = (s.drafts || []).map(d =>
    `<li><span class="file-key">${escapeHtml(dt(d.mtime))} · ${escapeHtml(d.label || '')}</span><span class="file-link" data-file-open data-path="${escapeHtml(d.path)}">${escapeHtml(d.name)}</span></li>`
  ).join('');

  const promptPreview = (s.startPromptText || '').slice(0, 1200);

  // Case-state block (only meaningful when the agent wrote output/case-state.json).
  const cs = s.caseState || null;
  const deadlines = s.deadlines || [];
  const dlChip = (level) => {
    if (level === 'expired') return 'bad';
    if (level === 'urgent')  return 'bad';
    if (level === 'warn')    return 'warn';
    return 'ok';
  };
  const deadlineRows = deadlines.map(d => {
    const dl = d.daysLeft == null ? '—' : (d.daysLeft < 0 ? `חלף ב-${-d.daysLeft} ימים` : `נשארו ${d.daysLeft} ימים`);
    return `<tr><td>${escapeHtml(d.key)}</td><td>${escapeHtml(d.date || '—')}</td><td>${chip(dl, dlChip(d.level))}</td></tr>`;
  }).join('');
  const missingEv = (cs && Array.isArray(cs.missingEvidence)) ? cs.missingEvidence : [];

  const caseStatePanel = cs ? `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">CURRENT CASE</div><span class="panel-meta">${escapeHtml((cs.ticketNumber || '—'))}</span></div>
      <div style="padding:0 14px 14px 14px">
        <div class="row" style="margin-bottom:10px;gap:14px">
          <div><b>קטגוריה:</b> ${escapeHtml(cs.category || '?')}</div>
          <div><b>מסלול שנבחר:</b> ${escapeHtml(cs.chosenRoute || 'undecided')}</div>
          <div><b>תאריך מסירה:</b> ${escapeHtml(cs.serviceDate || '—')}</div>
          ${cs.lastDraft ? `<div><b>טיוטה אחרונה:</b> ${escapeHtml(cs.lastDraft)}</div>` : ''}
          ${cs.updatedAt ? `<div style="color:var(--muted)">${escapeHtml(dt(cs.updatedAt))}</div>` : ''}
        </div>
        ${deadlineRows ? `<table class="activity-table" style="margin-bottom:10px"><thead><tr><th>מועד</th><th>תאריך</th><th>סטטוס</th></tr></thead><tbody>${deadlineRows}</tbody></table>` : ''}
        ${missingEv.length ? `<div><b>ראיות חסרות:</b><ul style="margin:6px 0 0;padding-right:20px">${missingEv.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
        ${cs.nextAction ? `<div style="margin-top:10px;padding:8px 10px;background:var(--bg-1);border:1px solid var(--cyan-dim);border-radius:6px"><b>צעד הבא מומלץ:</b> ${escapeHtml(cs.nextAction)}</div>` : ''}
      </div>
    </div>
  ` : `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">CURRENT CASE</div></div>
      <div style="padding:0 14px 14px 14px;color:var(--text-dim);font-size:13px">
        לא נמצא <code>output/case-state.json</code>. הסוכן יכול לכתוב את הקובץ בסוף סשן כדי שהדשבורד יציג כאן את הסטטוס, המועדים וצעדי ההמשך. עד אז — פתח את המכתב/הטיוטה האחרונה מתוך פאנל "OUTPUT DRAFTS".
      </div>
    </div>
  `;

  const intakeChecklistHtml = `
    <ol style="margin:0;padding-right:20px;line-height:1.7;font-size:13px;color:var(--text)" dir="rtl">
      <li><b>תמונה / סריקה / טקסט מלא של הדו"ח</b> (חובה)</li>
      <li><b>תאריך המסירה</b> (פיזית / דואר רשום / SMS דיגיטלי) — חובה</li>
      <li>תאריך + שעה + מקום העבירה</li>
      <li>תיאור העבירה לפי הדו"ח + סעיף + קנס + נקודות</li>
      <li>אופן האכיפה (שוטר / מצלמה / לייזר / רמזור)</li>
      <li>בעלות הרכב + האם <b>אתה</b> הנהג שביצע</li>
      <li>האם אתה מודה / חולק / חלקית</li>
      <li>ראיות שיש לך (תמונות, Waze, דשבורד, עדים, תדפיס נקודות)</li>
      <li>היסטוריית נהיגה / נהג חדש / מקצועי</li>
      <li><b>מטרה:</b> ביטול / המרה לאזהרה / להישפט / רק מידע</li>
    </ol>
    <div style="margin-top:8px;color:var(--muted);font-size:11.5px">
      טופס מלא: ראה <code>intake-form.md</code> בפאנל "AGENT FILES".
    </div>
  `;

  host.innerHTML = `
    ${pageHero({ title: 'Traffic Appeal IL', sub: 'Israeli traffic-ticket appeal agent. Cites gov.il / Knesset / Nevo / Wikisource sources; never files on your behalf.', status: s.headline || 'OK' })}

    <div class="panel">
      <div class="panel-head"><div class="panel-title">START</div><span class="panel-meta">${escapeHtml(s.summary || '')}</span></div>
      <div style="padding:0 14px 14px 14px">
        <div style="color:var(--text-dim);font-size:13px;margin-bottom:10px">
          Spawns the agent in the Claude Code tab in <b>auto mode</b> (no permission prompts). The agent reads <code>AGENT.md</code> + references first, then asks intake questions, then runs all 14 skills end-to-end. Drafts land under <code>traffic-law-appeal-il/output/</code> — never sent anywhere on your behalf.
        </div>
        <div class="row">
          <button class="btn-primary" data-traffic-open-chat>▶ OPEN CHAT WITH AGENT</button>
          <span class="hint" style="color:var(--muted);font-size:11.5px;font-family:var(--font-mono)">starts in the Claude tab · auto mode (full autonomy) · never files on your behalf</span>
        </div>
      </div>
    </div>

    ${caseStatePanel}

    <div class="split">
      <div>
        ${panel('WHAT TO PROVIDE WHEN YOU START', intakeChecklistHtml)}
        ${panel('OUTPUT DRAFTS', drafts ? `<ul class="files-list">${drafts}</ul><div class="md" data-file-viewer="traffic-law-drafts" hidden></div>` : `<div class="empty">no appeal drafts yet — they will appear under <code>traffic-law-appeal-il/output/</code> after a chat session</div>`, drafts ? `${(s.drafts||[]).length}` : null)}
        ${panel('AGENT FILES', `<ul class="files-list">${fileLinks.map(f =>
          `<li><span class="file-key">${escapeHtml(f.label)}</span><span class="file-link" data-file-open data-path="${escapeHtml(f.path)}">${escapeHtml(f.path.split(/[\\/]/).pop())}</span></li>`
        ).join('')}</ul><div class="md" data-file-viewer="traffic-law" hidden></div>`, `${fileLinks.length} files`)}
      </div>
      <div>
        ${panel('CUSTOM SKILLS', `<ul class="list">${skills || '<li>none</li>'}</ul>`, `${skillCheck.present.length}/${allSkills.length}`)}
        ${panel('START PROMPT (preview)', `<pre style="white-space:pre-wrap;direction:rtl;text-align:right;font-family:var(--font-mono);font-size:12px;line-height:1.5">${escapeHtml(promptPreview)}${(s.startPromptText||'').length > promptPreview.length ? '\n…' : ''}</pre>`)}
      </div>
    </div>
  `;

  bindPageInteractions();
  const openBtn = host.querySelector('[data-traffic-open-chat]');
  if (openBtn) {
    openBtn.onclick = () => {
      state.pendingClaudePrompt = s.startPromptText || '';
      navigate('claude');
    };
  }
}

// ─────────────────────────── PAGE: Claude Code ───────────────────────────
//
// `auto` mode passes --dangerously-skip-permissions, giving the dashboard the
// same hands-off autonomy as the interactive PowerShell Claude session: it can
// run commands, edit files, restart services, retry on failure, etc. without
// stalling on permission prompts. Output is streamed live over SSE, no
// confirm modal, no per-tick polling.

async function renderClaudePage(host) {
  const prevPrompt = $('#claude-prompt')?.value;
  const prevMode   = $('#claude-mode')?.value;
  const prevModel  = $('#claude-model')?.value;
  const prevEffort = $('#claude-effort')?.value;

  host.innerHTML = `
    ${pageHero({ title: 'Claude Code', sub: 'Spawns claude --print inside ~/.openclaw/workspace. Auto mode = same autonomy as the interactive PowerShell session.', status: 'OK' })}
    <div id="claude-diagnostics" class="claude-diagnostics"></div>
    <div class="claude-grid">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">NEW TASK</div></div>
        <div class="claude-form">
          <label>PROMPT
            <textarea id="claude-prompt" data-claude-prompt placeholder="e.g. restart the news scheduled task and confirm next-run is set; iterate until it works"></textarea>
          </label>
          <div class="claude-controls">
            <label>MODE
              <select id="claude-mode">
                <option value="auto" selected>auto — full autonomy (skip permissions, like PowerShell)</option>
                <option value="full">full — edits auto-accepted, shell stops on prompts</option>
                <option value="safe">safe — read+edit; allowlisted shell only</option>
                <option value="plan">plan — read/think only (no edits, no shell)</option>
              </select>
            </label>
            <label>MODEL
              <select id="claude-model">
                <option value="">(default)</option>
                <option value="sonnet">sonnet</option>
                <option value="opus">opus</option>
                <option value="haiku">haiku</option>
              </select>
            </label>
            <label>EFFORT
              <select id="claude-effort">
                <option value="">(default)</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="xhigh">xhigh</option>
              </select>
            </label>
          </div>
          <div id="claude-concurrency" class="claude-concurrency" hidden></div>
          <div class="row">
            <button id="claude-run" class="btn-primary">▶ RUN</button>
            <span class="hint" style="color:var(--muted);font-size:11px;font-family:var(--font-mono)">Ctrl+Enter to run · auto mode runs without confirm</span>
          </div>
        </div>
        <div class="panel-head" style="margin-top:18px"><div class="panel-title">CURRENT TASK</div></div>
        <div id="claude-current"><div class="empty">no task selected</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">TASK HISTORY</div></div>
        <input id="task-search" class="task-search" type="search" placeholder="filter by prompt…" autocomplete="off">
        <ul class="task-list" id="task-list"></ul>
      </div>
    </div>
  `;

  if (prevPrompt !== undefined) $('#claude-prompt').value = prevPrompt;
  if (prevMode)   $('#claude-mode').value = prevMode;
  if (prevModel)  $('#claude-model').value = prevModel;
  if (prevEffort) $('#claude-effort').value = prevEffort;

  // One-shot seed from another page (e.g. Traffic Appeal → "Open chat with agent").
  // Wins over prevPrompt so navigating to Claude with a pending prompt always shows it.
  if (state.pendingClaudePrompt) {
    $('#claude-prompt').value = state.pendingClaudePrompt;
    state.pendingClaudePrompt = null;
    $('#claude-prompt').focus();
  }

  $('#claude-run').onclick = claudeRun;
  $('#claude-prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) claudeRun();
  });

  await refreshClaudeList();
  await refreshClaudeDiagnostics();
  ensureClaudeTicker();
  if (state.selectedClaudeTaskId) openClaudeStream(state.selectedClaudeTaskId);
}

async function claudeRun() {
  const prompt = $('#claude-prompt').value.trim();
  if (!prompt) return;
  const mode = $('#claude-mode').value;
  const model = $('#claude-model').value || undefined;
  const effort = $('#claude-effort').value || undefined;
  // No confirm modal — auto mode is meant to be hands-off. The destructive
  // ones (plan/safe/full) also start without a prompt so behavior is uniform.
  // We *do* surface a passive concurrency warning above the button if a task
  // is already running, but we still let the user start a second one.
  $('#claude-run').disabled = true;
  const r = await api('/api/claude/run', { method: 'POST', body: { confirm: true, prompt, mode, model, effort } });
  $('#claude-run').disabled = false;
  if (!r.ok) { alert('failed: ' + JSON.stringify(r.data)); return; }
  state.selectedClaudeTaskId = r.data.id;
  await refreshClaudeList();
  openClaudeStream(r.data.id);
}

async function refreshClaudeList() {
  const r = await api('/api/claude/tasks?limit=50');
  if (!r.ok) return;
  state.claudeTasks = r.data.tasks || [];
  paintClaudeList();
  paintClaudeConcurrency();
  // Wire the filter input once.
  const search = $('#task-search');
  if (search && !search.dataset.wired) {
    search.dataset.wired = '1';
    search.addEventListener('input', paintClaudeList);
  }
}

function paintClaudeConcurrency() {
  const wrap = $('#claude-concurrency'); if (!wrap) return;
  const running = (state.claudeTasks || []).filter(t => t.status === 'running');
  // Don't count the currently-selected running task in the warning — the user
  // already sees it in the panel below, no point shouting about it.
  const others = running.filter(t => t.id !== state.selectedClaudeTaskId);
  if (!running.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  wrap.hidden = false;
  const lines = running.map(t => {
    const isSel = t.id === state.selectedClaudeTaskId;
    return `<a href="#" data-claude-jump="${escapeHtml(t.id)}" class="claude-conc-link${isSel ? ' is-self' : ''}">${escapeHtml((t.prompt || '').slice(0, 80) || '(no prompt)')}</a>`;
  }).join('');
  const head = others.length
    ? `${running.length} task${running.length > 1 ? 's' : ''} running — starting another runs them in parallel.`
    : `1 task running — starting another runs them in parallel.`;
  wrap.innerHTML = `<div class="claude-conc-head">⚠ ${head}</div><div class="claude-conc-list">${lines}</div>`;
  wrap.querySelectorAll('a[data-claude-jump]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      state.selectedClaudeTaskId = a.dataset.claudeJump;
      paintClaudeList();
      paintClaudeConcurrency();
      openClaudeStream(a.dataset.claudeJump);
    };
  });
}

function paintClaudeList() {
  const ul = $('#task-list'); if (!ul) return;
  const q = ($('#task-search')?.value || '').trim().toLowerCase();
  const tasks = (state.claudeTasks || []).filter(t =>
    !q || (t.prompt || '').toLowerCase().includes(q) || (t.status || '').includes(q) || (t.mode || '').includes(q)
  );
  ul.innerHTML = '';
  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = q ? `no tasks match "${q}"` : 'no tasks yet';
    ul.appendChild(li);
    return;
  }
  for (const t of tasks) {
    const li = document.createElement('li');
    if (t.id === state.selectedClaudeTaskId) li.classList.add('active');
    const k = claudeStatusKind(t.status);
    li.innerHTML = `
      <div class="task-prompt">${escapeHtml((t.prompt || '').slice(0, 240))}</div>
      <div class="task-meta">${chip(t.status, k)} <span>${escapeHtml(t.mode)}</span> <span>${dt(t.createdAt)}</span>${t.exitCode != null ? ` <span>exit ${t.exitCode}</span>` : ''}</div>`;
    li.onclick = () => {
      state.selectedClaudeTaskId = t.id;
      paintClaudeList();
      paintClaudeConcurrency();
      openClaudeStream(t.id);
    };
    ul.appendChild(li);
  }
}

function claudeStatusKind(status) {
  if (status === 'completed')                          return 'ok';
  if (status === 'running')                            return 'cyan';
  if (status === 'stopped' || status === 'orphaned')   return 'warn';
  if (status === 'killed')                             return 'warn';
  return 'bad'; // failed, unknown
}

async function refreshClaudeDiagnostics() {
  const r = await api('/api/claude/diagnostics');
  if (!r.ok) return;
  state.claudeDiagnostics = r.data;
  paintClaudeDiagnostics();
}

function paintClaudeDiagnostics() {
  const wrap = $('#claude-diagnostics'); if (!wrap) return;
  const d = state.claudeDiagnostics; if (!d) return;
  const orphans = d.untrackedClaudeProcesses || [];
  const orphansClass = orphans.length ? 'is-warn' : '';
  const stuckClass = d.stuckCount ? 'is-warn' : '';
  const binClass = d.claudeBinExists ? '' : 'is-bad';
  const last = d.lastCompleted;
  const fail = d.lastFailed;
  wrap.innerHTML = `
    <div class="diag-head">
      <span class="diag-title">CLAUDE RUNNER DIAGNOSTICS</span>
      <span class="diag-meta">runner ${escapeHtml(d.runnerVersion || '?')} · auto ${d.autoSupported ? 'on' : 'off'} · default ${escapeHtml(d.defaultMode || '?')}</span>
      <span class="spacer"></span>
      <button class="btn-ghost btn-tiny" id="claude-diag-refresh">⟳ REFRESH</button>
    </div>
    <div class="diag-grid">
      <div class="diag-cell"><div class="diag-label">ACTIVE</div><div class="diag-val">${d.activeCount || 0}</div></div>
      <div class="diag-cell ${stuckClass}"><div class="diag-label">STUCK</div><div class="diag-val">${d.stuckCount || 0}</div></div>
      <div class="diag-cell ${orphansClass}"><div class="diag-label">UNTRACKED CLAUDE.EXE</div><div class="diag-val">${orphans.length}</div></div>
      <div class="diag-cell ${binClass}"><div class="diag-label">CLAUDE BIN</div><div class="diag-val" title="${escapeHtml(d.claudeBin || '')}">${d.claudeBinExists ? 'OK' : 'MISSING'}</div></div>
      <div class="diag-cell"><div class="diag-label">LAST OK</div><div class="diag-val">${last ? `<a href="#" data-claude-jump="${escapeHtml(last.id)}">${escapeHtml((last.prompt || '').slice(0, 40) || last.id.slice(0, 8))}</a> <span class="diag-rel">${relTime(last.endedAt)}</span>` : '—'}</div></div>
      <div class="diag-cell"><div class="diag-label">LAST FAIL</div><div class="diag-val">${fail ? `<a href="#" data-claude-jump="${escapeHtml(fail.id)}">${escapeHtml((fail.prompt || '').slice(0, 40) || fail.id.slice(0, 8))}</a> <span class="diag-rel">${escapeHtml(fail.status || 'failed')} · ${relTime(fail.endedAt)}</span>` : '—'}</div></div>
    </div>
    ${orphans.length ? `<div class="diag-warn">⚠ ${orphans.length} stale claude.exe process${orphans.length > 1 ? 'es' : ''} not tracked by this runner: pid ${orphans.map(p => p.pid).join(', ')}. Restart the dashboard to sweep them.</div>` : ''}
  `;
  wrap.querySelectorAll('a[data-claude-jump]').forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      state.selectedClaudeTaskId = a.dataset.claudeJump;
      paintClaudeList();
      openClaudeStream(a.dataset.claudeJump);
    };
  });
  const refreshBtn = $('#claude-diag-refresh');
  if (refreshBtn) refreshBtn.onclick = () => { refreshClaudeDiagnostics(); refreshClaudeList(); };
}

// ── live output via SSE ─────────────────────────────────────────────────
// One open EventSource at a time; closes when the user picks another task,
// navigates away, or the task ends.
let claudeEventSource = null;
let claudeStreamTaskId = null;
let claudeOutBuf = '';
let claudeErrBuf = '';
let claudeOutBytes = 0;
let claudeErrBytes = 0;
// Mutable per-task health snapshot; updated by the SSE 'heartbeat' event and
// by the initial GET. Read by the 1s ticker to refresh time displays without
// re-painting the whole frame.
let claudeCurrentHealth = null;

function closeClaudeStream() {
  if (claudeEventSource) { try { claudeEventSource.close(); } catch {} }
  claudeEventSource = null;
  claudeStreamTaskId = null;
  claudeOutBuf = '';
  claudeErrBuf = '';
  claudeOutBytes = 0;
  claudeErrBytes = 0;
  claudeCurrentHealth = null;
}

async function openClaudeStream(id) {
  if (claudeStreamTaskId === id && claudeEventSource) return;
  closeClaudeStream();
  claudeStreamTaskId = id;

  // Render an initial frame from /api/claude/task so we have task metadata
  // (mode, started, status, computed health). The stream then replays the log
  // from byte 0.
  const r = await api(`/api/claude/task/${id}`);
  if (!r.ok || claudeStreamTaskId !== id) return;
  claudeCurrentHealth = r.data;
  // For already-finished tasks we won't get streaming data fast enough; seed
  // the visible buffers with the inline tail so the panel isn't empty.
  if (r.data.status !== 'running') {
    claudeOutBuf = r.data.stdout || '';
    claudeErrBuf = r.data.stderr || '';
  }
  paintClaudeFrame(r.data, claudeOutBuf, claudeErrBuf);

  const es = new EventSource(`/api/claude/task/${id}/stream?sinceOut=0&sinceErr=0`);
  claudeEventSource = es;
  es.addEventListener('append', (ev) => {
    if (claudeStreamTaskId !== id) return;
    let payload; try { payload = JSON.parse(ev.data); } catch { return; }
    if (payload.kind === 'stderr') {
      claudeErrBuf += payload.text;
      claudeErrBytes = payload.bytes;
      if (claudeCurrentHealth) {
        claudeCurrentHealth.lastStderrAt = payload.ts || new Date().toISOString();
        claudeCurrentHealth.lastOutputAt = claudeCurrentHealth.lastStderrAt;
      }
    } else {
      claudeOutBuf += payload.text;
      claudeOutBytes = payload.bytes;
      if (claudeCurrentHealth) {
        claudeCurrentHealth.lastStdoutAt = payload.ts || new Date().toISOString();
        claudeCurrentHealth.lastOutputAt = claudeCurrentHealth.lastStdoutAt;
      }
    }
    appendClaudeOutput(payload.kind, payload.text);
  });
  es.addEventListener('heartbeat', (ev) => {
    if (claudeStreamTaskId !== id) return;
    let h; try { h = JSON.parse(ev.data); } catch { return; }
    if (claudeCurrentHealth) {
      // Merge heartbeat into the in-memory health snapshot. The 1s ticker
      // re-renders the inline health bar from this without a full repaint.
      claudeCurrentHealth.lastOutputAt = h.lastOutputAt || claudeCurrentHealth.lastOutputAt;
      claudeCurrentHealth.staleMs       = h.staleMs;
      claudeCurrentHealth.elapsedMs     = h.elapsedMs;
      claudeCurrentHealth.possiblyStuck = h.possiblyStuck;
      claudeCurrentHealth.softWarn      = h.softWarn;
      claudeCurrentHealth.hardWarn      = h.hardWarn;
      claudeCurrentHealth.runtimeStatus = h.status;
      claudeCurrentHealth._heartbeatAt  = h.ts;
    }
    refreshClaudeHealthBar();
  });
  es.addEventListener('end', async (ev) => {
    if (claudeStreamTaskId !== id) return;
    let final; try { final = JSON.parse(ev.data); } catch { final = null; }
    try { es.close(); } catch {}
    if (claudeEventSource === es) claudeEventSource = null;
    if (final) {
      claudeCurrentHealth = final;
      paintClaudeFrame(final, claudeOutBuf, claudeErrBuf);
    }
    refreshClaudeList();
    refreshClaudeDiagnostics();
  });
  es.onerror = () => {
    // Browser will auto-retry; nothing to do unless we want to stop streaming.
    refreshClaudeHealthBar();
  };
}

// Render the full task frame: metadata grid, recovery controls, banners,
// stdout/stderr panels. Called on selection change and task end.
function paintClaudeFrame(t, stdoutText, stderrText) {
  const wrap = $('#claude-current'); if (!wrap) return;
  const isRunning = t.status === 'running';
  const k = claudeStatusKind(t.status);
  const elapsed = t.elapsedMs != null
    ? t.elapsedMs
    : (t.endedAt
        ? new Date(t.endedAt).getTime() - new Date(t.startedAt || t.createdAt).getTime()
        : Date.now() - new Date(t.startedAt || t.createdAt).getTime());

  const exitTxt = t.exitCode != null ? ` · exit ${t.exitCode}` : '';
  const sigTxt = t.signal ? ` · signal ${escapeHtml(t.signal)}` : '';
  const lastOut = t.lastOutputAt ? `last output ${relTime(t.lastOutputAt)}` : 'no output yet';

  const banners = renderClaudeBanners(t);
  const controls = renderClaudeControls(t);
  const stderrTone = t.status === 'failed' ? 'is-bad' : (stderrText ? 'is-warn' : '');
  const finalSummary = !isRunning ? renderClaudeFinalSummary(t, stdoutText, stderrText) : '';

  wrap.innerHTML = `
    <div class="claude-task-card" data-task-id="${escapeHtml(t.id)}">
      <div class="claude-task-head">
        <div class="claude-task-status">
          ${chip(t.status.toUpperCase(), k)}
          ${isRunning ? '<span class="claude-heartbeat" title="alive — heartbeat from runner"></span>' : ''}
        </div>
        <div class="claude-task-elapsed" data-claude-elapsed
             data-started="${escapeHtml(t.startedAt || t.createdAt || '')}"
             data-ended="${escapeHtml(t.endedAt || '')}"
             data-last-output="${escapeHtml(t.lastOutputAt || '')}">
          ${formatElapsed(elapsed)} · ${escapeHtml(lastOut)}
        </div>
        ${controls}
      </div>
      ${banners}
      <dl class="claude-task-meta">
        <div><dt>MODE</dt><dd>${escapeHtml(t.mode || '')}</dd></div>
        <div><dt>PID</dt><dd>${t.pid != null ? escapeHtml(String(t.pid)) : '—'}</dd></div>
        <div><dt>STARTED</dt><dd>${dt(t.startedAt || t.createdAt)}</dd></div>
        <div><dt>ENDED</dt><dd>${t.endedAt ? dt(t.endedAt) : '—'}${escapeHtml(exitTxt)}${sigTxt}</dd></div>
        <div><dt>STDOUT@</dt><dd>${t.lastStdoutAt ? relTime(t.lastStdoutAt) : '—'}</dd></div>
        <div><dt>STDERR@</dt><dd>${t.lastStderrAt ? relTime(t.lastStderrAt) : '—'}</dd></div>
        <div><dt>FILE@</dt><dd title="${escapeHtml(t.lastFileChangePath || '')}">${t.lastFileChangeAt ? relTime(t.lastFileChangeAt) : '—'}</dd></div>
        <div class="claude-meta-wide"><dt>CWD</dt><dd class="mono">${escapeHtml(t.cwd || '')}</dd></div>
        <div class="claude-meta-wide"><dt>CMD</dt><dd class="mono">${escapeHtml(t.command || '')}</dd></div>
      </dl>
      <details class="fold"><summary>PROMPT</summary><pre>${escapeHtml(t.prompt || '')}</pre></details>
      <details class="fold" open>
        <summary>STDOUT <span class="fold-meta">${isRunning ? '(live)' : `(${(t.stdoutBytes || 0).toLocaleString()} B)`}</span></summary>
        <pre class="claude-output" data-stdout data-autoscroll="1">${escapeHtml(stdoutText || (isRunning ? 'waiting for output…' : '(no stdout)'))}</pre>
      </details>
      <details class="fold ${stderrTone}" ${stderrText ? 'open' : ''}>
        <summary>STDERR <span class="fold-meta">${(t.stderrBytes || 0).toLocaleString()} B</span></summary>
        <pre class="claude-output ${stderrTone}" data-stderr data-autoscroll="1">${escapeHtml(stderrText || '(none)')}</pre>
      </details>
      ${finalSummary}
    </div>
  `;

  wireClaudeOutputAutoScroll(wrap);
  wireClaudeControls(wrap);
}

// Update only the live-changing parts (status chip kind, elapsed, last-output)
// without re-painting the whole frame. Called by the 1s ticker and by the SSE
// heartbeat handler. Avoids losing user scroll position / text selection.
function refreshClaudeHealthBar() {
  const wrap = $('#claude-current'); if (!wrap) return;
  const t = claudeCurrentHealth; if (!t) return;
  const el = wrap.querySelector('[data-claude-elapsed]');
  if (el) {
    const start = el.dataset.started ? new Date(el.dataset.started).getTime() : null;
    const end = el.dataset.ended ? new Date(el.dataset.ended).getTime() : null;
    const ms = (end || Date.now()) - (start || Date.now());
    const lastOut = t.lastOutputAt ? `last output ${relTime(t.lastOutputAt)}` : 'no output yet';
    el.textContent = `${formatElapsed(ms)} · ${lastOut}`;
    if (t.lastOutputAt) el.dataset.lastOutput = t.lastOutputAt;
  }
  // Banner updates: stuck / soft / hard warnings can flip on the fly.
  const bannerHost = wrap.querySelector('[data-claude-banners]');
  if (bannerHost) bannerHost.innerHTML = renderClaudeBannersInner(t);
}

function renderClaudeBanners(t) {
  return `<div class="claude-banners" data-claude-banners>${renderClaudeBannersInner(t)}</div>`;
}

function renderClaudeBannersInner(t) {
  const out = [];
  if (t.possiblyStuck) {
    const mins = Math.max(1, Math.round((t.staleMs || 0) / 60000));
    out.push(`<div class="claude-banner is-warn">⚠ Claude may be stuck — no stdout/stderr/file output for ~${mins} min. Use FORCE KILL if it stays unresponsive.</div>`);
  }
  if (t.hardWarn && !t.possiblyStuck) {
    const mins = Math.round((t.elapsedMs || 0) / 60000);
    out.push(`<div class="claude-banner is-warn">⏰ Long-running task — ${mins} min elapsed. Confirm Claude is still making progress.</div>`);
  } else if (t.softWarn && !t.possiblyStuck) {
    const mins = Math.round((t.elapsedMs || 0) / 60000);
    out.push(`<div class="claude-banner is-info">⌛ Soft warning — task has been running for ~${mins} min.</div>`);
  }
  if (t.status === 'orphaned') {
    out.push(`<div class="claude-banner is-warn">This task started in a previous dashboard run. Process state is no longer tracked. Force-kill works if the recorded PID still belongs to claude.exe.</div>`);
  }
  if (t.status === 'failed') {
    out.push(`<div class="claude-banner is-bad">Task failed${t.exitCode != null ? ` (exit ${t.exitCode})` : ''}. See STDERR below.</div>`);
  }
  return out.join('');
}

function renderClaudeControls(t) {
  const isRunning = t.status === 'running';
  const id = escapeHtml(t.id);
  const buttons = [];
  if (isRunning) {
    buttons.push(`<button class="btn-ghost btn-tiny" data-claude-stop="${id}" title="Send SIGTERM (graceful stop)">■ STOP</button>`);
    buttons.push(`<button class="btn-danger btn-tiny" data-claude-force="${id}" title="taskkill /T /F — kills the entire process tree">✕ FORCE KILL</button>`);
  } else {
    buttons.push(`<button class="btn-ghost btn-tiny" data-claude-restart="${id}" title="Re-run with the same prompt, mode, cwd">↻ RESTART</button>`);
  }
  buttons.push(`<button class="btn-ghost btn-tiny" data-claude-reveal-stdout="${id}" title="Open stdout log file in Explorer">📁 STDOUT LOG</button>`);
  buttons.push(`<button class="btn-ghost btn-tiny" data-claude-reveal-stderr="${id}" title="Open stderr log file in Explorer">📁 STDERR LOG</button>`);
  buttons.push(`<button class="btn-ghost btn-tiny" data-claude-copy-diag="${id}" title="Copy a diagnostic blob (status, pid, timestamps, last lines) to clipboard">⎘ COPY DIAG</button>`);
  return `<div class="claude-task-controls">${buttons.join('')}</div>`;
}

function renderClaudeFinalSummary(t, stdoutText, stderrText) {
  const dur = t.elapsedMs != null
    ? formatElapsed(t.elapsedMs)
    : (t.endedAt && t.startedAt
        ? formatElapsed(new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime())
        : '—');
  const lastN = (s, n) => {
    const lines = String(s || '').replace(/\r/g, '').split('\n');
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.slice(-n).join('\n');
  };
  const tailOut = lastN(stdoutText, 20);
  const tailErr = lastN(stderrText, 20);
  return `
    <div class="claude-final ${t.status === 'failed' ? 'is-bad' : t.status === 'completed' ? 'is-ok' : 'is-warn'}">
      <div class="claude-final-head">
        <strong>${escapeHtml((t.status || '').toUpperCase())}</strong>
        ${t.exitCode != null ? `<span>· exit ${escapeHtml(String(t.exitCode))}</span>` : ''}
        ${t.signal ? `<span>· signal ${escapeHtml(t.signal)}</span>` : ''}
        <span>· duration ${escapeHtml(dur)}</span>
        ${t.lastFileChangeAt ? `<span>· file change ${relTime(t.lastFileChangeAt)}</span>` : ''}
      </div>
      <details class="claude-final-fold" open>
        <summary>LAST 20 LINES · STDOUT</summary>
        <pre>${escapeHtml(tailOut || '(none)')}</pre>
      </details>
      <details class="claude-final-fold" ${tailErr ? 'open' : ''}>
        <summary>LAST 20 LINES · STDERR</summary>
        <pre>${escapeHtml(tailErr || '(none)')}</pre>
      </details>
    </div>
  `;
}

function wireClaudeOutputAutoScroll(wrap) {
  // Auto-scroll stick logic: if the user has scrolled up to read older
  // output, don't yank them back to the bottom. We toggle the
  // data-autoscroll attribute on each scroll event and read it in
  // appendClaudeOutput.
  wrap.querySelectorAll('pre.claude-output').forEach(pre => {
    pre.addEventListener('scroll', () => {
      const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 16;
      pre.dataset.autoscroll = atBottom ? '1' : '0';
    });
    // Start at the bottom for live tasks.
    pre.scrollTop = pre.scrollHeight;
  });
}

function wireClaudeControls(wrap) {
  wrap.querySelectorAll('button[data-claude-stop]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const r = await api(`/api/claude/task/${b.dataset.claudeStop}/stop`, { method: 'POST', body: {} });
      b.disabled = false;
      if (!r.ok) alert('stop failed: ' + JSON.stringify(r.data));
      refreshClaudeList();
    };
  });
  wrap.querySelectorAll('button[data-claude-force]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const r = await api(`/api/claude/task/${b.dataset.claudeForce}/force-kill`, { method: 'POST', body: {} });
      b.disabled = false;
      if (!r.ok) alert('force-kill failed: ' + JSON.stringify(r.data));
      refreshClaudeList();
      refreshClaudeDiagnostics();
    };
  });
  wrap.querySelectorAll('button[data-claude-restart]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const r = await api(`/api/claude/task/${b.dataset.claudeRestart}/restart`, { method: 'POST', body: {} });
      b.disabled = false;
      if (!r.ok) { alert('restart failed: ' + JSON.stringify(r.data)); return; }
      state.selectedClaudeTaskId = r.data.id;
      await refreshClaudeList();
      openClaudeStream(r.data.id);
    };
  });
  wrap.querySelectorAll('button[data-claude-reveal-stdout],button[data-claude-reveal-stderr]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.claudeRevealStdout || b.dataset.claudeRevealStderr;
      const kind = b.dataset.claudeRevealStdout ? 'stdout' : 'stderr';
      // tasksDir comes from /api/claude/diagnostics — refresh if we don't
      // have it yet (e.g. user clicked before diagnostics loaded).
      let dir = state.claudeDiagnostics && state.claudeDiagnostics.tasksDir;
      if (!dir) {
        await refreshClaudeDiagnostics();
        dir = state.claudeDiagnostics && state.claudeDiagnostics.tasksDir;
      }
      if (!dir) { alert('tasks dir unknown'); return; }
      const sep = dir.includes('\\') ? '\\' : '/';
      const logPath = `${dir}${sep}${id}.${kind}.log`;
      const r = await api('/api/reveal', { method: 'POST', body: { path: logPath } });
      if (!r.ok) alert('reveal failed: ' + JSON.stringify(r.data));
    };
  });
  wrap.querySelectorAll('button[data-claude-copy-diag]').forEach(b => {
    b.onclick = async () => {
      const r = await api(`/api/claude/task/${b.dataset.claudeCopyDiag}`);
      if (!r.ok) { alert('fetch failed: ' + JSON.stringify(r.data)); return; }
      const t = r.data;
      const lastN = (s, n) => String(s || '').replace(/\r/g, '').split('\n').slice(-n).join('\n');
      const blob = [
        `Task ${t.id}`,
        `Status: ${t.status}${t.exitCode != null ? ` (exit ${t.exitCode})` : ''}${t.signal ? ` signal=${t.signal}` : ''}`,
        `Mode: ${t.mode}    PID: ${t.pid || '—'}`,
        `Started: ${t.startedAt}    Ended: ${t.endedAt || '—'}`,
        `Last stdout: ${t.lastStdoutAt || '—'}    Last stderr: ${t.lastStderrAt || '—'}    Last file: ${t.lastFileChangeAt || '—'}`,
        `Stale: ${t.staleMs != null ? Math.round(t.staleMs / 1000) + 's' : '—'}    Possibly stuck: ${t.possiblyStuck ? 'YES' : 'no'}`,
        `Cwd: ${t.cwd}`,
        `Cmd: ${t.command}`,
        ``,
        `Prompt:`,
        `${t.prompt || ''}`,
        ``,
        `Last 20 stdout lines:`,
        lastN(t.stdout, 20) || '(none)',
        ``,
        `Last 20 stderr lines:`,
        lastN(t.stderr, 20) || '(none)'
      ].join('\n');
      try {
        await navigator.clipboard.writeText(blob);
        flashTinyTip(b, 'COPIED');
      } catch (e) {
        alert('clipboard write failed: ' + e.message);
      }
    };
  });
}

function flashTinyTip(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1200);
}

function appendClaudeOutput(kind, text) {
  const wrap = $('#claude-current'); if (!wrap) return;
  const sel = kind === 'stderr' ? 'pre[data-stderr]' : 'pre[data-stdout]';
  const pre = wrap.querySelector(sel);
  if (!pre) return;
  // Replace placeholder text on first chunk.
  if (pre.textContent === 'waiting for output…' || pre.textContent === '(none)' || pre.textContent === '(no stdout)' || pre.textContent === '') {
    pre.textContent = '';
  }
  // Honor user's scroll position — don't yank them down if they scrolled up.
  const stick = pre.dataset.autoscroll !== '0';
  pre.appendChild(document.createTextNode(text));
  if (stick) pre.scrollTop = pre.scrollHeight;
  if (kind === 'stderr') {
    const det = pre.closest('details');
    if (det && !det.open) det.open = true;
  }
}

let claudeTickerInterval = null;
let claudeDiagInterval = null;
function ensureClaudeTicker() {
  if (claudeTickerInterval) return;
  claudeTickerInterval = setInterval(() => {
    if (document.hidden) return;
    if (state.route.page !== 'claude') {
      // Stop streaming when leaving the page so we don't burn an open connection.
      if (claudeEventSource) closeClaudeStream();
      if (claudeDiagInterval) { clearInterval(claudeDiagInterval); claudeDiagInterval = null; }
      return;
    }
    refreshClaudeHealthBar();
  }, 1000);
  if (!claudeDiagInterval) {
    // Diagnostics & history list refresh — slower cadence.
    claudeDiagInterval = setInterval(() => {
      if (document.hidden) return;
      if (state.route.page !== 'claude') return;
      refreshClaudeDiagnostics();
      refreshClaudeList();
    }, 5000);
  }
}

// ─────────────────────────── PAGE: Activity ───────────────────────────
async function renderActivityPage(host) {
  host.innerHTML = `
    ${pageHero({ title: 'Activity', sub: 'Rolling action-log entries written by every action invocation.', status: 'OK' })}
    <div class="activity-filters">
      <label>SYSTEM
        <select id="act-alias">
          <option value="">all</option>
          <option value="news">news</option>
          <option value="organizer">organizer</option>
          <option value="system-map">system-map</option>
          <option value="claude">claude</option>
          <option value="dashboard">dashboard</option>
        </select>
      </label>
      <label>MODE
        <select id="act-mode">
          <option value="">all</option>
          <option value="read">read</option>
          <option value="exec">exec</option>
          <option value="send">send</option>
          <option value="write">write</option>
        </select>
      </label>
      <label>STATUS
        <select id="act-status">
          <option value="">all</option>
          <option value="ok">ok</option>
          <option value="fail">fail</option>
        </select>
      </label>
      <label>LIMIT
        <input id="act-limit" type="number" value="200" min="10" max="1000" step="10">
      </label>
      <button id="act-refresh" class="btn-primary">▶ REFRESH</button>
      <label class="act-auto" title="Auto-refresh every 10 seconds while this page is visible">
        <input id="act-auto" type="checkbox" checked> AUTO
      </label>
    </div>
    <table class="activity-table">
      <thead><tr><th>WHEN</th><th>SYSTEM</th><th>ACTION</th><th>MODE</th><th>STATUS</th><th>DURATION</th><th>DETAIL</th></tr></thead>
      <tbody id="activity-body"></tbody>
    </table>
  `;
  $('#act-refresh').onclick = paintActivity;
  ['#act-alias', '#act-mode', '#act-status', '#act-limit'].forEach(s => {
    const el = $(s); if (el) el.onchange = paintActivity;
  });
  paintActivity();
  ensureActivityTicker();
}

let activityTickerInterval = null;
function ensureActivityTicker() {
  if (activityTickerInterval) return;
  // 10s cadence — enough to catch new entries quickly without spamming the file
  // reader. Pauses when the tab is hidden or when the user navigates away.
  activityTickerInterval = setInterval(() => {
    if (document.hidden) return;
    if (state.route.page !== 'activity') return;
    const auto = $('#act-auto');
    if (auto && !auto.checked) return;
    paintActivity();
  }, 10000);
}
async function paintActivity() {
  await loadActivity({
    alias: $('#act-alias').value,
    mode: $('#act-mode').value,
    status: $('#act-status').value,
    limit: $('#act-limit').value || 200
  });
  const tbody = $('#activity-body'); if (!tbody) return;
  tbody.innerHTML = '';
  for (const e of (state.lastActivity || [])) {
    const ok = e.ok === true; const fail = e.ok === false;
    const tr = document.createElement('tr');
    if (fail) tr.classList.add('fail');
    const k = ok ? 'ok' : fail ? 'bad' : 'mute';
    const detailParts = [];
    if (e.error)    detailParts.push('error: ' + e.error);
    if (e.taskId)   detailParts.push('task: ' + e.taskId);
    if (e.exitCode != null) detailParts.push('exit: ' + e.exitCode);
    if (e.key)      detailParts.push('key: ' + e.key);
    tr.innerHTML = `
      <td>${escapeHtml(timeOnly(e.ts))}<br><span style="color:var(--muted);font-size:11px">${escapeHtml(relTime(e.ts))}</span></td>
      <td>${escapeHtml(e.alias || '')}</td>
      <td>${escapeHtml(e.name || '')}</td>
      <td>${escapeHtml(e.mode || '')}</td>
      <td>${chip(ok ? 'ok' : fail ? 'fail' : '—', k)}</td>
      <td>${e.durationMs != null ? e.durationMs + 'ms' : ''}</td>
      <td class="detail">${escapeHtml(detailParts.join(' · '))}</td>`;
    tbody.appendChild(tr);
  }
}

// ─────────────────────────── Page-wide bindings ───────────────────────────
function bindPageInteractions() {
  // Action buttons
  $$('button[data-action]').forEach(btn => {
    btn.onclick = () => runAction(btn.dataset.alias, btn.dataset.name);
  });
  // Sub-tab buttons + nav-style buttons that navigate
  $$('[data-route]').forEach(el => {
    if (el.tagName !== 'BUTTON' && !el.classList.contains('subtab')) return;
    el.onclick = () => {
      const [page, sub] = (el.dataset.route || '').split('/');
      navigate(page, sub);
    };
  });
  // File viewers
  $$('[data-file-open]').forEach(el => {
    el.onclick = async () => {
      const path = el.dataset.path;
      const alias = el.closest('.panel')?.querySelector('[data-file-viewer]')?.dataset.fileViewer;
      const viewer = $(`[data-file-viewer="${alias}"]`);
      if (!viewer) return;
      viewer.hidden = false;
      viewer.innerHTML = '<div class="empty">loading…</div>';
      const r = await apiText('/api/file?path=' + encodeURIComponent(path));
      if (!r.ok) { viewer.innerHTML = `<div class="empty" style="color:var(--red)">${escapeHtml(r.text || ('error ' + r.status))}</div>`; return; }
      // Render markdown for .md files; otherwise pre
      if (/\.md$/i.test(path)) viewer.innerHTML = renderMarkdown(r.text);
      else viewer.innerHTML = `<pre>${escapeHtml(r.text).slice(0, 200000)}</pre>`;
    };
  });
  // Reveal-in-Explorer (organizer Computer top files)
  $$('[data-reveal-file]').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const p = el.dataset.path;
      if (!p) return;
      const r = await api('/api/reveal', { method: 'POST', body: { path: p } });
      if (!r.ok) {
        alert('Could not open in Explorer: ' + (r.data && r.data.error || r.status));
      } else {
        const orig = el.textContent;
        el.textContent = 'OPENED';
        setTimeout(() => { el.textContent = orig; }, 1200);
      }
    };
  });
  // The whole file row also reveals on tap (mobile-friendly large hit target)
  $$('[data-file-row]').forEach(row => {
    row.onclick = async (e) => {
      if (e.target.closest('button')) return; // explicit button takes precedence
      const p = row.dataset.path;
      if (!p) return;
      await api('/api/reveal', { method: 'POST', body: { path: p } });
    };
  });
  // Markdown loader buttons (organizer module review)
  $$('[data-md-load]').forEach(btn => {
    btn.onclick = async () => {
      const path = btn.dataset.path;
      const target = btn.dataset.target;
      const fold = $(`#${target}-fold`);
      const el = $(`#${target}`);
      if (!path) { el.innerHTML = `<div class="empty" style="color:var(--amber)">no file path registered</div>`; if (fold) fold.open = true; return; }
      el.innerHTML = '<div class="empty">loading…</div>';
      if (fold) fold.open = true;
      const r = await apiText('/api/file?path=' + encodeURIComponent(path));
      if (!r.ok) {
        el.innerHTML = `<div class="empty" style="color:var(--red)">${escapeHtml(r.text || 'error '+r.status)}</div>`;
        return;
      }
      el.innerHTML = renderMarkdown(r.text);
    };
  });
}

// ─────────────────────────── Self-status indicator ───────────────────────────
async function refreshSelfStatus() {
  const elRun = $('#self-running'), elPid = $('#self-pid'), elUp = $('#self-uptime'),
        elUrl = $('#self-url'), elTask = $('#self-task');
  if (!elRun) return;
  let r;
  try { r = await api('/api/dashboard/self'); } catch { r = { ok: false }; }
  if (!r.ok || !r.data) {
    elRun.textContent = 'UNREACHABLE'; elRun.className = 'self-val bad';
    elPid.textContent = '—'; elUp.textContent = '—'; elUrl.textContent = '—'; elTask.textContent = '—';
    return;
  }
  const d = r.data;
  elRun.textContent = 'RUNNING'; elRun.className = 'self-val ok';
  elPid.textContent = d.pid != null ? String(d.pid) : '—';
  if (d.startedAt) {
    window.__selfStartedAt = new Date(d.startedAt).getTime();
    elUp.textContent = formatElapsed(Date.now() - window.__selfStartedAt);
  } else {
    window.__selfStartedAt = null;
    elUp.textContent = '—';
  }
  elUrl.textContent = d.url || '—';
  if (!d.task || d.task.installed === false) {
    elTask.textContent = 'NOT INSTALLED'; elTask.className = 'self-val warn';
  } else if (d.task.enabled === false) {
    elTask.textContent = 'DISABLED'; elTask.className = 'self-val warn';
  } else {
    elTask.textContent = (d.task.state || 'INSTALLED').toUpperCase();
    elTask.className = 'self-val ok';
  }
}

// ─────────────────────────── Remote-access indicator ───────────────────────────
async function refreshRemoteStatus() {
  const elState = $('#remote-state');
  if (!elState) return;
  const elIp     = $('#remote-ip');
  const elPort   = $('#remote-port');
  const elTok    = $('#remote-token');
  const elRot    = $('#remote-rotated');
  const elUrl    = $('#remote-url');
  const elCopy   = $('#remote-copy');

  let r;
  try { r = await api('/api/remote/status'); } catch { r = { ok: false }; }
  if (!r.ok || !r.data) {
    elState.textContent = 'UNREACHABLE'; elState.className = 'remote-state bad';
    return;
  }
  const d = r.data;
  // Determine label.
  let label = 'OFF', cls = 'cold';
  if (!d.enabled) { label = 'DISABLED'; cls = 'cold'; }
  else if (!d.tailscaleIp) { label = 'NO VPN'; cls = 'warn'; }
  else if (!d.tokenConfigured) { label = 'NO TOKEN'; cls = 'warn'; }
  else if (d.listening) { label = 'ONLINE'; cls = 'ok'; }
  else { label = 'NOT LISTENING'; cls = 'warn'; }
  elState.textContent = label;
  elState.className = 'remote-state ' + cls;

  elIp.textContent   = d.tailscaleIp || '—';
  elPort.textContent = d.port != null ? String(d.port) : '—';
  elTok.textContent  = d.tokenConfigured ? 'configured' : 'missing';
  elTok.className    = 'self-val ' + (d.tokenConfigured ? 'ok' : 'warn');
  elRot.textContent  = d.tokenRotatedAt ? relTime(d.tokenRotatedAt) : '—';
  elUrl.textContent  = d.url || '—';
  if (elCopy) elCopy.disabled = !d.url;
  window.__remoteUrl = d.url || null;
  window.__remoteStatus = d;
}

function bindRemotePanel() {
  const elCopy = $('#remote-copy');
  const elHelp = $('#remote-help');
  if (elCopy) {
    elCopy.addEventListener('click', async () => {
      const url = window.__remoteUrl;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        const orig = elCopy.textContent; elCopy.textContent = 'COPIED';
        setTimeout(() => { elCopy.textContent = orig; }, 1200);
      } catch {
        prompt('Copy this URL:', url);
      }
    });
  }
  if (elHelp) {
    elHelp.addEventListener('click', () => {
      const d = window.__remoteStatus || {};
      const lines = [
        'OpenClaw Remote Access · Tailscale-only',
        '',
        d.tailscaleIp ? `Tailscale IP detected: ${d.tailscaleIp}` : 'No Tailscale IP detected on this machine.',
        d.tokenConfigured ? 'Token: configured.' : 'Token: NOT configured.',
        d.url ? `URL: ${d.url}` : '',
        '',
        'On Windows (this machine):',
        '  1. Install Tailscale and sign in.',
        '  2. PowerShell:',
        '       cd C:\\Users\\<you>\\.openclaw\\workspace\\control-dashboard',
        '       .\\scripts\\remote-token-setup.ps1',
        '     (creates a token; copy the printed value)',
        '  3. Restart the dashboard service so the remote listener binds.',
        '',
        'On phone:',
        '  1. Install Tailscale, sign in, ensure VPN is ON.',
        '  2. Open browser to:  http://<vpn-ip>:<port>/?token=<your-token>',
        '  3. The token gets stored as a cookie; bookmark http://<vpn-ip>:<port>/.',
        '',
        'Disable: .\\scripts\\remote-token-setup.ps1 -Disable',
        'Rotate:  .\\scripts\\remote-token-setup.ps1 -Rotate'
      ].filter(Boolean).join('\n');
      alert(lines);
    });
  }
}

function bindSelfRestart() {
  const btn = $('#self-restart');
  const stat = $('#self-restart-status');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    if (!confirm('Restart the dashboard server now?')) return;
    btn.disabled = true;
    if (stat) { stat.textContent = 'sending…'; stat.className = 'self-restart-status warn'; }
    const elRun = $('#self-running'); const elTask = $('#self-task');
    const r = await api('/api/dashboard/restart', { method: 'POST' });
    if (!r.ok) {
      if (stat) {
        stat.textContent = 'failed: ' + ((r.data && r.data.error) || r.status);
        stat.className = 'self-restart-status bad';
      }
      btn.disabled = false;
      return;
    }
    if (stat) { stat.textContent = 'restarting…'; stat.className = 'self-restart-status warn'; }
    if (elRun) { elRun.textContent = 'RESTARTING'; elRun.className = 'self-val warn'; }
    if (elTask) { elTask.textContent = '—'; elTask.className = 'self-val'; }
    const oldStartedAt = window.__selfStartedAt;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise(res => setTimeout(res, 800));
      let h;
      try { h = await api('/api/dashboard/self'); } catch { h = { ok: false }; }
      if (h.ok && h.data && h.data.startedAt) {
        const newStart = new Date(h.data.startedAt).getTime();
        if (!oldStartedAt || newStart > oldStartedAt) {
          if (stat) { stat.textContent = 'back online'; stat.className = 'self-restart-status ok'; }
          await refreshSelfStatus();
          setTimeout(() => { if (stat) { stat.textContent = ''; stat.className = 'self-restart-status'; } }, 4000);
          btn.disabled = false;
          return;
        }
      }
    }
    if (stat) { stat.textContent = 'timed out — refresh manually'; stat.className = 'self-restart-status bad'; }
    btn.disabled = false;
  });
}

// ─────────────────────────── Keyboard shortcuts ───────────────────────────
// Tiny set, designed to stay out of the way of inputs and Claude prompts.
//   r   — refresh (same as the topbar refresh button)
//   ?   — show shortcut help
//   g n / g o / g s / g c / g a — go to news/organizer/system-map/claude/activity
const KEYBINDINGS_HELP = [
  'r        Refresh current page',
  'g n      Go to News',
  'g o      Go to Organizer',
  'g s      Go to System Map',
  'g c      Go to Claude Code',
  'g a      Go to Activity',
  '?        Show this help'
].join('\n');

let _gPressedAt = 0;
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't hijack typing in inputs / textareas / selects / contenteditable.
    const t = e.target;
    const tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') {
      e.preventDefault();
      alert('OpenClaw Control · keyboard shortcuts\n\n' + KEYBINDINGS_HELP);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      const btn = $('#refresh-btn');
      if (btn) btn.click();
      return;
    }
    // Two-key "g <letter>" navigation (Vim-style).
    if (e.key === 'g' || e.key === 'G') {
      _gPressedAt = Date.now();
      return;
    }
    if (Date.now() - _gPressedAt < 1200) {
      const map = { n: 'news', o: 'organizer', s: 'system-map', c: 'claude', a: 'activity' };
      const dest = map[e.key.toLowerCase()];
      if (dest) {
        _gPressedAt = 0;
        e.preventDefault();
        navigate(dest);
      }
    }
  });
}

// ─────────────────────────── Boot ───────────────────────────
async function boot() {
  wireSidebar();
  bindRemotePanel();
  bindSelfRestart();
  bindKeyboardShortcuts();
  ensureTicker();
  await Promise.all([loadRegistry(), loadSummary(), loadActivity({ limit: 60 }), refreshSelfStatus(), refreshRemoteStatus()]);
  paintGlobalPulse(); paintNavBadges();
  await onRouteChange();
  // Periodic refresh of summary + active page
  setInterval(async () => {
    if (document.hidden) return;
    await Promise.all([loadSummary(), loadActivity({ limit: 60 })]);
    paintGlobalPulse(); paintNavBadges();
    // Re-render the visible page if it's a status-driven page (skip claude+activity which manage themselves)
    const p = state.route.page;
    if (p === 'news' || p === 'organizer' || p === 'system-map') await render();
  }, 6000);
  // Self-status refresh — slower cadence is fine; uptime ticks via the second-counter below.
  setInterval(() => { if (!document.hidden) refreshSelfStatus(); }, 15000);
  setInterval(() => { if (!document.hidden) refreshRemoteStatus(); }, 30000);
  // Live uptime ticker (no network)
  setInterval(() => {
    const elUp = $('#self-uptime');
    if (!elUp || !window.__selfStartedAt) return;
    elUp.textContent = formatElapsed(Date.now() - window.__selfStartedAt);
  }, 1000);
}
boot();

// ─────────────────────────── PAGE: Telegram / Topics ───────────────────────────
async function renderTelegramPage(host) {
  const r = await api('/api/telegram/topics');
  const data = r.ok ? r.data : { topics: [] };

  const sensChip = (s) => s === 'sensitive' ? chip(s, 'warn') : (s === 'unknown' ? chip(s, 'mute') : (s === 'private' ? chip(s, 'cyan') : chip(s, 'ok')));
  const routableChip = (t) => t.routable ? chip('routable', 'ok') : chip(t.topicIdStatus === 'pending' ? 'pending' : 'not routable', 'warn');

  const rows = (data.topics || []).map(t => {
    const block = (t.blockedContent || []).join(', ');
    const idCell = t.topicId == null ? `<i style="color:var(--amber)">pending</i>` : escapeHtml(String(t.topicId));
    return `
      <tr data-alias="${escapeHtml(t.alias)}">
        <td><b>${escapeHtml(t.alias)}</b><div style="color:var(--muted);font-size:11px">${escapeHtml(t.name || '')}</div></td>
        <td>${escapeHtml(t.humanTopicName || '—')}</td>
        <td class="mono">${idCell}</td>
        <td>${escapeHtml(t.defaultTarget || '—')}</td>
        <td>${routableChip(t)} ${sensChip(t.sensitivity)}</td>
        <td style="font-size:11px;color:var(--muted)">${escapeHtml(t.relatedSystem || '—')}</td>
        <td style="font-size:11px;color:var(--muted)">${t.lastSeenAt ? escapeHtml(dt(t.lastSeenAt)) : '—'}</td>
        <td>
          <button class="btn-ghost btn-tiny" data-tg-relabel="${escapeHtml(t.alias)}" title="Update topicId / human name">RELABEL</button>
          <button class="btn-ghost btn-tiny" data-tg-test-send="${escapeHtml(t.alias)}" title="Send a test message (gated)">TEST SEND</button>
        </td>
      </tr>
      ${t.purpose || block || t.reRegisterHints ? `
        <tr class="tg-detail">
          <td colspan="8" style="background:var(--bg-1);padding:8px 12px;color:var(--text-dim);font-size:12px">
            ${t.purpose ? `<div><b>Purpose:</b> ${escapeHtml(t.purpose)}</div>` : ''}
            ${block ? `<div><b>Blocked content (without force:true):</b> ${escapeHtml(block)}</div>` : ''}
            ${!t.routable && t.reRegisterHints ? `<div style="margin-top:4px;color:var(--amber)"><b>To register:</b> ${escapeHtml(t.reRegisterHints)}</div>` : ''}
          </td>
        </tr>
      ` : ''}
    `;
  }).join('');

  host.innerHTML = `
    ${pageHero({ title: 'Telegram / Topics', sub: 'Friendly aliases for the OpenClaw supergroup topics. Resolved by lib/telegram-topics.js for every send.', status: 'OK' })}

    <div class="panel">
      <div class="panel-head"><div class="panel-title">REGISTRY</div><span class="panel-meta">${escapeHtml(data.defaultGroupChatId || '—')} · owner DM ${escapeHtml(data.ownerDmId || '—')} · updated ${escapeHtml(data.updatedAt || '—')}</span></div>
      <table class="activity-table" style="margin:0">
        <thead>
          <tr><th>ALIAS</th><th>TOPIC</th><th>ID</th><th>DEFAULT</th><th>STATE</th><th>SYSTEM</th><th>LAST SEEN</th><th></th></tr>
        </thead>
        <tbody id="tg-topics-body">${rows || '<tr><td colspan="8" class="empty">no topics in registry</td></tr>'}</tbody>
      </table>
    </div>

    <div class="split">
      <div>
        ${panel('AVAILABLE COMMANDS', `
          <ul class="list" id="tg-commands-list"><li class="empty">loading…</li></ul>
          <div style="color:var(--muted);font-size:11.5px;margin-top:8px">
            Same handlers as the dashboard's UI buttons — Telegram doesn't duplicate logic.
          </div>
        `)}
      </div>
      <div>
        ${panel('SAFETY POLICY', `
          <ul style="margin:0;padding-right:20px;line-height:1.7;font-size:13px;color:var(--text)" dir="rtl">
            <li><b>Send-by-alias</b> requires <code>confirm:true</code> for sensitive aliases.</li>
            <li><b>traffic-law</b> blocks draft-letter / ticket-image / ticket-text by default. Override only with <code>force:true</code>.</li>
            <li><b>Pending topics</b> (<code>traffic-law</code>, <code>unknown-537</code>, <code>unknown-967</code>) refuse all sends until relabeled.</li>
            <li><b>Bot tokens</b> never appear in this dashboard. The send pipeline reads them from <code>~/.openclaw/gateway.token</code> on demand.</li>
            <li>Logs every send attempt to <code>state/action-log.jsonl</code> under <code>alias=telegram</code>.</li>
          </ul>
        `)}
      </div>
    </div>
  `;

  // Wire RELABEL buttons.
  host.querySelectorAll('button[data-tg-relabel]').forEach(b => {
    b.onclick = async () => {
      const alias = b.dataset.tgRelabel;
      const idStr = prompt(`New topicId for '${alias}' (numeric, leave blank to skip):`, '');
      const human = prompt(`Human topic name for '${alias}' (leave blank to skip):`, '');
      const patch = {};
      if (idStr && idStr.trim()) patch.topicId = Number(idStr.trim());
      if (human && human.trim()) patch.humanTopicName = human.trim();
      if (Object.keys(patch).length === 0) return;
      const r = await api(`/api/telegram/topics/${alias}`, { method: 'POST', body: patch });
      if (!r.ok) { alert('relabel failed: ' + JSON.stringify(r.data)); return; }
      renderTelegramPage(host);
    };
  });

  // Wire TEST SEND buttons.
  host.querySelectorAll('button[data-tg-test-send]').forEach(b => {
    b.onclick = async () => {
      const alias = b.dataset.tgTestSend;
      const text = prompt(`Test text to send to '${alias}' via the gateway (will go through the real bot — type carefully):`, `OpenClaw test message — ${new Date().toLocaleString()}`);
      if (!text || !text.trim()) return;
      const intent = prompt(`Intent label (e.g. 'manual-test', 'status-ping'). Default: manual-test`, 'manual-test') || 'manual-test';
      if (!confirm(`Send this text to alias '${alias}' via the live Telegram gateway? This will post a real message.`)) return;
      const r = await api(`/api/telegram/topics/${alias}/send`, { method: 'POST', body: { confirm: true, text, intent } });
      alert(r.ok ? `Sent: ${JSON.stringify(r.data.gatewayResult || {}).slice(0, 300)}` : `Failed: ${JSON.stringify(r.data)}`);
    };
  });

  // Load command list.
  api('/api/telegram/commands').then(r => {
    const ul = $('#tg-commands-list'); if (!ul) return;
    if (!r.ok) { ul.innerHTML = `<li class="empty">command list unavailable: ${escapeHtml(JSON.stringify(r.data))}</li>`; return; }
    const cmds = (r.data.commands || []);
    if (!cmds.length) { ul.innerHTML = `<li class="empty">no commands registered</li>`; return; }
    ul.innerHTML = cmds.map(c => `<li><b>/${escapeHtml(c.name)}</b><div style="color:var(--muted);font-size:11.5px;margin-top:2px">${escapeHtml(c.description || '')}</div></li>`).join('');
  });
}
