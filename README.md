# deep-feynman

一个 Codex Skill：用费曼学习法带人真正学懂一个主题。

费曼学习法大多数人只做了前半段——讲一遍，感觉懂了，结束。真正起作用的是后半段：合上材料自己讲，然后被人戳穿哪里其实没懂。这个 skill 就是把后半段补上。

讲完不算完。得让学习者闭卷复述，用一组探针找出他自以为懂、其实没懂的地方，回源补上，反复到每个概念都过得了四道门，才允许写笔记。

## 安装

skill 源码在仓库的 `skills/ai-feynman/`。装到 Codex 的用户级 skill 目录：

```powershell
# Windows PowerShell
$dst = "$env:USERPROFILE\.codex\skills\ai-feynman"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Recurse -Force .\skills\ai-feynman\* $dst
```

```bash
# macOS / Linux
mkdir -p ~/.codex/skills/ai-feynman
cp -R skills/ai-feynman/. ~/.codex/skills/ai-feynman/
```

装完重启会话即可。skill 目录里没有任何绝对路径依赖，仓库内的 `skills/ai-feynman/` 和 `~/.codex/skills/ai-feynman/` 内容完全一致，改哪边都行（改完记得同步另一边）。

## 快速开始

在 Codex 里直接说：

```
/ai-feynman 教我 X
/ai-feynman 帮我搞懂 packages/react-reconciler 的 lane 模型
/ai-feynman 检验我懂不懂 RFC 9110 的缓存章节
```

也可以手动驱动脚本（cwd 得在项目根，工作区才会落在 `feynman/` 下）：

```bash
node ~/.codex/skills/ai-feynman/scripts/feynman.mjs status <slug>
```

`status` 最后那行 `NEXT:` 就是下一步该干什么，按它走就行。脚本输出的 `NEXT:` 行里带的是可直接复制的完整命令，优先照它执行。

## 七阶段状态机

| Phase | 做什么 | 出口条件 |
|---|---|---|
| 0 定标 | 把模糊主题拆成可证伪的概念清单 | 每个概念都有非空 `pass_criteria` |
| 1 取证 | 从一手信源抓证据，登记进 `sources.md` | 每概念 ≥1 个 T1 信源，拿不到的标 `信源不足` |
| 2 深讲 | 五层讲解：本质→类比→机制链→边界→误解 | `bank --check` 通过 + AI 自检通过 |
| 3 复述 | 翻转角色，学习者闭卷讲 | 闭环从这里开始 |
| 4 挑漏 | 对照四道门判分，用九检测器归类 gap | `record` 落账 |
| 5 回源 | 给精确坐标（行号/章节/锚点），只对失败概念重出卷 | 无未闭合致命 gap，各概念 mastery ≥ 0.8 |
| 6 固化 | 写 `notes.md` + 可视化图 | — |

### 四道门

判分不看「说得对不对」，看四道门过了几道：

- **G1 无术语复述** — 不用领域词汇能讲清是什么
- **G2 机制链** — 因果链每一步都有主语和动作，没有「然后就…」
- **G3 边界** — 说得出什么时候失效、代价是什么
- **G4 反例存活** — 面对反例或替代设计，原理解不崩

`score 2` 必须四道门全过，`1` 只过 G1+G2，`0` 是 G1/G2 缺了。

### 九类理解幻觉检测器

术语遮蔽 / 跳步 / 伪因果 / 边界失守 / 类比反噬 / 鹦鹉学舌 / 粒度错配 / 事实错误 / 未验证。

每个 gap 都得归到其中一类，并且摘学习者原话；「理解不足」这种空泛结论不收。

## 五条铁律

1. **教练阶段不给答案。** Phase 3–5 不透露正确答案，包括拆成「提示」分次喂、用反问暗示——给出答案的那一刻学习就结束了，而学习者会以为自己懂了。卡死时改用**窄带重讲**。
2. **不凭记忆讲解。** 数字、默认值、名称、顺序、API 签名、版本行为、因果关系，都必须本次实读。记忆与抓取冲突时信抓取；查不到就标 `未知`。
3. **致命 gap 未闭合，不能进入 Phase 6。** 脚本用 mastery 封顶 `0.4` 兜底，封顶的触发条件由两道校验保证：severity 必须与 score 绑定（`score 0` 不能标「细节」绕过去），`resolves` 里的 gap 必须属于本轮实际考过的概念。内容判定仍由模型负责，脚本只管结构自洽。
4. **判分不放水。** 为了鼓励而放水，会让 mastery 与 SM-2 排期失真，且不可逆。`score 2` 必须四道门全过，每题都要给出 `gates: {G1,G2,G3,G4}` 四门布尔，脚本会校验它与 score 是否自洽。
5. **一次一个追问。** 一次抛多个问题，学习者会挑最容易的答，gap 就被掩盖了。

## 仓库结构

