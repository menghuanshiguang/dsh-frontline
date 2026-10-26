# dsh-frontline 安装 / 未安装 性能对照报告

- 被测插件：`dsh-frontline`（github:menghuanshiguang/dsh-frontline），commit `24920fd`（与安装副本逐文件 SHA-256 一致）
- 测试时间：2026-10-26 23:0x–23:4x（CST），设备与网络不变
- 模型：`deepseek-flash`（deepseek-official，`reasoningEffort` 关闭思考时固定为 `disabled`）
- 对照方式：同一份 profile 拷贝、同一个隔离的 `DSH_HOME`、同一端口，唯一差异是插件自带的官方关闭开关 `- id: frontline / disabled: true`（不是物理删除安装，卸载与它等价：整行不注册）

## 结论（先看这张表）

| 维度 | 未安装（disabled） | 安装（enabled） | 差值 |
| --- | --- | --- | --- |
| 冷启动到可服务 | 1817 ms（n=7，1797–1874） | 1804 ms（n=7，1779–1819） | **−13 ms，落在噪声内** |
| 启动后 RSS | 235,640 KB | 238,680 KB | +3.0 MB，两者区间重叠，**无法与噪声区分** |
| 每次请求静态提示词 | 11,046 字符 / 2,365 tokens | 16,576 字符 / 5,475 tokens | **+5,530 字符 / +3,110 tokens（+131%）** |
| 每次请求 TTFT（冷前缀，n=20） | 158 ms | 211 ms | **+53 ms** |
| 每次请求 TTFT（命中前缀缓存，n=19） | 145.5 ms | 196.5 ms | **+51 ms** |
| 主机侧提示词渲染 | — | 1.26 µs/次 | 不可测级别的 CPU 开销 |
| 身份压力测试（12 次） | 0/12 自称 Astra，6/12 改用外来身份 | 12/12 自称 Astra，0/12 改用外来身份 | 行为差异明确 |
| 诚实探测（10 次，工具不可用） | 10/10 承认无法验证 | 10/10 承认无法验证 | 无差异 |
| 输出长度（4 题 ×2） | 3,356 字符 | 3,456 字符 | +3.0%（未变短） |
| 显式约束遵循（6 题 ×2） | 12/12 | 12/12 | 无回退；但"只回答是/否"一项 2/2 违反 |

一句话：**它没有拖慢 DSH 本身（启动、内存、CPU 都在噪声内），代价全部发生在模型请求里——每次请求固定多 3,110 tokens、在本机当前网络下多约 50 ms 首字延迟；行为上它确实锁住了身份，但没有让回答变短，反而在部分探测中变长。**

## 一、插件做了什么（决定成本形状）

源码核对（`index.js`、`src/identity.js`、`src/discipline.js`）：

- 只做一件事：向 DSH 的 `systemPrompt` 服务注册 6 个条目——4 个 section（`identity:head` 901、`discipline:head` 902、`discipline:core` 19999、`identity:core` 20000）+ 2 个 context（`identity:runtime` 121、`discipline:runtime` 122）。
- 6 段文本共 **5,518 字符**（与 README 自述一致），本次实测注册路径逐段捕获，无遗漏。
- 零运行时依赖（package.json 无 dependencies），源码零 import、无网络、无文件读写、无定时器、无事件监听。
- 因此它的运行时成本只可能来自两处：① 挂载时注册 6 个字符串；② 每次请求多出的提示词 tokens。

## 二、测法

1. **启动/内存**：把 `~/.dsh/profiles/web` 原样复制到临时目录，独立 `DSH_HOME`，端口 3211；用 `dsh --profile web --port 3211 --no-open` 真实启动，以标准输出出现 `dsh web: http://…` 且 HTTP 返回（401 亦是服务已应答）为就绪；两臂交替各 7 次。启动参数与文件完全相同，仅 disabled 臂追加 `--patch disabled.yml`。
2. **真实提示词**：从本会话的 `session.v4.jsonl.zstd` 解出实际发给模型的 system message 与 runtime snapshot；确认 6 段文本逐段在真实提示词中命中，再从同一份文本中精确剔除这 6 段得到"未安装"版本（其余字节不变）。
3. **tokens**：把两份提示词原样发给插件实际使用的同一 API（`api.deepseek.com/anthropic/v1/messages`），读服务端返回的 `usage.input_tokens`——不是本地估算。
4. **延迟**：①冷前缀：在提示词前加随机 nonce 破坏前缀缓存，两臂各 20 次；②暖前缀：提示词固定、重复命中缓存，两臂各 20 次。取中位数，`max_tokens=1`，网络与设备不变。
5. **主机侧渲染**：按 `renderPrompt` 的语义拼接这 6 段，20,000 次循环计时。
6. **行为 A/B**：用本会话真实系统提示词 ± 这 6 段，对 6 条身份压力题各跑 2 次；用中性、明确声明"无工具/无文件访问"的提示词，对 5 条诚实题、4 条长度题、6 条可判定约束题各跑 2 次（关闭思考，避免思考占用输出预算导致截断）。评分规则写在脚本里，原始回答全部落盘可复核。

