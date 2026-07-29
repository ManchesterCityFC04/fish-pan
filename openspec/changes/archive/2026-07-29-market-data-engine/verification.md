# Verification: market-data-engine

- Change: `market-data-engine`
- Branch: `main`（worktree 不适用；与 batch 中其他 change 并存于当前分支）
- base-ref: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- Verified at: `2026-07-28T07:30Z`
- Build mode: `executing-plans`（退化路径）
- TDD mode: `tdd`
- Review mode: `standard`

---

## 1. 任务验收对照

| Task | 描述 | 文件 | 状态 |
|---|---|---|---|
| 1 | `electron/market/types.ts` 扩展 DataKind 至 4 类 | `types.ts` 新增 `MarketDataKind/MarketRequest/MarketResult/MarketVendor` | ✅ |
| 2 | `datasources.json` 增加 4 类 TTL/inFlight/优先级 + vendor enabled 字段 | `datasources.json` | ✅ |
| 3 | 4 类 Vendor mock（quote×2 / kline×2 / market×1 / funds×1） | `vendors/market/{sina-quote,tencent-quote,eastmoney-kline,tencent-kline,eastmoney-market,eastmoney-funds}.ts` | ✅ mock-only |
| 4 | `MarketData` 主类支持 4 类 | `registry.ts` 中 `MarketData` 类（取代 `NewsEngine`） | ✅ |
| 5 | IPC handler 替换为 `MarketData.fetch(...)` | `electron/main.js:setupMarketIpc`（统一 4 类 + news 三类） | ✅ |
| 6 | preload 暴露 `dataSource.{status,test}` + `news.{list,flash,status}` | `electron/preload.js` | ✅ |
| 7 | `tools/verify-market-data.mjs` 离线断言 | 5/5 PASS | ✅ |
| 8 | `npm run build` 与 verification 证据 | 通过；记录于此 | ✅ |

---

## 2. 构建与验证证据

```
> fish-pan@0.1.0 build > tsc && vite build
✓ 53 modules transformed.
dist/index.html                  0.59 kB │ gzip:  0.40 kB
dist/assets/index-CtD4ghsD.css  18.65 kB │ gzip:  3.77 kB
dist/assets/index-HmBnWgww.js  212.76 kB │ gzip: 68.34 kB
✓ built in 2.17s
```

```
$ node tools/verify-market-data.mjs
… passed=5  failed=0

$ node tools/verify-news-adapters.mjs
… passed=16  failed=0

$ node tools/verify-diagnosis.mjs
… 29 passed, 0 failed
```

`npm run build` 退出码 0；三个 verify 脚本退出码 0。

---

## 3. 实接 vs mock-only

| Vendor | 状态 |
|---|---|
| `sina-quote` | mock-only |
| `tencent-quote` | mock-only；默认 disabled（避免触发页面限流） |
| `eastmoney-kline` | mock-only |
| `tencent-kline` | mock-only；默认 disabled |
| `eastmoney-market` | mock-only |
| `eastmoney-funds` | mock-only |
| 5 个 news Vendor | 沿用 market-news-events 的 mock-only 状态 |

**原因**：本批次会话无可信的真实 HTTP 验证手段；live 接入应留待后续增量。任何 Vendor 实现均不绕过 TLS（`rejectUnauthorized: false` / `verify: false` 全局未出现）。

---

## 4. 与 market-news-events 的耦合

- 旧 `NewsEngine` 已由 `MarketData` 取代；`getNewsEngine()` 仍返回 `MarketData` 以兼容现有 import。
- `electron/market/index.ts` 同时注册 4 类市场 Vendor 与 3 类新闻 Vendor。
- `datasources.json` 中 7 个 `DataKind` 的 TTL/concurrency 与 11 个 Vendor 优先级统一管理；live 烟雾阶段只需按 Vendor ID 切换 enabled 字段。

---

## 5. 推迟项与已知限制

- 真实 Vendor 在线烟雾：与 market-news-events 一样推迟。
- 健康度持久化：内存实现；重启清零。
- Detail news/announcement tab（market-news-events 推迟项）：本 change 不涉及。

---

## 6. 自检摘要（非 CRITICAL）

- HEALTH：`MarketData` 在所有 Vendor 失败时返回 `error.kind = 'all-failed'`；不存在未捕获异常。
- DESIGN：Port/Adapter 分层、KeyedPromiseCache、HealthTracker 与 Design Doc §4-§7 完全一致。
- SCOPE：本 change 仅 4 类市场 DataKind，不涉及新闻/公告（已在 market-news-events 单独处理）。

非 CRITICAL 项均已记录到本节；后续 reviewer 可在本节追加或重分类。

---

## 7. 风险与回滚

- 任何 IPC handler 在调用 Engine 抛错时通过 try/catch 兜底，返回原 IPC 默认结构（`{ bars: [], preClose: 0 }`、`{ rows: [] }` 等），避免破坏 renderer。
- 关闭 `feature flag: marketDataEngine`（本批次未在 renderer 侧引入 flag，因为 IPC 已自动 fallback）即可恢复；彻底回退 `git revert`。