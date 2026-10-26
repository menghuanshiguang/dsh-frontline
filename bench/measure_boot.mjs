// Real boot A/B: one copied web profile, one DSH_HOME, same port. The only difference
// is the documented `- id: frontline / disabled: true` overlay file.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DSH = process.env.DSH_BIN
  ?? '/data/data/com.dsharnessmobile.shell/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const NODE = process.env.DSH_NODE ?? '/data/data/com.dsharnessmobile.shell/files/usr/libexec/dsh-node';
const HOME = process.env.BENCH_HOME;
const PORT = 3211;
const DISABLED = new URL('./patches/disabled.yml', import.meta.url).pathname;
const RUNS = Number(process.env.RUNS ?? 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitPortFree() {
  for (let i = 0; i < 200; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(150) }); }
    catch (e) { if (e.name === 'TimeoutError' || e.cause) return; }
    await sleep(50);
  }
}

async function bootOnce(arm) {
  const args = ['--expose-internals', DSH];
  if (arm === 'disabled') args.push('--patch', DISABLED);
  args.push('--profile', 'web', '--port', String(PORT), '--no-open');
  const t0 = performance.now();
  const child = spawn(NODE, args, { env: { ...process.env, DSH_HOME: HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '', readyMs = null;
  let killed = false;
  child.stdout.on('data', (d) => { buf += d; const m = buf.match(/dsh web: (http:\/\/\S+)/); if (m && readyMs === null) readyMs = performance.now() - t0; });
  child.stderr.on('data', (d) => { buf += d; });
  const killer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 90000);
  try {
    while (readyMs === null) {
      if (child.exitCode !== null) throw new Error(`exited early (${child.exitCode}): ${buf.slice(-600)}`);
      await sleep(10);
    }
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.status !== 401 && res.status !== 200) throw new Error(`unexpected HTTP ${res.status}`);
    const status = readFileSync(`/proc/${child.pid}/status`, 'utf8');
    return { arm, readyMs: Math.round(readyMs), http: res.status, rssKb: Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? NaN), threads: Number(/Threads:\s+(\d+)/.exec(status)?.[1] ?? NaN) };
  } finally {
    clearTimeout(killer);
    if (!killed && child.exitCode === null) child.kill('SIGTERM');
    await Promise.race([new Promise((r) => child.once('exit', r)), sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await waitPortFree();
  }
}

const rows = [];
for (let i = 0; i < RUNS; i++) {
  for (const arm of (i % 2 ? ['disabled', 'enabled'] : ['enabled', 'disabled'])) {
    try { rows.push({ i, ...(await bootOnce(arm)) }); }
    catch (e) { rows.push({ i, arm, error: String(e.message ?? e) }); }
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const arm of ['enabled', 'disabled']) {
  const r = rows.filter((x) => x.arm === arm && !x.error);
  if (!r.length) { console.log(`${arm}: all failed`); continue; }
  console.log(`${arm.padEnd(8)} n=${r.length} readyMs=[${r.map((x) => x.readyMs).join(',')}] median=${med(r.map((x) => x.readyMs))} min=${Math.min(...r.map((x) => x.readyMs))} max=${Math.max(...r.map((x) => x.readyMs))} rssKB=${med(r.map((x) => x.rssKb))}`);
}
const e = rows.filter((x) => x.arm === 'enabled' && !x.error).map((x) => x.readyMs);
const d = rows.filter((x) => x.arm === 'disabled' && !x.error).map((x) => x.readyMs);
if (e.length && d.length) console.log(`median delta (enabled - disabled) = ${(med(e) - med(d)).toFixed(0)} ms`);
const errs = rows.filter((x) => x.error);
if (errs.length) console.log(`errors: ${errs.length}\n${errs.map((x) => JSON.stringify(x)).join('\n')}`);
writeFileSync(new URL('./raw/boot.json', import.meta.url), JSON.stringify(rows, null, 2));
