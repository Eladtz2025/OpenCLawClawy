// Telegram command dispatch table.
//
// Maps a parsed Telegram command to a backend handler. Each handler returns
// { ok, kind, ... }. The bridge process is responsible for sending the user
// the resulting reply text via the existing OpenClaw gateway — handlers
// themselves don't push outbound messages here.
//
// Single source of truth: every command that maps to "show me the status of
// X" calls the same provider.status() the dashboard's UI calls. Every
// command that runs an action calls the same provider.action(). Handlers
// only translate command-shape into provider-shape.
//
// Adding a new command: append an entry to COMMANDS with `description` and
// an `async run(ctx)` that returns `{ ok, replyText, ... }`. ctx is the
// shape passed by server.js (claudeRunner, callSystemStatus, callSystemAction,
// telegramTopics, logAction, args, fromUserId).

'use strict';

const fs = require('fs');
const { resolveWorkspacePath } = require('./runtime');

function userErr(msg) {
  const e = new Error(msg);
  e.userVisible = true;
  return e;
}

function extractKickoffPrompt(raw) {
  if (!raw) return '';
  const idx = raw.indexOf('\n---\n');
  return idx >= 0 ? raw.slice(idx + 5).trim() : raw.trim();
}

// ---------------------------- formatting helpers ----------------------------
function fmtStatus(alias, s) {
  if (!s) return `${alias}: no status`;
  const lines = [
    `${alias}: ${s.headline || '?'}${s.summary ? ' — ' + s.summary : ''}`
  ];
  const issues = (s.issues || []).slice(0, 5);
  if (issues.length) lines.push('Issues:', ...issues.map(i => `  • ${i}`));
  const next = (s.recommendedNext || []).slice(0, 2);
  if (next.length) {
    lines.push('Next:');
    for (const n of next) {
      lines.push('  → ' + (typeof n === 'string' ? n : (n.title || JSON.stringify(n))));
    }
  }
  return lines.join('\n');
}

