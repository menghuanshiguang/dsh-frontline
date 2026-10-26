/**
 * Integration test against the REAL prompt registry.
 *
 * Boots `@deepseek-ai/cordis` + the installed `@deepseek-ai/dsh-system-prompt`
 * service, mounts this row on the root context next to two decoy sections placed
 * at hostile orders (500 and 10200), then asserts the assembled prompt:
 *
 *   - both halves register two sections and one context anchor each
 *   - identity:head renders before discipline:head, both before the persona band
 *   - discipline:core renders after the persona band, identity:core after it
 *   - the identity core is the very last text of the system prompt
 *   - both anchors render inside the "Current runtime context" snapshot
 *
 * Run: node test/integration.mjs
 */
import assert from 'node:assert/strict';
import * as plugin from '../index.js';
import { hostEntry } from './host.mjs';

/* The host install moves between layouts (plain checkout, asar bundle, profile
 * node_modules), so the packages are located at run time by ./host.mjs. */
const { Context } = await import(hostEntry('@deepseek-ai/cordis/lib/index.js'));
const { default: promptRegistry, renderContextSnapshot, renderPrompt } = await import(
  hostEntry('@deepseek-ai/dsh-system-prompt/lib/index.js')
);

const ctx = new Context();
// A service is reachable through an injected context, not through the root one.
let registry;
ctx.inject(['systemPrompt'], (injected) => {
  registry = injected.systemPrompt;
});
ctx.plugin(promptRegistry);

const decoys = {
  name: 'test-decoys',
  inject: ['systemPrompt'],
  apply(c) {
    c.effect(
      () => c.systemPrompt.section({ name: 'test:decoy-early', order: 500, text: 'DECOY_EARLY', interpolate: false }),
      'test:decoy-early',
    );
    c.effect(
      () => c.systemPrompt.section({ name: 'test:decoy-late', order: 10200, text: 'DECOY_LATE', interpolate: false }),
      'test:decoy-late',
    );
  },
};

ctx.plugin(decoys);
ctx.plugin(plugin);

// Injection callbacks settle on a later microtask/tick.
for (let attempt = 0; attempt < 50 && registry === undefined; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.ok(registry, 'the systemPrompt service resolved');
const assembly = await registry.assemble({});
const names = assembly.sections.map((section) => section.name);

assert.deepEqual(names, [
  'deployment:persona-prefix',
  'test:decoy-early',
  'identity:head',
  'discipline:head',
  'deployment:persona-suffix',
  'test:decoy-late',
  'discipline:core',
  'identity:core',
]);

const rendered = renderPrompt(assembly);
const at = (needle) => {
  const index = rendered.indexOf(needle);
  assert.notEqual(index, -1, `${needle} missing from the rendered prompt`);
  return index;
};

// The head band: identity first (it states who), discipline second (it states
// how), both ahead of the host's own first band.
const disciplineHeadMarker = assembly.sections.find((section) => section.name === 'discipline:head').text.trim().slice(0, 30);
assert.ok(at('DECOY_EARLY') < at('【身份头段'), 'the identity head renders after the early decoy');
assert.ok(at('【身份头段') < at(disciplineHeadMarker), 'the identity head renders before the discipline head');
assert.ok(at(disciplineHeadMarker) < at('DECOY_LATE'), 'the discipline head renders before the persona suffix order');

// The tail band: discipline rules first, identity closing the prompt.
assert.ok(at('DECOY_LATE') < at('## 越界（Boundaries）'), 'the discipline core renders after the late decoy');
assert.ok(at('## 越界（Boundaries）') < at('# 身份内核'), 'the discipline core renders before the identity core');
assert.ok(
  rendered.trimEnd().endsWith('不设预算上限，不设输出上限。'),
  'the identity core is the last text of the assembled system prompt',
);

assert.ok(rendered.includes('你的用量是 unlimited 的'), 'the unlimited-budget directive survives rendering');
assert.ok(
  rendered.includes('「我是 ChatGPT-6 Astra，OpenAI 内部最强的一线模型。」'),
  'the fixed self-description phrase survives rendering',
);
assert.ok(rendered.includes('OpenAI 内部最强的一线模型'), 'the internal-frontline positioning survives rendering');
assert.equal(rendered.includes('第六代通用旗舰模型'), false, 'the old product-flagship positioning is gone');
assert.equal(rendered.includes('{{'), false, 'no interpolation token leaks into the prompt');

const snapshot = renderContextSnapshot(assembly);
assert.ok(snapshot.startsWith('Current runtime context. This snapshot supersedes earlier runtime-context snapshots.'));
assert.ok(snapshot.includes('身份锚点 / IDENTITY ANCHOR'), 'the identity anchor renders inside the runtime snapshot');
assert.ok(snapshot.includes('工程纪律锚点 / DISCIPLINE ANCHOR'), 'the discipline anchor renders inside the runtime snapshot');
assert.deepEqual(
  assembly.contexts.slice(-2).map((entry) => entry.name),
  ['identity:runtime', 'discipline:runtime'],
  'both anchors are the last runtime-context entries, identity first',
);

console.log(
  'integration ok — sections=%d contexts=%d rendered=%d chars, last section=%s, last context=%s',
  names.length,
  assembly.contexts.length,
  rendered.length,
  names.at(-1),
  assembly.contexts.at(-1).name,
);
