---
comet_change: market-data-engine
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-market-data-engine
status: final
---

# Design Doc: market-data-engine

> 本文档是对 OpenSpec `openspec/changes/market-data-engine/design.md`（高层方案）的深度技术细化，不替代它。OpenSpec delta spec 仍为 canonical spec。

## 1. 目标与范围

把现有散落在 `electron/main.js` 与 `src/api.ts` 的报价/K线/大盘/资金流调用统一到一个 `MarketData` 抽象之上，提供注册、优先级、自动降级、TTL 缓存、请求合并、有限重试、健康度与在线测试能力；保持现有 renderer IPC 兼容。

**非目标**：不引入 WebSocket、云端代理、新闻/公告/财报；不引入 React Query 等渲染端缓存库；不持久化远程行情与健康度历史；不绕过 TLS；不复制 PanWatch Python 实现。

## 2. 架构总览

```
┌────────────────────────────────────────────────────────┐
│ Renderer (React)                                       │
│  fetchQuotes / fetchKline / fetchMarket / fetchFunds    │
│  dataSource.status / dataSource.test                   │
└────────────────────────────┬───────────────────────────┘
                             │ electronAPI.* (preload)
┌────────────────────────────▼───────────────────────────┐
│ Electron Main (electron/main.js)                       │
│  ipcMain.handle('fetch-quotes' | 'fetch-kline' |       │
│                 'fetch-market' | 'fetch-funds'         │
│                 'data-source:status' | 'data-source:test')│
│            │                                            │
│            ▼                                            │
│  electron/market/                                       │
│   ├─ types.ts        MarketRequest/Result/Error/Kind   │
│   ├─ normalize.ts    validateResult + 字段映射           │
│   ├─ dedupe.ts       备用（去重合并）                     │
│   ├─ registry.ts     MarketData + KeyedPromiseCache     │
│   │                  + HealthTracker + MetricsSink      │
│   ├─ datasources.json 4 类 DataKind 的 TTL/优先级       │
│   └─ vendors/                                         │
│       ├─ quote/                                       │
│       │   ├─ sina.ts             (主力)                  │
│       │   └─ tencent.ts           (fallback,默认禁用)     │
│       ├─ kline/                                       │
│       │   ├─ eastmoney.ts        (主力)                  │
│       │   └─ tencent.ts           (fallback,默认禁用)     │
│       ├─ market/                                      │
│       │   └─ eastmoney.ts                            │
│       └─ funds/                                       │
│           ├─ eastmoney-industry.ts                    │
│           ├─ eastmoney-concept.ts                     │
│           └─ eastmoney-stock.ts                       │
└────────────────────────────────────────────────────────┘
```

## 3. 核心数据结构

```ts
type MarketDataKind = 'quote' | 'kline' | 'market' | 'funds';

interface MarketRequest {
  kind: MarketDataKind;
  code: string;             // 'sh600000' / 'all' / 'industry'
  // kline 专用
  klt?: 'm1'|'m5'|'m15'|'m30'|'m60'|'day'|'week'|'month'|'trend';
  len?: number;              // K线根数
  // funds 专用
  category?: 'industry'|'concept'|'stock';
  limit?: number;
}

interface MarketResult<T> {
  data: T | null;
  error?: MarketError;
  staleAfter?: number;       // ms；超过即视为陈旧
}

interface MarketError {
  kind: 'all-failed' | 'not-applicable' | 'no-main' | 'invalid-input' | string;
  vendor?: string;
  message?: string;
}

interface MarketVendor<T> {
  id: string;
  kind: MarketDataKind;
  supports(req: MarketRequest): boolean;
  fetch(req: MarketRequest, signal: AbortSignal): Promise<T>;
}
```

## 4. Engine 与缓存

复用 `KeyedPromiseCache`（已落地于 `electron/market/registry.ts`）：

```ts
class KeyedPromiseCache {
  private cache = new Map<string, { result: MarketResult<unknown>; cachedAt: number }>();
  private inflight = new Map<string, Promise<MarketResult<unknown>>>();
  async getOrFetch(key: string, ttlMs: number, fetch: () => Promise<MarketResult<unknown>>): Promise<MarketResult<unknown>>;
}
```

- key = `${kind}:${code}:${klt || ''}:${category || ''}`。
- TTL 内并发请求合并为一次外部 `fetch`。
- TTL 过期后下一次请求重新调用。

`MarketData` 主类：

```ts
class MarketData {
  registerVendor(v: MarketVendor<unknown>): void;
  fetch<T>(req: MarketRequest, signal?: AbortSignal): Promise<MarketResult<T>>;
  status(): { vendors: VendorHealth[] };
  resetCache(): void;
}
```

## 5. TTL 默认值（datasources.json）