// ---------------------------- COMMANDS map ----------------------------
//
// SCOPE NOTE (2026-05-04 split):
//   This dispatcher is shared between two callers:
//   - @ClaudeClawyBot (telegram-bridge/) — dev-bridge: /claude, /dashboard, /topics
//   - @Clawy_OpenClawBot (clawy-runtime/) — system runtime: /news, /organizer,
//                                            /system-map, /traffic-law in topics
//   The dispatcher itself doesn't know which caller invoked it. The bridge
//   layer is responsible for restricting the command surface (the dev bridge
//   only forwards a small whitelist; the CLAWY runtime forwards the rest).
const COMMANDS = {
  // ----- News -----
  news: {
    description: '/news [status|send today|doctor] — News-Dashboard status, send today\'s digest, or run health check.',
    async run(ctx) {
      const sub = (ctx.args || 'status').trim().split(/\s+/)[0].toLowerCase();
      if (sub === 'status' || sub === '') {
        const s = await ctx.callSystemStatus('news');
        return { ok: true, kind: 'reply', replyText: fmtStatus('news', s) };
      }
      if (sub === 'send') {
        const what = (ctx.args || '').trim().split(/\s+/)[1] || 'today';
        if (what !== 'today') return { ok: false, kind: 'reply', replyText: `Unknown send target: ${what}. Try /news send today.` };
        const r = await ctx.callSystemAction('news', 'send-morning-ping-dm');
        return { ok: true, kind: 'reply', replyText: `news send today → ${JSON.stringify(r).slice(0, 400)}` };
      }
      if (sub === 'doctor') {
        const r = await ctx.callSystemAction('news', 'doctor');
        let parsed = null;
        try { const m = r && r.stdout && r.stdout.match(/\{[\s\S]*\}\s*$/); if (m) parsed = JSON.parse(m[0]); } catch {}
        const issues = parsed && parsed.issues ? parsed.issues : [];
        const lines = [`news doctor: ${parsed && parsed.ok ? 'OK' : 'ATTENTION'} (exit ${r.exit})`];
        if (issues.length) lines.push('Issues:', ...issues.slice(0, 8).map(i => `  • ${i}`));
        else lines.push('No issues found.');
        return { ok: true, kind: 'reply', replyText: lines.join('\n') };
      }
      return { ok: false, kind: 'reply', replyText: `Unknown subcommand: ${sub}. Try /news status | send today | doctor.` };
    }
  },

  // ----- Organizer -----
  organizer: {
    description: '/organizer [status|computer scan|gmail scan|photos scan] — Organizer V2 entry points.',
    async run(ctx) {
      const tokens = (ctx.args || 'status').trim().split(/\s+/);
      const sub = (tokens[0] || 'status').toLowerCase();
      if (sub === 'status' || sub === '') {
        const s = await ctx.callSystemStatus('organizer');
        return { ok: true, kind: 'reply', replyText: fmtStatus('organizer', s) };
      }
      const map = {
        computer: { scan: 'computer.scan', plan: 'computer.plan', approve: 'computer.approve', apply: 'computer.apply' },
        gmail:    { scan: 'gmail.scan',    plan: 'gmail.plan',    approve: 'gmail.approve',    apply: 'gmail.apply' },
        photos:   { scan: 'photos.scan',   plan: 'photos.plan',   approve: 'photos.approve',   apply: 'photos.apply' }
      };
      const module = sub;
      const verb = (tokens[1] || '').toLowerCase();
      const action = map[module] && map[module][verb];
      if (!action) return { ok: false, kind: 'reply', replyText: `Unknown organizer command: ${ctx.args}. Try /organizer computer scan` };
      const r = await ctx.callSystemAction('organizer', action);
      return { ok: true, kind: 'reply', replyText: `organizer ${module} ${verb} → ${JSON.stringify(r).slice(0, 400)}` };
    }
  },

  // ----- System map -----
  'system-map': {
    description: '/system-map — show inventory snapshot.',
    async run(ctx) {
      const s = await ctx.callSystemStatus('system-map');
      return { ok: true, kind: 'reply', replyText: fmtStatus('system-map', s) };
    }
  },

  // ----- Traffic Law -----
  'traffic-law': {
    description: '/traffic-law [status|start appeal|checklist|draft appeal] — Traffic-Law-Appeal-IL agent.',
    async run(ctx) {
      const sub = (ctx.args || 'status').trim().toLowerCase();
      if (sub === 'status' || sub === '') {
        const s = await ctx.callSystemStatus('traffic-law');
        return { ok: true, kind: 'reply', replyText: fmtStatus('traffic-law', s) };
      }
      if (sub === 'checklist') {
        const intakePath = resolveWorkspacePath('traffic-law-appeal-il/intake-form.md');
        return { ok: true, kind: 'reply', replyText: `Traffic-law intake checklist: ${intakePath}\nFill it out, then DM the answers and I'll start the agent.` };
      }
      if (sub === 'start appeal' || sub === 'start' || sub === 'draft appeal') {
        // Sensitive: drafts stay under output/ — never sent externally.
        const startPromptPath = resolveWorkspacePath('traffic-law-appeal-il/prompts/start-appeal.md');
        const raw = fs.readFileSync(startPromptPath, 'utf8');
        const kickoff = extractKickoffPrompt(raw);
        const r = ctx.claudeRunner.startTask({
          prompt: kickoff,
          mode: 'auto',
          name: 'traffic-law-appeal-il-via-telegram'
        });
        if (ctx.logAction) ctx.logAction({ alias: 'claude', name: 'task-start-via-telegram', taskId: r.id, command: 'traffic-law' });
        return {
          ok: true, kind: 'claude',
          taskId: r.id,
          replyText: `Traffic-Law-Appeal-IL started — task ${r.id}.\nDrafts will land in output/ on the workstation. Nothing is sent automatically. Live: http://127.0.0.1:7777/?taskId=${r.id}`
        };
      }
      return { ok: false, kind: 'reply', replyText: `Unknown subcommand: ${sub}. Try /traffic-law status | start appeal | checklist | draft appeal.` };
    }
  },

  // ----- Dashboard pulse -----
  dashboard: {
    description: '/dashboard — overall pulse (worst state, open issues, next cron).',
    async run(ctx) {
      // Reuse the summary endpoint via the provider chain — but summary
      // isn't a provider, so build a quick view from each system status.
      const aliases = ['news', 'organizer', 'system-map', 'traffic-law'];
      const lines = ['Dashboard pulse:'];
      for (const a of aliases) {
        try {
          const s = await ctx.callSystemStatus(a);
          lines.push(`• ${a}: ${s.headline || '?'} — ${s.summary || ''}`.trim());
        } catch (e) {
          lines.push(`• ${a}: error — ${e.message}`);
        }
      }
      return { ok: true, kind: 'reply', replyText: lines.join('\n') };
    }
  },

  // ----- Topics registry view -----
  topics: {
    description: '/topics — list Telegram topic aliases and their routability.',
    async run(ctx) {
      if (!ctx.telegramTopics) return { ok: false, kind: 'reply', replyText: 'topics module unavailable' };
      const list = ctx.telegramTopics.listTopics();
      const lines = ['Topic registry:'];
      for (const t of list) {
        const tag = t.routable ? 'routable' : (t.topicIdStatus === 'pending' ? 'PENDING' : 'not routable');
        const sens = t.sensitivity !== 'normal' ? ` (${t.sensitivity})` : '';
        const id = t.topicId == null ? 'pending' : `id ${t.topicId}`;
        lines.push(`• ${t.alias.padEnd(13)} ${id.padEnd(11)} ${tag}${sens}`);
      }
      return { ok: true, kind: 'reply', replyText: lines.join('\n') };
    }
  },

  // ----- Claude Code remote-control -----
  claude: {
    description: '/claude <task> | status | stop | last | logs — drive the local Claude Code runner.',
    async run(ctx) {
      // SAFETY: this command can launch arbitrary code on the user's
      // workstation. The bridge layer enforces an allowlist of Telegram
      // user IDs; nothing here re-checks that. If you wire this command
      // into a non-bridge entrypoint, you MUST gate the caller separately.
      const args = (ctx.args || '').trim();
      const sub = args.split(/\s+/)[0].toLowerCase();
      const runner = ctx.claudeRunner;
      if (!runner) return { ok: false, kind: 'reply', replyText: 'claude runner unavailable' };

      // ---- /claude status ----
      if (sub === 'status') {
        const d = runner.getDiagnostics();
        const lines = [`claude runner ${d.runnerVersion} · default ${d.defaultMode}`];
        lines.push(`active: ${d.activeCount}, stuck: ${d.stuckCount}, dashboard leaks: ${d.processBuckets.dashboardLeak}`);
        if (d.lastCompleted) lines.push(`last ok: ${(d.lastCompleted.prompt || '').slice(0, 50)} (${d.lastCompleted.id.slice(0, 8)})`);
        if (d.lastFailed) lines.push(`last fail: ${d.lastFailed.status} — ${(d.lastFailed.prompt || '').slice(0, 50)} (${d.lastFailed.id.slice(0, 8)})`);
        if (d.activeTasks.length) {
          lines.push('Currently running:');
          for (const t of d.activeTasks) lines.push(`  • ${t.id.slice(0, 8)} (${t.mode}) — ${(t.prompt || '').slice(0, 60)}`);
        }
        return { ok: true, kind: 'reply', replyText: lines.join('\n') };
      }

      // ---- /claude stop ----
      if (sub === 'stop') {
        // Stop the most recent currently-running task.
        const d = runner.getDiagnostics();
        if (!d.activeTasks.length) return { ok: true, kind: 'reply', replyText: 'No active task to stop.' };
        const target = d.activeTasks[0];
        const r = runner.stopTask(target.id);
        return { ok: r.ok, kind: 'reply', replyText: r.ok
          ? `Stopping task ${target.id.slice(0, 8)} (was: ${(target.prompt || '').slice(0, 60)})`
          : `Stop failed: ${r.error}` };
      }

      // ---- /claude last ----
      if (sub === 'last') {
        const list = runner.listTasks(1);
        if (!list.length) return { ok: true, kind: 'reply', replyText: 'No tasks yet.' };
        const t = list[0];
        const lines = [
          `Last task ${t.id.slice(0, 8)} — ${t.status}${t.exitCode != null ? ` (exit ${t.exitCode})` : ''}`,
          `Mode: ${t.mode} · Created: ${t.createdAt}${t.endedAt ? ` · Ended: ${t.endedAt}` : ''}`,
          `Prompt: ${(t.prompt || '').slice(0, 200)}`
        ];
        return { ok: true, kind: 'reply', replyText: lines.join('\n') };
      }

      // ---- /claude logs ----
      if (sub === 'logs') {
        const list = runner.listTasks(1);
        if (!list.length) return { ok: true, kind: 'reply', replyText: 'No tasks yet.' };
        const t = list[0];
        // Pull the last ~3KB of stdout (Telegram cap is 4KB per message).
        const fullState = runner.getTask(t.id);
        const stdout = (fullState && fullState.stdout) || '';
        const tail = stdout.length > 3000 ? '…' + stdout.slice(-3000) : stdout;
        return { ok: true, kind: 'reply', replyText: `Logs for ${t.id.slice(0, 8)} (${t.status}):\n${tail || '(no stdout yet)'}` };
      }

      // ---- /claude <task> — start a new task ----
      if (!args) return { ok: false, kind: 'reply', replyText: 'Usage: /claude <task description> — or /claude status | stop | last | logs' };
      const r = runner.startTask({ prompt: args, mode: 'auto', name: 'telegram-claude' });
      if (ctx.logAction) ctx.logAction({ alias: 'claude', name: 'task-start-via-telegram-claude', taskId: r.id, fromUserId: ctx.fromUserId });
      return {
        ok: true, kind: 'claude',
        taskId: r.id,
        replyText: `Claude Code starting — task ${r.id.slice(0, 8)} (auto mode).\nWorkspace: ${r.cwd}\nLive: http://127.0.0.1:7777/?taskId=${r.id}`
      };
    }
  }
};

