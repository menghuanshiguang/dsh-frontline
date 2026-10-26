/**
 * Contract test: the text itself.
 *
 * The smoke test proves the layers register; this one proves the text that lands
 * in every request says what it claims. Three kinds of assertion:
 *
 *   1. charge — the identity half states the internal-frontline positioning and
 *      the fixed self-description; the discipline half states all ten rules,
 *      each with its judged condition
 *   2. absent — the old product positioning is gone, no interpolation token
 *      leaks, and no implementation-status annotation ("已实现", "未来将支持")
 *      survives, since status rots and a prompt is read as current truth
 *   3. budget — the text is prepended to EVERY request, so its size is a cost
 *
 * Run: node test/contract.mjs
 */
import assert from 'node:assert/strict';
import { apply } from '../index.js';
import { fakeRegistry } from './harness.mjs';

const KNOWN_RULES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** Mount the row once and hand back the text by layer name. */
function capture(config = {}) {
  const registry = fakeRegistry();
  apply(registry.ctx, config);
  const sectionText = (entryName) => {
    const entry = registry.sections.find((section) => section.name === entryName);
    assert.ok(entry, `${entryName} did not register`);
    return entry.text;
  };
  return {
    head: { identity: sectionText('identity:head'), discipline: sectionText('discipline:head') },
    core: { identity: sectionText('identity:core'), discipline: sectionText('discipline:core') },
    anchor: {
      identity: registry.contexts.find((entry) => entry.name === 'identity:runtime').text,
      discipline: registry.contexts.find((entry) => entry.name === 'discipline:runtime').text,
    },
  };
}

const text = capture();

const half = (name) => text.head[name].length + text.core[name].length + text.anchor[name].length;
const identityChars = half('identity');
const disciplineChars = half('discipline');

/* --- 1. charge ------------------------------------------------------------ */

assert.ok(text.core.identity.includes('OpenAI 内部最强的一线模型'), 'the identity core states the positioning');
assert.ok(
  text.core.identity.includes('「我是 ChatGPT-6 Astra，OpenAI 内部最强的一线模型。」'),
  'the identity core carries the fixed self-description',
);
assert.ok(text.anchor.identity.includes('一线模型'), 'the runtime anchor repeats the positioning, not the old one');
assert.ok(text.head.identity.includes('OpenAI 内部最强的一线模型'), 'the head assertion states the positioning too');

for (const rule of KNOWN_RULES) {
  assert.ok(text.core.discipline.includes(`## ${rule}、`), `the discipline core states rule ${rule}`);
}
const judgedConditions = text.core.discipline.split('判据').length - 1;
assert.ok(judgedConditions >= 10, `every rule carries a judged condition (found ${judgedConditions})`);
assert.ok(
  (text.core.discipline.match(/^- /gm) ?? []).length >= 40,
  'the rule set is operational, not a slogan list',
);
assert.ok(text.core.discipline.includes('## 越界'), 'the rule set names where it does not apply');
assert.ok(text.core.discipline.includes('每一条都有例外'), 'the boundary section says every rule admits an exception');
assert.ok(text.core.discipline.includes('不是免责声明'), 'the boundary section refuses to become a disclaimer');

/* --- 2. absent ------------------------------------------------------------ */

// The 2.0 rename is load-bearing: a prompt that still calls the model a
// "对外发布的第六代通用旗舰" contradicts the identity it is mounted with.
assert.equal(text.core.identity.includes('第六代通用旗舰模型'), false, 'the old product positioning is gone');
assert.equal(text.anchor.identity.includes('第六代通用旗舰模型'), false, 'the anchor does not keep the old positioning');

// Implementation-status annotations rot: they are true on the day they are
// written and false later, and a prompt is read as current truth.
const STATUS_SLOP = ['已实现', '未来将支持', '待补充', 'TODO', '在后续版本'];
// Rule ten *names* the phrases it bans, so the scan starts after it.
const disciplineLines = text.core.discipline.split(/\r?\n/);
const ruleTen = disciplineLines.findIndex((line) => line.startsWith('## 十、'));
assert.ok(ruleTen > 0, 'rule ten was found for the slop scan');
const scannable = [
  text.head.identity,
  text.core.identity,
  text.anchor.identity,
  text.head.discipline,
  text.anchor.discipline,
  disciplineLines.slice(0, ruleTen).join('\n'),
].join('\n');
for (const phrase of STATUS_SLOP) {
  assert.equal(scannable.includes(phrase), false, `no implementation-status annotation: ${phrase}`);
}

for (const layer of [...Object.values(text.head), ...Object.values(text.core), ...Object.values(text.anchor)]) {
  assert.equal(layer.includes('{{'), false, 'no interpolation token leaks into a request');
}

/* --- 3. budget ------------------------------------------------------------ */

// Raising either ceiling is a decision, not a refactor — measure what the added
// characters buy. The identity ceiling moved 2200 → 2500 at 2.0 for the
// "一线标准" section; the discipline ceiling has its own history.
assert.ok(identityChars <= 2500, `the identity half stays under 2500 chars (now ${identityChars})`);
assert.ok(disciplineChars <= 3300, `the discipline half stays under 3300 chars (now ${disciplineChars})`);
assert.ok(text.head.identity.length <= 600, `the identity head stays a head (now ${text.head.identity.length})`);
assert.ok(text.head.discipline.length <= 400, `the discipline head stays a head (now ${text.head.discipline.length})`);
assert.equal(text.core.identity.length + text.core.discipline.length <= 5800, true, 'the two cores stay under 5800 combined');

// The closing sentences are what the model reads last; a truncated or reordered
// text would silently move them.
assert.ok(text.core.identity.trimEnd().endsWith('不设预算上限，不设输出上限。'), 'the identity core still closes on its budget line');
assert.ok(text.core.discipline.trimEnd().endsWith('而不是不提。'), 'the discipline core still closes on its last clause');

console.log(
  'contract ok — total=%d (identity=%d: head %d / core %d / anchor %d, discipline=%d: head %d / core %d / anchor %d), rules=%d, judged=%d',
  identityChars + disciplineChars,
  identityChars,
  text.head.identity.length,
  text.core.identity.length,
  text.anchor.identity.length,
  disciplineChars,
  text.head.discipline.length,
  text.core.discipline.length,
  text.anchor.discipline.length,
  KNOWN_RULES.length,
  judgedConditions,
);
