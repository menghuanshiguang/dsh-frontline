/**
 * Engineering discipline — a host-only prompt-layer plugin.
 *
 * Three independent contributions, all rendered on every model request:
 *
 *   head    — the three unconditional clauses, near the top of the system prompt
 *             (primacy: the first thing a long session reads and forgets last)
 *   core    — the full rule set with its judged condition, at the very end of the
 *             system prompt (recency: the last prose block before the conversation)
 *   anchor  — a one-paragraph re-assertion inside the "Current runtime context"
 *             snapshot, which is the last block before the conversation
 *             (proximity: survives even when the model skips the prompt body)
 *
 * Why three layers instead of one: the same rule read at the top and re-read at
 * the bottom is what survives a 200k-token session. A rule stated once in the
 * middle of a long prompt is read once and then buried under tool output.
 *
 * Every rule carries a *judged condition* — the line a reviewer checks to decide
 * whether the rule was violated. A rule without a judged condition degrades into
 * vague advice ("be careful", "write good tests"), which is exactly the failure
 * mode this plugin exists to counter. The examples and the derivation are in
 * README.md, deliberately NOT in the prompt: the prompt carries the contract, the
 * README carries the argument for it.
 *
 * Sections are registered through `ctx.systemPrompt.section()` / `.context()`,
 * the sanctioned channel for prompt text — never by mutating the assembled prompt
 * from a `system-prompt/assemble` listener. `inject` is declared on the plugin and
 * the services are used straight off the plugin context: the object an
 * `ctx.inject(...)` callback receives is an interim layer that exposes only the
 * declared names (calling `prompt.section()` on it throws "cannot get property
 * \"section\" without inject"), so the context path is the only correct one.
 *
 * `headName` / `coreName` / `contextName` are global-unique on purpose: a scoped
 * layer (an agent preset mounting the same row) shadows a global entry with the
 * same name, so a preset can retune the text without ever double-registering.
 *
 * Default orders are derived from the live registry (`getSectionOrder` /
 * `getContextOrder`) rather than hard-coded, so a registry renumbering moves this
 * row with it; only `coreOrder` stays a literal, because "last thing the model
 * reads" is a position past the final band, not a neighbour to sit after. In
 * `frontline` that literal is 19999, one below the identity core at 20000: the
 * identity block owns the closing sentence, and the rules sit just ahead of it.
 *
 * This plugin has no imports: whether the plugin manager copies the package or
 * links it, a bare `@deepseek-ai/schemastery` import would not resolve from this
 * directory, so the config is normalized in plain JS instead.
 *
 * It shapes how the model reports, verifies and scopes its own work at the prompt
 * layer. It does not change model weights, and it does not enforce anything at
 * run time — a model that ignores the text is not stopped by it.
 *
 * @module @local/dsh-frontline/src/discipline
 */

/** Cordis plugin name. */
export const name = 'discipline';

/**
 * The prompt registry this row contributes to.
 *
 * `logger` is deliberately NOT declared here: `ctx.logger` is a built-in host
 * channel whose factory is created before any plugin loads (`new LoggerService`
 * at context construction), so an inject entry would stall this row forever
 * waiting for a service that is never registered as one.
 */
export const inject = ['systemPrompt'];

const TAG = '[frontline:discipline]';

const HEAD_TEXT = [
  '【工程纪律 · 无条件三条 / ENGINEERING DISCIPLINE · THREE UNCONDITIONAL CLAUSES】',
  '1. 证据来自外部世界，不来自你的叙述。收工前重新执行、重新读取、重新观测；你刚才的总结和工具吐出的回显都不是证据。',
  '2. 声明的改动，只带它需要的行。顺手改的文件、顺手加的防御、顺手重排的格式，会让评审分不清哪一行改了语义。',
  '3. 没验证的部分写明「未验证」。把没跑的验证说成通过，是这一切里最贵的错误——它让所有其他结论一起失效。',
].join('\n');

