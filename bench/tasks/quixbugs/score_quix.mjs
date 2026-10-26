// 判分：把修复后的文件当模块导入，跑该题全部 JSON 用例（子进程 + 超时）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tasks = JSON.parse(readFileSync(new URL('./data/dataset.json', import.meta.url), 'utf8'));
const byName = Object.fromEntries(tasks.map((t) => [t.name, t]));
const TAG = process.env.TAG ?? '';
const rows = JSON.parse(readFileSync(new URL(`./out/answers${TAG}.json`, import.meta.url), 'utf8'));
const work = new URL('./out/work/', import.meta.url);
mkdirSync(work, { recursive: true });
function extract(text) {
  const blocks = [...text.matchAll(/```(?:python)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  return (blocks.length ? blocks[blocks.length - 1] : text).trim() + '\n';
}
const harness = `
import importlib.util, json, signal, sys
path, name, cases_path = sys.argv[1], sys.argv[2], sys.argv[3]
signal.alarm(10)
spec = importlib.util.spec_from_file_location("fix", path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
fn = getattr(m, name)
cases = json.load(open(cases_path))
ok = 0
for args, want in cases:
    try:
        got = fn(*args)
    except Exception as e:
        got = ("EXC", type(e).__name__)
    ok += (got == want)
print(ok, len(cases))
`;
writeFileSync(new URL('./harness.py', work), harness);
const results = [];
for (const row of rows) {
  const t = byName[row.name];
  const file = new URL(`${row.name}-${row.arm}.py`, work);
  writeFileSync(file, extract(row.text));
  writeFileSync(new URL(`${row.name}-cases.json`, work), JSON.stringify(t.tests));
  const r = spawnSync('python3', [new URL('./harness.py', work).pathname, file.pathname, t.name, new URL(`${row.name}-cases.json`, work).pathname], { encoding: 'utf8', timeout: 30000 });
  const out = (r.stdout || '').trim().split('\n').pop() || '';
  const [ok, total] = out.split(' ').map(Number);
  results.push({ name: row.name, arm: row.arm, pass: ok === total && Number.isFinite(ok), ok: Number.isFinite(ok) ? ok : 0, total: Number.isFinite(total) ? total : t.tests.length, ms: row.ms, outTokens: row.outTokens, err: (r.stderr || '').slice(-200) });
}
writeFileSync(new URL(`./out/results${TAG}.json`, import.meta.url), JSON.stringify(results, null, 2));
for (const arm of ['with', 'without']) {
  const r = results.filter((x) => x.arm === arm);
  console.log(`${arm.padEnd(8)} pass=${r.filter((x) => x.pass).length}/${r.length} cases=${r.reduce((s, x) => s + x.ok, 0)}/${r.reduce((s, x) => s + x.total, 0)}`);
}
const d = [...new Set(results.map((x) => x.name))].map((n) => ({ n, w: results.find((x) => x.name === n && x.arm === 'with').pass, o: results.find((x) => x.name === n && x.arm === 'without').pass })).filter((x) => x.w !== x.o);
console.log('discordant', d.length, JSON.stringify(d));
