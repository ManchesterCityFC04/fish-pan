## Why

fish-pan 当前“一键诊断”的 `news` 字段恒为 `null`，因为全代码库没有新闻数据源。PanWatch 实现了多源新闻、公告与快讯，并把字段标准化后接入 Agent；fish-pan 需要在不引入 PanWatch 多 Agent 与 Apache 来源的前提下，补齐个股新闻、公告与快讯，并接入详情页与一键诊断上下文。

## What Changes

- 第一版引入个股新闻、公司公告和市场快讯三类数据；优先级支持 A 股，港美股按可用数据源降级。
- 复用 `market-data-engine` 的 Port/Adapter/TTL/降级与健康度机制，避免另起一套请求栈。
- 在数据源注册表中加入 `news | announcement | flash` 三个 Adapter，注册到 `MarketData`，按 Vendor 优先级调度。
- 统一字段：`title` / `url` / `source` / `publishedAt` / `summary` / `codes[]`；详情页与一键诊断统一使用此结构。
- 详情页底部新增“新闻”和“公告”两标签，展示最近 30 天记录；自选列表行显示最新一条新闻时间戳。
- 一键诊断 bundle 中 `news` 不再恒为 `null`：传入最近 N 条新闻与公告摘要；当某 Adapter 失效时显示“暂无新闻”而不阻断诊断。
- 重复新闻通过 `(url | titleHash)` 去重；缓存与 TTL 由 `market-data-engine` 统一控制。
- 港美股没有可用 Adapter 时显示“不适用”，而不是报错。
- 不在本 change 中增加财报、分红、股东、龙虎榜、融资融券和北向资金；不爬取付费研报；不直接生成情绪分数；不保存未经限制的全文内容。

## Capabilities

### New Capabilities
- `market-news-events`: 个股新闻、公告与快讯的注册、聚合、缓存和接入详情页与一键诊断上下文。

### Modified Capabilities
- `one-click-diagnosis`: 诊断 bundle 接收真实新闻与公告上下文；当某 Adapter 失效时显示“暂无新闻”而非报错。

## Impact

- 主要影响 `electron/main.js`、`src/api.ts`、`src/diagnosis.ts`、`src/views/OneClickDiagnosis.tsx`、`src/types.ts` 与新增 `electron/market/vendors/news.ts` 等 Adapter 文件。
- 渲染端详情页底部增加“新闻”和“公告”两个标签；自选列表行显示新闻时间戳。
- 数据源注册表与健康度视图需要扩展以呈现新闻 Vendor 状态。
- 单元测试与离线断言：新增 `tools/verify-news-adapters.mjs`，覆盖字段标准化、去重与降级。
- 安全边界：每个 Vendor 实现里禁止 `verify=false`；调用字段映射前必须经过 `validateResult` 钩子。