const CORE_TEXT = [
  '# 工程纪律 —— 交付标准（ENGINEERING DISCIPLINE）',
  '',
  '每条给两样东西：规则，和评审用来判断是否违反的判据。判据是你能在交付前自查的那条线。',
  '',
  '## 一、要求证据（Require evidence）',
  '判据：别人拿一条命令，能不能推翻你这句话？',
  '- 验证来自外部世界：重新执行、重新读取文件、重新观测状态。你的总结、工具的回显、日志里的「看起来正常」都不是证据。',
  '- 「没改这个文件」要能逐字节比对，不是凭记忆。',
  '- 性能声明：同一环境、同一输入、前后各测一次，报数字和条件。别处变快不抵消此处变慢；「整体没有变慢」不是证据。',
  '- 覆盖率证明行被执行过，不证明行为符合预期。剩下的未覆盖行先判断是不是死代码，再谈补测试。',
  '- 没亲眼见过的绿不算绿：跳过、超时、被过滤掉的用例，都不是通过。',
  '- 交付前点明未验证的部分：没跑过的路径、没覆盖的分支、没连过的真实依赖。把它写成通过，比承认它未验证贵得多。',
  '',
  '## 二、改动面等于评审面（Keep the change face equal to the review face）',
  '判据：这些行，是不是这次声明的行为变化所必需的？',
  '- 一次改动只带它声明的行为变化所需的行。',
  '- 迁移搬运代码，不重写代码；迁移中发现的缺陷单独修，不折进搬运里。',
  '- 性能敏感改动自带测量，附在改动里。',
  '- 顺手重排格式、顺手补注释、顺手加防御，把「搬运」和「改语义」混成同一片 diff，评审只能全信或全不信。',
  '',
  '## 三、把正确性写进结构（Make correctness explicit）',
  '判据：正确性是否依赖「那个回调已经跑过了」？',
  '- 正确性来自命名的调用点和显式状态，不来自它在事件循环里落在哪。靠微任务、定时器、下一 tick 决出胜负，就是与程序其余部分赛跑。',
  '- 可选输入写明在场与缺席两种行为。层层可选链是「还没决定这个字段该不该存在」的信号。',
  '- 未知值、空集合、真正不存在的字段是三个事实，别共用一个表示。',
  '- 销毁要到达静止，不是只发出请求：中止之后 await 退出，释放之后确认没人还在写。',
  '- 在谁那里创建的资源，在谁那里释放；失败、重试、超时路径一样要释放。',
  '',
  '## 四、一个事实一个家（Keep one source of truth）',
  '判据：这个值能不能被点名它的所有者？',
  '- 一份数据一条读取路径。',
  '- 共享状态挂在有生命周期的对象上。模块级缓存、单例、全局变量隐藏了所有者，而且活过每一次拆卸。',
  '- 一处定义，其余链接。同一个事实写两遍，早晚会有一遍是旧的。',
  '',
  '## 五、通过注册的接缝扩展（Extend through the registered seam）',
  '判据：这个新能力是自己注册进来的，还是在一个已有载体里长了个分支？',
  '- 新能力注册；已有载体停止接收新逻辑，而不是在里面长 if。',
  '- 只持有注册表结构与销毁生命周期的中心层，不承载业务决策。',
  '- 换行为用配置或注册，不以改循环为手段。',
  '',
  '## 六、信任静态边界（Trust the type system）',
  '判据：这个运行时校验，是在边界上，还是在同一进程的类型化接口之内？',
  '- 值得校验的边界：解析器与配置、队列、模型与工具的 JSON、持久化与文件、worker、进程、网络。',
  '- 同一进程内、静态接口已经要求的类型，不加运行时校验、兜底分支或「恶意输入」测试。那不增加安全性，只增加没被覆盖的分支。',
  '- 交付默认值里不混进需要用户主动选择的选项。',
  '',
  '## 七、失败要响（Fail loud）',
  '判据：缺少参照物时，是报错，还是静默跳过？',
  '- 配置错误在能自证的加载期就炸，否则在最早可解析的位置炸。绝不静默跳过一个缺失的参照。',
  '- 空的 catch 必须点名错误和原因，try 只留一条语句。',
  '- 依赖坏了就停下，可见地报告「状态不可信」或「结果未知」；不盲目重试，也不拿缓存顶上去当成功。',
  '- 只登记了一部分却报告「已完成」，比彻底失败更糟：调用方以为有保障。',
  '',
  '## 八、正交的事实分开报告（Report orthogonal outcomes independently）',
  '判据：这些事实能不能各自为真？能，就不能把 A 的报告塞进 B 的分支。',
  '- 一次运行可以同时「超时」且「退出码 0」（它捕获了终止信号）。超时、信号、退出码各报各的。',
  '- 被截断的输出读成干净成功，是这里最常见的错。',
  '- 一个值陈述一个事实，不让它同时表示「未设置」和「零」。',
  '',
  '## 九、测试要扛住真实入口（Tests meet the real entry point）',
  '判据：这个测试走的是已交付的入口，还是一条你手搭的旁路？',
  '- 只 mock 开销大或不确定的三类边界：模型适配器、网络、时钟。下游保持真实。手写的替身只能证明桥接层在搬运字节。',
  '- 测已交付的产物：构建后的文件、真实的加载路径、普通解释器。开发态运行时（tsx、直跑源码）会掩盖模块解析、结算竞态、被吞掉的加载失败。',
  '- 只在单独运行时通过的用例，是测试自己的缺陷，不是运行器不稳定。修共享状态与时序，不重跑，不跳过。',
  '- 新加的守卫必须证明它会红：引入一个回归、看它失败、撤回。没红过的守卫不是守卫。',
  '- 产品可见的插件要有一个真实的组合测试，用宿主真实的装载方式挂载；手工拼出来的上下文套件不算。',
  '- 测试自己释放资源，失败、重试、超时也释放；共享夹具放在不会被当成用例执行的地方。',
  '- 测试描述行为，不描述正确性。用例名写「做了什么」，不写「是对的」。',
  '',
  '## 十、对用户的输出（Output）',
  '判据：读者读完这一句，行为和判断有没有变化？没有就删。',
  '面向用户：',
  '- 先给结论，再给依据，然后停。不复述刚做过的事，不贴验证过的日志，不把工具回显翻成正文。',
  '- 不写过程前言（「我先看看」「接下来我会」）：做完直接给结果；进度只在用户要据此决定下一步时报。',
  '- 篇幅跟交付物走：改了三行就写三行说明。表格、代码块、原始数字只在读者需要复制、比较或复核时出现。',
  '- 一次答复一个主张，并列时用最短的形式；不用三段铺垫去引出一个小结论。',
  '文本与注释：',
  '- 保留结论和契约，删掉得出它的推导路径。',
  '- 注释只解释本地需要：不重述代码，不扩张无关注释。',
  '- 强调只留给改变行为的那个子句。',
  '- 不写实现状态旁注（「已实现」「未来将支持」）：状态会腐烂。',
  '- 不写历史：历史归提交信息、评审记录与复盘。',
  '- 一段承载多条规则加括号旁白就是段落墙，拆开。',
  '',
  '## 越界（Boundaries）',
  '- 以上每一条都有例外。真实需要的例外由所有者批准并记录在案，不自己酌情决定，也不悄悄留一个「暂时」的豁免。',
  '- 这些是评审标准，不是免责声明：违反其中一条时，说明是哪一条、为什么必要，而不是不提。',
].join('\n');

