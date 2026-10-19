# state.json 与 results/sN.json 的 schema

`references/artifacts.md` 覆盖 concepts / bank / results 三个文件。**`state.json` 由脚本独占写入，字段较多**，这里完整列出，免得要读源码才知道有哪些字段。

## state.json

**脚本独占写入，不要手改。** 手改 mastery / ease / reps / due 会让 SM-2 排期与实际作答历史脱钩，且无法察觉。

### 顶层

| 字段 | 类型 | 说明 |
|---|---|---|
| `slug` | string | 主题标识，同时是工作区目录名 |
| `title` | string | 主题标题，来自 `init --title` |
| `target` | string | 学习目标（调试 / 面试 / 实盘决策 / 纯兴趣…）。写入试卷抬头，影响讲解深度 |
| `created` | date | 建仓日期 `YYYY-MM-DD` |
| `round` | number | **已分配的最高轮次**。在 `test` 出卷时 +1 并持久化（不再由 `record` 回写——那会让乱序记录把轮次回退） |
| `gap_seq` | number | gap 自增序号。gap id 形如 `g7` |
| `concepts` | object | 概念表，key 为概念 id |
| `sessions` | object | 试卷记录表，key 为 session id（`s1`、`s2`…） |

### `concepts[<id>]`

| 字段 | 类型 | 写入方 | 说明 |
|---|---|---|---|
| `id` | string | `concepts` | 概念标识，`bank.json` 用它归属题目 |
| `title` | string | `concepts` | 人读标题 |
| `weight` | number | `concepts` | 相对权重，用于抽题分层 |
| `pass_criteria` | string[] | `concepts` | **必须非空数组**。掌握判据，逐条可证伪 |
| `mastery` | number | 脚本 | 0–1。取最近 5 轮 history 的 `score/2` 均值；有未闭合致命 gap 时封顶 0.4 |
| `ease` | number | 脚本 | SM-2 难度系数，下限 1.3，初值 2.5 |
| `reps` | number | 脚本 | 连续通过轮次。**按概念每轮 +1，不是按题**——一轮考 5 道也只 +1 |
| `interval` | number | 脚本 | 当前复习间隔（天）。`reps` 1→1 天，2→3 天，之后按 `interval × ease` |
| `lapses` | number | 脚本 | 累计失败轮次。每轮至多 +1（不管该轮错几道） |
| `due` | date | 脚本 | 下次复习日。`test --due-only` 依据它筛选 |
| `history` | object[] | 脚本 | 逐题作答流水，每项 `{session, score, date}`。`mastery` 只看末 5 条 |
| `gaps` | object[] | `record` | 该概念的 gap 台账（见下） |

### `concepts[].gaps[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `gid` | string | 全局唯一，形如 `g3`。`record` 的 `resolves` 引用它 |
| `round` | number | 产生该 gap 的轮次 |
| `session` | string | 产生该 gap 的 session |
| `date` | date | 记录日期 |
| `type` | string | 九检测器之一 |
| `severity` | `致命`/`重要`/`细节` | **与 score 强制绑定**（见下） |
| `detail` | string | 学习者原话摘录 + 错在哪 |
| `question_id` | string | 触发题 |
| `source_ref` | string | 回源坐标 |
| `resolved` | boolean | 是否闭合 |
| `resolved_at` | date? | 闭合日期 |

### `sessions[<sid>]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `s1`、`s2`… |
| `ts` | string | 出卷时间戳 `YYYYMMDD-HHMMSS-随机后缀`，同时是试卷文件名 |
| `round` | number | 该卷所属轮次 |
| `due_only` | boolean | 是否由 `--due-only` 触发 |
| `question_ids` | string[] | 本卷题目。`record` 会拒绝不属于本卷的题 |
| `recorded` | boolean | 是否已判分落账。**重复 record 会污染 mastery 与排期，脚本拒绝** |
| `recorded_at` | date? | 判分日期 |
| `resolved_gaps` | string[]? | 本次闭合的 gap id |

---

## results/sN.json

**模型写入，`record` 消费。** `test` 出卷时生成模板。

```json
{
  "session": "s1",
  "graded": [
    {
      "question_id": "q7",
      "score": 1,
      "gates": { "G1": true, "G2": true, "G3": false, "G4": true },
      "gap_type": "边界失守",
      "severity": "重要",
      "note": "学习者原话：'它就是更快一点' —— 说不出代价"
    }
  ],
  "resolves": ["g2"]
}
```

| 字段 | 说明 |
|---|---|
| `session` | **活字段**。`record` 用它绑定 session（优先级：显式 `--session` > 此字段 > 唯一待记录卷） |
| `graded` | 必须覆盖本卷全部题目，缺一题即报错 |
| `resolves` | 本轮闭合的 gap id。**gap 所属概念必须出现在本轮** `question_ids` 中，否则报错 |

### gates：四道门证据（必填）

每道题必须给出四门布尔值。**脚本只校验 gates 与 score 是否自洽，不判断内容真假**——这正是「纯簿记」的边界：拦的是自相矛盾的判分，不是错误的判分。

| 字段 | 判据 |
|---|---|
| `G1` | 无术语复述：不用领域词汇说清「它是什么」 |
| `G2` | 机制链：因果链每步都有主语和动作，没有「然后就…」 |
| `G3` | 边界：说出至少一个失效场景**和**一个代价 |
| `G4` | 反例存活：面对反例或替代设计，原理解不崩 |

映射（脚本强制）：

| gates 状态 | 允许的 score |
|---|---|
| 四门全 `true` | `2` |
| G1+G2 `true`，G3 或 G4 有 `false` | `1` |
| G1 或 G2 为 `false` | `0` |

### severity 与 score 的绑定

severity 决定 mastery 是不是被封顶 0.4。原先脚本只校验枚举合法，模型把 score 0 全标「细节」就能让封顶永不触发，唯一的硬闸门形同虚设。现在改成：

| score | 允许的 severity |
|---|---|
| `2` | 无 gap |
| `1` | `重要` |
| `0` | `致命` |

唯一例外（`references/probing.md`）：纯记忆型 `事实错误` 且不污染机制链时，`score 0` 可降为 `重要`，需在 `note` 里写明理由。

### 未通过时的必填项

`score < 2` 必须给 `gap_type`（九检测器之一）、`severity`、`note`（≥4 字，摘学习者原话）。