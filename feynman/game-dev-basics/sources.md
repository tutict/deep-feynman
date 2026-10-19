# 信源台账 · 游戏制作基础

> 每条 claim 必须能回指到具体位置。状态: 已验证 / 推断 / 未知 / 已纠正。
> 本主题**没有官方教学大纲**（不是考证类），走的是 references/sources.md 的「网络自主检索」流程：先按 T1–T4 分级列候选，再抓一手。
> 本台账抓取日期同为 2026-10-19（同一批取证）。

## 一手信源

| 信源 | 级 | 说明 | 抓取日期 |
|---|---|---|---|
| Steam 官方公告《New Revenue Share Tiers and other updates to the Steam Distribution Agreement》 | T1 |2018-10-01 起生效的分成档位 | 2026-10-19 |
| Apple《App Store Small Business Program》官方页 | T1 |佣金档位（15% / 30% / 10%） | 2026-10-19 |
| Google Play《Service fees》官方帮助页 | T1 |服务费档位（15% / 30%） | 2026-10-19 |
| Steamworks 官方文档 · Store Presence > Release Process | T1 |发布前的审核与 checklist 要求 | 2026-10-19 |
| IGDA Curriculum Framework v3.2beta（2008-02，44 页 PDF） | T2 |行业机构 IGDA 教育 SIG 出的课程框架；学科划分、生产环节、生命周期、发行/开发关系 | 2026-10-19 |
| Rami Ismail《Prototypes & Vertical Slice》（2022-09-26） | T3 |Vlambeer 联合创始人的从业者文章；开发时间线与原型/垂直切片的判据 | 2026-10-19 |

## 具体断言

| # | claim | 信源 | 级 | 抓取日期 | 状态 |
|---|-------|------|----|----------|------|
| 1 | Steam 标准分成为 70%/30%；单个应用在 Steam 上收入超过 $10M 后，超出部分调整为 75%/25%；超过 $50M 后，超出部分调整为 80%/20%（2018-10-01 起，此前的收入不计入） | Steam 官方公告 | T1 | 2026-10-19 | 已验证 |
| 2 | Steam 的「收入」口径包含游戏包、DLC、游戏内销售与社区市场游戏费用 | Steam 官方公告 | T1 | 2026-10-19 | 已验证 |
| 3 | Apple：年收入不超过 100 万美元的开发者适用 15% 佣金；标准佣金为 30%；在欧盟以及订阅满一年后进一步降至 10% | Apple 官方页 | T1 | 2026-10-19 | 已验证 |
| 4 | Google Play：开发者每年前 100 万美元收入适用 15% 服务费，超出部分为 30% | Google Play 官方帮助页 | T1 | 2026-10-19 | 已验证 |
| 5 | 在 Steam 发布产品主要由开发者自己掌控，但 Valve 需要在发布前审核并批准该产品 | Steamworks Release Process | T1 | 2026-10-19 | 已验证 |
| 6 | Steam 发布有两张 checklist：商店页（Store Presence）与产品构建（build）配置；两张都必须完成、审核并通过才能发布 | Steamworks Release Process | T1 | 2026-10-19 | 已验证 |
| 7 | 必须先提交商店页审核，通过后才能提交构建审核；商店页审核通常需要 3-5 个工作日 | Steamworks Release Process | T1 | 2026-10-19 | 已验证 |
| 8 | 游戏学科的核心领域包括：Game Design、Game Programming、Visual Design、Audio Design、Interactive Storytelling、Game Production、Business of Gaming（另有 Critical Game Studies、Games and Society 两个偏研究/社会的方向） | IGDA Framework §3 | T2 | 2026-10-19 | 已验证 |
| 9 | 游戏生产涉及的环节包括：management、design、programming、audio、graphic design、writing、testing、QA | IGDA Framework §2 | T2 | 2026-10-19 | 已验证 |
| 10 | IGDA 的工作定义：游戏是一种有规则的活动；多数定义的共同点是「游戏是系统，玩家做出选择、改变系统状态，导致一个结果」 | IGDA Framework §2.1 | T2 | 2026-10-19 | 已验证 |
| 11 | IGDA 把开发生命周期粗分为 Pre-production / Production / Testing，外加 Shipping and maintaining customer loyalty（上线与维护） | IGDA Framework §3.8 | T2 | 2026-10-19 | 已验证 |
| 12 | 生产过程存在多种方法论：Waterfall、spiral、v-shaped、evolutionary、Scrum/Agile、iterative/incremental、rapid prototyping；各自有优缺点 | IGDA Framework §3.8 | T2 | 2026-10-19 | 已验证 |
| 13 | IGDA 把「定义团队成员之间的接口」列为团队协作与群体动力学的核心议题 | IGDA Framework §3.8 | T2 | 2026-10-19 | 已验证 |
| 14 | IGDA 把发行商/开发商关系列为专门议题，含 The deal、Greenlighting process、Milestone review | IGDA Framework §3.9 | T2 | 2026-10-19 | 已验证 |
| 15 | IGDA 列举的商业模式包括：microtransactions、one-time payment、按月订阅的 SaaS、free to play with some features available to paying members | IGDA Framework §3.9 | T2 | 2026-10-19 | 已验证 |
| 16 | 行业中的角色关系涉及 publishers、developers、distributors、marketers、retailers 等多方 | IGDA Framework §3.9 | T2 | 2026-10-19 | 已验证 |
| 17 | 常见开发时间线：Ideation → Prototyping → Vertical Slice → Production → Alpha（Feature Complete）→ Beta（Content Complete）→ Release Candidate → Release | Rami Ismail 2022-09-26 | T3 | 2026-10-19 | 已验证 |
| 18 | 原型（Prototype）用来回答「该不该做这个游戏」，垂直切片（Vertical Slice）用来回答「能不能做出来」；两者常被混为一谈，代价是时间与金钱 | Rami Ismail 2022-09-26 | T3 | 2026-10-19 | 已验证 |
| 19 | Alpha 的含义是 Feature Complete（功能完整），Beta 的含义是 Content Complete（内容完整） | Rami Ismail 2022-09-26 | T3 | 2026-10-19 | 已验证 |
| 20 | 中国国内安卓渠道（华为/小米/应用宝等）的分成比例 | 未取证 | — | 2026-10-19 | 未知 |
| 21 | 独立开发者与发行商之间常见的分成比例（如 50/50、70/30） | 未取证 | — | 2026-10-19 | 未知 |
| 22 | 「垂直切片」这个词的行业起源与确切定义边界（IGDA 框架里没有这个词） | 未取证 | — | 2026-10-19 | 未知 |

> **#20–#22 明确排除出判分依据**：它们要么涉及国内渠道（本次未取证），要么是术语溯源。用它们出题等于考猜。