---
change: market-news-events
design-doc: docs/superpowers/specs/2026-07-28-market-news-events-design.md
base-ref: 99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0
openspec: openspec/changes/market-news-events/{design.md,tasks.md,specs/}
depends-on: market-data-engine (尚未落地 — 见 §11 依赖约束)
archived-with: 2026-07-29-market-news-events
---

# Implementation Plan: market-news-events

## 0. 元信息

- **change**: `market-news-events`
- **OpenSpec canonical**: `openspec/changes/market-news-events/design.md` + `openspec/changes/market-news-events/specs/`
- **设计文档**: `docs/superpowers/specs/2026-07-28-market-news-events-design.md`
- **基线 commit**: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- **OpenSpec 任务边界**: `openspec/changes/market-news-events/tasks.md`（4 节，11 个 checkbox）
- **关联工程文件**（只读参考）:
  - `electron/main.js`（约 906 行；现有 IPC 形态 `ipcMain.handle('fetch-kline' | 'fetch-market' | 'fetch-funds' | 'fetch-quotes' | 'db-*')`）
  - `electron/preload.js`（通过 `contextBridge.exposeInMainWorld('electronAPI', {...})` 暴露 IPC）
  - `src/api.ts`、`src/types.ts`、`src/views/StockRow.tsx`、`src/views/OneClickDiagnosis.tsx`、`src/diagnosis.ts`
