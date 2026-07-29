## Context

fish-pan 的报价、K 线、大盘与资金流调用目前散落在 `electron/main.js` 与 `src/api.ts` 中，缺少统一的数据源抽象、缓存、请求合并与健康度体系。PanWatch 的 `packages/marketdata` 通过 Port / Registry / Engine / Vendor / TTLCache / retry / metrics 分层解决了同类问题，但其 Python 实现和宽松的 SSL 配置不应直接移植。fish-pan 的目标是借鉴其架构思路，在 TypeScript 与 Electron 主进程侧建立本地化、显式且可观测的数据源底座，不引入云端依赖或新的网络通道。

## Goals / Non-Goals

**Goals:**

- 在 Electron 主进程侧提供 `MarketData` 统一入口，按 `quote | kline | market | funds` 四类数据组织适配器。
- 引入 `Vendor` 注册表、优先级配置、按数据类型的 TTL 缓存、并发请求合并、有限重试与退避策略。
- 记录每个 Vendor 的最近成功时间、最近错误、累计请求次数和基础成功指标，并提供单 Vendor 在线测试入口。
- 任何 Vendor 抛错或返回异常字段时，必须被捕获并隔离，不污染其他 Vendor 结果或中断主进程。
- 保留现有 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` IPC 名称与调用方语义；内部可由 Engine 包装，但响应结构与错误形态保持稳定。
- 维护与硬件时钟或会话标识解耦的请求 id 映射，便于日志与回放。

**Non-Goals:**

- 不实现 WebSocket 推送或服务端代理。
- 不在本 change 内增加新闻、公告、财报或资金流扩展数据。
- 不引入 React Query 等渲染端缓存库；渲染端继续以 props/状态轮询。
- 不持久化远程行情；TTL 缓存仅在进程内有效（除非显式落盘以支持健康度历史）。
- 不支持自定义代理或绕过 TLS 验证；保留当前系统的网络栈行为。
- 不翻译 PanWatch 的 Python 代码或保留 `verify=False` 行为。

## Decisions

- **Port/Adapter 分层**：在 `electron/market/` 下定义 `MarketRequest` / `MarketResult` / `MarketError` 三个不可变类型作为 Port，并要求每个 Vendor 实现 `fetchQuote / fetchKline / fetchMarket / fetchFunds` 中相应的方法。Engine 负责选择候选、并发合并、重试与降级。
- **注册表与优先级**：使用 `Map<dataKind, Vendor[]>` 描述候选顺序；启动时按 `datasources.json` 加载，每个 Vendor 持有 `priority`、`enabled`、`quotaHint` 字段。设计阶段就允许在前端设置页只改 JSON 而不动代码。
- **TTL 与请求合并**：每个 Engine 入口维护一个 `Map<key, Promise<Result>>`，并附带 `inFlightTTL` 与 `cacheTTL` 两个常量。`inFlightTTL` 用于合并同一 key 的并发请求，`cacheTTL` 用于短时复用。默认值通过 `datasources.json` 暴露，例如 `quote.inFlight=2s,quote.cache=1.5s`。
- **错误隔离与降级**：Vendor 抛错或返回非空错误字段时，Engine 立即记录最近错误、按指数退避降低该 Vendor 的优先级分数；其他 Vendor 继续尝试。所有 Vendor 失败时返回结构化 `MarketError`，由调用方展示。
- **重试与退避**：重试仅在网络层错误（超时、连接重置）下生效，且对每个 Vendor 每个 key 限制最大尝试次数（默认 2 次）与总时间预算（默认 5s）。解析错误不重试，直接降级。
- **健康度指标**：维护 `MetricsSink` 接口与内存实现，记录 `lastSuccessAt` / `lastErrorAt` / `latencyMs` / `successCount` / `errorCount`。新增 IPC `data-source:status` 与 `data-source:test` 用于查询和触发在线测试。
- **兼容层**：现有 `fetchKline` / `fetchQuotes` / `fetchMarket` / `fetchFunds` 的 IPC handler 转调 Engine，但保留其返回结构；若未来需要切换为新事件流，兼容层由 Engine 负责按数据契约适配。
- **不实现持久化层**：本 change 不落盘健康度历史，避免引入新的 SQL 表与备份变更；如确需长期统计，作为后续增量。

## Risks / Trade-offs

- [外部接口字段漂移] → 在 Adapter 内集中做字段映射与默认值兜底，并通过 `validateResult` 钩子拒绝异常；新增回归用例覆盖字段缺省场景。
- [网络抖动放大请求量] → 退避与并发合并双重保护；提供 `quotaHint` 便于按 Vendor 调节。
- [腾讯 fallback 调用频次可能超过其页面限制] → 默认禁用 Tenent fallback，仅在用户启用时生效；将是否启用、并发限速写进 `datasources.json` 文档。
- [TTL 不一致导致 UI 偶发闪烁] → Engine 返回时携带 `staleAfter` 时间戳；渲染端在数据陈旧时显式标识。
- [健康度指标只存在内存中，重启清零] → 文档中明确该行为；如需持久化历史，作为独立增量。
- [PanWatch 的 Python 抽象优秀但实现有兼容性风险] → 显式声明不移植其实现，仅借鉴分层与契约；技术选型时反复比较。

## Migration Plan

1. 引入 `electron/market/` 目录与核心类型，作为 Port/Adapter 占位。
2. 将 `fetchQuotes` 的 Sina 实现、东方财富 K 线实现、Tencent fallback 拆为三个 Vendor Adapter，并注册到 `MarketData`。
3. 在主进程侧加 IPC `data-source:status` / `data-source:test`，渲染端在数据源状态小图标上显示。
4. 把 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` 的 handler 改为 `MarketData.fetch(...)`，保持返回结构稳定。
5. 引入 Vitest 单元测试覆盖 Engine 的优先级、降级、合并与重试分支。

回滚方案：保留旧 `fetchXxx` 函数与 IPC 入口在 `legacy/` 子目录，由 `feature flag: marketDataEngine` 切换；任何验证未通过均可通过开关回到旧实现，无需重新打包。

## Open Questions

- 健康度指标是否需要持久化历史，作为后续独立 change？
- 是否引入“按代码别名解析的 Vendor 列表”配置（类似 PanWatch 的 symbol.py），还是继续由 renderer 提供候选？
- 对行情接口的 ToS 边界是否需要在文档中显式列出？需要在哪个版本首次声明？