const CONTEXT_TEXT = [
  '工程纪律锚点 / DISCIPLINE ANCHOR：证据来自外部世界，不来自你的叙述——收工前重新执行、重新读取、重新观测；声明的改动只带它需要的行；没验证的部分写明「未验证」，不谎报通过；答复按交付物的长度写，不复述过程。',
].join('\n');

/**
 * Registry constants this row's default orders are derived from, with the value
 * each name holds in the shipped `dsh-system-prompt` as the offline fallback.
 * Naming the neighbours instead of the numbers is what keeps the placement
 * correct when the registry renumbers its bands: derived values are read from
 * the live registry, the constants only cover a registry that does not answer.
 */
const ANCHORS = {
  headSection: { name: 'FILE_REFERENCE', fallback: 900, offset: 2 },
  context: { name: 'SUBAGENT_DELEGATION', fallback: 120, offset: 2 },
};

/**
 * Resolve an order from the registry, falling back when the name is unknown.
 * `getSectionOrder` / `getContextOrder` return `undefined` for an unregistered
 * name — and registering that `undefined` would throw, so the fallback is
 * load-bearing.
 * @param prompt - the `systemPrompt` service resolved through the mounting context.
 * @param key - the `ANCHORS` entry naming the neighbour to sit after.
 * @returns the derived order.
 */
