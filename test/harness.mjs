/**
 * The fake prompt registry shared by the unit-level specs.
 *
 * A real `systemPrompt` service is a cordis plugin (see `integration.mjs`); this
 * stand-in records what a plugin registers and answers just enough of the
 * registry's read side for the derived orders to resolve. It lives here, in a
 * plain module, and NOT in one of the specs: importing a spec re-runs its
 * `describe`-level body, so a fixture kept in a spec mounts (and here: asserts)
 * a second time in the importer. Only `*.test.*` files are imported by nothing.
 *
 * Run: used by smoke.mjs and contract.mjs
 */

/** The registry rows the plugin derives its default orders from. */
export const SECTION_ORDERS = { FILE_REFERENCE: 900, TOOL_BASH: 1000, DEPLOYMENT_PERSONA_SUFFIX: 10200 };
export const CONTEXT_ORDERS = { SANDBOX_POLICY: 110, APPROVAL_POLICY: 115, SUBAGENT_DELEGATION: 120 };

/**
 * @param options - `sectionOrders` / `contextOrders` override the lookup (pass
 *   `() => undefined` for a registry that answers nothing); `sectionThrows`
 *   makes registration fail, to prove a failure propagates.
 * @returns the recording arrays plus the `ctx` to hand to `apply()`.
 */
export function fakeRegistry(options = {}) {
  const sections = [];
  const contexts = [];
  const effects = [];
  const logs = [];

  const lookup =
    (table) =>
    (name) =>
      typeof table === 'function' ? table(name) : table[name];

  const prompt = {
    systemPrompt: {
      section(entry) {
        if (options.sectionThrows) throw new Error('registry exploded');
        sections.push(entry);
        return () => {};
      },
      context(entry) {
        contexts.push(entry);
        return () => {};
      },
      getSectionOrder: lookup(options.sectionOrders ?? SECTION_ORDERS),
      getContextOrder: lookup(options.contextOrders ?? CONTEXT_ORDERS),
    },
    logger() {
      return {
        info(_format, message) {
          logs.push(String(message));
        },
      };
    },
    effect(fn, label) {
      effects.push(label);
      return fn();
    },
  };

  const ctx = {
    ...prompt,
    inject(services, callback) {
      if (JSON.stringify(services) !== '["systemPrompt"]') {
        throw new Error(`unexpected inject request: ${JSON.stringify(services)}`);
      }
      callback(prompt);
    },
  };

  return {
    ctx,
    prompt,
    sections,
    contexts,
    effects,
    logs,
    /** Clear what was recorded; `ctx` stays usable for the next `apply()`. */
    reset() {
      sections.length = 0;
      contexts.length = 0;
      effects.length = 0;
      logs.length = 0;
    },
  };
}
