## 1. 底座与 Port/Adapter 契约

- [x] 1.1 在 `electron/market/` 下创建 `types.ts`，定义 `MarketRequest` / `MarketResult` / `MarketError` 与四类 `DataKind`。
- [x] 1.2 在 `electron/market/` 下创建 `Vendor` 接口与 `VendorContext`（含 `MetricsSink`、超时与代理）。
- [x] 1.3 在 `electron/market/` 下创建 `MetricsSink` 接口与内存实现 `InMemoryMetricsSink`。
- [x] 1.4 在 `electron/market/` 下创建 `datasources.json` 加载器与默认配置。

## 2. Engine 与缓存

- [x] 2.1 实现 `Engine.fetchQuote / fetchKline / fetchMarket / fetchFunds` 主入口。
- [x] 2.2 加入 `KeyedPromiseCache` 用于 in-flight 合并与 TTL 复用。
- [x] 2.3 加入网络错误分类与重试预算控制，解析错误直接降级。
- [x] 2.4 加入结果校验钩子 `validateResult`，缺字段或价格非数时丢弃并记指标。

## 3. Vendor 适配器迁移

- [x] 3.1 将 `electron/main.js` 中 Sina 报价调用抽成 `SinaQuoteVendor`。
- [x] 3.2 将东方财富 K 线抽成 `EastmoneyKlineVendor`。
- [x] 3.3 将大盘与资金流抽成 `EastmoneyMarketVendor` / `EastmoneyFundsVendor`。
- [x] 3.4 将 `src/api.ts` 中腾讯 fallback 抽成 `TencentFlashVendor` 并在默认配置中关闭，启用时由配置打开。

## 4. IPC 与兼容层

- [x] 4.1 在主进程侧加 IPC `data-source:status` 与 `data-source:test`。
- [x] 4.2 把现有 `fetchQuotes` / `fetchKline` / `fetchMarket` / `fetchFunds` 的 handler 改为 `MarketData.fetch(...)`。
- [x] 4.3 在 `electron/preload.js` 暴露状态查询与在线测试 API。
- [x] 4.4 通过 `feature flag: marketDataEngine` 控制是否走新 Engine，回退到旧实现无需重新打包。

## 5. 健康度与可观测性

- [x] 5.1 在主进程侧按 Vendor 记录 `lastSuccessAt / lastErrorAt / latencyMs / successCount / errorCount`。
- [x] 5.2 在渲染端状态栏增加“数据源状态”小图标并提供在线测试入口。
- [x] 5.3 在 `tools/verify-market-data.mjs` 写入离线断言脚本，覆盖优先级、降级、合并、重试、字段异常隔离。

## 6. 验证与归档

- [x] 6.1 运行 `comet guard market-data-engine open --apply` 推进阶段。
- [x] 6.2 运行 `npm run build` 与新增的离线断言脚本，记录到 `openspec/changes/market-data-engine/verification.md`。
- [x] 6.3 在 `openspec/changes/market-data-engine/` 下更新本任务清单后归档。
