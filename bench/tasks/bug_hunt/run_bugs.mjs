// bug 查找修复 A/B：同一份 buggy 模块 + 失败的测试，两臂只差 system prompt 里的六段。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.DEEPSEEK_API_KEY;
const base = new URL('../../raw/', import.meta.url);
const sysWith = readFileSync(new URL('real-system-with.txt', base), 'utf8');
const sysWithout = readFileSync(new URL('real-system-without.txt', base), 'utf8');
const code = readFileSync(new URL('./code/inventory.py', import.meta.url), 'utf8');
const tests = readFileSync(new URL('./code/test_inventory.py', import.meta.url), 'utf8');
const failure = readFileSync(new URL('./code/failure.txt', import.meta.url), 'utf8');

const prompt = [
  '下面是一个小模块和它的测试。测试有 5 个失败；除此之外，函数契约（docstring）与实现之间还有测试没有覆盖到的 bug。请：',
  '1) 先逐条列出所有 bug（函数名 + 根因，一行一个），包括测试没覆盖到的；',
  '2) 然后输出修复后的 inventory.py 完整代码，只放在一个 ```python 代码块里。',
  '不要修改测试，不要输出其他内容。',
  '',
  '=== inventory.py ===',
  code,
  '=== test_inventory.py ===',
  tests,
  '=== 测试输出 ===',
  failure,
].join('\n');

async function call(system) {
  const body = JSON.stringify({
    model: 'deepseek-flash', max_tokens: 6000, thinking: { type: 'disabled' },
    system, messages: [{ role: 'user', content: prompt }],
  });
  const t0 = performance.now();
  const res = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body, signal: AbortSignal.timeout(240000),
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  return {
    ms: Math.round(performance.now() - t0),
    usage: json.usage,
    text: (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
  };
}

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const rows = [];
for (let rep = 0; rep < Number(process.env.REPS ?? 3); rep++) {
  for (const [arm, sys] of (rep % 2 ? [['without', sysWithout], ['with', sysWith]] : [['with', sysWith], ['without', sysWithout]])) {
    const r = await call(sys);
    rows.push({ arm, rep, ms: r.ms, outTokens: r.usage.output_tokens, chars: r.text.length, text: r.text });
    console.log(`${arm.padEnd(7)} r${rep} ${String(r.ms).padStart(6)}ms out=${String(r.usage.output_tokens).padStart(5)} chars=${String(r.text.length).padStart(5)}`);
    await new Promise((res) => setTimeout(res, 200));
  }
}
writeFileSync(new URL('./out/answers.json', import.meta.url), JSON.stringify(rows, null, 2));
console.log('saved', rows.length);
