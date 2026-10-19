# Gap Log · 游戏制作基础

> 由 record 子命令自动追加。这是本主题最有价值的资产：它记录你**曾经**以为懂了的地方。

## g1 · dev-pipeline · 重要 · 粒度错配

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q5` · 回源: Rami Ismail 2022-09-26（开发时间线）、IGDA §3.8（Pre-production / Production / Testing；Shipping and maintaining customer loyalty）；sources.md claim #11 #17
- 错在哪: 原话：'规划整体游戏方向，确定游戏剧本；规划玩法；程序引擎制作；美术音乐加工；测试；分发' —— 顺序对、也够粗粒度（预制作/制作/测试/上线），但停在这一层：没有原型/垂直切片这层早期验证，也没有 Alpha/Beta/发布候选这些后期关卡，上线之后的运营维护也没提。
- 状态: 未闭合

## g2 · industry-money · 致命 · 跳步

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q9` · 回源: IGDA §3.9（microtransactions、one-time payment、SaaS 月费、free to play with some features available to paying members）；sources.md claim #15
- 错在哪: 原话：'网游氪金；买断；dlc' —— 三种都点到了，但'钱从哪来'一个字没说：谁在什么时候为什么付钱。商业模式只剩名字，链条是空的。
- 状态: 未闭合

## g3 · dev-pipeline · 致命 · 跳步

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q6` · 回源: Rami Ismail 2022-09-26（原型=该不该做，垂直切片=能不能做）；sources.md claim #18
- 错在哪: 原话：'不清楚' —— 原型与垂直切片各自回答什么问题、为什么不能互相替代，整条都空着。
- 状态: 未闭合

## g4 · game-parts-roles · 致命 · 边界失守

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q4` · 回源: IGDA §3.8（Team make-up；Balancing talent, experience, budget）、§3.9（Independent vs Publisher/Developer）；sources.md claim #8 #13 #16
- 错在哪: 原话：'不清楚' —— 说不出'策划/程序/美术'这套分工在什么情况下失效，也举不出代价。
- 状态: 未闭合

## g5 · game-parts-roles · 致命 · 粒度错配

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q2` · 回源: IGDA §3.3–3.6（Game Design / Game Programming / Visual Design / Audio Design）、§2；sources.md claim #8 #9
- 错在哪: 原话：'游戏玩法；游戏程序稳健性；游戏审美' —— 只说了三类角色大致管什么，说不出各自的产出物，也没有'主语+动作'的职责链，正好落在 bank 里警告的'负责好玩/负责好看'模式上。
- 状态: 未闭合

## g6 · industry-money · 致命 · 事实错误

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q11` · 回源: Steam 官方公告（2018-10-01 生效）、Apple 官方页、Google Play 官方帮助页；sources.md claim #1 #3 #4
- 错在哪: 原话：'按游戏销量会变，大概一百万份的时候' —— 阈值是按**收入**不是**份数**（Apple/Google 年 $100 万，Steam $1000 万/$5000 万），而且分档只作用于'超出部分'、不是追溯整体。数字和单位都错。
- 状态: 未闭合

## g7 · industry-money · 致命 · 跳步

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q10` · 回源: IGDA §3.9（publishers/developers/distributors/marketers/retailers；Publisher/Developer Relationships；The deal）、Steam/Apple/Google 分成条款；sources.md claim #1 #3 #4 #14 #16
- 错在哪: 原话：'开发商开发游戏、发行商署名发行、平台销售' —— 只说了三方各干什么，钱的流向一步没说：玩家付钱→平台抽成→发行商分成→开发商拿剩余。'发行商署名发行'也把发行商说小了。
- 状态: 未闭合

## g8 · industry-money · 致命 · 跳步

- 轮次: 第 1 轮 (s1) · 2026-10-19
- 触发题: `q12` · 回源: IGDA §3.9（Independent vs Publisher/Developer；platform choices；distribution channels）、§3.8（典型预算与预算类别）；sources.md claim #14 #16
- 错在哪: 原话：'优秀独游前不成立；空洞骑士' —— 反例方向对（独游能绕开头部规模），但说不出为什么：'通吃'的机制（网络效应/规模摊薄成本/曝光集中）没讲，'优秀独游'本身也是循环说法。
- 状态: 未闭合