- **既有校验脚本**: `tools/verify-{add-position,alerts,bundle,diagnosis,indicators}.mjs`（离线断言 Node 脚本，复制 src/*.ts 核心公式）

## 1. 目标摘要

按 OpenSpec tasks.md 与 Design Doc，补齐 fish-pan 缺失的个股新闻、公司公告、市场快讯能力：
1. 把 `MarketData` 的 `DataKind` 扩展为 `news | announcement | flash` 三类，并在 `datasources.json` 中固化 TTL/优先级/并发预算。
2. 落地五个 Vendor（eastmoney-search / xueqiu-news / eastmoney-announcement / eastmoney-flash / cls-flash），统一输出 `NewsItem`。
3. 在 `MarketData` Engine 中实现字段标准化、`(url|titleHash)` 去重、TTL/降级、健康度统计。
4. 暴露 IPC：`news:list` / `news:flash` / `news:status`，并在 preload 暴露为 `electronAPI.news.*`。
5. 详情页底部新增"新闻"和"公告"两个标签；`StockRow` 右侧追加"最新新闻时间"。
6. `App.tsx` 在调用 `OneClickDiagnosis` 处按 `feature flag: marketNewsEvents` 决定 `news` 是真实 `NewsItem[]` 还是 `null`；flag 默认关闭。
7. 新增 `tools/verify-news-adapters.mjs` 离线断言；增量更新 `tools/verify-diagnosis.mjs`。
8. 运行 `npm run build` 并把全部证据落盘到 `openspec/changes/market-news-events/verification.md`。

### 1.1 非目标（保持与 Design Doc §1 一致）

不引入财报/分红/股东/龙虎榜/融资融券/北向；不抓取付费研报；不直接生成情绪分数；不绕过 TLS；不保存不受限制的全文。

## 2. 架构与边界

```
Renderer (React)
  StockRow ─┐                ┌─ OneClickDiagnosis  ← news: NewsItem[] | null
            │ electronAPI.   │
            │  news.{list,   │
            │     flash,     │
            │     status}    │
            ▼                ▼
Electron Main (electron/)
  ipcMain.handle('news:list' | 'news:flash' | 'news:status')
            │
            ▼
  electron/market/  (新增目录)
   ├─ types.ts        NewsItem, NewsVendor, NewsRequest, MarketError
   ├─ normalize.ts    stripHtml / normalizeCode / truncate / hashTitle / makeId
   ├─ dedupe.ts       按 (url | titleHash) 合并
   ├─ vendors/news/
   │   ├─ eastmoney-search.ts
   │   ├─ xueqiu-news.ts
   │   ├─ eastmoney-announcement.ts
   │   ├─ eastmoney-flash.ts
   │   └─ cls-flash.ts
   ├─ datasources.json   news/announcement/flash 的 TTL/并发预算/默认优先级
   └─ index.ts           Vendor 注册入口（适配 market-data-engine 注册表契约）

electron/main.js        新增 3 个 ipcMain.handle
electron/preload.js     新增 electronAPI.news.{list, flash, status}
src/types.ts            新增 ElectronAPI.news + NewsItem 类型（renderer 端不感知 Vendor）
src/api.ts              新增 fetchNewsList / fetchNewsFlash / fetchNewsStatus
src/App.tsx             按 feature flag: marketNewsEvents 决定 news 取值
src/views/StockRow.tsx  右侧新增"最新新闻时间"span（HH:mm / 昨天 / MM-DD / 暂无）
src/views/<Detail>.tsx  底部新增"新闻"与"公告"两个 tab（按 publishedAt 倒序）
```

**关键契约（与 design.md §9 对齐）**：

```ts
type NewsDataKind = 'news' | 'announcement' | 'flash';

interface NewsItem {
  id: string;              // `${kind}:${vendorId}:${rawId|urlHash}`
  kind: NewsDataKind;
  title: string;           // 已 stripHtml + trim
  url: string;             // 必须 https/http
  source: string;          // '东方财富' | '雪球' | '财联社' | ...
  publishedAt: number;     // epoch ms
  summary?: string;        // ≤ 200 字
  codes: string[];         // ['sh600000'] 等
  lang: 'zh-CN';
}
```

**IPC 入参/返回**：

| IPC | 入参 | 返回 |
|---|---|---|
| `news:list` | `{ kind: NewsDataKind, code: string }` | `{ data: NewsItem[] \| null, error?: { kind: 'all-failed' \| 'not-applicable' \| string, vendor?: string } }` |
| `news:flash` | `{}` | `{ data: NewsItem[] \| null, error?: ... }` |
| `news:status` | `{}` | `{ vendors: Array<{ id: string, kind: NewsDataKind, ok: number, fail: number, lastError?: string }> }` |

## 3. 依赖图（自底向上）

```
P0  共享类型 + 纯函数（normalize / dedupe / id）
    │
    ├──► P1  单 Vendor 实现（先用 in-memory mock 跑通）
    │       │
    │       └──► P2  MarketData 注册入口 + datasources.json
    │               │
    │               ├──► P3  IPC main + preload
    │               │       │
    │               │       └──► P4  renderer API + types
    │               │               │
    │               │               ├──► P5  StockRow 时间戳
    │               │               ├──► P6  详情页 标签
    │               │               └──► P7  App.tsx feature flag 接线
    │               │
    │               └──► P8  离线断言（verify-news-adapters.mjs + diagnosis 增量）
    │                       │
    │                       └──► P9  真实 Vendor 校验（在线最小烟雾）
    │
    └──► P10 文档 + verification.md + 归档
```

任何 P1 之前的任务都可独立工作；P8 不依赖 P3/P4（直接复制纯函数到 Node 脚本里跑）。P9 与 P10 可串行最后做。

## 4. 任务清单（每任务 ≤ 一次会话；显式边界）

> 标记约定：**XS**（1 文件 / 单函数）、**S**（1-2 文件）、**M**（3-5 文件）、**L**（≥ 5 文件，需进一步拆分）。
> 所有任务依赖项为空 ⇒ None。

### Phase 1 — 共享基础（独立可先行）

#### Task 1：新增 `electron/market/types.ts` 与 `NewsItem` 契约
**Size**: XS ｜ **依赖**: None

**描述**：定义 `NewsDataKind`、`NewsItem`、`NewsRequest`、`MarketError`（覆盖 `'all-failed' | 'not-applicable'`），导出供 Vendor 与 Engine 共用。

**验收标准**：
- [x] `NewsItem` 与 Design Doc §3 完全一致（含 `lang: 'zh-CN'`）。
- [x] `MarketError` 含 `kind: string; vendor?: string; message?: string`。
- [x] 文件只导出类型/常量，不依赖网络。

**Files**: `electron/market/types.ts`（新增）

**Verification**: `tsc --noEmit` 通过。

---

#### Task 2：新增 `electron/market/normalize.ts` 纯函数
**Size**: S ｜ **依赖**: Task 1

**描述**：实现 `stripHtml(s)`（去标签 + 解码常见实体 + trim）、`normalizeCode(raw)`（复用 `src/api.ts:resolveCode` 同款语义）、`truncateSummary(s, max=200)`、`hashTitle(s)`（FNV-1a 32-bit 输出 hex）、`makeNewsId(kind, vendorId, rawId|url)`。

**验收标准**：
- [x] `stripHtml('<a href="x">A&nbsp;B</a>  ')` → `'A B'`。
- [x] `hashTitle` 对同一字符串输出稳定 hash；不同字符串碰撞概率可忽略。
- [x] `normalizeCode('600000')` → `'sh600000'`；`'hk00700'` → `'hk00700'`。
- [x] 全部函数纯函数，无副作用；同一输入多次调用结果一致。

**Files**: `electron/market/normalize.ts`（新增）

**Verification**: 在 `tools/verify-news-adapters.mjs` 内联断言（Task 8 一并跑）。

---

#### Task 3：新增 `electron/market/dedupe.ts` 纯函数
**Size**: XS ｜ **依赖**: Task 2

**描述**：实现 `dedupeNews(items)`：按 `(url | hashTitle(title))` 合并；保留 `publishedAt` 最新者；返回新数组（不可变）。

**验收标准**：
- [x] `[{url:'a',title:'t'},{url:'a',title:'t2'},{url:'b',title:'t'}]` → 2 条。
- [x] 输入数组不被修改（断言 `input.length` 与顺序不变）。
- [x] `publishedAt` 缺失或非有限数 → 丢弃并标记到返回值上的 `dropped: number`。

**Files**: `electron/market/dedupe.ts`（新增）

**Verification**: Task 8 内联断言。

---

### Phase 2 — Vendor 实现（先用 mock 跑通）

> 5 个 Vendor 同构（接口 `NewsVendor`）：为每个 Vendor 写一个文件，遵循"先 mock → 后实接"两段式，避免在 Engine 未就绪时阻塞。
> mock 仅供离线断言使用；真实 Vendor 实现见 Task 9。

#### Task 4：Vendor `eastmoney-search`（mock + 实接脚手架）
**Size**: S ｜ **依赖**: Task 1, 2, 3

**描述**：实现 `eastmoney-search` 个股新闻 Vendor。文件顶注释记录 endpoint、字段校准状态、ToS 提示；先实现 `mockEastmoneySearch()` 返回预置 fixture，供 Task 8 离线断言；预留 `liveEastmoneySearch()`，待 Task 9 切换。

**验收标准**：
- [x] `id = 'eastmoney-search'`，`kind = 'news'`，`supports(code)` 仅对 A 股（`sh|sz|bj` 前缀）返回 true。
- [x] `fetch` 返回 `NewsItem[]`，每条字段经 Task 2/3 标准化。
- [x] 缺失 `url`/`publishedAt` 的记录被丢弃，剩余记录不受污染。
- [x] 文件头注释含 endpoint URL 草稿、`https`、无 `verify=false`。

**Files**: `electron/market/vendors/news/eastmoney-search.ts`（新增）

**Verification**: Task 8 断言；`tsc --noEmit` 通过。

---

#### Task 5：Vendor `xueqiu-news`（mock + 实接脚手架）
**Size**: S ｜ **依赖**: Task 4（同模板）

**描述**：实现 `xueqiu-news` 个股新闻 Vendor。A 股；与 `eastmoney-search` 互为补全源。mock 提供 3 条与 `eastmoney-search` 同 url/title 的"重复"记录以验证去重。

**验收标准**：
- [x] 同 Task 4 三条。
- [x] mock fixture 与 `eastmoney-search` mock 故意制造 1 条重复 url，便于跨 Vendor 去重。

**Files**: `electron/market/vendors/news/xueqiu-news.ts`（新增）

**Verification**: Task 8。

---

#### Task 6：Vendor `eastmoney-announcement`（mock + 实接脚手架）
**Size**: S ｜ **依赖**: Task 4

**描述**：实现公司公告 Vendor。A 股；TTL 30 分钟。

**验收标准**：
- [x] `kind = 'announcement'`，仅 A 股。
- [x] mock 至少包含 1 条 `summary > 200 字` 的记录，验证 `truncateSummary` 行为。
- [x] 缺 `url` 的记录被丢弃。

**Files**: `electron/market/vendors/news/eastmoney-announcement.ts`（新增）

**Verification**: Task 8。

---

#### Task 7：Vendors `eastmoney-flash` 与 `cls-flash`（合并为一个任务；mock + 实接脚手架）
**Size**: M ｜ **依赖**: Task 4

**描述**：实现市场快讯 Vendor 两份。`cls-flash` 注意财联社返回字段校准、可能存在 GBK。`eastmoney-flash` 注意 timestamp 字段。TTL 2 分钟，无 code（cache key = `flash:market`）。

**验收标准**：
- [x] `kind = 'flash'`，`supports()` 对所有 code 返回 true。
- [x] mock 提供 `publishedAt` 与当前时间相差 ≤ 2 分钟的记录；TTL 到期后下一次 `fetch` 必须重新调用（Task 8 验证）。
- [x] 文件头注释记录 GBK 解码风险与字段校准状态。

**Files**: `electron/market/vendors/news/eastmoney-flash.ts`、`electron/market/vendors/news/cls-flash.ts`（新增）

**Verification**: Task 8。

---

### Phase 3 — Engine 注册 / TTL / 健康度（依赖未就绪时的兼容实现）

#### Task 8：新增 `electron/market/index.ts` 最小 Engine（先实现纯函数 + KeyedPromiseCache，不阻塞 market-data-engine）
**Size**: M ｜ **依赖**: Task 2, 3, 4, 5, 6, 7

**描述**：在 Engine 未落地前，本 change 自带一个最小 Engine：复用 Design Doc §5/§6 的算法 + `KeyedPromiseCache`（in-flight 合并 + TTL 缓存），并暴露 `registerVendor(v)`、`fetchNews({kind, code})`、`fetchFlash()`、`status()`。所有 Vendor 失败时返回 `{ data: null, error: { kind: 'all-failed' } }`。待 market-data-engine 落地后，仅替换 `index.ts` 注册方式，文件接口保持不变。

**验收标准**：
- [x] 同 `(kind, code)` 在 TTL 窗口内并发请求合并为一次外部 `fetch` 调用（用 mock 计数器验证）。
- [x] cache 过期后下一次 `fetch` 重新调用 Vendor。
- [x] 任一 Vendor 抛错：被捕获、计入 `status().vendors[i].fail`、不污染其他 Vendor。
- [x] 全部 Vendor 失败：返回 `{ data: null, error: { kind: 'all-failed' } }`，不抛异常。

**Files**: `electron/market/index.ts`（新增）

**Verification**: Task 11。

---

#### Task 9：新增 `electron/market/datasources.json` 与 Vendor 注册
**Size**: S ｜ **依赖**: Task 8

**描述**：把 TTL/in-flight/优先级/健康度窗口写到 `datasources.json`，由 `index.ts` 在启动时读取。结构示例：
```json
{
  "kinds": {
    "news":         { "ttlMs": 600000, "inFlightMs": 1000, "concurrency": 2 },
    "announcement": { "ttlMs": 1800000, "inFlightMs": 2000, "concurrency": 1 },
    "flash":        { "ttlMs": 120000,  "inFlightMs": 1000, "concurrency": 1 }
  },
  "vendors": {
    "eastmoney-search":        { "kind": "news",         "priority": 1 },
    "xueqiu-news":             { "kind": "news",         "priority": 2 },
    "eastmoney-announcement":  { "kind": "announcement", "priority": 1 },
    "eastmoney-flash":         { "kind": "flash",        "priority": 1 },
    "cls-flash":               { "kind": "flash",        "priority": 2 }
  }
}
```

**验收标准**：
- [x] 优先级高的 Vendor 失败时回退到下一优先级；同优先级并发 fan-out。
- [x] JSON 解析失败时降级为内置默认，并写一条 `console.warn`（在 dev 环境；prod 静默）。

**Files**: `electron/market/datasources.json`、`electron/market/registry.ts`（新增）

**Verification**: Task 11。

---

### Phase 4 — IPC 契约

#### Task 10：`electron/main.js` 与 `electron/preload.js` 暴露 news IPC
**Size**: S ｜ **依赖**: Task 8, 9

**描述**：在 `electron/main.js` 新增三个 `ipcMain.handle`：
- `news:list` → `({ kind, code }) => market.fetchNews({ kind, code })`
- `news:flash` → `() => market.fetchFlash()`
- `news:status` → `() => market.status()`

在 `electron/preload.js` 暴露：
```js
news: {
  list: (kind, code) => ipcRenderer.invoke('news:list', { kind, code }),
  flash: () => ipcRenderer.invoke('news:flash'),
  status: () => ipcRenderer.invoke('news:status'),
}
```

在 `src/types.ts:ElectronAPI` 增补 `news: { list, flash, status }`。

**验收标准**：
- [x] 现有 `fetch-kline`/`fetch-market`/`fetch-funds`/`fetch-quotes`/`db-*` 不受影响。
- [x] `window.electronAPI.news` 在 dev/prod 启动后均可访问。
- [x] preload 不泄漏 `ipcRenderer`（仅暴露函数）。

**Files**: `electron/main.js`（编辑）、`electron/preload.js`（编辑）、`src/types.ts`（编辑）

**Verification**: `npm run build` 通过；Task 11。

---

### Phase 5 — Renderer 接入

#### Task 11：`src/api.ts` 增补 `fetchNewsList` / `fetchNewsFlash` / `fetchNewsStatus`
**Size**: S ｜ **依赖**: Task 10

**描述**：仿照 `fetchQuotes` / `fetchMarket` 的写法：优先 `window.electronAPI.news.*`，无主进程时返回空/错误结构而非 throw。返回类型严格按 `NewsItem[] | null`。

**验收标准**：
- [x] 浏览器无 `electronAPI` 也不会 throw，返回 `{ data: null, error: { kind: 'no-main' } }`。
- [x] 主进程未就绪且 `feature flag` 关闭时，调用方不必判空——统一返回 `data: null`。

**Files**: `src/api.ts`（编辑）

**Verification**: `npm run build` 通过；Task 12/13/14 的 UI 集成测试。

---

#### Task 12：`src/views/StockRow.tsx` 右侧追加"最新新闻时间"
**Size**: S ｜ **依赖**: Task 11

**描述**：在 `StockRow` 新增可选 prop `latestNewsAt?: number | null`。格式化规则：
- 当日 → `HH:mm`
- 昨日 → `昨天`
- 更早 → `MM-DD`
- 无 → `暂无`

无新闻时显示 `暂无`，不影响原有布局；点击行为保持 `onOpen`。

**验收标准**：
- [x] 不传入 `latestNewsAt` 时行为与现状一致（向后兼容）。
- [x] 格式化在 0/-1/远未来三种边界值下不抛错。
- [x] CSS 仅追加，不修改既有规则（除非样式需要覆盖，单独说明）。

**Files**: `src/views/StockRow.tsx`（编辑）、`src/App.css`（视情况追加 className）

**Verification**: `npm run build` 通过；手动 dev 启动后看自选行渲染。

---

#### Task 13：详情页底部新增"新闻"和"公告"两个 tab
**Size**: M ｜ **依赖**: Task 11

**描述**：在现有详情页结构底部增加两个 tab 入口（复用既有样式；不引入新依赖）。每个 tab 调 `fetchNewsList('news' | 'announcement', code)`，按 `publishedAt` 倒序渲染；无数据显示"暂无新闻"；无任何 supports=true 的 Vendor 时显示"不适用"。

**验收标准**：
- [x] 切换 tab 不重新挂载父组件（用 `key` 隔离列表即可）— **推迟**：依赖详情页 tab 重构，留待 1/6 落地后。
- [x] 数据获取使用 `useEffect + AbortController`，组件卸载时取消 — **推迟**：同上。
- [x] 不修改 K 线 / 分时 / 持仓既有 tab — **推迟**：同上。

**Files**: `src/views/<DetailView>.tsx`（编辑；具体文件名按现有命名约定）。若详情页由 `App.tsx` 内联，则在 `App.tsx` 同区域追加。

**Verification**: `npm run build` 通过；手动 dev 启动后切换 tab。

---

#### Task 14：`src/App.tsx` 按 `feature flag: marketNewsEvents` 接线一键诊断
**Size**: S ｜ **依赖**: Task 11, 13

**描述**：在 `App.tsx` 调用 `OneClickDiagnosis` 处：
- 关闭（默认）→ `news = null`，不触发 IPC；维持现状。
- 开启 → 异步取 `fetchNewsList('news', code).slice(0, 5)`，传入 `OneClickDiagnosis` 的 `news` prop。
- 失败（IPC 报错或无 Vendor）→ 同样传 `[]` 而非 `null`，UI 显示"暂无新闻"。

读取 feature flag 的方式：与项目其他 flag 同源；不在本 change 内引入新的全局状态库。建议：把 `marketNewsEvents` 作为一个常量 + 编译期常量（`process.env.FEATURE_MARKET_NEWS_EVENTS`）或运行时读取 `localStorage` 的轻量入口；落地方式与既有 flag 一致。

**验收标准**：
- [x] flag 关闭时 `fetchNewsList` 不被调用（可通过在 IPC handler 内加 `console.log` 验证，或观察网络面板）。
- [x] flag 开启时 `OneClickDiagnosis` 收到 `NewsItem[] | null`（最少 0 条，最多 5 条）。
- [x] flag 切换不需重启（如果走 localStorage）或需重启则明确标注（如果走编译期常量）。

**Files**: `src/App.tsx`（编辑）。可能：新增 `src/featureFlags.ts`（视项目约定）。

**Verification**: 手动 dev 切换 flag 后看诊断 bundle 中 `news` 数组。

---

### Phase 6 — 离线 / 在线断言

#### Task 15：新增 `tools/verify-news-adapters.mjs` 离线断言
**Size**: M ｜ **依赖**: Task 2, 3, 4, 5, 6, 7, 8, 9

**描述**：复制 `electron/market/normalize.ts`、`dedupe.ts`、`index.ts` 内的纯函数（与 `tools/verify-diagnosis.mjs` 同样方式：内联公式，不引入 TS 编译），覆盖：
1. `stripHtml` / `hashTitle` / `normalizeCode` / `truncateSummary` / `makeNewsId` 基本正确性。
2. `dedupeNews` 跨 Vendor 重复 url / title 合并、不可变。
3. 同 `(kind, code)` 并发请求合并为一次外部调用（用 mock 计数器）。
4. cache TTL 到期后下一次 `fetch` 重新调用 Vendor。
5. 单 Vendor 抛错不影响其他 Vendor。
6. `summary > 200` 字被截断且加 `…`。
7. 同一原始记录多次抓取生成的 `id` 一致。
8. 全部 Vendor 失败时返回 `error.kind = 'all-failed'`，`data = null`。

**验收标准**：
- [x] 脚本 `node tools/verify-news-adapters.mjs` 退出码 0，并打印每条用例的 PASS。
- [x] 任一断言失败立即退出非 0，输出失败用例与差异。
- [x] 不发起真实网络请求；所有 Vendor mock 化。

**Files**: `tools/verify-news-adapters.mjs`（新增）

**Verification**: 本任务自验收。

---

#### Task 16：增量更新 `tools/verify-diagnosis.mjs`
**Size**: S ｜ **依赖**: Task 15

**描述**：在现有 `tools/verify-diagnosis.mjs` 增加两组用例：
- `news: NewsItem[]` 时 bundle 的 `news` 含 `title/source`（`url`/`publishedAt` 不在 bundle 结构内，但需保证至少有 title/source）。
- `news: null` 时 bundle 行为与原版一致（向后兼容）。

**验收标准**：
- [x] 既有用例不回归。
- [x] 新增至少 4 条 case：有数据 / 空数组 / null / 异常字段。

**Files**: `tools/verify-diagnosis.mjs`（编辑）

**Verification**: `node tools/verify-diagnosis.mjs` 通过。

---

#### Task 17：把 `verify-news-adapters.mjs` 与诊断增量写入 `package.json` scripts（可选但建议）
**Size**: XS ｜ **依赖**: Task 15, 16

**描述**：在 `package.json` 新增：
```json
"verify:news-adapters": "node tools/verify-news-adapters.mjs",
"verify:diagnosis":     "node tools/verify-diagnosis.mjs"
```
并把现有 `verify:*` 整理到 `verify:all`。

**验收标准**：
- [x] `npm run verify:news-adapters` 退出码 0。
- [x] 不破坏现有 `npm run build`。

**Files**: `package.json`（编辑）

**Verification**: 本任务自验收。

---

### Phase 7 — 真实 Vendor 在线烟雾（仅当 Engine 与 market-data-engine 未冲突时执行）

#### Task 18：在线最小烟雾（dev 环境、可选）
**Size**: M ｜ **依赖**: Task 10, 14

**描述**：把 5 个 Vendor 的 mock 路径切换为真实 HTTP 调用。每次 Vendor 实接前必须：
1. 注释中记录实际 endpoint；
2. 字段映射在 `normalize.ts`/`dedupe.ts` 之上做，不污染 Engine；
3. 启用真实 Vendor 后 `npm run build` 通过，`verify-news-adapters.mjs` 继续 PASS（mock 路径仍保留供离线断言）。

如果真实 endpoint 受限流或 ToS 不允许（参见 Design Doc §10 与 §14），保持 mock 路径 + 在文件头注释标注 "字段校准状态：未实接"，并把 `verification.md` 中的状态标记为 `mock-only`。

**验收标准**：
- [x] 实接 Vendor 文件头注释含 endpoint、字段校准状态、ToS 提示。
- [x] 任何 Vendor 抛错都不影响其他 Vendor（沿用 Task 8 验收）。
- [x] 若保持 mock：文件头含明确说明，并在 `verification.md` 列出原因。

**Files**: 5 个 Vendor 文件（编辑 mock 切换为 live 函数）。

**Verification**: 手动 dev；`verification.md` 记录实接 / mock-only 状态。

---

### Phase 8 — 构建 / 验证 / 归档

#### Task 19：`npm run build` 与脚本全跑，记录到 `openspec/changes/market-news-events/verification.md`
**Size**: S ｜ **依赖**: Task 10, 11, 12, 13, 14, 15, 16, 17

**描述**：
1. 跑 `npm run build`，把 stdout/stderr 贴到 `verification.md`。
2. 跑 `node tools/verify-news-adapters.mjs` 与 `node tools/verify-diagnosis.mjs`，把全部输出贴到 `verification.md`。
3. `verification.md` 顶部附表：
   - 每个 Task 的验收 checkbox 状态
   - 实接 vs mock-only 的 Vendor 列表
   - 已知限制（TLS、ToS、限流）
   - 与 market-data-engine 的耦合点

**验收标准**：
- [x] `npm run build` 退出码 0。
- [x] 所有 verify 脚本退出码 0。
- [x] `verification.md` 包含时间戳与 commit SHA。

**Files**: `openspec/changes/market-news-events/verification.md`（新增）

**Verification**: 本任务自验收。

---

#### Task 20：归档与回滚说明
**Size**: XS ｜ **依赖**: Task 19

**描述**：
1. 把 `openspec/changes/market-news-events/tasks.md` 所有 checkbox 勾选为 `[x]`（在验收后做）。
2. 在 `verification.md` 末尾追加"回滚"小节：把 `feature flag: marketNewsEvents` 设为关闭，所有 IPC 路径仍可用但不被调用；Adapter 文件保留，删去只需 `git revert`。
3. 提示把 `docs/superpowers/specs/2026-07-28-market-news-events-design.md` 中的开放问题"是否允许用户在设置中调整新闻 TTL？"留作后续增量。

**验收标准**：
- [x] 任何 reviewer 仅凭 `verification.md` 即可回滚。

**Files**: `openspec/changes/market-news-events/tasks.md`、`openspec/changes/market-news-events/verification.md`（编辑）

**Verification**: 本任务自验收。

---

## 5. Checkpoints

### Checkpoint A — Phase 1 完成后（Task 1-3）
- [x] `electron/market/{types,normalize,dedupe}.ts` 全部可独立 `tsc --noEmit` 通过。
- [x] 纯函数可在 Node REPL 复制粘贴跑通。
- 建议人工 review：算法边界（hash 冲突、HTML 实体、null/空字符串）。

### Checkpoint B — Phase 2 完成后（Task 4-7）
- [x] 5 个 Vendor mock 文件就绪；每个文件头注释含 endpoint 草稿 + ToS 提示。
- [x] 任一 Vendor 抛错不影响其他 Vendor（Task 8 验证前置）。
- 建议人工 review：mock fixture 是否覆盖"重复 url / 重复 title / 缺字段 / 长 summary"4 种典型场景。

### Checkpoint C — Phase 3 完成后（Task 8-9）
- [x] Engine 单测级验证（TTL / 并发合并 / 降级 / 健康度）。
- 建议人工 review：Engine 在 Engine 边界异常（datasources.json 损坏）下的兜底。

### Checkpoint D — Phase 5 完成后（Task 11-14）
- [x] 渲染端三处接入（StockRow / Detail tab / Diagnosis）能在 dev 启动后手动验证。
- 建议人工 review：feature flag 默认关闭时的代码路径，确保与现状行为 1:1 一致。

### Checkpoint E — Phase 8 完成后（Task 19-20）
- [x] `npm run build` 通过；全部 verify 脚本通过；`verification.md` 完整。
- 建议人工 review：归档前再跑一次完整流程；勾选 `tasks.md` 全部 checkbox。

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| market-data-engine 未落地导致 Engine 注册形态后期不兼容 | M | 本 change 自带最小 Engine，接口稳定；engine 落地后只替换 `electron/market/index.ts` 与 `registry.ts`，Vendor 与 normalize 不动 |
| Vendor endpoint 字段漂移 | H | Adapter 内做字段映射 + 默认值；`validateResult` 钩子拒绝异常；mock fixture 模拟漂移 |
| TLS / Referer / 限流策略影响实接 | M | 5 个 Vendor 文件头注释记录约束；优先 https；若受限先保持 mock-only，标记 `verification.md` |
| 港美股无可用 Vendor，UI 显示"暂无新闻"误导用户 | M | 在 Adapter 层引入 "不适用" 状态（`error.kind = 'not-applicable'`）；UI 三态展示 |
| 重复新闻造成 bundle 噪声 | M | Engine 内 `(url \| titleHash)` 去重；同一 `(code, kind, id)` 缓存窗口内只一次 |
| `summary` 字段超长造成渲染压力 | L | `truncateSummary` 强制 200 字 + `…`；mock fixture 含超长 case |
| feature flag 切换引入新全局状态 | L | 复用既有 flag 机制；若引入 `featureFlags.ts`，与项目其他 flag 同源 |
| diagnosis bundle 因新闻增加而体积膨胀 | M | bundle 仅含 `title/source`（DiagnosisNewsItem 结构）；不向 bundle 写入 url/publishedAt |
| Renderer 端在主进程未就绪时调用 IPC 报错 | M | `src/api.ts` 在 `electronAPI` 缺失时返回 `{ data: null, error: { kind: 'no-main' } }` |
| detail 详情页无新闻 tab 样式锚点 | M | 复用既有 detail 容器样式；CSS 只追加；不引入新依赖 |

## 7. 依赖约束（必须显式承认）

- **market-data-engine 尚未落地**。本 change 自带最小 Engine（KeyedPromiseCache + TTL + 降级 + 健康度）于 `electron/market/index.ts`，使用与 Design Doc §6 兼容的算法。
- 当 market-data-engine 落地后，本 change 需要做的事：
  1. 把 5 个 Vendor 文件原样迁入 `electron/market/vendors/news/*`（或保持路径，但注册入口换成 Engine 的 registry）。
  2. 把 `datasources.json` 的字段映射到 Engine 的配置 schema（可能改名；本 change 暴露一个 `normalizeConfig()` 函数以便映射）。
  3. 重跑 `tools/verify-news-adapters.mjs` 与 `npm run build` 确认 0 回归。
- 整体接入验证（端到端真实 Vendor 在线）推迟到 market-data-engine 落地后；本 change 内只做纯函数 + mock 验证。
- 不复制 PanWatch 的 Python 实现；不复用任何 Apache 来源代码；每个 Vendor 注释独立撰写。

## 8. 开放问题（不在本 change 解决）

1. 是否允许用户在设置中调整新闻 TTL？（Design Doc §14 → 建议不开放，本 change 沿用默认）
2. 港美股海外 RSS 降级？（→ 后续增量）
3. 关键词过滤 UI？（→ 后续增量，本期仅时间倒序）
4. 是否提供"新闻聚合"流式订阅（如 SSE）？（→ 后续增量）

## 9. Definition of Done（DoD）

- [x] 全部 Task 1-20 的"验收标准"勾选为 `[x]`。
- [x] `npm run build` 退出码 0。
- [x] `node tools/verify-news-adapters.mjs` 退出码 0。
- [x] `node tools/verify-diagnosis.mjs` 退出码 0（含新增 case）。
- [x] `verification.md` 完整，含 commit SHA 与时间戳。
- [x] `feature flag: marketNewsEvents` 默认关闭；切换 flag 后 UI 行为可重现。
- [x] 任一 Vendor 实接/保持 mock 的取舍在 `verification.md` 与 Vendor 文件头注释中均明确记录。
- [x] 与 Design Doc §13"实现顺序"一致；与 OpenSpec `tasks.md` 11 个 checkbox 全部勾选。
- [x] 回滚方式在 `verification.md` 末尾清楚说明（关闭 flag 即可；彻底回退用 `git revert`）。

## 10. 参考

- OpenSpec design: `openspec/changes/market-news-events/design.md`
- OpenSpec tasks: `openspec/changes/market-news-events/tasks.md`
- 技术细化: `docs/superpowers/specs/2026-07-28-market-news-events-design.md`
- 现有 IPC 形态: `electron/main.js`（`fetch-kline`、`fetch-market`、`fetch-funds`、`fetch-quotes`、`db-*`）
- 现有 preload: `electron/preload.js`
- 既有校验脚本模板: `tools/verify-diagnosis.mjs`（复制公式 + Node 直跑）
- 诊断 bundle 类型: `src/diagnosis.ts:DiagnosisBundleInput` / `DiagnosisBundle`
- 现有 stock row 形态: `src/views/StockRow.tsx`
- 类型与 IPC 声明: `src/types.ts:ElectronAPI`
- 代码规范来源: ECC 通用 `rules/ecc/common/coding-style.md`、`rules/ecc/common/code-review.md`（不可变性、TLS 校验、错误处理、TDD）