| kind | ttlMs | inFlightMs | concurrency | 默认 Vendor |
|---|---|---|---|---|
| quote | 1500 | 1500 | 4 | sina（主力）；tencent（默认禁用） |
| kline | 60000 | 2000 | 2 | eastmoney（主力）；tencent（默认禁用） |
| market | 8000 | 1000 | 1 | eastmoney |
| funds | 15000 | 1000 | 2 | eastmoney-industry/concept/stock |

## 6. 重试与降级

- **网络层错误**（超时、连接重置、DNS 失败）：同一 Vendor 最多重试 2 次，总时间预算 5s。
- **解析错误**（字段缺失、类型错误）：不重试，记录到 health 后立即尝试下一个 Vendor。
- **所有 Vendor 失败**：返回 `{ data: null, error: { kind: 'all-failed', vendor, message } }`，由调用方展示“数据暂不可用”。
- **港美股无 Vendor**：`supports()` 返回 false 时直接跳过该 Vendor；无任何候选时返回 `{ data: null, error: { kind: 'not-applicable' } }`。

## 7. 健康度

`HealthTracker` 维护每个 Vendor：
- `lastSuccessAt` / `lastErrorAt` (epoch ms)
- `latencyMs` (最近一次)
- `successCount` / `errorCount`
- `lastError?: string`

IPC：
- `data-source:status` → `{ vendors: VendorHealth[] }`
- `data-source:test` `{ vendorId, kind, code }` → `{ ok, latencyMs, error? }`，5s 超时。

## 8. IPC 兼容层

`electron/main.js` 现有 handler 改为：

```js
ipcMain.handle('fetch-quotes', async (_, { codes }) => {
  const market = getMarketData();
  const result = await market.fetchQuote({ codes });
  // 返回与旧实现兼容的字符串或结构化对象
});
```

返回结构必须与现状保持稳定（`fetch-quotes` 仍是 GBK 文本；`fetch-kline` 仍是 `{ bars, preClose, name, error? }`；`fetch-market` 仍是 `{ rows }`；`fetch-funds` 仍是 `{ rows, error? }`）。

`preload.js` 暴露 `dataSource: { status, test }`。

## 9. Feature Flag 与回滚

- `feature flag: marketDataEngine` 默认关闭；
- 关闭 → 旧 handler 直接返回现状；
- 开启 → handler 转调 `MarketData.fetch(...)`，保留旧返回结构。

回滚：关闭 flag 即可，行为完全等同现状。

## 10. 安全与合规

- 所有 Vendor Adapter 走 https；禁止 `verify=false` / `rejectUnauthorized: false`。
- 字段映射集中到 Adapter；`validateResult` 拒绝异常。
- 每个 Vendor 文件头注释记录 endpoint、字段校准状态、ToS 提示。

## 11. 测试策略

### 11.1 `tools/verify-market-data.mjs`
- 优先级高的 Vendor 失败时回退到下一优先级。
- 同优先级并发 fan-out（mock 计数器验证）。
- 单 Vendor 抛错不污染其他 Vendor。
- TTL 窗口内并发请求合并为一次外部调用。
- 字段异常（缺字段、价格非数）被丢弃并记录到 health。
- 全部 Vendor 失败时返回 `error.kind = 'all-failed'`。

### 11.2 兼容回归
- `npm run build` 通过；
- `tools/verify-diagnosis.mjs` 不回归（既有 29/29 PASS 维持）。

## 12. 实现顺序（与 tasks.md 对齐）

1. `electron/market/types.ts` 扩展 DataKind 至 4 类。
2. `datasources.json` 增加 4 类 TTL/inFlight/优先级。
3. 4 类 Vendor mock（sina/tencent/eastmoney × quote/kline/market/funds）。
4. `MarketData` 主类支持 4 类。
5. IPC handler 替换为 `MarketData.fetch(...)`。
6. preload 暴露 `dataSource.{status,test}`。
7. `tools/verify-market-data.mjs` 离线断言。
8. `npm run build` + `verification.md`。

## 13. 与 market-news-events 的关系

`market-news-events` 已落地一个最小 `NewsEngine`（`KeyedPromiseCache` + `HealthTracker`），其抽象与本 change 完全一致。本 change 落地后：
- `electron/market/registry.ts` 的 `MarketData` 取代 `NewsEngine`，但保留相同的 API 形状（`registerVendor` / `fetch` / `status` / `resetCache`）。
- `electron/market/index.ts` 重构，使 news/announcement/flash 三类 Vendor 注册到统一 `MarketData`。
- 新增 IPC `data-source:status` 与既有 IPC `news:status` 由同一后端字段填充。

## 14. 开放问题

- 健康度历史是否需要持久化？当前为内存；如需后续增量。
- Vendor 是否支持 `proxyUrl`？当前不支持，避免误用；如需新增独立 change。
- 多数据源 (fx) 是否在本 change 范围？建议后续增量（已声明非目标）。

## 15. Spec Patch

无。当前 OpenSpec delta spec（`specs/market-data-engine/spec.md`）已覆盖所有 9 条 ADDED Requirements 与 4 个 Scenario；与设计完全一致，无需回写。
