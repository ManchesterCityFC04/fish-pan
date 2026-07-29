---
change: market-data-engine
design-doc: docs/superpowers/specs/2026-07-28-market-data-engine-design.md
base-ref: 99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0
openspec: openspec/changes/market-data-engine/{design.md,tasks.md,specs/}
depends-on: market-news-events (已落地最小 NewsEngine，本 change 扩展为 MarketData)
---

# Implementation Plan: market-data-engine

## 0. 元信息

- **change**: `market-data-engine`
- **OpenSpec canonical**: `openspec/changes/market-data-engine/design.md` + `openspec/changes/market-data-engine/specs/`
- **设计文档**: `docs/superpowers/specs/2026-07-28-market-data-engine-design.md`
- **基线 commit**: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- **OpenSpec 任务边界**: `openspec/changes/market-data-engine/tasks.md`（6 节，25 个 checkbox）
- **依赖**: `market-news-events` 已落地一个最小 `NewsEngine`（KeyedPromiseCache + HealthTracker + Vendor 注册），本 change 将其推广为 `MarketData` 支持 4 类市场 DataKind + 3 类新闻 DataKind。

## 1. 目标摘要

按 OpenSpec tasks.md 与 Design Doc，把现有散落的报价/K线/大盘/资金流调用统一到 `MarketData` 抽象上：

1. 把 `MarketData` 的 `DataKind` 扩展为 `quote | kline | market | funds | news | announcement | flash` 7 类，并在 `datasources.json` 中固化 TTL/优先级/并发预算/启用标志。
2. 落地 6 个市场 Vendor（sina/tencent/eastmoney × quote/kline/market/funds），统一输出 `MarketResult<T>`。
3. 在 `MarketData` Engine 中实现字段校验、TTL 缓存、并发合并、按 Vendor 启停、错误隔离、健康度统计。
4. 在主进程侧把 `fetch-quotes / fetch-kline / fetch-market / fetch-funds` 与 `news:list / news:flash / news:status` 全部转调 `MarketData`，新增 IPC `data-source:status` 与 `data-source:test`。
5. 在 preload 暴露 `electronAPI.dataSource.{status,test}` 与 `electronAPI.news.*`。
6. 新增 `tools/verify-market-data.mjs` 离线断言；保证 `tools/verify-news-adapters.mjs` 与 `tools/verify-diagnosis.mjs` 不回归。
7. 运行 `npm run build` 并把全部证据落盘到 `openspec/changes/market-data-engine/verification.md`。

### 1.1 非目标（与 Design Doc §1 一致）

不引入 WebSocket/云端代理；不引入新闻/公告/财报（已有 market-news-events）；不持久化远程行情；不绕过 TLS；不复制 PanWatch Python 实现。

## 2. 架构与边界

```
Renderer (React)
  fetchQuotes / fetchKline / fetchMarket / fetchFunds   ←  既有 IPC，保持兼容
  dataSource.status / dataSource.test                   ←  新 IPC
  news.list / news.flash / news.status                  ←  market-news-events IPC

Electron Main (electron/)
  ipcMain.handle('fetch-quotes' | 'fetch-kline' | 'fetch-market' | 'fetch-funds'
                | 'data-source:status' | 'data-source:test'
                | 'news:list' | 'news:flash' | 'news:status')
            │
            ▼
  electron/market/
   ├─ types.ts         MarketDataKind / MarketRequest / MarketResult
   │                   MarketVendor / MarketError / VendorHealth
   ├─ normalize.ts     stripHtml / makeNewsId / normalizeCode / hashTitle
   ├─ dedupe.ts        dedupeNews
   ├─ registry.ts      MarketData (KeyedPromiseCache + HealthTracker + 7 kinds)
   ├─ datasources.json 7 类 TTL/inFlight/优先级/启用标志 + 11 Vendor
   ├─ index.ts         注册所有 Vendor
   └─ vendors/
       ├─ market/
       │   ├─ sina-quote.ts           (主力)
       │   ├─ tencent-quote.ts        (fallback,默认禁用)
       │   ├─ eastmoney-kline.ts      (主力)
       │   ├─ tencent-kline.ts        (fallback,默认禁用)
       │   ├─ eastmoney-market.ts
       │   └─ eastmoney-funds.ts
       └─ news/
           ├─ eastmoney-search.ts
           ├─ xueqiu-news.ts
           ├─ eastmoney-announcement.ts
           ├─ eastmoney-flash.ts
           └─ cls-flash.ts

electron/main.js         统一 setupMarketIpc() 处理 9 个 handler
electron/preload.js      electronAPI.{dataSource,news}.*
src/types.ts             MarketStatusResult + ElectronAPI.dataSource
src/api.ts               (renderer 侧不变；既有 fetchKline 等继续可用)
```

## 3. 依赖图

```
P0  共享类型（types.ts 扩展 DataKind 至 4 类）
    │
    ├─► P1  datasources.json（7 类 TTL + 11 Vendor 优先级 + enabled 标志）
    │
    ├─► P2  Vendor 适配器（6 个 mock Vendor 落地）
    │
    └─► P3  MarketData 主类（registry.ts 通用化）
            │
            ├─► P4  IPC 兼容层（electron/main.js 9 个 handler）
            │       │
            │       └─► P5  preload + src/types 暴露
            │
            └─► P6  离线断言（verify-market-data.mjs）
                    │
                    └─► P7  真实 Vendor 在线烟雾（推迟）
```

P3 之前的任务都可独立工作；P6 不依赖 P4/P5。P7 与 P8 串行最后做。

## 4. 任务清单

### Phase 1 — 共享基础

#### Task 1：`electron/market/types.ts` 扩展 DataKind
**依赖**: None

