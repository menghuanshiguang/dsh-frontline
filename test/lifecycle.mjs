/**
 * Lifecycle test against the REAL prompt registry: mount → assemble → dispose →
 * assemble → remount.
 *
 * This is the regression guard a prompt plugin never gets from review. It asserts
 * the halves of the unload contract that byte-level reading cannot see:
 *
 *   1. after `fiber.dispose()` the registry holds none of the six layers — a
 *      leaky registration would silently double the prompt text on every edit
 *      (and a doubled identity block is not a cosmetic problem)
 *   2. dispose removes only what this row registered, never a neighbour's layer
 *   3. a half switched off at mount stays absent across a dispose/remount cycle,
 *      so a reload cannot resurrect a layer its author turned off
 *
 * Run: node test/lifecycle.mjs
 */
import assert from 'node:assert/strict';
import * as plugin from '../index.js';
import { hostEntry } from './host.mjs';

/* Same run-time resolution as integration.mjs: the host install moves between
 * layouts, so no absolute module path is baked into this file. */
const { Context } = await import(hostEntry('@deepseek-ai/cordis/lib/index.js'));
const { default: promptRegistry } = await import(hostEntry('@deepseek-ai/dsh-system-prompt/lib/index.js'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SECTIONS = ['identity:head', 'identity:core', 'discipline:head', 'discipline:core'];
const CONTEXTS = ['identity:runtime', 'discipline:runtime'];

const makeCtx = () => {
  const ctx = new Context();
  ctx.on('internal/error', (error) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
  let registry;
  ctx.inject(['systemPrompt'], (injected) => {
    registry = injected.systemPrompt;
  });
  ctx.plugin(promptRegistry);
  return { ctx, registry: () => registry };
};

const { ctx, registry } = makeCtx();

const names = async () => {
  const service = registry();
  if (!service) return undefined;
  return (await service.assemble({})).sections.map((section) => section.name);
};
const anchors = async () => (await registry().assemble({})).contexts.map((entry) => entry.name);

const withTolerance = async (pattern) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = await names();
    if (found) {
      const matched = found.filter((entry) => pattern.test(entry));
      if (matched.length) return matched;
    }
    await sleep(25);
  }
  return [];
};

/* --- mount ---------------------------------------------------------------- */

const fiber = ctx.plugin(plugin, {});
assert.deepEqual(
  (await withTolerance(/^(identity|discipline):/)).sort(),
  [...SECTIONS].sort(),
  'both halves register all four sections on mount',
);
assert.deepEqual((await anchors()).filter((entry) => CONTEXTS.includes(entry)), CONTEXTS, 'both anchors register on mount');

const before = await names();

/* --- dispose -------------------------------------------------------------- */

await fiber.dispose();
await sleep(50);
const after = await names();
assert.deepEqual(
  after,
  before.filter((entry) => !SECTIONS.includes(entry)),
  'dispose removes every layer this row registered and nothing else',
);
assert.equal((await anchors()).some((entry) => CONTEXTS.includes(entry)), false, 'dispose removes both anchors');

/* --- remount -------------------------------------------------------------- */

const second = ctx.plugin(plugin, {});
assert.deepEqual(
  (await withTolerance(/^(identity|discipline):/)).sort(),
  [...SECTIONS].sort(),
  'remounting after dispose registers a single set of layers',
);
assert.deepEqual(
  (await anchors()).filter((entry) => CONTEXTS.includes(entry)),
  CONTEXTS,
  'the anchors do not duplicate either',
);
await second.dispose();
await sleep(50);
assert.equal(
  (await names()).some((entry) => SECTIONS.includes(entry)),
  false,
  'the second dispose is clean too',
);

/* --- a disabled half stays disabled across a cycle ------------------------ */

const third = ctx.plugin(plugin, { discipline: false });
assert.deepEqual(
  (await withTolerance(/^(identity|discipline):/)).sort(),
  ['identity:core', 'identity:head'],
  'a half disabled at mount does not register',
);
await third.dispose();
await sleep(50);
const fourth = ctx.plugin(plugin, { discipline: false });
assert.deepEqual(
  (await withTolerance(/^(identity|discipline):/)).sort(),
  ['identity:core', 'identity:head'],
  'a reload does not resurrect the disabled half',
);
assert.deepEqual((await anchors()).filter((entry) => CONTEXTS.includes(entry)), ['identity:runtime']);
await fourth.dispose();
await sleep(50);

console.log(
  'lifecycle ok — mount=%d after-dispose=%d, sections leaked=%d, anchors leaked=%d, disabled-half respected',
  before.length,
  after.length,
  after.filter((entry) => SECTIONS.includes(entry)).length,
  (await anchors()).filter((entry) => CONTEXTS.includes(entry)).length,
);
