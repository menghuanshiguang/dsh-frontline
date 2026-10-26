// QuixBugs（31 个真实 bug，242 条 JSON 用例）A/B。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const KEY = process.env.DEEPSEEK_API_KEY;
const base = new URL('../../raw/', import.meta.url);
const sysWith = readFileSync(new URL('real-system-with.txt', base), 'utf8');
const sysWithout = readFileSync(new URL('real-system-without.txt', base), 'utf8');
const tasks = JSON.parse(readFileSync(new URL('./data/dataset.json', import.meta.url), 'utf8'));

function userPrompt(t) {
  const ex = t.tests.slice(0, 3).map(([args, want]) => `${JSON.stringify(args)} -> ${JSON.stringify(want)}`).join('\n');
  return [
    `Fix the bug in this Python program. The function \`${t.name}\` must satisfy the examples.`,
    '```python',
    t.buggy,
    '```',
    'Examples:',
    ex,
    '',
    'Return the complete fixed file only, no explanation, no markdown fences.',
  ].join('\n');
}
async function call(system, content) {
  const body = JSON.stringify({ model: 'deepseek-flash', max_tokens: 2048, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST', headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(120000),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return { ms: Math.round(performance.now() - t0), outTokens: json.usage.output_tokens, text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') };
}
const TAG = process.env.TAG ?? '';
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const rows = [];
for (let i = 0; i < tasks.length; i++) {
  const t = tasks[i];
  const prompt = userPrompt(t);
  for (const [arm, sys] of (i % 2 ? [['without', sysWithout], ['with', sysWith]] : [['with', sysWith], ['without', sysWithout]])) {
    const r = await call(sys, prompt);
    rows.push({ name: t.name, arm, ms: r.ms, outTokens: r.outTokens, text: r.text });
    process.stdout.write(arm === 'with' ? 'W' : 'o');
  }
}
console.log();
writeFileSync(new URL(`./out/answers${TAG}.json`, import.meta.url), JSON.stringify(rows, null, 2));
console.log('saved', rows.length);
