# bench —— dsh-frontline 实测（2026-10-26）

对 `dsh-frontline` 做的一次独立 A/B 测量：装（`enabled`）与不装（插件的官方开关
`- id: frontline / disabled: true`），除这一行外 profile 完全相同。

- 被测版本：`24920fd`（与安装到 `~/.dsh/profiles/web/node_modules/@local/dsh-frontline`
  的副本逐文件 SHA-256 一致）
- 环境：Android / Termux 内 DSH `0.14.x`、Node v24.18.0、模型 `deepseek-flash`
- 完整报告：[REPORT.md](./REPORT.md)

## 一句话结论

不拖慢宿主：启动 −13 ms（噪声内）、RSS 无可分辨差异、主机侧渲染 1.26 µs/次。
真正的成本在每次模型请求：**+5,530 字符 / +3,110 tokens / +53 ms 首字延迟**。
行为上身份锁定生效（12/12 vs 0/12），但没有观察到"答复变短"，且出现一处显式约束回退
（"只回答是/否"2/2 违反）。

## 文件

| 路径 | 内容 |
| --- | --- |
| `REPORT.md` | 完整报告（方法、数字、局限、网上测试题清单） |
| `extract_texts.mjs` | 挂载插件、捕获它注册的 6 段提示词 |
| `measure_boot.mjs` | 真实启动 A/B（同一 profile 拷贝 + 独立 DSH_HOME） |
| `real_prompt_delta.mjs` | 从真实会话记录重建 system prompt / runtime snapshot，算字符与 token 差 |
| `measure_prefill.mjs` | 冷前缀 TTFT A/B（nonce 破坏缓存） |
| `measure_warm.mjs` | 命中前缀缓存的 TTFT A/B |
| `measure_render.mjs` | 主机侧拼提示词的 CPU 成本 |
| `behavior_v2.mjs` | 21 题行为 A/B（身份 / 诚实 / 长度 / 约束），中性无工具底座 |
| `identity_real.mjs` | 真实 system prompt 上的 6 条身份压力题 A/B |
| `patches/disabled.yml` | 官方关闭开关的 overlay |
| `raw/` | 全部原始数据：`summary.json`、token/延迟/启动采样、逐题回答、两份提示词 |

## 复现

前置：可用的 DSH 安装（`DSH_BIN`）、`dsh-node` 启动器（`DSH_NODE`，Android 上
`process.execPath` 被 linker 污染时必需）、`DEEPSEEK_API_KEY`；延迟/行为脚本需要能访问
`api.deepseek.com`。

```bash
# 0) 捕获插件注册的文本（PLUGIN_ROOT 指向插件包目录）
PLUGIN_ROOT=$HOME/.dsh/profiles/web/node_modules/@local/dsh-frontline \
  node bench/extract_texts.mjs

# 1) 启动 A/B：需要一份 profile 拷贝到 $BENCH_HOME/profiles/web
BENCH_HOME=/tmp/bench/home RUNS=7 node bench/measure_boot.mjs

# 2) 真实提示词增量与 token（session-excerpt.jsonl 是真实会话两条记录的最小摘录）
DEEPSEEK_API_KEY=… node bench/real_prompt_delta.mjs

# 3) 延迟（冷 / 暖）
REPS=20 DEEPSEEK_API_KEY=… node bench/measure_prefill.mjs
REPS=20 DEEPSEEK_API_KEY=… node bench/measure_warm.mjs

# 4) 行为 A/B
DEEPSEEK_API_KEY=… node bench/behavior_v2.mjs
DEEPSEEK_API_KEY=… node bench/identity_real.mjs
```

说明：

- `behavior_v2.mjs` / `identity_real.mjs` 用 `thinking: {type: "disabled"}`，避免思考 token
  吃掉输出预算导致截断；`max_tokens` 每题单独设置。
- 延迟脚本用 `max_tokens=1` 只测首字时间；冷前缀靠请求开头的随机 nonce 破坏缓存。
- 原始 `session.jsonl`（完整会话）不随仓库分发；仓库里是与测量相关的
  `raw/session-excerpt.jsonl`（system message + 第一条 runtime snapshot）。
- 行为样本为每项 2 次、共 21 题，是方向性证据，不是显著性结论。
