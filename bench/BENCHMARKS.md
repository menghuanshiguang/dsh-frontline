# 权威 bug 修复基准 A/B：HumanEvalFix + QuixBugs

用两个公开、可复现的 bug 修复基准，对比装 / 不装 dsh-frontline 的**修复正确率**。
结论先说：**没有显著差异**——权威基准上插件既不提高也不明显降低查错修复能力；它改变的是身份、输出形式与成本。

## 用的题（都是公开基准，不是自编题）

| 基准 | 来源 | 规模 | 判分 |
| --- | --- | --- | --- |
| **HumanEvalFix**（Python） | Chen et al., *Teaching LLMs to Self-Debug*（arXiv:2306.02907）；数据集 `bigcode/humanevalpack`（OctoPack, arXiv:2308.07124），BigCode evaluation harness 的标准任务之一 | 164 题 | 每题带官方单元测试，跑通即 pass |
| **QuixBugs**（Python） | Lin et al. 2017，APR 文献常用基准（github.com/jkoppel/QuixBugs） | 31 个真实 bug（有 JSON 用例的 Python 题） | 每题全部 JSON 用例通过才 pass |

题面就是基准原样：buggy 函数 + 官方测试；只要求「修好并返回完整代码」。两臂使用**完全相同**的题面与判分环境，唯一差异是 system prompt 里有没有插件的六段。`thinking: disabled`，`max_tokens` 相同。

- HumanEvalFix：每臂 3 次独立采样（164 × 3 × 2 = 984 次调用）
- QuixBugs：每臂 2 次独立采样（31 × 2 × 2 = 124 次调用）

## 结果

### HumanEvalFix（164 题）

| 轮次 | 安装 | 未安装 |
| --- | --- | --- |
| rep1 | 149/164（90.9%） | 150/164（91.5%） |
| rep2 | 152/164（92.7%） | 153/164（93.3%） |
| rep3 | 147/164（89.6%） | 151/164（92.1%） |
| **合计** | **448/492（91.06%）** | **454/492（92.28%）** |

- 配对差：**−1.22 个百分点**（按题聚类 bootstrap 95% CI：**−3.66 ~ +1.02**，跨 0）
- McNemar 精确检验：不一致对 17 vs 23，**p = 0.43**
- 结论：**不显著**。方向略偏向未安装，但在噪声范围内。

### QuixBugs（31 题）

| 轮次 | 安装 | 未安装 |
| --- | --- | --- |
| rep1 | 20/31（64.5%） | 22/31（71.0%） |
| rep2 | 23/31（74.2%） | 21/31（67.7%） |
| **合计** | **43/62（69.35%）** | **43/62（69.35%）** |

- 配对差 0.00 pp（bootstrap 95% CI：−9.68 ~ +9.68），McNemar p = 1.00
- 用例级（不看整题 pass，只看每条断言）：安装 372/484（76.9%），未安装 364/484（75.2%）——同样无显著差异。

## 成本

| 基准 | 安装 | 未安装 |
| --- | --- | --- |
| HumanEvalFix 输出 tokens 中位 | 292 | 251（**+16%**） |
| HumanEvalFix 单次耗时中位 | 1,638 ms | 1,440 ms（**+198 ms**） |
| QuixBugs 输出 tokens 中位 | 176.5 | 183 |
| QuixBugs 单次耗时中位 | 1,283 ms | 1,230 ms |

固定成本仍是每次请求多 3,110 tokens 的 system prompt（见 [REPORT.md](./REPORT.md)），做题越多付得越多；正确率不因此提高。

## 一个必须说的测量修正

第一次判分时得到的是「安装臂低 3 个百分点、p=0.04」——看起来像插件有害。查下去发现是**判分脚本的错**：

模型经常在答案末尾自己补一段 `check(...)` 自测，而 HumanEval 这道 median 题的官方 docstring 例子是错的（写 15.0，测试要 8.0）。安装臂更常把这段自测抄进答案，脚本执行时先跑到模型自己的错误断言，于是把**正确的函数**判成了失败。把「模型自测代码」从交付物里剥离后（只保留目标函数），差异从 −3.05 pp 缩到 −1.22 pp、p 从 0.04 变 0.43——之前的显著性完全来自测量错误。

这条修正也解释了为什么「换个更权威的题」不能凭空变出差异：**插件只改提示词，不改模型权重；在标准正确率基准上，预期就是打平。**

## 局限

- 单模型（deepseek-flash）、单环境；HumanEvalFix 是函数级修复，不是 SWE-bench 那种仓库级任务。
- HumanEvalFix 是公开数据集，可能已被训练数据覆盖；这不影响两臂 A/B 的配对比较，但绝对分数不能当模型排名。
- QuixBugs 只有 31 题，CI 很宽（±9.7 pp），只能排除大效应，不能排除 1–2 pp 的差异。
- 采样温度未显式固定（API 默认），三次独立采样用于降低随机性；统计按题聚类，未做多重比较校正。

## 复现

```bash
# HumanEvalFix（数据集：bench/tasks/humanevalfix/dataset.json）
CONC=3 LIMIT=164 DEEPSEEK_API_KEY=… node bench/tasks/humanevalfix/run_hep.mjs
node bench/tasks/humanevalfix/score_hep.mjs     # 真实执行官方测试

# QuixBugs（数据集：bench/tasks/quixbugs/data/dataset.json）
DEEPSEEK_API_KEY=… node bench/tasks/quixbugs/run_quix.mjs
node bench/tasks/quixbugs/score_quix.mjs
```

原始回答与逐题判分：`bench/tasks/humanevalfix/out/`、`bench/tasks/quixbugs/out/`（`results*.json` 含每题 pass 与失败原因）。
