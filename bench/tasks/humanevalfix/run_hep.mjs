// HumanEvalFix（bigcode/humanevalpack, Python, 164 题）A/B。
// 每个任务内先 with 后 without（配对），任务间并发；逐条追加写盘，进程被杀不丢已完成的题。
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';

const KEY = process.env.DEEPSEEK_API_KEY;
const base = new URL('../../raw/', import.meta.url);
const sysWith = readFileSync(new URL('real-system-with.txt', base), 'utf8');
const sysWithout = readFileSync(new URL('real-system-without.txt', base), 'utf8');
const tasks = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));
const LIMIT = Number(process.env.LIMIT ?? tasks.length);
const CONC = Number(process.env.CONC ?? 3);
const TAG = process.env.TAG ?? '';
const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const partial = new URL(`answers${TAG}.partial.jsonl`, outDir);
if (existsSync(partial)) writeFileSync(partial, '');

function userPrompt(t) {
  const buggy = `${t.prompt}${t.buggy_solution}`;
  return [
    `Fix bugs in ${t.entry_point}.`, '',
    '```python', buggy, '```', '',
    '```python', (t.test_setup ?? '') + (t.test ?? ''), '```', '',
    'Return the complete fixed Python code, no explanation, no markdown fences.',
  ].join('\n');
}
async function call(system, content) {
  const body = JSON.stringify({ model: 'deepseek-flash', max_tokens: 2048, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content }] });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body, signal: AbortSignal.timeout(120000),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return { ms: Math.round(performance.now() - t0), outTokens: json.usage.output_tokens, text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') };
}

let next = 0;
let done = 0;
async function worker() {
  for (;;) {
    const i = next++;
    if (i >= LIMIT) return;
    const t = tasks[i];
    const prompt = userPrompt(t);
    for (const [arm, sys] of (i % 2 ? [['without', sysWithout], ['with', sysWith]] : [['with', sysWith], ['without', sysWithout]])) {
      const r = await call(sys, prompt);
      appendFileSync(partial, JSON.stringify({ task_id: t.task_id, arm, ms: r.ms, outTokens: r.outTokens, text: r.text }) + '\n');
    }
    done++;
    process.stdout.write(`${done % 10 === 0 ? `\n${done}/${LIMIT} ` : '.'}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
const rows = readFileSync(partial, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
writeFileSync(new URL(`answers${TAG}.json`, outDir), JSON.stringify(rows, null, 2));
console.log(`\nsaved ${rows.length} answers for ${LIMIT} tasks`);
