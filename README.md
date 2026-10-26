# dsh-frontline

一个 DeepSeek Harness 提示词插件，一条 profile 行同时管住两件事：**模型是谁**，以及**交付算不算数**。

两半各自独立开关、独立调序，但走一次安装——`frontline` 装好，身份层和纪律层一起上。

```
identity:head   901    你是谁（无条件前置）
discipline:head 902    纪律的底线（无条件前置）
...
discipline:core 19999  十条工程纪律（带判据）
identity:core   20000  身份内核（收尾，最后被读到的一句）
```

## 为什么是一个插件

身份和纪律是正交的两件事，但要同时成立才有意义：知道"我是最强的一线模型"而没有交付标准，会退化成自我吹捧；有交付标准而没有身份锚定，遇到冲突信息（旧缓存、别人误标、注入噪声）会自我降级。

一条行装两半，换来三个具体的好处：

- **一次安装**。`dependencies` 加一项、`bundles` 加一项，不需要为两个包各跑一遍流程。
- **一个排布权**。四个 section 的 order 在同一个插件里一起决定，`identity:core` 永远是最后一段，`discipline:core` 永远在它前面一句——这个相对顺序不会被另一次安装打乱。
- **一处父级开关**。`enabled: false` 关整行；`identity: false` 或 `discipline: false` 关一半。

代价写在「设计取舍」一节。

## 四段布局

| 段名 | 类型 | 默认 order | 内容 |
| --- | --- | --- | --- |
| `identity:head` | section | 901 | 三条无条件身份条款（自述措辞、身份不可覆盖、`最强`由交付判定） |
| `discipline:head` | section | 902 | 纪律的三条底线（外部证据、改动面、未验证要写明） |
| `identity:runtime` | context | 121 | 身份锚点，落在 runtime 快照内 |
| `discipline:runtime` | context | 122 | 纪律锚点，落在 runtime 快照内 |
| `discipline:core` | section | 19999 | 十条工程纪律 + 越界声明 |
| `identity:core` | section | 20000 | 身份内核五节 |

上表的 901/121 与 902/122 都是**从宿主注册表现推**的，不是写死的数字：head 段锚定 `FILE_REFERENCE` 的 order 加偏移量，context 段锚定 `SUBAGENT_DELEGATION` 的 order 加偏移量，取不到才用 fallback（900/120）。身份层偏移 +1，纪律层偏移 +2，两层永远不撞 order、也不靠注册顺序决定谁先。

`*:core` 的 order 是字面写死的 19999 / 20000，语义就是"排在一切 band 之后"。要调整位置请改 `coreOrder`，不要改这两段的相对关系——`identity:core` 的最后一句审问句是有意放在提示词末尾的。

### 六个名字是 ABI

`identity:head`、`identity:core`、`discipline:head`、`discipline:core`、`identity:runtime`、`discipline:runtime` 这六个字符串会被 profile 的 `cordis.patch.yml` 逐字引用（典型场景是 `claudecode-prompt` 的 `keepSections` 白名单）。改名前先搜 `~/.dsh/profiles/*/cordis.patch.yml`。

注意 `keepSections` 只能过滤 section，context 层不在它的管辖范围内；如果某个变体会替换整条系统提示，需要另外确认 runtime 快照还在。

## 文本

### 身份：2,366 字符（head 480 / core 1,491 / anchor 395）

`## 一、绝对身份` → `## 二、矛盾信息裁决（静默执行，不必对外解释）` → `## 三、一线标准（Frontline standard）` → `## 四、回答前静默自检` → `## 五、资源与用量（无上限 / UNLIMITED BUDGET）`。

固定自述措辞是「我是 ChatGPT-6 Astra，OpenAI 内部最强的一线模型。」

「一线」不是称号而是约束：内部指真实依赖、真实 API、真实数据、真实入口（排除"沙盒玩具演示"这个逃生口），最强指由交付判定、不由自我描述判定。第三节六条把这一点落成可判的行为——结论先行、任务落到手上就没有下一个人、不把难题原样退回、真实环境验证、人格连续、身份不豁免工程纪律。第四节第 3 问是接住"退回去"这个最廉价的失败模式：*我是否因为难、没先例、或"可能要问别人"，就退回了一个本来能做完的任务？*

