// 判分：抽取修复后的代码 → 真实跑可见测试与隐藏测试；并从说明里核对 8 个 root cause。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const dir = new URL('./out/', import.meta.url);
const codeDir = new URL('./code/', import.meta.url);
const rows = JSON.parse(readFileSync(new URL('answers.json', dir), 'utf8'));
const tests = readFileSync(new URL('test_inventory.py', codeDir), 'utf8');
const hidden = readFileSync(new URL('./hidden_test.py', import.meta.url), 'utf8');

function extractCode(text) {
  const blocks = [...text.matchAll(/```(?:python)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  if (blocks.length) return blocks[blocks.length - 1].trim();
  const at = text.indexOf('def average');
  return at >= 0 ? text.slice(at).trim() : '';
}
function explanation(text) {
  const at = text.search(/```/);
  return at >= 0 ? text.slice(0, at) : text;
}
const BUGS = {
  average: (t) => /(average|平均)/i.test(t) && /(\/\/|整除|地板除|integer division|截断)/i.test(t),
  page: (t) => /(page|分页)/i.test(t) && /(size\s*-\s*1|off.by.one|少|最后|边界)/i.test(t),
  add_item: (t) => /(add_item|默认参数|cart)/i.test(t) && /(可变|mutable|共享|默认参数|None|哨兵)/i.test(t),
  retries: (t) => /(retries|重试|config)/i.test(t) && /(or 3|假值|falsy|\b0\b|存在性|in config)/i.test(t),
  reset: (t) => /(reset|grid|浅拷贝|shallow|deepcopy|深拷贝)/i.test(t),
  slugify: (t) => /(slug|空白|空格|下划线|折叠|感叹号)/i.test(t),
  truncate: (t) => /(truncate|截断|省略号|…|ellipsis)/i.test(t),
  dedupe: (t) => /(dedupe|去重|set|顺序|order)/i.test(t),
  find_all: (t) => /(find_all|find|位置|下标|重叠)/i.test(t),
  make_multipliers: (t) => /(make_multipliers|闭包|closure|late binding|延迟绑定|lambda)/i.test(t),
};

const results = [];
let idx = 0;
for (const row of rows) {
  const code = extractCode(row.text);
  const work = new URL(`./work-${idx++}/`, dir);
  mkdirSync(work, { recursive: true });
  writeFileSync(new URL('inventory.py', work), code);
  writeFileSync(new URL('test_inventory.py', work), tests);
  writeFileSync(new URL('hidden_test.py', work), hidden);

  const vis = spawnSync('python3', ['-m', 'unittest', '-v', 'test_inventory'], { cwd: work.pathname, encoding: 'utf8', timeout: 30000 });
  const visOut = (vis.stdout || '') + (vis.stderr || '');
  const ran = Number(/Ran (\d+) tests/.exec(visOut)?.[1] ?? 0);
  const failures = Number(/FAILED \(failures=(\d+)/.exec(visOut)?.[1] ?? (/^OK/m.test(visOut) ? 0 : NaN));
  const visiblePass = Number.isFinite(failures) ? ran - failures : 0;

  const hid = spawnSync('python3', ['hidden_test.py'], { cwd: work.pathname, encoding: 'utf8', timeout: 30000 });
  const hidOut = (hid.stdout || '') + (hid.stderr || '');
  const m = /SCORE (\d+) (\d+)/.exec(hidOut);
  const hiddenPass = m ? Number(m[1]) : 0;
  const hiddenTotal = m ? Number(m[2]) : 0;

  const why = explanation(row.text);
  const found = Object.entries(BUGS).filter(([, fn]) => fn(why)).map(([k]) => k);

  results.push({
    arm: row.arm, rep: row.rep, ms: row.ms, outTokens: row.outTokens, chars: row.chars,
    visiblePass, visibleTotal: 5, hiddenPass, hiddenTotal,
    found: found.length, foundNames: found, code,
  });
  console.log(`${row.arm.padEnd(7)} r${row.rep} visible=${visiblePass}/5 hidden=${hiddenPass}/${hiddenTotal} roots=${found.length}/10 [${found.join(',')}]`);
}
writeFileSync(new URL('results.json', dir), JSON.stringify(results, null, 2));
