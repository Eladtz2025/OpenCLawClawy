// Telegram topic alias registry + alias-resolving send helper.
//
// The registry lives at state/telegram-topics.json and is the single source
// of truth for "which alias maps to which group/topic and what's its
// sensitivity policy". The legacy per-system `telegram` block in
// registry/systems.json continues to work, but new code should consult this
// module instead so topic IDs aren't sprinkled across the codebase.
//
// All sends are gated by:
//   - Routability (topicId must be present, alias must not be `pending`).
//   - Sensitivity (sensitive aliases require an explicit `confirm: true`
//     **and** the caller must opt out of `blockedContent` — e.g. legal
//     drafts, ticket text — unless the request explicitly says so).
//
// We never load the bot token here. Outbound delivery is done by
// `bin/send-via-gateway.js`, which already reads the gateway token from
// ~/.openclaw/gateway.token.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DASHBOARD_ROOT } = require('./runtime');

const TOPICS_FILE = path.join(DASHBOARD_ROOT, 'state', 'telegram-topics.json');
const SEND_VIA_GATEWAY = path.join(DASHBOARD_ROOT, 'bin', 'send-via-gateway.js');
const TEMP_DIR = path.join(DASHBOARD_ROOT, 'state', 'telegram-outgoing');
fs.mkdirSync(TEMP_DIR, { recursive: true });

// Cache the parsed registry; reload when the file mtime changes.
let _cache = { mtimeMs: 0, data: null };

function loadRegistry() {
  let stat;
  try { stat = fs.statSync(TOPICS_FILE); } catch { return defaultRegistry(); }
  if (_cache.data && _cache.mtimeMs === stat.mtimeMs) return _cache.data;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8')); }
  catch (e) { throw new Error(`telegram-topics.json unreadable: ${e.message}`); }
  raw.topics = Array.isArray(raw.topics) ? raw.topics : [];
  _cache = { mtimeMs: stat.mtimeMs, data: raw };
  return raw;
}

function defaultRegistry() {
  return { version: 2, defaultGroupChatId: null, ownerDmId: null, topics: [] };
}

function saveRegistry(reg) {
  reg.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(TOPICS_FILE, JSON.stringify(reg, null, 2), 'utf8');
  _cache = { mtimeMs: 0, data: null };
}

function listTopics() {
  const reg = loadRegistry();
  return reg.topics.map(t => annotateRoutability(t, reg));
}

// Compute a derived view: routable iff topicId is a number (or alias is a DM
// alias with a usable ownerDmId). Pending entries always come back routable=false.
function annotateRoutability(t, reg) {
  const out = { ...t };
  if (t.alias === 'dm') {
    out.routable = !!(reg.ownerDmId);
    out.resolvedDmId = reg.ownerDmId || null;
    return out;
  }
  if (t.topicIdStatus === 'pending' || t.topicId == null) {
    out.routable = false;
  } else if (typeof t.topicId !== 'number' || !Number.isFinite(t.topicId)) {
    out.routable = false;
    out.routabilityIssue = 'topicId is not a number';
  } else if (!t.groupChatId) {
    out.routable = false;
    out.routabilityIssue = 'groupChatId missing';
  } else {
    out.routable = true;
  }
  return out;
}

function resolveAlias(alias) {
  const reg = loadRegistry();
  const t = reg.topics.find(x => x.alias === alias);
  if (!t) return null;
  return annotateRoutability(t, reg);
}

// Update the routing fields of an existing alias. Whitelist what's mutable:
//   topicId, humanTopicName, purpose, defaultTarget, sensitivity, autoSend,
//   requireExplicitConfirm, blockedContent, reRegisterHints, lastSeenAt.
// Renaming aliases or moving between groupChatIds is intentionally NOT
// supported here — those are heavier operations and should be done by
// editing the file directly.
const MUTABLE_FIELDS = new Set([
  'topicId', 'humanTopicName', 'purpose', 'defaultTarget', 'sensitivity',
  'autoSend', 'requireExplicitConfirm', 'blockedContent', 'reRegisterHints',
  'lastSeenAt', 'topicIdStatus', 'name', 'relatedSystem'
]);

function updateAlias(alias, patch) {
  const reg = loadRegistry();
  const idx = reg.topics.findIndex(t => t.alias === alias);
  if (idx < 0) throw new Error(`unknown alias: ${alias}`);
  const next = { ...reg.topics[idx] };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!MUTABLE_FIELDS.has(k)) continue;
    if (k === 'topicId' && v != null) {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`topicId must be a number; got ${v}`);
      next.topicId = n;
      next.topicIdStatus = 'set';
    } else {
      next[k] = v;
    }
  }
  reg.topics[idx] = next;
  saveRegistry(reg);
  return annotateRoutability(next, reg);
}

