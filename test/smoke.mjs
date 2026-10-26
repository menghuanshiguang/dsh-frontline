/**
 * Smoke test: mount both halves against a fake prompt registry and assert the
 * four sections and two context anchors register with their expected names,
 * orders and text.
 *
 * The assertions are on the mounted entries, not on the source constants: what
 * the registry receives is the contract, and every other test builds on it.
 *
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict';
import { apply, inject, name } from '../index.js';
import { fakeRegistry } from './harness.mjs';

const { ctx, sections, contexts, effects, logs, reset } = fakeRegistry();

const layout = () => sections.map((section) => [section.name, section.order]);
const anchors = () => contexts.map((entry) => [entry.name, entry.order]);
const orderOf = (sectionName) => sections.find((section) => section.name === sectionName).order;

/* --- the public ABI ------------------------------------------------------- */

assert.deepEqual(inject, ['systemPrompt'], 'the row asks for one service');
assert.equal(name, 'frontline', 'one row, one name');

/* --- both halves on by default -------------------------------------------- */

apply(ctx, {});

assert.equal(sections.length, 4, 'two head sections and two core sections');
assert.equal(contexts.length, 2, 'one runtime anchor per half');
assert.deepEqual(
  layout(),
  [
    ['identity:head', 901],
    ['identity:core', 20000],
    ['discipline:head', 902],
    ['discipline:core', 19999],
  ],
  'head orders are derived from the registry neighbour, core orders are literals',
);
assert.deepEqual(anchors(), [
  ['identity:runtime', 121],
  ['discipline:runtime', 122],
]);
assert.deepEqual(
  sections.map((section) => section.interpolate),
  [false, false, false, false],
  'interpolation stays off unless the row opts in',
);

// The six names are a public contract, not an implementation detail: a profile
// patch lists them literally in `keepSections`, and a rename drops the layer
// silently (no error, no log). test/audit.mjs checks the installed profile
// against them, so change these only together with every profile that names them.
assert.deepEqual(
  [...sections.map((section) => section.name), ...contexts.map((entry) => entry.name)],
  ['identity:head', 'identity:core', 'discipline:head', 'discipline:core', 'identity:runtime', 'discipline:runtime'],
  'the canonical names are ABI',
);

// Relative positions the other tests and the README both rely on.
assert.ok(orderOf('identity:head') < 1000, 'the identity head sits before the tool-usage band');
assert.ok(orderOf('discipline:head') > orderOf('identity:head'), 'discipline follows identity in the head position');
assert.ok(orderOf('discipline:core') > 10200, 'the discipline core sits after the deployment persona suffix');
assert.ok(orderOf('discipline:core') < orderOf('identity:core'), 'the identity core keeps the closing position');

/* --- each half carries its own charge ------------------------------------- */

for (const section of sections) {
  assert.equal(section.text.includes('{{'), false, `${section.name} has no interpolation token`);
}
// The identity half names the identity; the discipline half is written for any
// author and stays name-free, so it can be mounted alone or reused.
for (const section of sections.filter((entry) => entry.name.startsWith('identity:'))) {
  assert.ok(section.text.includes('ChatGPT-6 Astra'), `${section.name} names the identity`);
}
for (const section of sections.filter((entry) => entry.name.startsWith('discipline:'))) {
  assert.equal(section.text.includes('ChatGPT-6 Astra'), false, `${section.name} stays identity-agnostic`);
}
assert.ok(
  sections.find((entry) => entry.name === 'discipline:core').text.includes('判据'),
  'the discipline core states the judged condition of each rule',
);
assert.ok(
  contexts.find((entry) => entry.name === 'identity:runtime').text.includes('ChatGPT-6 Astra'),
  'the identity anchor names the identity',
);

/* --- a registry that answers nothing still yields finite orders ----------- */

const silent = fakeRegistry({ sectionOrders: () => undefined, contextOrders: () => undefined });
apply(silent.ctx, {});
assert.deepEqual(
  silent.sections.map((section) => section.order),
  [901, 20000, 902, 19999],
  'fallback anchors keep the derived orders finite',
);
assert.deepEqual(silent.contexts.map((entry) => entry.order), [121, 122], 'no undefined order ever reaches the registry');

/* --- gating: the row, then either half ------------------------------------ */

reset();
apply(ctx, { enabled: false });
assert.equal(sections.length + contexts.length, 0, 'enabled:false mounts nothing');

reset();
apply(ctx, { identity: false });
assert.deepEqual(layout(), [
  ['discipline:head', 902],
  ['discipline:core', 19999],
]);
assert.deepEqual(anchors(), [['discipline:runtime', 122]]);

