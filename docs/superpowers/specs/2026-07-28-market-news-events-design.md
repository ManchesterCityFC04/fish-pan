---
comet_change: market-news-events
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-market-news-events
status: final
---

# Design Doc: market-news-events

> 本文档是对 OpenSpec `openspec/changes/market-news-events/design.md`（高层方案）的深度技术细化，不替代它。OpenSpec delta spec 仍为 canonical spec。

## 1. 目标与范围

补齐 fish-pan 缺失的个股新闻、公司公告与市场快讯能力，把当前一键诊断中恒为 `null` 的 `news` 字段替换为真实的 `NewsItem[]`，并在自选行与详情页提供可见入口。

**非目标**：不引入财报/分红/股东/龙虎榜/融资融券/北向；不爬取付费研报；不生成情绪分数；不绕过 TLS；不保存不受限制的全文。

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────┐
│ Renderer (React)                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ WatchlistRow │  │ Detail (news │  │ OneClickDiag   │  │
│  │  + news time │  │  + announce) │  │  news: NewsItem│  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────┘  │
│         │ electronAPI.news.*  │                 │ props     │
└─────────┼─────────────────────┼─────────────────┼──────────┘
          │                     │                 │ feature flag
┌─────────▼─────────────────────▼─────────────────▼──────────┐
│ Electron Main (electron/market/)                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ MarketData Engine (reuse from market-data-engine)   │   │
│  │  ─ registry: news | announcement | flash            │   │
│  │  ─ TTL cache + request coalescing                   │   │
│  │  ─ fallback + retry/backoff + validateResult        │   │
│  │  ─ MetricsSink (health)                             │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │ Port: NewsVendor                  │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │ vendors/news/                                        │   │
│  │  eastmoney-search │ xueqiu-news   │ eastmoney-ann    │   │
│  │  eastmoney-flash  │ cls-flash     │                   │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

复用 `market-data-engine` 的 Port/Adapter/TTL/降级/健康度体系，不另起请求栈。新增三类 `DataKind` 与五个 Vendor。

## 3. 核心数据结构

```ts
type NewsDataKind = 'news' | 'announcement' | 'flash';

interface NewsItem {
  id: string;              // `${kind}:${vendorId}:${rawId|urlHash}`
  kind: NewsDataKind;
  title: string;           // 已 stripHtml，trim
  url: string;             // https/http only
  source: string;          // '东方财富' | '雪球' | '财联社' | ...
  publishedAt: number;     // epoch ms
  summary?: string;        // ≤ 200 字，已 stripHtml + truncate
  codes: string[];         // ['sh600000'] 等
  lang: 'zh-CN';
}
```

**约束**：
- `title` 必须非空；`url` 与 `publishedAt` 必须存在，否则被 `validateResult` 丢弃。
- `summary` 仅在 Vendor 能稳定提供时填写；缺省不阻塞渲染。
- `codes` 至少包含触发查询的股票代码；跨标的新闻按实际关联填充。

## 4. Vendor 适配层

所有 Vendor 实现 `NewsVendor` 接口（`MarketData` Port 的子类型）：

```ts
interface NewsVendor {
  id: string;
  kind: NewsDataKind;
  supports(code: string): boolean;        // 市场判定（A/HK/US）
  fetch(req: NewsRequest, signal: AbortSignal): Promise<NewsItem[]>;
}
```

| Vendor | kind | 市场 | TTL cache | 备注 |
|---|---|---|---|---|
| `eastmoney-search` | news | CN | 10m | 东方财富个股搜索 API |
| `xueqiu-news` | news | CN | 10m | 雪球新闻 API，补全 |
| `eastmoney-announcement` | announcement | CN | 30m | 东方财富 stock 公告 |
| `eastmoney-flash` | flash | ALL | 2m | 东方财富快讯 |
| `cls-flash` | flash | ALL | 2m | 财联社电报 |

每个 Vendor 必须：
- 走标准 `https`；禁止 `verify=false` / `rejectUnauthorized: false`。
- 在文件头注释记录 endpoint、字段校准状态、已知限制、ToS 提示。
- 通过 `validateResult` 钩子校验后再返回；缺字段记录丢弃。
- 对 GBK / HTML / JSON 各自解析，输出统一 `NewsItem`。

## 5. 字段标准化与去重

集中在 `MarketData` Engine 层：

1. **stripHtml**：移除 title / summary 中的 HTML 标签与转义实体。
2. **normalizeCode**：复用 `src/api.ts` 的 `resolveCode` 把原始代码规范化为 `sh/sz/hk/bj` 前缀。
3. **truncate summary**：超 200 字截断并加 `…`。
4. **id 生成**：`${kind}:${vendorId}:${urlHash|rawId}`，保证跨 Vendor 稳定。
5. **去重**：在 Engine 返回前按 `(url | hash(title))` 合并；同一 `(code, kind, id)` 在缓存窗口内只返回一次。

## 6. 缓存与 TTL

复用 `MarketData` 的 `KeyedPromiseCache`：