// Sensitivity gate. Returns { ok: true } or { ok: false, reason }.
// `intent` is the caller-provided description of what's being sent; it is
// matched against the alias's `blockedContent` list (case-insensitive
// substring match).
function policyCheck(topic, { intent, confirm, force }) {
  if (!topic) return { ok: false, reason: 'unknown alias' };
  if (!topic.routable) return { ok: false, reason: 'alias is not routable (pending topicId)' };
  if (topic.requireExplicitConfirm && !confirm && !force) {
    return { ok: false, reason: `alias '${topic.alias}' requires explicit confirm:true` };
  }
  const intentLower = String(intent || '').toLowerCase();
  if (Array.isArray(topic.blockedContent)) {
    for (const blocked of topic.blockedContent) {
      if (intentLower.includes(String(blocked).toLowerCase()) && !force) {
        return { ok: false, reason: `intent '${intent}' is blockedContent for '${topic.alias}'; pass force:true with explicit confirmation to override` };
      }
    }
  }
  return { ok: true };
}

// Resolve an alias and produce { ok, target, threadId, ... } describing
// where to send. Does NOT actually send — that's `sendByAlias`.
function planSend(alias, opts = {}) {
  const reg = loadRegistry();
  const topic = resolveAlias(alias);
  const policy = policyCheck(topic, opts);
  if (!policy.ok) return { ok: false, alias, error: policy.reason, topic };

  // DM target — uses ownerDmId. No threadId.
  if (topic.alias === 'dm' || topic.defaultTarget === 'dm') {
    if (!reg.ownerDmId) return { ok: false, alias, error: 'ownerDmId missing in registry' };
    return {
      ok: true, alias,
      to: `telegram:${reg.ownerDmId}`,
      threadId: null,
      sessionKey: opts.sessionKey || `dashboard:${alias}:dm`,
      accountId: opts.accountId || 'default',
      topic
    };
  }

  // Group-topic target.
  if (!topic.groupChatId) return { ok: false, alias, error: 'groupChatId missing on topic' };
  if (topic.topicId == null) return { ok: false, alias, error: 'topicId pending — relabel before sending' };
  return {
    ok: true, alias,
    to: `telegram:${topic.groupChatId}`,
    threadId: topic.topicId,
    sessionKey: opts.sessionKey || `dashboard:${alias}:topic-${topic.topicId}`,
    accountId: opts.accountId || 'default',
    topic
  };
}

// Actually send. `intent` is a short label like "news-summary",
// "organizer-status", "smoke-test"; it gets matched against blockedContent.
// `confirm` must be true for sensitive aliases. `force` overrides
// blockedContent (use ONLY when the caller is explicitly requesting that
// content type, e.g. user typed `/traffic-law send-draft`).
function sendByAlias({ alias, text, intent, confirm = false, force = false, sessionKey, accountId }) {
  return new Promise((resolve) => {
    if (!text || !String(text).trim()) {
      return resolve({ ok: false, alias, error: 'text required' });
    }
    const plan = planSend(alias, { intent, confirm, force, sessionKey, accountId });
    if (!plan.ok) return resolve(plan);

    if (!fs.existsSync(SEND_VIA_GATEWAY)) {
      return resolve({ ok: false, alias, error: `send-via-gateway.js missing at ${SEND_VIA_GATEWAY}` });
    }

    // Stream text via a temp file so it never appears in argv (avoids leaks
    // when long messages or shell-special chars are involved).
    const tmp = path.join(TEMP_DIR, `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
    try { fs.writeFileSync(tmp, String(text), 'utf8'); }
    catch (e) { return resolve({ ok: false, alias, error: `temp write failed: ${e.message}` }); }

    const args = [
      SEND_VIA_GATEWAY,
      '--channel', 'telegram',
      '--to', plan.to,
      '--account', plan.accountId,
      '--session-key', plan.sessionKey,
      '--text-file', tmp
    ];
    if (plan.threadId != null) args.push('--threadId', String(plan.threadId));

    const child = spawn(process.execPath, args, { windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', d => { out += String(d); });
    child.stderr.on('data', d => { err += String(d); });
    child.on('close', (code) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (code === 0) {
        let parsed = null;
        try { const m = out.match(/\{[\s\S]*\}\s*$/); parsed = m ? JSON.parse(m[0]) : null; } catch {}
        resolve({ ok: true, alias, plan, gatewayResult: parsed });
      } else {
        resolve({ ok: false, alias, plan, exit: code, stderr: err.slice(0, 600) });
      }
    });
    child.on('error', (e) => {
      try { fs.unlinkSync(tmp); } catch {}
      resolve({ ok: false, alias, plan, error: e.message });
    });
  });
}

// Mark `lastSeenAt` for an alias. Called by anything that observes a
// successful inbound/outbound message on a topic.
function touch(alias) {
  try { updateAlias(alias, { lastSeenAt: new Date().toISOString() }); }
  catch { /* alias not found — ignore */ }
}

module.exports = {
  TOPICS_FILE,
  loadRegistry, listTopics, resolveAlias, updateAlias,
  planSend, sendByAlias, policyCheck, touch
};
