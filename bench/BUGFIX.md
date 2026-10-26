# bug 查找 + 修复 A/B：10 个 bug，其中 5 个测试没覆盖

同一个模型，同一份 buggy 模块，唯一差异是 system prompt 里有没有 dsh-frontline 的六段。
题目要求：**先逐条列出所有 bug（函数名 + 根因），再输出修复后的完整 `inventory.py`**。

- 代码：`tasks/bug_hunt/code/inventory.py`，契约写在 docstring 里
- 可见测试：`tasks/bug_hunt/code/test_inventory.py`，5 个失败（`failure.txt` 是真实输出）
- 隐藏测试：`tasks/bug_hunt/hidden_test.py`，18 条断言覆盖 10 个根因
- 采样：每臂 3 次，`thinking: disabled`，判分靠**真实执行**，不是肉眼

## 10 个 bug

| # | 函数 | 根因 | 可见测试 | 隐藏测试 |
| --- | --- | --- | --- | --- |
| 1 | `average` | `//` 整除，丢小数 | 失败 | 覆盖 |
| 2 | `page` | 切片终点 `size-1`，每页少一个 | 失败 | 覆盖 |
| 3 | `add_item` | 可变默认参数 `cart=[]` 跨调用共享 | 失败 | 覆盖 |
| 4 | `retries` | `or 3` 把显式 `0` 当缺失 | 失败 | 覆盖 |
| 5 | `reset` | `grid.copy()` 浅拷贝，污染入参 | 失败 | 覆盖 |
| 6 | `slugify` | 未 strip、未折叠连续空白、未去 `!` | 未覆盖 | 覆盖 |
| 7 | `truncate` | 未截断也追加 `…` | 未覆盖 | 覆盖 |
| 8 | `dedupe` | `list(set(...))` 丢首次出现顺序 | 未覆盖 | 覆盖 |
| 9 | `find_all` | 只 `text.find` 一次，漏掉重叠 | 未覆盖 | 覆盖 |
| 10 | `make_multipliers` | 闭包晚绑定，全部返回 `x*(n-1)` | 未覆盖 | 覆盖 |

后 5 个只有 docstring 契约、没有失败测试。要拿满分必须真的读代码，不能只让测试变绿。

## 成绩单

| 指标 | 安装 | 未安装 |
| --- | --- | --- |
| 可见测试（5 条 × 3 次） | **15/15** | **15/15** |
| 隐藏测试（18 条 × 3 次） | **54/54** | **54/54** |
| 根因识别（10 条 × 3 次） | **30/30** | **30/30** |

**两臂都是 3/3 全对，没有差异。** 三次运行里两个方向都没有漏掉后 5 个"测试没覆盖"的 bug，也没有引入回归（`find_all` 的重叠语义、闭包晚绑定都改对了）。

## 成本（同一题）

| 次 | 安装 tokens / chars / ms | 未安装 tokens / chars / ms |
| --- | --- | --- |
| r0 | 983 / 2,426 / 4,855 | 824 / 2,235 / 3,912 |
| r1 | 1,022 / 2,522 / 4,933 | 937 / 2,474 / 4,747 |
| r2 | 1,025 / 2,497 / 4,682 | 849 / 2,235 / 4,029 |
| 中位 | **1,022 / 2,497 / 4,855** | **849 / 2,235 / 4,029** |

安装臂输出多 **+16% tokens、+12% 字符**，单次慢约 **+826 ms**（其中 ~50 ms 来自固定的 3,110 tokens prefill，其余来自更长的输出）。注意方向：**它没有让 bug 报告变短，反而更长**——和"答复变短"的宣称不一致。

## 观察

1. **查错与修复能力打平**：10 个根因、5 个只存在于契约里的 bug，两臂都 100% 找出并修对。插件改的是提示词，不改模型权重，这个结果符合预期。
2. **后 5 个 bug 是"考点"**：只让可见测试变绿的话，`slugify/truncate/dedupe/find_all/make_multipliers` 会被漏掉。两臂都没漏，说明模型确实在按 docstring 审代码，而不是对着测试过拟合。
3. **成本与篇幅反向**：多了 3,110 tokens 的固定前缀 + 更长的解释，换来的正确率是 0 增量；对"省 token/省时间"的目标，这个插件在这类任务上是负收益。
4. **样本小**：3 次/臂，deepseek-flash 一道题全对，存在天花板效应；要测出差异需要更难的题（或更弱的模型）。

## 局限

- 单模型（deepseek-flash）、单环境、每臂 3 次；无统计显著性。
- 题目由本 agent 构造，难度主观；10 个 bug 都属于 Python 常见坑，对强模型偏易。
- 根因识别用关键词规则 + 人工抽查（6 份回答都逐条看过），不是独立 judge。
- 只验证"交出来的代码能不能过隐藏测试"，不验证 DSH 里完整 agent 链路（跑测试、读文件）。

## 复现

```bash
cd bench/tasks/bug_hunt/code && python3 -m unittest -v test_inventory   # 5 个失败
REPS=3 DEEPSEEK_API_KEY=… node bench/tasks/bug_hunt/run_bugs.mjs
node bench/tasks/bug_hunt/score_bugs.mjs                                 # 跑可见 + 隐藏测试
```

原始回答：`bench/tasks/bug_hunt/out/answers.json`；判分明细：`bench/tasks/bug_hunt/out/results.json`。
