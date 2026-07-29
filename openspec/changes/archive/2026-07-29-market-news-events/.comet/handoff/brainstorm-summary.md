# Brainstorm Summary

- Change: market-news-events
- Date: 2026-07-28
- Candidate: A

## 用户确认的关键决策

- **Q1（Vendor 组合）= 照搬 PanWatch**：雪球 + 东方财富搜索 + 东方财富公告 + 东方财富/财联社快讯；雪球仅作为新闻补全，财联社作为快讯源。
- **Q2（摘要）= B**：保留 `summary` 字段（≤ 200 字），详情页可折叠展示。
- **Q3（自选行展示）= A**：自选行右侧追加“最新新闻时间”单行文字（`HH:mm` / `昨天` / `MM-DD` / `暂无`）。
- **Q4（feature flag 与回滚）= A**：仅在调用入口按 `feature flag: marketNewsEvents` 决定传 `news: NewsItem[] | null`；IPC、Adapter、缓存、健康度全量开发但默认关闭。

## 候选 A：技术方案摘要

- 在 `electron/market/vendors/news/` 下落地四个 Vendor：
  - `eastmoney-search.ts`（个股新闻）
  - `xueqiu-news.ts`（个股新闻补全）
  - `eastmoney-announcement.ts`（个股公告）
  - `eastmoney-flash.ts`（东方财富快讯）+ `cls-flash.ts`（财联社快讯）
- 三类 `DataKind = 'news' | 'announcement' | 'flash'`，每类独立注册到 `MarketData`，每类 1–2 个 Vendor 按优先级调度。
- `NewsItem = { id, kind, title, url, source, publishedAt, summary?, codes: string[], lang }`，summary 字段最大 200 字。
- 字段标准化与去重集中在 `MarketData` Engine 层；Adapter 仅负责 HTTP 抓取与字段映射。
- TTL：news.inFlight=1s, news.cache=10m；announcement.cache=30m；flash.cache=2m。
- 去重：`(url | titleHash)` 在缓存窗口内合并；同一 `(code, kind, id)` 仅返回一次。
- 详情页底部新增“新闻”和“公告”两标签；自选列表行右侧显示最近一条新闻时间戳。
- 一键诊断 bundle 的 `news` 字段：flag 开启时传 `NewsItem[]`；flag 关闭时维持 `null`（不破坏现有 OpenSpec contract）。

## 关键取舍与风险

- **雪球 / 财联社限流**：通过 TTL 与“单 Vendor 失败自动降级”机制兜底；适配前完成字段校准并记录到 Vendor 注释。
- **字段漂移**：每个 Vendor 通过 `validateResult` 钩子拒绝异常记录；缺字段记录直接丢弃不污染其他条目。
- **TLS 不绕过**：所有 Adapter 走标准 https；禁止 `verify=false` 或 `rejectUnauthorized: false`。
- **港美股无数据**：当没有任何可用 Vendor 时显示“不适用”，而不是错误；保留后续接入点。
- **情绪/解读越界**：本 change 不生成情绪分数；后续 LLM 摘要由 `llm-provider-integration` 提供。

## 测试策略

- `tools/verify-news-adapters.mjs`：
  - 字段标准化（缺 url / publishedAt → 丢弃）
  - 去重（同 URL 与同 titleHash 合并）
  - TTL 行为（cache 复用与失效）
  - 失败隔离（单 Vendor 抛错不影响其他）
  - 摘要长度裁剪（> 200 字截断）
- `tools/verify-diagnosis.mjs` 增量用例：
  - news: NewsItem[] 时 bundle 渲染含摘要与时间戳
  - news: null 时 bundle 行为与原版一致
- 通过 `feature flag: marketNewsEvents` 关闭时，回归原 OpenSpec 行为（仅 `news: null`）。

## Spec Patch

无。当前 OpenSpec delta spec 已覆盖 B/A 选项；本次决策不需修改 spec，无需回写 delta spec。

## 下一步

- 创建 Design Doc 至 `docs/superpowers/specs/2026-07-28-market-news-events-design.md`。
- 运行 `comet state set market-news-events design_doc`。
- 运行 `comet guard market-news-events design --apply` 推进 phase=build。