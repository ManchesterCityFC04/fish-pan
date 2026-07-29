# Brainstorm Summary

- Change: market-data-engine
- Date: 2026-07-28

## 用户已确认的关键决策

- **Vendor 组合**：保持 `proposal.md` 范围不变（新浪/东方财富/腾讯 fallback）。
- **DataKind**：四种 `quote | kline | market | funds`，每类独立 Vendor 注册与 TTL。
- **feature flag 与回滚**：通过 `feature flag: marketDataEngine` 切换新旧 IPC handler 路径；关闭时回退到现状。
- **架构**：复用 market-news-events 已落地的 `electron/market/{types,normalize,dedupe,registry,vendors,datasources.json,index.ts}` 模式，扩展 DataKind 至 4 类（quote/kline/market/funds）。
- **IPC 兼容**：保留 `fetchQuotes/fetchKline/fetchMarket/fetchFunds` 既有返回结构；handler 内部转调 `MarketData.fetch(...)`。
- **测试策略**：纯函数 + 离线断言（`tools/verify-market-data.mjs`）；不引入 Vitest。

## 关键取舍与风险

- **Tencent fallback 默认禁用**：避免触发页面限流；用户启用时受 `datasources.json` 控制。
- **健康度仅内存**：重启清零；持久化留待后续增量。
- **重试仅网络层错误**：解析错误不重试，避免无效放大。
- **TLS 不绕过**：所有 Vendor Adapter 走 https；禁止 `verify=false` / `rejectUnauthorized: false`。
- **PanWatch Python 实现不移植**：仅借鉴分层与契约。
- **market-news-events 已落地一个最小 NewsEngine**：本 change 的 `MarketData` 与之共用 `KeyedPromiseCache` 与 `HealthTracker` 抽象，避免双套实现漂移。

## 测试策略

- `tools/verify-market-data.mjs`：复制 `electron/market/registry.ts` 与 Vendor 字段映射的纯函数，覆盖优先级、降级、合并、重试、字段异常隔离、TTL。
- 5 个 Vendor mock 化（与 market-news-events 同模式），离线即可跑通。
- `verification.md` 中标注实接/mock-only 取舍。

## Spec Patch

无。OpenSpec delta spec（`specs/market-data-engine/spec.md`）已覆盖 9 条 ADDED Requirements + 4 个 Scenario；与设计一致。

## 下一步

- 创建 Design Doc 至 `docs/superpowers/specs/2026-07-28-market-data-engine-design.md`。
- 用户确认 → 运行 `comet state set market-data-engine design_doc` + `comet guard market-data-engine design --apply`。