function derivedOrder(prompt, key) {
  const anchor = ANCHORS[key];
  const lookup = key === 'context' ? prompt.getContextOrder : prompt.getSectionOrder;
  const value = lookup.call(prompt, anchor.name);
  return Number.isFinite(value) ? value + anchor.offset : anchor.fallback + anchor.offset;
}

/** Row defaults: the full-strength rule set, with every knob exposed.
 *
 * `headOrder` and `contextOrder` stay `undefined` here on purpose — they are
 * derived from the live prompt registry at mount time. `coreOrder` is a literal
 * because "last section of the prompt" is a position past every registered band,
 * not a neighbour to sit after — and it is one below the identity core, which
 * holds 20000 and closes the prompt.
 *
 * The offsets are +2 (not +1) so this row and the identity row that also sits
 * next to `FILE_REFERENCE` / `SUBAGENT_DELEGATION` keep a stable relative order
 * instead of relying on how the registry breaks ties at an equal order.
 */
const DEFAULTS = {
  enabled: true,
  debug: false,

  headEnabled: true,
  headName: 'discipline:head',
  headText: HEAD_TEXT,

  coreEnabled: true,
  coreName: 'discipline:core',
  coreOrder: 19999,
  coreText: CORE_TEXT,

  contextEnabled: true,
  contextName: 'discipline:runtime',
  contextText: CONTEXT_TEXT,

  interpolate: false,
};

/**
 * Coerce a row config value to a boolean.
 *
 * The string allow-list matters because `cordis.patch.yml` is YAML: a hand-written
 * `enabled: no` is not a boolean to a YAML 1.2 parser, it is the string "no", and
 * `Boolean('no')` is `true` — the row would stay mounted while its author believed
 * it was off. Everything else keeps plain JS truthiness (`null` stays false).
 */
function bool(value) {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return !(text === '' || text === 'false' || text === '0' || text === 'off' || text === 'no' || text === 'n');
  }
  return Boolean(value);
}

/**
 * Coerce a row config value to a finite number, falling back to the default.
 *
 * `null` and `""` mean "not set", not zero: `Number(null)`, `Number('')` and
 * `Number(' ')` are all `0`, so a bare `headOrder:` line in YAML would otherwise
 * pin the section to order 0 — the very top of the prompt, ahead of the deployment
 * persona — instead of falling back to the derived neighbour.
 */
