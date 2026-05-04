#!/usr/bin/env node
// workspace-files-win: Windows-safe sandboxed file ops inside ~/.openclaw/workspace.
// All paths must resolve under SANDBOX_ROOT.
// Verbs: list, read, write, exists, mkdir, stat.

const fs = require('fs');
const path = require('path');
const os = require('os');

const SANDBOX_ROOT = path.resolve(os.homedir(), '.openclaw', 'workspace');

function resolveSafe(input) {
  if (!input) throw new Error('path required');
  const abs = path.isAbsolute(input) ? path.resolve(input) : path.resolve(SANDBOX_ROOT, input);
  let real;
  try { real = fs.realpathSync(abs); } catch { real = abs; }
  const rootReal = (() => {
    try { return fs.realpathSync(SANDBOX_ROOT); } catch { return SANDBOX_ROOT; }
  })();
  const norm = path.normalize(real);
  const rootNorm = path.normalize(rootReal);
  const a = norm.toLowerCase();
  const r = rootNorm.toLowerCase();
  if (a !== r && !a.startsWith(r.endsWith(path.sep) ? r : r + path.sep)) {
    throw new Error(`path outside sandbox: ${abs}`);
  }
  return abs;
}

function fail(msg, code = 1) {
  process.stderr.write(`wf: ${msg}\n`);
  process.exit(code);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const [verb, ...rest] = process.argv.slice(2);
  if (!verb) fail('usage: wf <verb> [args...]', 2);

  switch (verb) {
    case 'list': {
      const dir = resolveSafe(rest[0] || '.');
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const tag = e.isDirectory() ? 'd' : e.isFile() ? 'f' : '?';
        process.stdout.write(`${tag} ${e.name}\n`);
      }
      break;
    }
    case 'read': {
      const file = resolveSafe(rest[0]);
      process.stdout.write(fs.readFileSync(file, 'utf8'));
      break;
    }
    case 'write': {
      const file = resolveSafe(rest[0]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const data = await readStdin();
      fs.writeFileSync(file, data, 'utf8');
      process.stdout.write(`wrote ${file} (${Buffer.byteLength(data, 'utf8')} bytes)\n`);
      break;
    }
    case 'exists': {
      const p = resolveSafe(rest[0]);
      process.stdout.write(fs.existsSync(p) ? 'true\n' : 'false\n');
      break;
    }
    case 'mkdir': {
      const dir = resolveSafe(rest[0]);
      fs.mkdirSync(dir, { recursive: true });
      process.stdout.write(`created ${dir}\n`);
      break;
    }
    case 'stat': {
      const p = resolveSafe(rest[0]);
      if (!fs.existsSync(p)) {
        process.stdout.write(JSON.stringify({ exists: false }) + '\n');
        break;
      }
      const st = fs.statSync(p);
      process.stdout.write(JSON.stringify({
        exists: true,
        type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other',
        size: st.size,
        mtime: st.mtime.toISOString()
      }) + '\n');
      break;
    }
    default:
      fail(`unknown verb: ${verb}`, 2);
  }
}

main().catch(err => fail(err.message || String(err)));