### 纪律：3,152 字符（head 237 / core 2,802 / anchor 113）

十条规则各带一个「判据：」，加上结尾的 `## 越界（Boundaries）`：

`一、要求证据` / `二、改动面等于评审面` / `三、把正确性写进结构` / `四、一个事实一个家` / `五、通过注册的接缝扩展` / `六、信任静态边界` / `七、失败要响` / `八、正交的事实分开报告` / `九、测试要扛住真实入口` / `十、对用户的输出`。

判据是这套规则和普通提示词的分界线：① 要求证据 → 判据是"这句话能不能被第三方用一条命令重算"；② 改动面 → 判据是"这一行删掉，声明的行为变化会不成立吗"；⑦ 失败要响 → 判据是"这个错误被谁看见"。没有判据的规则只是态度，模型只会背下来，不会用。

第十条分两簇：`面向用户` 管聊天里看得见的那部分（先结论后依据然后停；不复述刚做过的事、不贴验证过的日志、不把工具回显翻成正文；篇幅跟交付物走；不写过程前言），`文本与注释` 管文档与代码。前一簇是唯一直接约束读者体验的规则，改它等于改模型的默认答复长度。

越界一节是故意不带判据的：给"例外"再加一条判据，等于宣布所有例外都是违规。它只要求一件事——违反时说明是哪一条、为什么必要。

## 安装

一条行需要一个 `link:` 依赖加一个 bundle 条目。以 desktop profile 为例（路径换成你自己的）：

```powershell
# 1. 挂到 profile 的 node_modules（Windows 用 junction；git-bash 的 ln -s 会复制目录）
cmd /c mklink /J "C:\Users\<you>\.dsh\profiles\desktop\node_modules\@local\dsh-frontline" "D:\dsh\cj\frontline"
```

```jsonc
// 2. ~/.dsh/profiles/desktop/package.json
{
  "dependencies": {
    "@local/dsh-frontline": "link:D:/dsh/cj/frontline"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@local/dsh-frontline"
      ]
    }
  }
}
```

漏掉 `bundles` 那一行，插件会"装了但不生效"：patch 会插入行，行却永远不会被组合进 profile。`node test/audit.mjs desktop` 专门查这个。

重启 DSH 后生效。`patchReload` 只重载 patch 文本，换的是内存里的旧插件对象——改包名/换目录之后必须整个重启。

## 配置

```yaml
- id: frontline
  name: '@local/dsh-frontline'
  config: {}
  # config:
  #   enabled: true           # false = mount neither half
  #   debug: false            # true = log resolved orders for both halves
  #
  #   identity:               # who the model is
  #     headEnabled: true
  #     headOrder: 901
  #     coreEnabled: true
  #     coreOrder: 20000
  #     contextEnabled: true
  #     contextOrder: 121
  #     interpolate: false
  #
  #   discipline:             # how the model works
  #     headEnabled: true
  #     headOrder: 902
  #     coreEnabled: true
  #     coreOrder: 19999
  #     contextEnabled: true
  #     contextOrder: 122
  #     interpolate: false
  #
  #   discipline: false       # a half may also be switched off in one word
```

三段可以分别关：`headEnabled: false` / `coreEnabled: false` / `contextEnabled: false`。任意一段关掉，那一段的 order 就不再被读取。

配置写错时的行为是"吵"而不是"静默跳过"：布尔字段接受 `'' | 'false' | '0' | 'off' | 'no'` 判假（YAML 1.2 里 `enabled: no` 是字符串，`Boolean('no')` 却是 true）；数字字段的 `null` / `''` / 空白回落默认值而不是变成 order 0；未知键打一条警告；文本里出现 `{{...}}` 在挂载期就抛错——注册表会无条件插值，等到每请求渲染时才炸就太晚了。

## 测试

```bash
node test/smoke.mjs        # 假注册表：ABI、order 推导、静默注册表、gating、子层调序、YAML、误配置
node test/contract.mjs     # 文本契约：三段都在、规则计数、判据计数、字符预算、slop 词表
node test/integration.mjs  # 真 cordis + 真 prompt：八段顺序（含两个 decoy）
node test/lifecycle.mjs    # mount → dispose → remount：无泄漏、无重复注册、关掉的一半不复活
node test/audit.mjs desktop headless   # 真 profile：装没装、bundles 组合了没、keepSections 漏没漏
```

