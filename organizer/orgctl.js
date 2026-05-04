#!/usr/bin/env node
// Organizer V2 — top-level CLI.
// Usage:
//   node orgctl.js <module> <verb> [args...]
//   node orgctl.js doctor                          (cross-module health snapshot)
//   node orgctl.js help
//
// Modules: computer | gmail | photos
// Verbs:   auth | scan | plan | approve | apply | doctor
//
// Each module has a single entry point at modules/<m>/<m>.{ps1|js|py} that
// dispatches by verb. orgctl is a thin shell that chooses the right runtime.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const MODULES_DIR = path.join(ROOT, 'modules');

const MODULES = {
  computer: {
    runtime: 'powershell',
    entry: path.join(MODULES_DIR, 'computer', 'computer.ps1'),
    verbs: ['scan', 'plan', 'approve', 'apply', 'doctor']
  },
  gmail: {
    runtime: 'node',
    entry: path.join(MODULES_DIR, 'gmail', 'gmail.js'),
    verbs: ['auth', 'scan', 'plan', 'approve', 'apply', 'doctor']
  },
  photos: {
    runtime: 'python',
    entry: path.join(MODULES_DIR, 'photos', 'photos.py'),
    verbs: ['auth', 'scan', 'plan', 'approve', 'apply', 'doctor']
  }
};

function help() {
  console.log(`Organizer V2 control CLI

  node orgctl.js <module> <verb> [args...]
  node orgctl.js doctor          # cross-module health
  node orgctl.js help

Modules: ${Object.keys(MODULES).join(', ')}
Verbs per module:`);
  for (const [m, cfg] of Object.entries(MODULES)) {
    console.log(`  ${m.padEnd(8)} ${cfg.verbs.join(' | ')}`);
  }
}

function dispatch(moduleName, verb, rest) {
  const cfg = MODULES[moduleName];
  if (!cfg) { console.error(`unknown module: ${moduleName}`); process.exit(2); }
  if (!cfg.verbs.includes(verb)) {
    console.error(`unknown verb for ${moduleName}: ${verb} (allowed: ${cfg.verbs.join('|')})`);
    process.exit(2);
  }
  if (!fs.existsSync(cfg.entry)) {
    console.error(`module entry missing: ${cfg.entry}`);
    process.exit(2);
  }

  let cmd, args;
  if (cfg.runtime === 'powershell') {
    cmd = 'powershell';
    args = ['-ExecutionPolicy', 'Bypass', '-File', cfg.entry, '-Verb', verb, ...rest];
  } else if (cfg.runtime === 'node') {
    cmd = process.execPath;
    args = [cfg.entry, verb, ...rest];
  } else if (cfg.runtime === 'python') {
    cmd = 'python';
    args = [cfg.entry, verb, ...rest];
  } else {
    console.error(`unsupported runtime: ${cfg.runtime}`);
    process.exit(2);
  }

  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

function crossDoctor() {
  // Re-use the existing top-level doctor at scripts/doctor.js for now.
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'doctor.js')], { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') { help(); process.exit(0); }
if (argv[0] === 'doctor') { crossDoctor(); }
const [moduleName, verb, ...rest] = argv;
if (!verb) { console.error('verb required'); help(); process.exit(2); }
dispatch(moduleName, verb, rest);
