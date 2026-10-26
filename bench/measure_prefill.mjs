// Cold-prefill A/B: a random nonce at the start busts the provider prefix cache, so each
// call pays full prefill for its system prompt. Same user message, same max_tokens.
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.DEEPSEEK_API_KEY;
const withSys = readFileSync(new URL('./raw/system-with.txt', import.meta.url), 'utf8');
const withoutSys = readFileSync(new URL('./raw/system-without.txt', import.meta.url), 'utf8');
const nonce = () => Math.random().toString(36).slice(2, 12);

async function call(system) {
  const body = JSON.stringify({ model: 'deepseek-flash', max_tokens: 1, system: `[nonce ${nonce()}]\n${system}`, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body,
  });
  const ms = performance.now() - t0;
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  return { ms: Math.round(ms), input: j.usage.input_tokens, cacheRead: j.usage.cache_read_input_tokens };
}

const rows = [];
for (let i = 0; i < Number(process.env.REPS ?? 10); i++) {
  const order = i % 2 === 0 ? [['with', withSys], ['without', withoutSys]] : [['without', withoutSys], ['with', withSys]];
  for (const [arm, sys] of order) rows.push({ i, arm, ...(await call(sys)) });
}
writeFileSync(new URL('./raw/prefill.json', import.meta.url), JSON.stringify(rows, null, 2));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const arm of ['with', 'without']) {
  const r = rows.filter((x) => x.arm === arm);
  console.log(`${arm.padEnd(8)} n=${r.length} ms=[${r.map((x) => x.ms).join(',')}] median=${med(r.map((x) => x.ms))} input=${r[0].input} cacheRead=${r[0].cacheRead}`);
}
const d = med(rows.filter((x) => x.arm === 'with').map((x) => x.ms)) - med(rows.filter((x) => x.arm === 'without').map((x) => x.ms));
console.log(`median delta (with - without) = ${d.toFixed(0)} ms`);