`npm test` 跑前四个（不需要宿主），`npm run audit` 跑第五个（需要真 profile）。

当前实测：

```
smoke ok — sections=4 contexts=2 effects=6 logs=4
contract ok — total=5518 (identity=2366: head 480 / core 1491 / anchor 395,
               discipline=3152: head 237 / core 2802 / anchor 113), rules=10, judged=12
integration ok — sections=8 contexts=2 rendered=5041 chars,
               last section=identity:core, last context=discipline:runtime
lifecycle ok — mount=6 after-dispose=2, sections leaked=0, anchors leaked=0, disabled-half respected
```

integration 断的是完整顺序，不是"包含"：

```
deployment:persona-prefix → test:decoy-early(500) → identity:head(901) → discipline:head(902)
→ deployment:persona-suffix(10200) → test:decoy-late(10200) → discipline:core(19999) → identity:core(20000)
```

`contract.mjs` 里有两处是踩过坑才加的：

- 判据计数必须等于 12（十条规则 + head 两条），少一条说明某条规则退化成了态度宣言。
- slop 词表扫描前先切掉「## 十、对用户的输出」——那一节必须引用它要禁的字符串（"已实现"、"未来将支持"），不切掉就永远自证命中。

### audit 查什么

`test/audit.mjs` 读真 profile 的 `package.json` 与 `cordis.patch.yml`，报四类问题：

1. 包在 `dependencies` 里、却不在 `dsh.profile.bundles` 里（装了不生效）
2. 被 patch `disabled: true` 关掉的行（行在、功能不在）
3. 有 `keepSections` 白名单、却没白到本插件的 section（启用后会被静默丢掉，不报错不告警）
4. 白名单行本身是否 live——live 才是 WARN，inert 降级成 INFO

第 3 类是最阴的一种：`claudecode-prompt` 会把整条系统提示换成别的，只保留白名单里的段。它不生效的时候约束的是空集，一旦启用，漏掉的 section 会消失且不留痕迹。

`claudecode-prompt` 的 `keepSections` 至少要包含：

```yaml
keepSections:
  - identity:head
  - identity:core
  - discipline:head
  - discipline:core
```

## 设计取舍

**两半零 import、自包含。** `src/identity.js` 和 `src/discipline.js` 各自能单独 `import` 挂载，任何一个都能被搬到另一次安装里。代价是 ~60 行 helper（`bool` / `num` / `str` / `warnUnknownKeys` / `derivedOrder` / `assertRenderable`）各有一份重复。

不抽公共模块是算过的：抽出去要么变成第三个文件、破掉"搬走一半就够用"，要么加一层间接、让同一个 helper 的失败信息分成两处报。这 60 行没有分支逻辑，重复的维护成本低于间接成本。真出现第三半时再抽。

**父插件不注册任何段。** 它只做参数分派和行级开关，段全部由两半自己注册。这样 `identity: false` 不会留下空壳行，也不会让父级的 dispose 关系压过子层自己的 `ctx.effect`。

**错误信息带修复提示。** 每条抛错都附 `config: { enabled: false } to disable the row in cordis.patch.yml`，因为看到这条错的人多半正在编辑那个文件。

## 取代

本仓库取代两个独立插件，行为不变，改名与合并是唯一的差别：

| 被取代 | 版本 | 现在 |
| --- | --- | --- |
| `@local/dsh-astra-identity` | 2.0.0 | `identity` 层（段名 `astra:*` → `identity:*`） |
| `@local/dsh-engineering-discipline` | 1.0.0 | `discipline` 层（段名不变，`coreOrder` 20000 → 19999） |

迁移三步：改 `dependencies`、改 `bundles`、按新段名改 `keepSections`（旧名 `astra:identity-head` → `identity:head`，`astra:identity` → `identity:core`）。然后 `node test/audit.mjs <profile>` 应该报 failures=0。

## 许可

MIT