reset();
apply(ctx, { discipline: false });
assert.deepEqual(layout(), [
  ['identity:head', 901],
  ['identity:core', 20000],
]);
assert.deepEqual(anchors(), [['identity:runtime', 121]]);

reset();
apply(ctx, { identity: { enabled: false } });
assert.deepEqual(
  layout(),
  [
    ['discipline:head', 902],
    ['discipline:core', 19999],
  ],
  'a half can be switched off inside its own object too',
);

/* --- per-half retuning ---------------------------------------------------- */

reset();
apply(ctx, {
  identity: { headEnabled: false, coreOrder: 12000, coreText: 'CUSTOM IDENTITY' },
  discipline: { contextOrder: 130, interpolate: true, headText: 'X {{declared_opt_in}} Y' },
});
assert.deepEqual(
  layout(),
  [
    ['identity:core', 12000],
    ['discipline:head', 902],
    ['discipline:core', 19999],
  ],
  'a half retunes only its own layers',
);
assert.equal(sections[0].text, 'CUSTOM IDENTITY');
assert.equal(sections[0].interpolate, false, 'the identity half keeps interpolation off');
assert.equal(sections[1].interpolate, true, 'interpolate is per half, not per row');
assert.equal(sections[2].interpolate, true);
assert.deepEqual(
  anchors(),
  [
    ['identity:runtime', 121],
    ['discipline:runtime', 130],
  ],
  'contextOrder is per half',
);

/* --- YAML 1.2 spellings --------------------------------------------------- */

// `enabled: no` is the STRING "no" in YAML 1.2, and Boolean('no') is true — the
// row would stay mounted while its author believed it was off.
for (const falsy of ['no', 'off', 'n', 'FALSE', '0', '']) {
  reset();
  apply(ctx, { enabled: falsy });
  assert.equal(sections.length + contexts.length, 0, `enabled:${JSON.stringify(falsy)} stays unmounted`);
}

// A bare order key is null or "", which means "not set" — not order 0.
for (const unset of [null, '', '   ']) {
  reset();
  apply(ctx, { identity: { headOrder: unset }, discipline: { contextOrder: unset } });
  assert.deepEqual(
    layout().map(([, order]) => order),
    [901, 20000, 902, 19999],
    `unset order ${JSON.stringify(unset)} falls back to the derived value`,
  );
  assert.deepEqual(anchors().map(([, order]) => order), [121, 122]);
}

/* --- misconfiguration is reported, never silent --------------------------- */

// Without a schema a typo is silently ignored, so it must at least be named.
reset();
apply(ctx, { discipine: { enabled: false }, identity: { coreOder: 5 } });
assert.ok(
  logs.some((message) => message.includes('unknown config key(s): discipine')),
  `a top-level typo is reported (logs: ${JSON.stringify(logs)})`,
);
assert.ok(
  logs.some((message) => message.includes('unknown config key(s): coreOder')),
  'a per-half typo is reported against the half it was written under',
);

// A half written as a scalar is a mistake worth naming, and mounting the default
// beats mounting nothing.
reset();
apply(ctx, { discipline: 5 });
assert.ok(
  logs.some((message) => message.includes('"discipline" expects an object')),
  'a scalar half is reported',
);
assert.equal(sections.length, 4, 'a scalar half still mounts the defaults');

// The registry interpolates every section unconditionally, so a placeholder must
// fail at MOUNT time instead of throwing on every request render.
assert.throws(
  () => apply(ctx, { identity: { headText: 'X {{missing_var}} Y' } }),
  /placeholder.*interpolate: true/s,
  'a placeholder in the identity text is rejected at mount',
);
assert.throws(
  () => apply(ctx, { discipline: { coreText: 'X {{missing_var}} Y' } }),
  /placeholder/,
  'a placeholder in the discipline text is rejected at mount',
);

// A layer that cannot register fails loud — it must never report success.
assert.throws(
  () => apply(fakeRegistry({ sectionThrows: true }).ctx, {}),
  /registry exploded/,
  'a registration failure propagates instead of being swallowed',
);

// A row-level debug reaches both halves.
reset();
apply(ctx, { debug: true });
assert.ok(
  logs.some((message) => message.includes('[frontline:identity]')),
  'the identity half logs under the row',
);
assert.ok(
  logs.some((message) => message.includes('[frontline:discipline]')),
  'the discipline half logs under the row',
);

console.log(
  'smoke ok — sections=%d contexts=%d effects=%d logs=%d',
  sections.length,
  contexts.length,
  effects.length,
  logs.length,
);
