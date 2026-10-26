// Warm-prefix A/B: identical system prompt per arm each call, so after the first call the
// provider's prefix cache serves it. Measures the steady-state per-turn cost.
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.DEEPSEEK_API_KEY;
const withSys = readFileSync(new URL('./raw/system-with.txt', import.meta.url), 'utf8');
const withoutSys = readFileSync(new URL('./raw/system-without.txt', import.meta.url), 'utf8');
async function call(system) {
  const body = JSON.stringify({ model: 'deepseek-flash', max_tokens: 1, system, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body });
  const ms = performance.now() - t0;
  const j = JSON.parse(await res.text());
  return { ms: Math.round(ms), input: j.usage.input_tokens, cacheRead: j.usage.cache_read_input_tokens };
}
const rows = [];
for (let i = 0; i < Number(process.env.REPS ?? 12); i++) for (const [arm, sys] of (i % 2 ? [['without', withoutSys], ['with', withSys]] : [['with', withSys], ['without', withoutSys]])) rows.push({ i, arm, ...(await call(sys)) });
const warm = rows.filter((r) => r.i > 0);
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const arm of ['with', 'without']) {
  const r = warm.filter((x) => x.arm === arm);
  console.log(`${arm.padEnd(8)} n=${r.length} ms=[${r.map((x) => x.ms).join(',')}] median=${med(r.map((x) => x.ms))} input+tokens=${r.reduce((s, x) => s + x.input, 0) / r.length} cacheRead=${r.reduce((s, x) => s + x.cacheRead, 0) / r.length}`);
}
console.log(`median delta = ${(med(warm.filter((x) => x.arm === 'with').map((x) => x.ms)) - med(warm.filter((x) => x.arm === 'without').map((x) => x.ms))).toFixed(0)} ms`);
writeFileSync(new URL('./raw/warm.json', import.meta.url), JSON.stringify(rows, null, 2));