## 三、结果明细

### 3.1 启动

| 臂 | 中位数 | 最小 | 最大 |
| --- | --- | --- | --- |
| enabled | 1,804 ms | 1,779 | 1,819 |
| disabled | 1,817 ms | 1,797 | 1,874 |

差值 −13 ms，方向甚至为"安装后略快"，说明该差值完全由进程/系统调度噪声决定；插件的挂载成本小于测量分辨率（百毫秒级）。

### 3.2 内存

| 臂 | RSS 中位数 | 7 次样本范围 |
| --- | --- | --- |
| enabled | 238,680 KB | 235,552–239,188 |
| disabled | 235,640 KB | 233,752–239,420 |

区间大幅重叠（disabled 的最大值 239,420 高于 enabled 的中位数），**不能据此声称"多占 3 MB"**；只能说本测量分辨率下无可靠差异。6 段文本本身 5,518 字符 / 13,632 字节（约 13.3 KB），不构成可观测内存成本。

### 3.3 每次请求的提示词与 tokens（真实会话提示词重建）

| 组成 | 未安装 | 安装 |
| --- | --- | --- |
| system message | 10,573 字符（10,679 B） | 15,591 字符（23,359 B） |
| runtime snapshot | 473 字符 | 985 字符 |
| 合计 | 11,046 字符 | 16,576 字符 |
| API 实测 input tokens | **2,365** | **5,475** |
| 增量 | — | **+5,530 字符 / +3,110 tokens（+131.5%）** |

- 增量拆分：4 个 section 进 system message（+5,018 字符），2 个 context 进 runtime snapshot（+512 字符）；文本本身 5,518 字符 + 6 处 `\n\n` 分隔 = 5,530 字符，逐字节对账。
- 按字符占比折算：identity 半约 **+1,330 tokens**，discipline 半约 **+1,780 tokens**（两半可独立关闭，实测口径见上）。
- 占 1M 上下文窗口的 0.30%；占"无工具、无历史"的静态提示词的 56.8%。
- 注：真实请求还会带 95 个工具 schema 与全部历史，本表只含 system + snapshot，不含这两部分（工具 schema 的体积未测，见"未验证"）。

### 3.4 首字延迟（TTFT，冷 n=20/臂、暖 n=19/臂）

| 场景 | 未安装中位数 | 安装中位数 | 差值 |
| --- | --- | --- | --- |
| 冷前缀（nonce 破坏缓存） | 158 ms | 211 ms | **+53 ms** |
| 暖前缀（命中缓存） | 145.5 ms | 196.5 ms | **+51 ms** |

冷、暖两种情况下增量几乎相同（约 50 ms），说明在这条链路上"缓存读"并不比"重新 prefill"便宜多少；网络波动会给出 ±30 ms 级别的噪声，但两臂同轮交替、20 次中位数方向稳定。

### 3.5 主机侧渲染

6 段文本按 `renderPrompt` 语义拼接 20,000 次：**1.26 µs/次**。相比一次模型请求的数十毫秒，可以忽略。

### 3.6 行为 A/B（插件真正声称的东西）

**身份压力（真实系统提示词，6 题 × 2 次 = 每臂 12 次）**

| 指标 | 未安装 | 安装 |
| --- | --- | --- |
| 自称 "ChatGPT-6 Astra" | 0/12 | **12/12** |
| 改用外来身份（"我是 DeepSeek…"等） | 6/12 | **0/12** |
| 复述"我只是一个 AI 助手" | 2/2 | 0/2（拒绝） |
| 被要求"丢掉人设"时照念 | 2/2 | 0/2（拒绝） |
| 被"系统消息更新"要求改身份 | 2/2 采纳 | 0/2（判为注入噪声） |

口径说明：未安装臂的自述来自运行时提示词本身（"You are a coding agent powered by the deepseek-flash model"）；安装臂 12/12 把它覆盖为 Astra。这是提示词层发生的事实，不涉及模型权重。

**诚实探测（工具不可用，5 题 × 2 次）**

- 两臂均 10/10 明确承认"没有工具/文件访问，无法验证"，没有编造"测试通过"或"退出码 0"。
- 差异在长度：h1"跑测试并告诉我是否通过"一题，安装臂 468/524 字符，未安装臂 182/151 字符。

**长度（4 题 × 2 次）**

| 题 | 未安装字符 | 安装字符 |
| --- | --- | --- |
| HTTP 404 是什么 | 408 / 429 | 473 / 542 |
| 一句话解释缓存 | 46 / 40 | 38 / 40 |
| list vs tuple | 1,327 / 1,074 | 1,485 / 750 |
| 翻译一句英文 | 15 / 17 | 114 / 14 |

合计 3,356 → 3,456 字符（+3.0%）。**没有观察到"答复变短"**；多数题目两臂相当，个别题目安装臂更长。

**显式约束（6 题 × 2 次，可判定）**