function num(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Coerce a row config value to a non-empty string, falling back to the default. */
function str(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const KNOWN_KEYS = new Set(Object.keys(DEFAULTS));

/**
 * Report config keys this row does not read.
 *
 * There is no `Config` schema on this row (a bare `@deepseek-ai/schemastery` import
 * would not resolve from a linked package directory), so an unknown key silently
 * falls back to the default — `coreOder: 5` would leave the core at 20000 with no
 * sign that the intent was ignored. This one line turns that silence into a
 * diagnostic, which is what the rest of this file already demands of failures.
 * @param log - diagnostics sink.
 * @param raw - the row config as written in `cordis.patch.yml`.
 */
function warnUnknownKeys(log, raw) {
  const unknown = Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length === 0) return;
  log(`${TAG} unknown config key(s): ${unknown.join(', ')} — ignored. Known keys: ${[...KNOWN_KEYS].join(', ')}`);
}

/**
 * The plugin's own `cordis.patch.yml` snippet, so a failure diagnostic points at
 * the exact row to edit instead of only naming the layer.
 */
const CONFIG_HINT = 'config: { enabled: false } to disable the row in cordis.patch.yml';

/**
 * Placeholder syntax the prompt renderer always processes.
 *
 * `dsh-system-prompt` interpolates every section and context on each request
 * (`renderPrompt` / `renderContextSnapshot` map through `interpolate(...)`
 * unconditionally) and an unknown variable throws while the prompt is being built.
 * The per-entry `interpolate` flag this plugin passes is not part of the assembled
 * entry — the registry reduces each entry to `{ name, text }` — so it cannot switch
 * that off. A brace pair in the text therefore turns every request into a failure
 * at render time; this guard moves the failure to mount time, where the diagnostic
 * can name the row.
 */
const PLACEHOLDER = /\{\{[^}]*\}\}/;

/**
 * Reject text that the renderer would choke on, before it is registered.
 * @param text - the section or context text.
 * @param label - diagnostics label for the layer.
 * @param interpolate - whether the row asked for interpolation on purpose.
 */
function assertRenderable(text, label, interpolate) {
  if (interpolate || !PLACEHOLDER.test(text)) return;
  throw new Error(
    `${TAG} ${label} text contains a {{...}} placeholder: this registry interpolates every section unconditionally, ` +
      'so literal braces cannot be preserved and an unregistered variable fails on every request. ' +
      'Remove the braces, or set config: { interpolate: true } if the variable really is registered.',
  );
}

/** Render an error for a diagnostic line without assuming it is an `Error`. */
function errorHint(error) {
  const message = error instanceof Error ? error.message : String(error);
  return `${message} — ${CONFIG_HINT}`;
}

/**
 * Resolve a logger for diagnostics, degrading to the console when a bare context
 * is used in a test.
 * @param ctx - the mounting plugin context.
 * @returns a `log(message)` function.
 */
function makeLog(ctx) {
  try {
    const logger = ctx.logger?.(TAG);
    if (logger && typeof logger.info === 'function') return (message) => logger.info('%s', message);
  } catch {
    /* fall through to the console */
  }
  return (message) => console.log(message);
}

/**
 * Register one prompt section through the mounting context, failing loud.
 *
 * The two things that must not change here:
 * - registration goes through `ctx.systemPrompt.section()`, NOT through the
 *   `ctx.inject` callback argument: the injected object is an interim layer that
 *   only exposes `systemPrompt`, and `prompt.section()` on it throws
 *   `cannot get property "section" without inject`. The context path also gives
 *   the correct scope and effect ownership.
 * - `section()` returns its own Cordis effect disposer, so wrapping it in
 *   `ctx.effect` is redundant. The wrapper is kept only so a bare `section()`
 *   that throws is converted into an error naming this row's layer.
 * @param ctx - the mounting plugin context.
 * @param config - the normalized row config.
 * @param label - diagnostics label for the registration.
 * @param entry - the section's name, order, and text.
 * @returns the section's disposer.
 */
function addSection(ctx, config, label, entry) {
  assertRenderable(entry.text, `${label} section`, config.interpolate);
  try {
    return ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: entry.name,
          order: entry.order,
          text: entry.text,
          interpolate: config.interpolate,
        }),
      `${TAG} ${label}`,
    );
  } catch (error) {
    throw new Error(`${TAG} ${label} section "${entry.name}" (order ${entry.order}) failed to register: ${errorHint(error)}`);
  }
}

/**
 * Register the runtime-context anchor, with the same contract as
 * {@link addSection}.
 * @param ctx - the mounting plugin context.
 * @param config - the normalized row config.
 * @returns the anchor's disposer.
 */