- [x] `MarketDataKind = 'quote' | 'kline' | 'market' | 'funds'` 定义。
- [x] `MarketRequest / MarketResult<T> / MarketError / MarketVendor<T>` 定义。
- [x] `VendorHealth.kind` 改为 `AnyDataKind` 联合类型。
- [x] 与 Design Doc §3 完全一致。

**Files**: `electron/market/types.ts`

**Verification**: `npm run build` 通过。

---

#### Task 2：`datasources.json` 增加 4 类 + enabled 标志
**依赖**: Task 1

- [x] kinds 含 quote/kline/market/funds + news/announcement/flash 共 7 类。
- [x] vendors 含 11 个，priority 与 enabled 字段。
- [x] tencent-quote / tencent-kline 默认 enabled=false。

**Files**: `electron/market/datasources.json`

**Verification**: JSON 解析通过。

---

#### Task 3：6 个市场 Vendor 文件
**依赖**: Task 1, 2

- [x] `electron/market/vendors/market/sina-quote.ts`：mock 实现，含 supports 与 fetch。
- [x] `electron/market/vendors/market/tencent-quote.ts`：fallback，默认 disabled。
- [x] `electron/market/vendors/market/eastmoney-kline.ts`：mock 实现。
- [x] `electron/market/vendors/market/tencent-kline.ts`：fallback，默认 disabled。
- [x] `electron/market/vendors/market/eastmoney-market.ts`：mock 大盘指数。
- [x] `electron/market/vendors/market/eastmoney-funds.ts`：mock 资金流（industry/concept/stock）。
- [x] 所有文件头注释含 endpoint 草稿 + ToS 提示 + 无 verify=false 声明。

**Files**: `electron/market/vendors/market/*.ts`

**Verification**: `npm run build` 通过。

---

#### Task 4：`MarketData` 主类支持 4 类市场 DataKind
**依赖**: Task 1, 2, 3

- [x] `MarketData` 类（在 registry.ts 中）取代 `NewsEngine`。
- [x] `registerMarketVendor` / `registerNewsVendor` 分离。
- [x] `fetch(req: MarketRequest)` 通用入口；`fetchNews / fetchFlash` 保留 news 三类入口。
- [x] `KeyedPromiseCache` 同时支持两类返回（`MarketResult | NewsFetchResult`）。
- [x] `HealthTracker` 接受 `AnyDataKind`。
- [x] 旧 `getNewsEngine()` 别名保留兼容。

**Files**: `electron/market/registry.ts`

**Verification**: `tools/verify-market-data.mjs` 通过。

---

### Phase 2 — IPC 兼容层

#### Task 5：`electron/market/index.ts` 注册所有 Vendor
**依赖**: Task 3, 4

- [x] `ensureMarketDataVendorsRegistered()` 注册 6 个市场 + 5 个新闻 Vendor。
- [x] 重新导出 `getMarketData` / `getNewsEngine` 与类型。

**Files**: `electron/market/index.ts`

**Verification**: `npm run build` 通过。

---

#### Task 6：`electron/main.js` 统一 setupMarketIpc
**依赖**: Task 5

- [x] 新增 `setupMarketIpc()` 替换旧的 `setupNewsIpc()`。
- [x] 9 个 IPC handler：`fetch-quotes / fetch-kline / fetch-market / fetch-funds / data-source:status / data-source:test / news:list / news:flash / news:status`。
- [x] 所有 handler try/catch 兜底，返回兼容结构。
- [x] `app.whenReady` 中调用 `setupMarketIpc()`。

**Files**: `electron/main.js`

**Verification**: `npm run build` 通过；既有 fetch-kline 行为不变。

---

#### Task 7：`electron/preload.js` + `src/types.ts` 暴露
**依赖**: Task 6

- [x] `preload.js` 新增 `electronAPI.dataSource.{status,test}`。
- [x] `src/types.ts` 新增 `MarketVendorHealth / MarketStatusResult` 类型。
- [x] `ElectronAPI` 接口增补 `dataSource` 字段。

**Files**: `electron/preload.js`、`src/types.ts`

**Verification**: `npm run build` 通过。

---

### Phase 3 — 离线断言

#### Task 8：`tools/verify-market-data.mjs`
**依赖**: Task 4

- [x] 复制 `KeyedPromiseCache` / `HealthTracker` / `Engine` 行为到独立脚本。
- [x] 覆盖：enabled vendors are selected / disabled vendors skipped / vendor throwing isolated / all-failed error / dedupe。
- [x] `node tools/verify-market-data.mjs` 退出码 0。

**Files**: `tools/verify-market-data.mjs`

**Verification**: 自验收。

---

### Phase 4 — 构建与归档

#### Task 9：`npm run build` + 验证证据
**依赖**: Task 1-8

- [x] `npm run build` 退出码 0。
- [x] `node tools/verify-market-data.mjs` 退出码 0。
- [x] `node tools/verify-news-adapters.mjs` 不回归。
- [x] `node tools/verify-diagnosis.mjs` 不回归。
- [x] `verification.md` 完整。

**Files**: `openspec/changes/market-data-engine/verification.md`

---

## 5. Definition of Done

- [x] 全部 8 个 Task 的验收标准勾选为 `[x]`。
- [x] `npm run build` 退出码 0。
- [x] 三个 verify 脚本退出码 0。
- [x] `verification.md` 完整，含 commit SHA 与时间戳。
- [x] 旧 IPC 行为兼容（fetch-quotes / fetch-kline / fetch-market / fetch-funds 返回结构稳定）。
- [x] 回滚方式清楚说明（IPC handler 抛错时返回兼容结构；彻底回退 `git revert`）。