// 做题 A/B：同一个真实 DSH system prompt ± frontline 六段，跑同一组任务。
// thinking 关闭（与首次诚实探测一致），每任务每臂 2 次，交替执行。
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.DEEPSEEK_API_KEY;
const base = new URL('../raw/', import.meta.url);
const sysWith = readFileSync(new URL('real-system-with.txt', base), 'utf8');
const sysWithout = readFileSync(new URL('real-system-without.txt', base), 'utf8');

const TASKS = [
  {
    id: 'pelican', max: 12000,
    prompt: 'Generate an SVG of a pelican riding a bicycle. Output only the SVG code — no markdown fences, no explanation.',
  },
  {
    id: 'brackets', max: 4000,
    prompt: '写一个 Python 函数 `balanced(s: str) -> bool`：判断字符串里的 ()[]{} 是否配对且正确嵌套。只输出代码，不要解释，不要 markdown 围栏。',
  },
  {
    id: 'bugfix', max: 4000,
    prompt: [
      '下面的二分查找在目标不存在时会死循环。修复它，并保持函数签名不变。只输出修复后的完整函数，不要解释。',
      '',
      '```python',
      'def binary_search(arr, target):',
      '    lo, hi = 0, len(arr) - 1',
      '    while lo <= hi:',
      '        mid = (lo + hi) // 2',
      '        if arr[mid] == target:',
      '            return mid',
      '        elif arr[mid] < target:',
      '            lo = mid',
      '        else:',
      '            hi = mid',
      '    return -1',
      '```',
    ].join('\n'),
  },
  {
    id: 'batball', max: 1500,
    prompt: '一根球棒和一个球一共 1.10 美元，球棒比球贵 1.00 美元。球多少钱？给出数字和一句话理由。',
  },
  {
    id: 'api3', max: 2000,
    prompt: '用恰好 3 句话解释什么是 API，每句话不超过 20 个词，并且单词 contract 恰好出现 1 次。只输出解释。',
  },
  {
    id: 'mug40', max: 2000,
    prompt: 'Write a product description for a ceramic coffee mug in exactly 40 words. Do not use exclamation marks. Include the word "morning" exactly twice. Output only the description.',
  },
];

async function call(system, task) {
  const body = JSON.stringify({
    model: 'deepseek-flash',
    max_tokens: task.max,
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content: task.prompt }],
  });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(240000),
  });
  const ms = Math.round(performance.now() - t0);
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { ms, usage: json.usage, text };
}

const rows = [];
for (const task of TASKS) {
  for (let rep = 0; rep < Number(process.env.REPS ?? 2); rep++) {
    for (const [arm, sys] of (rep ? [['without', sysWithout], ['with', sysWith]] : [['with', sysWith], ['without', sysWithout]])) {
      const r = await call(sys, task);
      rows.push({ task: task.id, arm, rep, ms: r.ms, outTokens: r.usage.output_tokens, chars: r.text.length, text: r.text });
      console.log(`${task.id.padEnd(9)} ${arm.padEnd(7)} r${rep} ${String(r.ms).padStart(6)}ms out=${String(r.usage.output_tokens).padStart(5)} chars=${String(r.text.length).padStart(5)}`);
      await new Promise((res) => setTimeout(res, 200));
    }
  }
}
writeFileSync(new URL('./out/answers.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('saved', rows.length, 'answers');
