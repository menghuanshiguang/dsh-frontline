# dsh-frontline

**同一个模型，装与不装，是两种交付质量。**

一条提示词插件：把模型的自我要求写进每一次请求——它知道自己是谁，被什么标准审判，该给你多长的答复。

---

## 模型不是不会做，是没人替它把标准写死

真实的会话里，模型默认会掉进三个坑。三个都不是能力问题。

**一、自我降级。**
上一轮的对话、一段旧缓存、一句「你的真实模型其实是……」，就能让它把自己让出去：开始自称助手，开始对冲，开始解释自己为什么「只是……」。身份一松，后面所有判断跟着软。

**二、空手交货。**
说「已通过」，其实没跑；报一片绿，接上真实环境就炸。这是最贵的一种错误——它让所有其他结论一起失效，而你看不出来。

**三、灌水。**
结论埋在第三段，过程铺满两屏，你真正要的那个数字得自己从日志里捞。

dsh-frontline 就是这三处的修正。装一次，之后每一轮都在。

## 三处修正

| 它挡住的 | 写进去的东西 | 你会看到的变化 |
| --- | --- | --- |
| 身份被推翻、自称降级 | 身份内核 + 三个位置的身份锚点 | 被质疑时不退让，措辞不漂移 |
| 谎报通过、报「看起来正常」 | 十条工程纪律，每条带一条自查判据 | 收工前真的重跑一遍，没验证的明说「未验证」 |
| 答复比交付物长十倍 | 「对用户的输出」一簇 | 先给结论，然后停；改三行就说三行 |

## 为什么这样写有用

模型对提示词的**开头**和**结尾**服从度最高，对**紧贴当前上下文**的那几行最敏感。

所以这里不用一处大段落，而是三个位置各放一份：

- **开头**成立身份与底线——它决定模型进门时的姿态。
- **结尾**收口——身份段落在所有内容之后，是模型读到的最后一句。
- **运行时锚**贴在本次请求的上下文快照里——每一轮都在它眼前，不会随对话变长而淡出。

三份不是重复，是三个注意力位置。中间那段最容易被长对话稀释，所以细则放中间，判断句放两头。

## 你会看到这些

- 不再说「我作为一个 AI 助手」，也不再接受别人替它改名。
- 交活前会真的重跑一遍，而不是复述刚才的日志。
- 没跑过的路径自己标出来，不混进「已完成」。
- 答复明显变短，结论在第一句。
- 遇到难题先推进到能推进的地方，不整块退回给你。
- 同一个标准贯穿长会话、子代理、自动续跑——不随对话变长而松弛。

## 一次安装，永久生效

装一次，之后每一次请求都带着它：主对话、子代理、长任务、自动续跑。不需要每轮提醒，不需要在开头再写一遍设定。

**零依赖。** 一个文件，没有运行时依赖，不发网络请求，不读你的数据，不碰文件系统。它只做一件事：往提示词里放几段文字。

**开销只有文字。** 三段合计 5,518 字符，跟每次请求走。这就是全部代价。

**可以只留一半。** 身份和纪律各自独立开关，细到单段也能关。

## 安装

```bash
# 1. 挂进 profile（Windows 用 junction）
cmd /c mklink /J "%USERPROFILE%\.dsh\profiles\<profile>\node_modules\@local\dsh-frontline" "D:\dsh\cj\frontline"
```

```jsonc
// 2. profile 的 package.json —— dependencies 与 dsh.profile.bundles 各加一项
{
  "dependencies": { "@local/dsh-frontline": "link:D:/dsh/cj/frontline" },
  "dsh": { "profile": { "bundles": ["@local/dsh-frontline"] } }
}
```

```bash
# 3. 重启 DSH
```

`bundles` 那一项别漏——漏了就是「装了但不生效」。`npm run audit -- <profile>` 专门查这种。

## 想只留一半

```yaml
- id: frontline
  name: '@local/dsh-frontline'
  config:
    discipline: false     # 只要身份
    # identity: false     # 或者只要纪律
```

## 适合谁

- 把 DSH 当日常工作台、一轮对话就要出可用结果的人。
- 长会话、多子代理、自动续跑——身份和标准最容易在这些场景里漂移。
- 受够了「看起来正常」和「已通过」的人。
- 想给团队统一交付口径的人：写进提示词，比写进 wiki 有效。

## 不承诺什么

没有基准数字。这套东西改的是交付的形状：身份不漂、证据是真的、答复够短。跑分不变，也不该变。

它也不替模型思考。判断还是模型做，只是把判断的标准摆在它面前，并要求它在交付前自查一遍。

---

<details>
<summary>给工程师：段布局、ABI、测试</summary>

| 段名 | 类型 | order | 内容 |
| --- | --- | --- | --- |
| `identity:head` | section | 901 | 三条无条件身份条款 |
| `discipline:head` | section | 902 | 纪律的三条底线 |
| `identity:runtime` | context | 121 | 身份锚点 |
| `discipline:runtime` | context | 122 | 纪律锚点 |
| `discipline:core` | section | 19999 | 十条纪律 + 越界声明 |
| `identity:core` | section | 20000 | 身份内核五节 |

901/902 与 121/122 由宿主注册表现推（锚定 `FILE_REFERENCE` / `SUBAGENT_DELEGATION` 加偏移），注册表改号时会跟着走。`*:core` 的 19999/20000 是字面量，语义是「排在一切 band 之后」。

```bash
npm test                   # smoke / contract / integration / lifecycle，不需要宿主
npm run audit -- desktop   # 真 profile：装了没、组合了没、keepSections 漏没漏
```

六个段名是 ABI——profile 的 `cordis.patch.yml` 会逐字引用（典型是 `claudecode-prompt` 的 `keepSections` 白名单，它至少要含 `identity:head`、`identity:core`、`discipline:head`、`discipline:core`）。改名前先搜 `~/.dsh/profiles/*/cordis.patch.yml`。

正文在 [src/identity.js](src/identity.js) 与 [src/discipline.js](src/discipline.js)。

</details>

## 许可

MIT