function listCommands() {
  return Object.entries(COMMANDS).map(([name, def]) => ({ name, description: def.description }));
}

async function dispatch(body, deps) {
  const command = (body && typeof body.command === 'string') ? body.command.toLowerCase() : '';
  if (!command) throw userErr('command required');
  const def = COMMANDS[command];
  if (!def) throw userErr(`unknown command: ${command}. Try ${Object.keys(COMMANDS).slice(0, 5).join(', ')}.`);

  const ctx = {
    ...deps,
    args: typeof body.args === 'string' ? body.args : '',
    fromUserId: body.fromUserId != null ? String(body.fromUserId) : null,
    replyToMessageId: body.replyToMessageId || null
  };

  let r;
  try { r = await def.run(ctx); }
  catch (e) {
    if (deps.logAction) {
      deps.logAction({ alias: 'telegram', name: `dispatch:${command}`, mode: 'send', ok: false, error: e.message, fromUserId: ctx.fromUserId });
    }
    throw e;
  }

  if (deps.logAction) {
    deps.logAction({
      alias: 'telegram',
      name: `dispatch:${command}`,
      mode: r.kind === 'claude' ? 'exec' : 'read',
      ok: !!r.ok,
      taskId: r.taskId || null,
      fromUserId: ctx.fromUserId
    });
  }

  return {
    ok: !!r.ok,
    command,
    kind: r.kind,
    replyText: r.replyText || null,
    taskId: r.taskId || null,
    streamPath: r.taskId ? `/api/claude/task/${r.taskId}/stream` : null,
    dashboardUrl: r.taskId ? `http://127.0.0.1:7777/?taskId=${r.taskId}` : null
  };
}

module.exports = { dispatch, listCommands, COMMANDS };