- `news`：`inFlight=1s`，`cache=10m`
- `announcement`：`inFlight=2s`，`cache=30m`
- `flash`：`inFlight=1s`，`cache=2m`

缓存 key = `${kind}:${code}`（flash 无 code 时用 `flash:market`）。TTL 内并发请求合并为一次外部调用。

## 7. 失败隔离与降级

- 单 Vendor 抛错或返回异常 → Engine 记录该 Vendor 健康度失败，按优先级尝试下一个。
- 所有 Vendor 失败 → 返回 `{ data: null, error: { kind: 'all-failed', ... } }`，UI 显示“暂无新闻”，诊断 `news=[]`（非 `null`）。
- 港美股无任何 `supports=true` 的 Vendor → UI 显示“不适用”，不是错误。

## 8. UI 接入

### 8.1 详情页
- 底部新增“新闻”和“公告”两个标签，复用现有详情页样式。
- 列表按 `publishedAt` 倒序；每条显示标题、来源、时间、可折叠 summary。
- 无数据显示“暂无新闻”；不可用显示“不适用”。

### 8.2 自选列表行
- `StockRow.tsx` 右侧追加“最新新闻时间”单行：
  - 当日 → `HH:mm`
  - 昨日 → `昨天`
  - 更早 → `MM-DD`
  - 无 → `暂无`
- 取该股 `news` 类第一条（最新）的 `publishedAt`。

### 8.3 一键诊断
- `App.tsx` 在调用 `OneClickDiagnosis` 处按 `feature flag: marketNewsEvents` 决定：
  - 开启 → `news: NewsItem[]`（取最近 5 条，含 title/source/url/publishedAt）
  - 关闭 → `news: null`（维持现状，向后兼容）
- `buildDiagnosisBundle` 已支持 `news: DiagnosisNewsItem[] | null`，无需改其结构。

## 9. IPC 契约

主进程暴露（经 preload 的 `electronAPI.news`）：

| IPC | 入参 | 返回 |
|---|---|---|
| `news:list` | `{ kind: NewsDataKind, code: string }` | `{ data: NewsItem[] \| null, error?: MarketError }` |
| `news:flash` | `{}` | `{ data: NewsItem[] \| null, error?: MarketError }` |
| `news:status` | `{}` | 各 Vendor 健康度摘要 |

渲染端只消费 `NewsItem[]`，不感知 Vendor 差异。

## 10. 安全与合规

- TLS 验证不绕过；仅 https/http。
- 不请求需要鉴权的私有接口；不持久化全文。
- 每个 Vendor 注释记录字段校准状态与 ToS 提示。
- 诊断 bundle 中 `news` 仅含标题/来源/URL/时间，不含完整正文。

## 11. Feature Flag 与回滚

- `feature flag: marketNewsEvents`（默认关闭）：
  - 关闭 → `App.tsx` 传 `news: null`，IPC 不被调用，行为等同现状。
  - 开启 → 走完整 Vendor 链路。
- Adapter / IPC / 缓存 / 健康度全量开发但默认关闭，可随时通过 flag 切换。

## 12. 测试策略

### 12.1 `tools/verify-news-adapters.mjs`（纯函数 + mock）
- 字段标准化：缺 `url` 或 `publishedAt` → 丢弃且不污染其他条目。
- 去重：同 URL / 同 `titleHash` 合并为一条。
- TTL 行为：cache 窗口内复用，过期后重新请求。
- 失败隔离：单 Vendor 抛错不影响其他 Vendor。
- 摘要裁剪：`summary > 200` 字截断。
- `id` 稳定性：同一原始记录多次抓取生成相同 id。

### 12.2 `tools/verify-diagnosis.mjs`（增量）
- `news: NewsItem[]` 时 bundle 含摘要与时间戳。
- `news: null` 时 bundle 行为与原版一致（向后兼容）。

### 12.3 手动验证
- A 股详情页“新闻/公告”标签可见且按时间倒序。
- 自选行右侧显示最新新闻时间。
- 一键诊断（flag 开启）传入真实新闻；flag 关闭维持现状。
- 关闭某 Vendor 后健康度标红，UI 不崩。

## 13. 实现顺序（与 tasks.md 对齐）

1. `MarketData` 注册三类 `DataKind` 与默认 `datasources.json`。
2. 落地四个 Vendor + 字段标准化与去重。
3. 详情页与自选行 UI 接入。
4. 一键诊断 `news` 接入 + feature flag。
5. 离线断言脚本与诊断增量用例。
6. `comet guard market-news-events design --apply` → phase=build。

## 14. 开放问题

- 是否允许用户在设置中调整新闻 TTL？建议本期不开放 Vendor 切换，仅保留默认 TTL。
- 港美股是否接入海外 RSS 降级？建议后续增量。
- 关键词过滤 UI？建议后续增量，本期仅时间倒序。

## 15. Spec Patch

无。当前 OpenSpec delta spec（`specs/market-news-events/spec.md`）已覆盖本设计的所有验收场景与边界条件，无需回写。
