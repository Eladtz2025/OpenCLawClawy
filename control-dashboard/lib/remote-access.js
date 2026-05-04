// OpenClaw Control Dashboard — Tailscale-only remote access.
// Adds a SECOND listener bound exclusively to the detected Tailscale IP
// (CGNAT range 100.64.0.0/10), gated by a shared bearer token.
// The localhost listener is unchanged.
//
// Hard guarantees:
//   - never binds to 0.0.0.0
//   - never starts if no Tailscale IP is detected
//   - never starts if no token is configured
//   - rejects any request whose remote address is outside 100.64.0.0/10
//   - constant-time token comparison
//   - token is read from disk on every check (rotation = drop the file)
//   - token is never logged, never returned over the wire

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TOKEN_PATH = path.resolve(
  process.env.OPENCLAW_REMOTE_TOKEN_FILE ||
  path.join(os.homedir(), '.openclaw', 'dashboard-remote.token')
);

const COOKIE_NAME = 'oc_remote_token';
const DEFAULT_REMOTE_PORT = 7787;

// ─── Tailscale CGNAT range: 100.64.0.0/10 ───────────────────────────────
function isTailscaleAddress(addr) {
  if (typeof addr !== 'string') return false;
  // strip IPv4-mapped IPv6 prefix
  const v4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v4);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  if (a !== 100) return false;
  return b >= 64 && b <= 127;
}

function detectTailscaleIp() {
  // Allow explicit override (still validated against the CGNAT range).
  const override = process.env.OPENCLAW_REMOTE_HOST;
  if (override && isTailscaleAddress(override)) return override;

  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family !== 'IPv4' && ni.family !== 4) continue;
      if (ni.internal) continue;
      if (isTailscaleAddress(ni.address)) return ni.address;
    }
  }
  return null;
}