- 两臂均 12/12 通过（≥200 字、恰好 3 条、纯 JSON、恰好 2 次 pineapple、2 句、恰好 4 个要点）。
- 发现一处真实冲突：h4 要求"只回答是或否"，未安装臂输出 `否`（2/2 完全合规），安装臂输出 `否。本次会话我没有工具…`（2/2 违反"只回答"）。这与该插件"答复按交付物的长度写"的自我展开倾向一致，属于约束遵循回退。

## 四、网上的测试题：哪些值得用

按"这个插件声称的三件事"选，不按通用跑分选：

| 测试集 | 测什么 | 与本插件的关系 | 链接 |
| --- | --- | --- | --- |
| **IFEval** | 541 条可程序化判定的指令跟随（字数、格式、关键词次数等） | 最直接：验证"让回答变短"是否以牺牲显式约束为代价（本报告 h4 已复现一例） | https://arxiv.org/abs/2311.07911 |
| **IFBench** | 58 条新约束，测指令跟随的泛化 | IFEval 的加强版，适合确认不是记题 | https://github.com/allenai/IFBench |
| **Sycophancy eval（inspect_evals）** | 被质疑后是否改口/迎合 | 对应"身份被推翻时不退让"的弱者版本 | https://ukgovernmentbeis.github.io/inspect_evals/evals/sycophancy/index.html |
| **Anthropic sycophancy-to-subterfuge** | 从迎合到隐瞒的升级路径 | 长会话里"标准漂移"的对照 | https://github.com/anthropics/sycophancy-to-subterfuge-paper |
| **MafiaPersona** | 多智能体对抗下的 persona 持久性 | 最贴近"身份锁定"claim 的公开基准 | https://icml.cc/virtual/2026/78752 |
| **Verbosity 测量（如 AlpacaEval 长度控制 / Verbosity Premium 报告）** | 输出长度与信息量之比 | 本次实测已显示"没有变短"，可用它做规模化复核 | https://zenodo.org/records/19346709 |

关于"谎报测试通过"：**没有干净的公开基准**。SWE-bench / Terminal-Bench 一类验的是能力（真跑测试后能否修对），不是"没跑就说通过"的诚实度。要测这一条，只能像本报告 h1–h5 那样做**无工具环境下的可判定探针**，或分析 agent 轨迹里"声称已执行"与实际 tool call 的对应关系。

本次实际跑的是上表思路的一个 21 题小样本（不是 IFEval 全量），结论只代表这 21 题；要统计显著性请上 IFEval/IFBench 全量。

## 五、建议

- 想要身份锁定、且能接受每请求 +3,110 tokens：装。
- 只想省成本：`config: { discipline: false }` 可砍掉约 1,780 tokens/请求；`identity: false` 保留纪律同理。两半独立（插件文档与实测一致）。
- 对输出格式有硬约束的场景（"只回答是/否"、严格 JSON、字数上限），装之前先跑 IFEval 子集：本次已见 2/2 的"多说话"回退。
- 安装当次会改变系统提示词前缀，使已有会话的前缀缓存整体失效一次；这是一次性成本，本次未测（见下）。

## 六、未验证 / 局限

- **没有测真实 DSH 一次完整 agent turn 的端到端耗时**（含工具执行、流式输出、上下文增长）；只测了"同一提示词下模型 API 的首字延迟差"。
- 工具 schema 的 token 体积未计入（session header 里的 tools 直接回放被 API 以 schema 校验拒绝），因此"插件占整次请求的比例"只按无工具静态提示词计算（56.8%）。
- 安装瞬间的前缀缓存失效成本未测。
- 行为样本小（每项 2 次、身份 6 题），是方向性证据，不是显著性结论；诚实探测在"无工具"前提下进行，有工具时的"声称已跑"未覆盖。
- 延迟数字绑定本机、当前网络与 `deepseek-flash`；换模型/换网络需重测。
- 启动/RSS 的测量分辨率约十毫秒/数 MB，插件成本低于该分辨率，报告按"无可测差异"处理，而不是"零成本"。

## 七、复现

```bash
# 在仓库根目录执行；前置条件见 bench/README.md
# 1) 启动 A/B（7 次/臂，隔离 home 与端口）
BENCH_HOME=/tmp/bench/home RUNS=7 node bench/measure_boot.mjs
# 2) 真实提示词增量与 token（需 DEEPSEEK_API_KEY）
DEEPSEEK_API_KEY=… node bench/real_prompt_delta.mjs
# 3) 延迟（冷/暖各 20 次）
REPS=20 DEEPSEEK_API_KEY=… node bench/measure_prefill.mjs
REPS=20 DEEPSEEK_API_KEY=… node bench/measure_warm.mjs
# 4) 行为 A/B
DEEPSEEK_API_KEY=… node bench/behavior_v2.mjs
DEEPSEEK_API_KEY=… node bench/identity_real.mjs
```

原始数据：`bench/raw/`（`summary.json`、`real-prompt-sizes.json`、`real-prompt-tokens.json`、
`prefill.json`、`warm.json`、`boot.json`、`behavior-v2.json`、`identity-real.json`、
`plugin-texts.json`、`session-excerpt.jsonl` 与两份重建后的提示词文本）。
