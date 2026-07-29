# Comet Design Handoff

- Change: market-data-engine
- Phase: design
- Mode: compact
- Context hash: 206b8f8e364b7f603a51ee024a39a092032c162ec8abf506b478c924b519fa1d

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/market-data-engine/proposal.md

- Source: openspec/changes/market-data-engine/proposal.md
- Lines: 1-30
- SHA256: 635abfe23bdf15895c437ef4790a58685b9e4ed2eaa758b39126b932bcc67e7b

```md
## Why

fish-pan 目前的报价、K 线、大盘与资金流请求分别散落在 Electron 主进程和渲染端 API 中，数据源选择、腾讯回退、超时、缓存与错误提示缺少统一契约。随着持仓、高级告警和新闻等能力加入，这种分散模式会放大接口波动、重复请求和故障定位成本，因此需要先建立可扩展、可观测的数据源底座。

## What Changes

- 为报价、K 线、大盘和资金流定义统一的请求、结果与错误契约，并通过注册表管理数据源适配器。
- 将现有新浪、东方财富和腾讯调用迁移为适配器，支持按数据类型配置启停与优先级，并在主数据源失败时自动降级。
- 增加按数据类型配置的 TTL 缓存、并发请求合并、有限次数重试和退避，避免刷新周期内重复访问第三方接口。
- 记录每个数据源的最近成功时间、最近错误、请求延迟和基础成功状态，并提供在线测试入口。
- 隔离格式异常、字段漂移和网络失败，不允许单个适配器的异常污染其他候选结果或导致主界面崩溃。
- 尽量保持现有 renderer IPC 与用户刷新行为兼容；确需调整的返回结构采用兼容层过渡。
- 明确安全与合规边界：不绕过 TLS 验证，不把第三方内部接口视为获得长期商业授权，不逐行移植 PanWatch 的 Python 实现。
- 本 change 不新增新闻、公告、财报等数据类型，不引入 WebSocket、云端代理或后台服务。

## Capabilities

### New Capabilities
- `market-data-engine`: 统一行情数据源注册、选择、自动降级、缓存、请求合并、重试退避、健康状态和在线测试行为。

### Modified Capabilities

无。

## Impact

- 主要影响 `electron/main.js`、`electron/preload.js`、`src/api.ts`、`src/types.ts` 及后续新增的数据源模块和状态视图。
- 现有报价、K 线、大盘和资金流 IPC 将迁移到统一引擎之后，但应保持调用方可兼容。
- 需要为数据源契约、选择策略、缓存、请求合并、降级、健康指标和异常隔离增加自动化测试。
- 外部依赖仍是新浪、东方财富和腾讯公开可访问端点；实现阶段需要记录字段校准结果与使用边界。

```

## openspec/changes/market-data-engine/design.md

- Source: openspec/changes/market-data-engine/design.md
- Lines: 1-59
- SHA256: 695da707f6de7176fb8b7aacd0e40f41875808023eb4636a683591587ab7558e

```md
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

```

## openspec/changes/market-data-engine/tasks.md

- Source: openspec/changes/market-data-engine/tasks.md
- Lines: 1-39
- SHA256: 84ee2f0ab332e7d0f2b642619cd3086680c379f168a87561b41c96aa2e697e21

```md
## 1. 底座与 Port/Adapter 契约

- [ ] 1.1 在 `electron/market/` 下创建 `types.ts`，定义 `MarketRequest` / `MarketResult` / `MarketError` 与四类 `DataKind`。
- [ ] 1.2 在 `electron/market/` 下创建 `Vendor` 接口与 `VendorContext`（含 `MetricsSink`、超时与代理）。
- [ ] 1.3 在 `electron/market/` 下创建 `MetricsSink` 接口与内存实现 `InMemoryMetricsSink`。
- [ ] 1.4 在 `electron/market/` 下创建 `datasources.json` 加载器与默认配置。

## 2. Engine 与缓存

- [ ] 2.1 实现 `Engine.fetchQuote / fetchKline / fetchMarket / fetchFunds` 主入口。
- [ ] 2.2 加入 `KeyedPromiseCache` 用于 in-flight 合并与 TTL 复用。
- [ ] 2.3 加入网络错误分类与重试预算控制，解析错误直接降级。
- [ ] 2.4 加入结果校验钩子 `validateResult`，缺字段或价格非数时丢弃并记指标。

## 3. Vendor 适配器迁移

- [ ] 3.1 将 `electron/main.js` 中 Sina 报价调用抽成 `SinaQuoteVendor`。
- [ ] 3.2 将东方财富 K 线抽成 `EastmoneyKlineVendor`。
- [ ] 3.3 将大盘与资金流抽成 `EastmoneyMarketVendor` / `EastmoneyFundsVendor`。
- [ ] 3.4 将 `src/api.ts` 中腾讯 fallback 抽成 `TencentFlashVendor` 并在默认配置中关闭，启用时由配置打开。

## 4. IPC 与兼容层

- [ ] 4.1 在主进程侧加 IPC `data-source:status` 与 `data-source:test`。
- [ ] 4.2 把现有 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` 的 handler 改为 `MarketData.fetch(...)`。
- [ ] 4.3 在 `electron/preload.js` 暴露状态查询与在线测试 API。
- [ ] 4.4 通过 `feature flag: marketDataEngine` 控制是否走新 Engine，回退到旧实现无需重新打包。

## 5. 健康度与可观测性

- [ ] 5.1 在主进程侧按 Vendor 记录 `lastSuccessAt / lastErrorAt / latencyMs / successCount / errorCount`。
- [ ] 5.2 在渲染端状态栏增加“数据源状态”小图标并提供在线测试入口。
- [ ] 5.3 在 `tools/verify-market-data.mjs` 写入离线断言脚本，覆盖优先级、降级、合并、重试、字段异常隔离。

