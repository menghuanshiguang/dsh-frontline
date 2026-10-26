/**
 * ChatGPT-6 Astra · frontline — one row, two prompt layers.
 *
 * `identity` states who the model is, `discipline` states how it works. They are
 * orthogonal (an identity without standards is a slogan; standards without an
 * identity have no author), so each lives in its own module and can be mounted
 * alone — `src/identity.js` and `src/discipline.js` have zero imports and export
 * their own `apply(ctx, config)`. Shipping them as ONE package means one
 * `insert` line in a profile patch carries both, and one `disabled: true`
 * removes both.
 *
 * Mounting order and the resulting layout:
 *
 *   identity:head   901    first thing read, next to FILE_REFERENCE
 *   discipline:head 902    the three unconditional clauses, right after it
 *   … the host's own bands (tools, runtime, deployment persona) …
 *   discipline:core 19999  the full rule set with judged conditions
 *   identity:core   20000  the identity block — closes the prompt
 *
 * The two `head` layers come before every host band (primacy), the two `core`
 * layers come after every host band (recency), and the identity core holds the
 * very last position because its fixed self-description sentence is the one line
 * that must never be paraphrased away. Each `context` anchor (121, 122) renders
 * inside the "Current runtime context" snapshot, next to the request.
 *
 * Config: `enabled` gates the whole row; `identity` and `discipline` gate one
 * half. Everything else belongs to the half it names — see `cordis.patch.yml`
 * for the full key list and `README.md` for what each text buys.
 *
 * This package has no dependencies and no imports outside its own `src/`: the
 * plugin manager may copy it or link it, and a bare `@deepseek-ai/schemastery`
 * import would not resolve from either layout. The config is normalized in
 * plain JS instead.
 *
 * @module @local/dsh-frontline
 */
import * as discipline from './src/discipline.js';
import * as identity from './src/identity.js';

export const name = 'frontline';

/** Both halves register through the injected system-prompt service. */
export const inject = ['systemPrompt'];

const TAG = '[frontline]';
const PARTS = { identity, discipline };
const KNOWN_KEYS = new Set(['enabled', 'debug', ...Object.keys(PARTS)]);

/**
 * YAML 1.2 turns `enabled: no` into the STRING "no", and `Boolean('no')` is
 * true — the row would stay mounted while its author believed it was off. Only
 * an explicit truthy spelling means "on".
 */
function bool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return !['', 'false', '0', 'off', 'no', 'n'].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function makeLog(ctx) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger(TAG) : undefined;
  return (message) => {
    if (logger && typeof logger.info === 'function') logger.info('%s', message);
    else console.log(message);
  };
}

/**
 * Mount both halves. Each half normalizes its own config, so a typo under
 * `identity:` is reported against `identity:` instead of this row.
 *
 * @param ctx - host context carrying the `systemPrompt` service.
 * @param config - the row config from `cordis.patch.yml` (may be undefined).
 */
export function apply(ctx, config) {
  const raw = config && typeof config === 'object' ? config : {};
  const log = makeLog(ctx);
  const debug = bool(raw.debug);

  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length) {
    log(`${TAG} unknown config key(s): ${unknown.join(', ')} — ignored. Known keys: ${[...KNOWN_KEYS].join(', ')}`);
  }

  if (!bool(raw.enabled === undefined ? true : raw.enabled)) {
    if (debug) log(`${TAG} disabled by config`);
    return;
  }

  for (const [key, part] of Object.entries(PARTS)) {
    const value = raw[key];
    let partConfig;
    if (value && typeof value === 'object') partConfig = { ...value };
    else if (value === false) partConfig = { enabled: false };
    else if (value === undefined || value === true) partConfig = {};
    else {
      log(`${TAG} "${key}" expects an object (or false to disable it), got ${typeof value} — ignored, mounting with defaults`);
      partConfig = {};
    }
    // A row-level `debug` reaches both halves unless a half sets its own.
    if (partConfig.debug === undefined) partConfig.debug = debug;
    part.apply(ctx, partConfig);
  }
}