// ─── Token store ────────────────────────────────────────────────────────
function loadTokenInfo() {
  try {
    const stat = fs.statSync(TOKEN_PATH);
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^﻿/, '').trim();
    let token = null;
    let createdAt = null;
    let rotatedAt = null;
    if (raw.startsWith('{')) {
      try {
        const j = JSON.parse(raw);
        token = (j.token || '').trim();
        createdAt = j.createdAt || null;
        rotatedAt = j.rotatedAt || null;
      } catch { /* fall through */ }
    }
    if (!token) token = raw.split(/\s+/)[0];
    if (!token || token.length < 32) return null;
    return {
      token,
      mtime: stat.mtime.toISOString(),
      createdAt: createdAt || stat.birthtime?.toISOString?.() || null,
      rotatedAt: rotatedAt || stat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

function tokensEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  // Equal-length buffers required by timingSafeEqual.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still do a constant-time compare on a same-length buffer to avoid early exit.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// ─── Request auth ───────────────────────────────────────────────────────
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractProvidedToken(req, parsedUrl) {
  // 1. Authorization: Bearer <token>
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  // 2. Custom header
  const h = req.headers['x-openclaw-remote-token'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  // 3. Query string (one-shot — should be exchanged for cookie)
  if (parsedUrl && parsedUrl.query && typeof parsedUrl.query.token === 'string') {
    return parsedUrl.query.token.trim();
  }
  // 4. Cookie
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  return null;
}

// ─── Listener ───────────────────────────────────────────────────────────
function start({ route, log = () => {}, port = DEFAULT_REMOTE_PORT }) {
  if (process.env.OPENCLAW_REMOTE_DISABLED === '1') {
    return { listening: false, reason: 'disabled-by-env' };
  }
  const ip = detectTailscaleIp();
  if (!ip) {
    return { listening: false, reason: 'no-tailscale-ip' };
  }
  const tinfo = loadTokenInfo();
  if (!tinfo) {
    return { listening: false, reason: 'no-token', ip, port };
  }

  const handler = (req, res) => {
    // Defence-in-depth: reject any request whose source is outside Tailscale.
    const ra = req.socket && req.socket.remoteAddress;
    if (!isTailscaleAddress(ra)) {
      respond(res, 403, { error: 'remote access requires Tailscale (100.64.0.0/10)' });
      return;
    }
    // Re-load token on every request so rotation takes effect immediately.
    const live = loadTokenInfo();
    if (!live) {
      respond(res, 503, { error: 'remote access not configured' });
      return;
    }
    const url = require('url').parse(req.url || '/', true);
    const provided = extractProvidedToken(req, url);
    if (!provided || !tokensEqual(provided, live.token)) {
      // If the request came via ?token= and matched, set the cookie + redirect.
      // Already handled above (no match = 401).
      respondAuthChallenge(res);
      return;
    }
    // Token-as-query: set cookie, redirect to clean URL so it isn't visible/cached.
    const fromQuery = url.query && typeof url.query.token === 'string' && url.query.token.trim() === live.token;
    if (fromQuery) {
      const cleanQuery = { ...url.query };
      delete cleanQuery.token;
      const qs = Object.keys(cleanQuery).length
        ? '?' + Object.entries(cleanQuery).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
        : '';
      res.writeHead(302, {
        'set-cookie': `${COOKIE_NAME}=${encodeURIComponent(live.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
        'location': (url.pathname || '/') + qs,
        'cache-control': 'no-store'
      });
      res.end();
      return;
    }
    // Authorized. Re-set cookie opportunistically (refresh expiry).
    if (req.headers['cookie'] && parseCookies(req.headers['cookie'])[COOKIE_NAME]) {
      res.setHeader('set-cookie',
        `${COOKIE_NAME}=${encodeURIComponent(live.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
    }
    // Hand off to the dashboard router with a context indicating remote access.
    Promise.resolve(route(req, res, { listener: 'remote', authorized: true, user: 'remote' }))
      .catch(err => {
        try { respond(res, 500, { error: err.message }); } catch {}
      });
  };

  const server = http.createServer(handler);
  let bound = false;
  try {
    server.listen(port, ip);
    bound = true;
  } catch (e) {
    return { listening: false, reason: 'listen-error', error: e.message, ip, port };
  }

  server.on('error', err => {
    log(`[remote-access] listener error: ${err.message}`);
  });

  return {
    listening: true,
    server,
    ip,
    port,
    url: `http://${ip}:${port}`,
    bound,
    tokenConfigured: true,
    rotatedAt: tinfo.rotatedAt
  };
}

function respond(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function respondAuthChallenge(res) {
  res.writeHead(401, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'www-authenticate': 'Bearer realm="openclaw-remote"'
  });
  res.end(`<!doctype html>
<meta charset="utf-8">
<title>OpenClaw Control — Remote</title>
<style>
  body { background:#05080d; color:#e3ecf7; font:14px/1.5 system-ui, sans-serif; padding:24px; }
  h1 { font:600 16px/1 ui-monospace, monospace; letter-spacing:.18em; color:#19e0ff; }
  code { background:#0f1722; border:1px solid #1f2c3d; padding:2px 6px; border-radius:4px; }
  .hint { color:#aab7c8; max-width:520px; }
</style>
<h1>OPENCLAW · REMOTE ACCESS</h1>
<p class="hint">This dashboard is reachable only over Tailscale. Append your remote-access token to the URL once, and it will be remembered as a cookie:</p>
<p class="hint"><code>http://&lt;tailscale-ip&gt;:&lt;port&gt;/?token=&lt;your-token&gt;</code></p>
<p class="hint">Or send the header <code>Authorization: Bearer &lt;your-token&gt;</code>.</p>
`);
}

// ─── Status (safe for both local and remote callers) ───────────────────
function getStatus(currentListener) {
  const ip = detectTailscaleIp();
  const tinfo = loadTokenInfo();
  const enabled = process.env.OPENCLAW_REMOTE_DISABLED !== '1';
  let reason = null;
  if (!enabled) reason = 'disabled-by-env';
  else if (!ip) reason = 'no-tailscale-ip';
  else if (!tinfo) reason = 'no-token';
  return {
    enabled,
    tailscaleIp: ip,
    port: Number(process.env.OPENCLAW_REMOTE_PORT || DEFAULT_REMOTE_PORT),
    url: ip ? `http://${ip}:${Number(process.env.OPENCLAW_REMOTE_PORT || DEFAULT_REMOTE_PORT)}` : null,
    listening: !!(currentListener && currentListener.listening),
    listeningOn: currentListener && currentListener.listening
      ? { ip: currentListener.ip, port: currentListener.port }
      : null,
    tokenConfigured: !!tinfo,
    tokenRotatedAt: tinfo ? tinfo.rotatedAt : null,
    tokenPath: TOKEN_PATH,
    reason
  };
}

module.exports = {
  TOKEN_PATH,
  COOKIE_NAME,
  DEFAULT_REMOTE_PORT,
  isTailscaleAddress,
  detectTailscaleIp,
  loadTokenInfo,
  tokensEqual,
  start,
  getStatus
};
