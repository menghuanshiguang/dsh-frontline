// 判分：按官方方式执行「修复后的代码 + 官方测试」，跑通即 pass。
import { readFileSync, writeFileSync, mkdirSync, writeFileSync as wf } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tasks = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(tasks.map((t) => [t.task_id, t]));
const TAG = process.env.TAG ?? '';
const rows = JSON.parse(readFileSync(new URL(`./out/answers${TAG}.json`, import.meta.url), 'utf8'));
const work = new URL('./out/work/', import.meta.url);
mkdirSync(work, { recursive: true });

function extract(text, entry) {
  const blocks = [...text.matchAll(/```(?:python)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  let code = blocks.length ? blocks[blocks.length - 1] : text;
  code = code.replace(/^\s*(Here|The fixed|Fixed code)[^\n]*\n/i, '');
  const at = code.search(new RegExp(`(^|\\n)(async\\s+)?def\\s+${entry}\\s*\\(`));
  if (at >= 0) {
    let out = code.slice(at);
    // 只保留目标函数本身：模型自带的 check/测试/if __name__ 不属于交付物，
    // 否则会用错误的自测断言把正确实现判成失败（2026-10-27 发现）。
    const cut = out.search(/\n(def check\(|check\(|if __name__)/);
    if (cut >= 0) out = out.slice(0, cut);
    return out.trim() + '\n';
  }
  return null; // 交给调用方按 body 续写处理
}

const results = [];
for (const row of rows) {
  const t = byId[row.task_id];
  const fixed = extract(row.text, t.entry_point);
  const source = fixed ?? `${t.prompt}${row.text}\n`;
  const program = `${t.import ?? ''}${source}\n${t.test_setup ?? ''}${t.test}\n`;
  const file = new URL(`${row.task_id.replace('/', '_')}-${row.arm}.py`, work);
  wf(file, program);
  const r = spawnSync('python3', [file.pathname], { encoding: 'utf8', timeout: 20000 });
  const pass = r.status === 0;
  results.push({ task_id: row.task_id, arm: row.arm, pass, ms: row.ms, outTokens: row.outTokens, extracted: Boolean(fixed), err: pass ? '' : (r.stderr || '').split('\n').slice(-3).join(' | ').slice(0, 200) });
}
writeFileSync(new URL(`./out/results${TAG}.json`, import.meta.url), JSON.stringify(results, null, 2));
const tasksSeen = [...new Set(results.map((r) => r.task_id))];
for (const arm of ['with', 'without']) {
  const r = results.filter((x) => x.arm === arm);
  console.log(`${arm.padEnd(8)} pass=${r.filter((x) => x.pass).length}/${r.length}`);
}
const discordant = tasksSeen.map((id) => ({
  id,
  w: results.find((x) => x.task_id === id && x.arm === 'with').pass,
  o: results.find((x) => x.task_id === id && x.arm === 'without').pass,
})).filter((x) => x.w !== x.o);
console.log('discordant', discordant.length, JSON.stringify(discordant.slice(0, 20)));
