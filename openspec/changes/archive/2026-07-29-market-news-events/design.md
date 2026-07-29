## Context

fish-pan 当前诊断 bundle 里的 `news` 字段为 `null`，原因是没有新闻数据源；PanWatch 通过 `vendors/news.py` 把雪球、东方财富搜索和公告接口整合为统一字段。本 change 借鉴其“统一字段 + 适配器”做法，但仅覆盖第一版三类（个股新闻 / 公司公告 / 快讯），且只采用可长期使用的字段校准；不复制 PanWatch 的 Python 实现、不引入 Apache 来源、不绕过 TLS。

## Goals / Non-Goals

**Goals:**

- 把个股新闻、公司公告、市场快讯统一为 `NewsItem` 结构，并在 `MarketData` 中按 `news | announcement | flash` 三类注册 Adapter。
- 复用 `market-data-engine` 的 Port/Adapter/TTL/降级/健康度机制，避免另起一套请求栈。
- 详情页底部“新闻”和“公告”两个标签；自选列表行显示最新一条新闻时间戳。
- 一键诊断 bundle 中 `news` 不再恒为 `null`；当某 Adapter 失效时显示“暂无新闻”而不阻断诊断。
- 港美股没有可用 Adapter 时显示“不适用”，而不是报错。
- 重复新闻通过 `(url | titleHash)` 去重。

**Non-Goals:**

- 不引入财报、分红、股东、龙虎榜、融资融券和北向资金。
- 不抓取付费研报。
- 不直接生成情绪分数，不订阅商业情绪 API。
- 不保存未经限制的全文内容；摘要字段最大 200 字。
- 不绕过 TLS 验证；不假设第三方内部接口可长期商用。

## Decisions

- **数据源类型**：在 `MarketData` 中新增三类 `DataKind = 'news' | 'announcement' | 'flash'`；每类独立 Adapter 注册。
- **Adapter 实现**：第一版为每类提供 1–2 个公开可达的 Vendor；A 股优先；港美股按可用 Adapter 提供降级。
- **字段标准化**：所有 Adapter 输出统一为 `NewsItem = { id, kind, title, url, source, publishedAt, summary?, codes: string[], lang }`。
- **去重策略**：按 `(url | hash(title))` 去重；同一 `(code, kind, id)` 在缓存窗口内只返回一次。
- **缓存与 TTL**：TTL 由 `MarketData` 统一控制；`news.inFlight=1s, news.cache=10m`，`announcement` 略长，`flash` 较短。
- **诊断接入**：`buildDiagnosisBundle` 接收 `news: NewsItem[]`，当 Adapter 失败时显示 `status: 'unavailable'`；UI 区分有数据、无数据、不可用三态。
- **安全与合规**：所有 Vendor Adapter 走 `httpsAgent` / `node-fetch` 标准配置；禁止 `verify=false`；每个 Vendor 在代码注释中记录字段校准状态与已知限制。

## Risks / Trade-offs

- [数据源字段漂移] → 在 Adapter 内集中做字段映射与默认值兜底；`validateResult` 钩子拒绝异常结果。
- [数据源 ToS 与限流] → 默认频次为 `cache=10m`；健康度面板允许用户主动暂停。
- [港美股无数据] → 明确显示“不适用”，不暴露内部错误；预留后续 Vendor 接入点。
- [重复新闻] → 通过 `(url | titleHash)` 去重；缓存窗口期内合并同一来源。
- [情绪与解读越界] → 第一版只提供原文与摘要，不直接生成情绪分数；后续 LLM 摘要通过 `llm-provider-integration` 提供。

## Migration Plan

1. 在 `MarketData` 注册 `news | announcement | flash` 三类 Adapter。
2. 新增 `electron/market/vendors/news.ts`，提供 A 股新闻与公告的第一版 Vendor；快讯作为附加类。
3. 渲染端详情页增加“新闻”和“公告”标签；自选列表行显示最新新闻时间戳。
4. `buildDiagnosisBundle` 与 `OneClickDiagnosis` 接入真实 `news` 上下文。
5. 编写 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重、降级与不可用状态。
6. 通过 `feature flag: marketNewsEvents` 控制新旧路径；关闭时回退到当前 `news: null` 行为。

回滚：保留旧 `news: null` 默认；通过 feature flag 关闭即可。

## Open Questions

- 是否允许用户在设置中调整新闻 TTL？建议提供“刷新间隔”配置项，但本期不开放 Vendor 切换。
- 是否接入海外 RSS 作为港美股降级？建议留作后续增量。
- 是否提供“关键词过滤” UI？建议先只做时间倒序，关键词过滤作为独立增量。