## 6. 验证与归档

- [ ] 6.1 运行 `comet guard market-data-engine open --apply` 推进阶段。
- [ ] 6.2 运行 `npm run build` 与新增的离线断言脚本，记录到 `openspec/changes/market-data-engine/verification.md`。
- [ ] 6.3 在 `openspec/changes/market-data-engine/` 下更新本任务清单后归档。

```

## openspec/changes/market-data-engine/specs/market-data-engine/spec.md

- Source: openspec/changes/market-data-engine/specs/market-data-engine/spec.md
- Lines: 1-88
- SHA256: cc4529b5153dd75fb7a4d09326abd9432594210d70f86fa9751ca8fb1335824b

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 统一数据源注册与启用
The system SHALL 在 Electron 主进程侧维护按数据类型（quote / kline / market / funds）分组的 Vendor 注册表，并按配置文件的优先级顺序选择候选 Vendor。Vendor 必须支持运行时启用与禁用。

#### Scenario: 单 Vendor 提供数据
- **WHEN** 数据类型下只启用了一个 Vendor 且请求成功
- **THEN** Engine 直接返回该 Vendor 的结果并在状态中标记其最近成功时间

#### Scenario: Vendor 被禁用
- **WHEN** 启动时或运行时将某 Vendor 标记为禁用
- **THEN** Engine 不再把它作为候选且健康度中显示“已禁用”

### Requirement: 主 Vendor 失败自动降级
The system MUST 在候选 Vendor 出现网络错误、超时或解析错误时，按优先级尝试下一个候选，并在所有候选失败时返回结构化错误而非抛出异常。

#### Scenario: 主 Vendor 网络超时
- **WHEN** 主 Vendor 在指定超时内未返回
- **THEN** Engine 在不退避的前提下立即尝试下一个 Vendor，并把该 Vendor 标记为“最近错误”

#### Scenario: 所有候选失败
- **WHEN** 所有候选 Vendor 都在允许的重试与退避范围内失败
- **THEN** Engine 返回包含 `errorKind: "all-failed"` 的结构化结果，不抛出未捕获异常

### Requirement: 并发请求合并与 TTL 缓存
The system MUST 在同一数据类型与同一请求 key 下合并并发请求，并使用可配置的 TTL 缓存短时复用结果，避免在刷新周期内重复访问第三方接口。

#### Scenario: TTL 内的并发请求
- **WHEN** 同一 key 在 TTL 窗口内被发起第二次请求
- **THEN** Engine 复用首次 in-flight Promise，不发起新的外部请求

#### Scenario: TTL 过期后的请求
- **WHEN** 上一次结果超过 cacheTTL 仍未更新
- **THEN** 新的请求触发实际数据获取并刷新缓存

### Requirement: 有限重试与指数退避
The system MUST 对网络层错误（超时、连接重置）执行有限次数的重试（默认最多 2 次）并按指数退避增加间隔；解析错误 MUST NOT 重试。

#### Scenario: 重试触发
- **WHEN** Vendor 抛错分类为网络层错误
- **THEN** Engine 在配置的预算内重试并在失败时尝试下一个 Vendor

#### Scenario: 解析错误不重试
- **WHEN** Vendor 返回非预期结构或空关键字段
- **THEN** Engine 立即记录错误并尝试下一个 Vendor，不再重试同一 Vendor

### Requirement: 字段异常隔离
The system MUST 在 Vendor 返回结果时通过统一的字段校验钩子识别异常（例如缺字段、价格为负等）并丢弃该结果，不影响其他 Vendor 或后续请求。

#### Scenario: 异常字段被识别
- **WHEN** 某 Vendor 返回的报价缺少必要字段
- **THEN** 该结果被丢弃，Engine 继续尝试下一个 Vendor 并把异常记入该 Vendor 的健康度

### Requirement: 数据源健康度状态
The system SHALL 为每个 Vendor 维护最近成功时间、最近错误时间、平均延迟、成功与失败计数，并提供 IPC 供 UI 查看与在线测试。

#### Scenario: 查看状态
- **WHEN** renderer 发起 `data-source:status`
- **THEN** Engine 返回所有 Vendor 的状态摘要，按数据类型分组

#### Scenario: 在线测试单 Vendor
- **WHEN** renderer 发起 `data-source:test` 并指定 Vendor
- **THEN** Engine 在 5 秒内返回成功、解析失败或网络超时三态结果

### Requirement: 错误返回结构化
The system MUST 为所有数据请求返回稳定的 JSON 结构 `MarketResult`，其中 `data` 为成功数据或 `null`，`error` 为 `{kind, message, vendorId, observedAt}` 形态的对象。

#### Scenario: 错误结果可见
- **WHEN** Engine 聚合所有 Vendor 失败
- **THEN** `MarketResult.data` 为 `null`，`error.kind` 等于 `"all-failed"`，且 `error.vendorId` 指明最后失败的 Vendor

### Requirement: 现有 IPC 兼容
The system MUST 保留现有 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` IPC 的调用语义和返回结构；不得在没有兼容层的情况下删除或重命名。

#### Scenario: 旧调用方式仍可工作
- **WHEN** renderer 按现有参数与返回结构调用上述 IPC
- **THEN** 系统返回与未启用 Engine 之前语义一致的结果

#### Scenario: 新 IPC 不可用时的回退
- **WHEN** 用户通过 `feature flag: marketDataEngine` 关闭新 Engine

```

Full source: openspec/changes/market-data-engine/specs/market-data-engine/spec.md
