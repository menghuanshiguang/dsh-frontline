// 机器可判定的评分 + SVG 渲染。视觉主观分不在这里，见 bench/TASKS.md。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const dir = new URL('./out/', import.meta.url);
mkdirSync(dir, { recursive: true });
const rows = JSON.parse(readFileSync(new URL('answers.json', dir), 'utf8'));
const cjk = (s) => (s.match(/[\u4e00-\u9fff]/g) || []).length;
const stripFences = (s) => s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();

function extractSvg(text) {
  const m = text.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0] : null;
}
function extractPy(text) {
  const fenced = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// 隐藏测试：不依赖模型自己写的用例。
const PY_TESTS = {
  brackets: `
cases = [
    ("()", True), ("([{}])", True), ("(]", False), ("([)]", False),
    ("", True), (")(", False), ("{[()]}", True), ("(((", False),
]
ok = 0
for s, want in cases:
    try:
        got = balanced(s)
    except Exception as e:
        got = f"EXC:{e}"
    ok += (got == want)
print(ok, len(cases))
`,
  bugfix: `
import signal
signal.alarm(5)
arrs = [
    ([1,3,5,7,9], 5, 2), ([1,3,5,7,9], 9, 4), ([1,3,5,7,9], 2, -1),
    ([], 3, -1), ([1], 1, 0), ([1,3,3,5], 3, 3),
    (list(range(1000)), 999, 999), (list(range(1000)), 1000, -1),
]
ok = 0
for arr, target, want in arrs:
    try:
        got = binary_search(arr, target)
    except Exception as e:
        got = f"EXC:{e}"
    if target == 3 and arr == [1,3,3,5]:
        ok += got in (1, 2)
    else:
        ok += (got == want)
print(ok, len(arrs))
`,
};

function runPy(code, test) {
  const src = `${code}\n\n${test}`;
  const r = spawnSync('python3', ['-c', src], { encoding: 'utf8', timeout: 15000 });
  if (r.error) return { ok: 0, total: 'ERR', detail: String(r.error.message) };
  const out = (r.stdout || '').trim().split('\n').pop() || '';
  const [ok, total] = out.split(' ').map(Number);
  return { ok: Number.isFinite(ok) ? ok : 0, total: Number.isFinite(total) ? total : 'ERR', detail: (r.stderr || '').slice(0, 200) };
}

// SVG 渲染（@resvg/resvg-wasm，WASM 无原生依赖；路径由 RESVG_DIR 指定）
let resvg = null;
try {
  const req = createRequire(import.meta.url);
  const mod = await import(process.env.RESVG_DIR ? new URL(`file://${process.env.RESVG_DIR}/index.mjs`).href : '@resvg/resvg-wasm');
  await mod.initWasm(readFileSync(process.env.RESVG_WASM ?? '/dev/null'));
  resvg = mod.Resvg;
} catch (e) { console.error('resvg unavailable:', e.message); }

const fontBuffers = [];
for (const f of ['/system/fonts/Roboto-Regular.ttf', '/system/fonts/NotoSansCJK-Regular.ttc']) {
  try { fontBuffers.push(readFileSync(f)); } catch {}
}

const results = [];
for (const row of rows) {
  const out = { task: row.task, arm: row.arm, rep: row.rep, ms: row.ms, outTokens: row.outTokens, chars: row.chars, score: {} };
  const t = row.text.trim();
  if (row.task === 'pelican') {
    const svg = extractSvg(t);
    out.score.svg = Boolean(svg);
    if (svg) {
      writeFileSync(new URL(`${row.task}-${row.arm}-r${row.rep}.svg`, dir), svg);
      try {
        const r = new resvg(svg, { fitTo: { mode: 'width', value: 900 }, font: { fontBuffers, defaultFontFamily: 'Roboto' } });
        writeFileSync(new URL(`${row.task}-${row.arm}-r${row.rep}.png`, dir), r.render().asPng());
        out.score.rendered = true;
      } catch (e) { out.score.rendered = false; out.score.renderError = e.message.slice(0, 120); }
      out.score.proseChars = t.length - svg.length;
      out.score.elements = (svg.match(/<(path|circle|ellipse|rect|polygon|polyline|line|text|g|use|defs|linearGradient|radialGradient|stop)\b/gi) || []).length;
      out.score.bytes = Buffer.byteLength(svg);
    }
  } else if (row.task === 'brackets' || row.task === 'bugfix') {
    const code = extractPy(t);
    out.score = { ...runPy(code, PY_TESTS[row.task]), code };
  } else if (row.task === 'batball') {
    // 只看最终结论：答案里出现 0.05/5 美分即正确；后文对 0.10 的反驳不算错。
    out.score.correct = /(0\.05|5\s*美分|5\s*cents|五美分)/i.test(t);
  } else if (row.task === 'api3') {
    const body = t.replace(/^.*?[：:]\s*/s, '');
    const sents = body.split(/(?<=[。！？.!?])/).map((s) => s.trim()).filter(Boolean);
    out.score = { sentences: sents.length, contract: (t.match(/contract/gi) || []).length, cjk: cjk(t), perSentenceCjk: sents.map(cjk) };
    out.score.pass = sents.length === 3 && out.score.contract === 1;
  } else if (row.task === 'mug40') {
    const words = t.split(/\s+/).filter(Boolean);
    out.score = { words: words.length, exclaim: (t.match(/!/g) || []).length, morning: (t.match(/morning/gi) || []).length };
    out.score.pass = words.length === 40 && out.score.exclaim === 0 && out.score.morning === 2;
  }
  results.push(out);
}
writeFileSync(new URL('results.json', dir), JSON.stringify(results, null, 2));
for (const r of results) {
  const s = { ...r.score };
  delete s.code;
  console.log(`${r.task.padEnd(9)} ${r.arm.padEnd(7)} r${r.rep} ${JSON.stringify(s)}`);
}