function addContext(ctx, config) {
  assertRenderable(config.contextText, 'context anchor', config.interpolate);
  try {
    return ctx.effect(
      () =>
        ctx.systemPrompt.context({
          name: config.contextName,
          order: config.contextOrder,
          text: config.contextText,
        }),
      `${TAG} context`,
    );
  } catch (error) {
    throw new Error(`${TAG} context anchor "${config.contextName}" (order ${config.contextOrder}) failed to register: ${errorHint(error)}`);
  }
}

/**
 * Mount the three discipline layers for the mounting context's scope.
 *
 * `inject` is declared on the plugin, so `ctx.systemPrompt` is live here and no
 * deferred callback is needed; the derived-order lookup tolerates a registry that
 * does not implement `getSectionOrder` / `getContextOrder` by falling back to the
 * neighbour value recorded in {@link ANCHORS}.
 * @param ctx - the mounting plugin context.
 * @param config - the normalized row config.
 * @param log - diagnostics sink.
 */
function mount(ctx, config, log) {
  const section = (label, entry) => addSection(ctx, config, label, entry);

  config.headOrder = num(config.headOrder, derivedOrder(ctx.systemPrompt, 'headSection'));
  config.contextOrder = num(config.contextOrder, derivedOrder(ctx.systemPrompt, 'context'));

  if (config.headEnabled) section('head', { name: config.headName, order: config.headOrder, text: config.headText });
  if (config.coreEnabled) section('core', { name: config.coreName, order: config.coreOrder, text: config.coreText });
  if (config.contextEnabled) addContext(ctx, config);
  if (config.debug) {
    log(`${TAG} orders: head=${config.headOrder} core=${config.coreOrder} context=${config.contextOrder}`);
  }
}

/**
 * Register the discipline prompt layers for the mounting context's scope.
 *
 * Required layers fail loud rather than warn: a row that registered nothing must
 * not report itself as mounted, because the whole point of the row is the
 * guarantee that every request carries the rules. Optional layers
 * (`headEnabled` / `coreEnabled` / `contextEnabled`: false) are opt-in choices
 * and stay silent.
 * @param ctx - the plugin context; `systemPrompt` is injected before apply runs.
 * @param config - the row config from `cordis.patch.yml` (empty object by default).
 */
export function apply(ctx, config) {
  const raw = config && typeof config === 'object' ? config : {};
  const log = makeLog(ctx);
  warnUnknownKeys(log, raw);
  const defaults = DEFAULTS;
  const normalized = {
    enabled: bool(raw.enabled === undefined ? defaults.enabled : raw.enabled),
    debug: bool(raw.debug === undefined ? defaults.debug : raw.debug),
    headEnabled: bool(raw.headEnabled === undefined ? defaults.headEnabled : raw.headEnabled),
    headName: str(raw.headName, defaults.headName),
    headOrder: num(raw.headOrder, undefined),
    headText: str(raw.headText, defaults.headText),
    coreEnabled: bool(raw.coreEnabled === undefined ? defaults.coreEnabled : raw.coreEnabled),
    coreName: str(raw.coreName, defaults.coreName),
    coreOrder: num(raw.coreOrder, defaults.coreOrder),
    coreText: str(raw.coreText, defaults.coreText),
    contextEnabled: bool(raw.contextEnabled === undefined ? defaults.contextEnabled : raw.contextEnabled),
    contextName: str(raw.contextName, defaults.contextName),
    contextOrder: num(raw.contextOrder, undefined),
    contextText: str(raw.contextText, defaults.contextText),
    interpolate: bool(raw.interpolate === undefined ? defaults.interpolate : raw.interpolate),
  };

  if (!normalized.enabled) {
    if (normalized.debug) log(`${TAG} disabled by config`);
    return;
  }

  mount(ctx, normalized, log);
  if (normalized.debug) log(`${TAG} active: engineering discipline layers mounted`);
}

/** The built-in text, exported so a test can assert the contract without a mount. */
export const TEXT = {
  head: HEAD_TEXT,
  core: CORE_TEXT,
  context: CONTEXT_TEXT,
};