```
skills/ai-feynman/            skill 源码（可整目录拷进 ~/.codex/skills/）
├── SKILL.md                  状态机主文档
├── agents/openai.yaml        Codex 界面元数据
├── references/
│   ├── probing.md            九检测器、探针问法、四道门判分与 gates、L0–L5 升级阶梯、窄带重讲、AI 自检清单
│   ├── sources.md            信源 T1–T4 分级、五类输入的取证流程、网络检索纪律、台账格式
│   ├── artifacts.md          三个 JSON schema、出题规则、费曼笔记模板、可视化图规格
│   └── schema.md             state.json 全部字段 + results 的 gates/severity 映射
└── scripts/
    ├── feynman.mjs           确定性簿记（纯 Node，无依赖）
    └── feynman.test.mjs      回归测试（node:test，零依赖）

feynman/<slug>/               每个学习主题一个工作区
├── concepts.json             概念清单 + pass_criteria
├── sources.md                信源台账（claim 编号是全仓库的引用锚点）
├── bank.json                 题库（含 reference_answer 与 source_ref）
├── state.json                mastery / SM-2 排期（脚本独占，禁止手改）
├── gaps.md                   gap 台账（record 自动追加）
├── notes.md                  费曼笔记（notes --scaffold 生成骨架，Phase 6 填）
├── tests/                    自测卷（不含参考答案）
├── results/sN.json           每轮判分
├── figures/                  可视化讲解图（Phase 6 按需创建）
└── samples/                  一手材料副本（已 gitignore）
```

## 脚本命令

```
init      <slug> --title "标题" [--target "..."] [--dir feynman]
concepts  <slug> --file concepts.json          注册概念（保留已有 mastery）
bank      <slug> --check                       校验题库
test      <slug> [--n 8] [--concepts a,b] [--due-only] [--seed S]
record    <slug> --results results/sN.json
gaps      <slug> [--concept <id>] [--all]      列出 gap 台账 + 可粘贴的 resolves 片段
notes     <slug> --scaffold [--force]          生成笔记骨架（灌入 gap 原话与信源）
status    <slug>                               进度看板 + NEXT 建议
```

脚本只做**确定性簿记**：加权分层抽样、SM-2、mastery、gap log。判分是模型的事——脚本校验的是结构自洽（四道门与 score 是否矛盾、severity 是否匹配、闭合的 gap 是否属于本轮），不判断内容对错。

抽题权重 `(1-mastery)^1.5 × (1+0.2×lapses) × (0.8+0.2×difficulty)`，并分层保证概念覆盖广度；`apply` 题额外要求该概念 mastery ≥ 0.8 且无未闭合致命 gap 才进候选池。SM-2 的 `reps`/`lapses` 按概念每轮各推进一次（不管该轮考几道），分数取该概念本轮的最低分——短板决定排期。

闭环里原先最手工的两处已经收进脚本：`gaps` 列出待闭合 gap 并给出可直接粘贴的 `resolves` 片段（不用再去翻 `state.json` 抄 `gid`）；`notes --scaffold` 生成笔记骨架，把 gap 原话灌进第 4 节、信源摘进第 7 节。

参考答案与 `source_ref` 只留在 `bank.json`，不粘进试卷或对话，闭卷才有诊断价值。试卷同样不印题型、难度与概念 id：`explain→G1`、`boundary→G3`、`counterexample→G4` 的映射等于提前告诉学习者要考哪道门。

脚本启动时会检查 cwd 有没有 `.git` / `.codex` / `.qoder` / `.agents` 标记，缺了直接报错——工作区路径按 cwd 解析，在子目录里跑会静默分裂出第二份工作区。

## 测试

```bash
node --test skills/ai-feynman/scripts/feynman.test.mjs
```

33 条用例覆盖抽样、SM-2、判分校验、闸门、路径契约与闭环命令。新增约束时同时补一条用例，并确认它在改动前是红的、改动后转绿——没红过的测试证明不了它有牙。

## 当前进行中的主题

`feynman/a-share-financials/` — **A 股财报解读**，目标是实盘投资决策。

样本是贵州茅台 2025 年年度报告（143 页，PDF 已 gitignore）。台账 60 条 claim，全部回指到具体页码；题库 14 题，覆盖 3 个概念，每概念都有 boundary 或 counterexample 题。

这个主题也顺带示范了取证纪律该怎么执行：

- 每一条算术链都验算到分——资产负债表恒等式、流动/非流动负债逐项加总、归母权益逐项加总、存货明细↔间接法调节表、完整的间接法链条 `85,310,324,833.67 − 24,874,446,586.02 + 2,264,878,265.75 − 1,178,551,524.05 = 61,522,204,989.35` ✓
- 抽取工具会静默产生错数（Identity-H CID 字体导致附注编号与金额粘连），台账里写明了方法论警告，并规定任何读到的数字必须先用同表合计行验算
- 自己讲错的地方当场更正并登记，包括把「存货增加」误判为经营现金流 −33.46% 的主因（真实主因是应付与应收的反转）
- 查不到一手确认的（13.1 亿残差、151.52 亿收现差额成因、经营性应收项目构成）标 `未知`，明确排除出判分依据，不编解释

## 环境要求

Node.js（脚本零依赖，`zlib` 走内置）。Windows 下路径一律用正斜杠，且注意 bash 的 `$TEMP` 与 Node 的路径解析不一致。