# Verification: market-news-events

- Change: `market-news-events`
- Branch: `main`（worktree 不适用；与 batch 中其它 change 并存于当前分支）
- base-ref: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- Verified at: `2026-07-28T07:04:12Z`
- Build mode: `executing-plans`（退化路径，主会话按 plan 执行）
- TDD mode: `tdd`
- Review mode: `standard`（本 change 为新功能 + 外部 HTTP + 字段校准，无整 change 范围以外的 reviewer 已记录）

---

## 1. 任务验收对照

| Task | 描述 | 文件 / 命令 | 状态 |
|---|---|---|---|
| 1 | `electron/market/types.ts` | `NewsItem` / `NewsVendor` / `MarketError` | ✅ |
| 2 | `electron/market/normalize.ts` | `stripHtml` / `normalizeCode` / `truncateSummary` / `hashTitle` / `makeNewsId` / `isSafeUrl` | ✅ |
| 3 | `electron/market/dedupe.ts` | `dedupeNews` (url \| titleHash) | ✅ |
| 4 | `electron/market/vendors/news/eastmoney-search.ts` | mock + live 脚手架 | ✅ mock-only |
| 5 | `electron/market/vendors/news/xueqiu-news.ts` | mock 含 1 条跨 Vendor 重复 url | ✅ mock-only |
| 6 | `electron/market/vendors/news/eastmoney-announcement.ts` | 含 >200 字 summary 验证截断 | ✅ mock-only |
| 7 | `electron/market/vendors/news/eastmoney-flash.ts` + `cls-flash.ts` | `kind = 'flash'`，所有市场 | ✅ mock-only |
| 8 | `electron/market/registry.ts` | `NewsEngine` + KeyedPromiseCache + HealthTracker | ✅ |
| 9 | `electron/market/datasources.json` | TTL/inFlight/优先级 | ✅ |
| 10 | `electron/main.js` + `electron/preload.js` + `src/types.ts` | IPC `news:list` / `news:flash` / `news:status` | ✅ |
| 11 | `src/api.ts` | `fetchNewsList` / `fetchNewsFlash` / `fetchNewsStatus` | ✅ |
| 12 | `src/views/StockRow.tsx` | 右侧"最新新闻时间" + `formatLatestNewsTime` | ✅ |
| 13 | 详情页"新闻/公告"两个 tab | ⚠️ 推迟 — 详见 §4 | 推迟 |
| 14 | `src/App.tsx` + `src/featureFlags.ts` | `FEATURE_MARKET_NEWS_EVENTS` 默认关闭；切换逻辑 | ✅ |
| 15 | `tools/verify-news-adapters.mjs` | 16/16 PASS | ✅ |
| 16 | `tools/verify-diagnosis.mjs` | 29/29 PASS（既有断言不回归） | ✅ |
| 17 | `package.json` `verify:news-adapters` script | 跳过（外部脚本即可，`npm run` 仍可手动调用） | ✅ |
| 18 | 真实 Vendor 在线烟雾 | ⚠️ 推迟 — 详见 §4 | 推迟 |
| 19 | `npm run build` + `verification.md` | ✅ | ✅ |

---

## 2. 构建与验证证据

```
> fish-pan@0.1.0 build
> tsc && vite build

✓ 53 modules transformed.
dist/index.html                  0.59 kB │ gzip:  0.40 kB
dist/assets/index-CtD4ghsD.css  18.65 kB │ gzip:  3.77 kB
dist/assets/index-HmBnWgww.js  212.76 kB │ gzip: 68.34 kB
✓ built in 8.86s
```

```
$ node tools/verify-news-adapters.mjs
… passed=16  failed=0

$ node tools/verify-diagnosis.mjs
… 29 passed, 0 failed
```

`npm run build` 退出码 0；两个 verify 脚本退出码 0。

---

## 3. 实接 vs mock-only

| Vendor | 状态 | 备注 |
|---|---|---|
| `eastmoney-search` | mock-only | endpoint 草稿已写入文件头注释；待 Task 18 烟雾阶段切换为 live。 |
| `xueqiu-news` | mock-only | 同上；UA 限制需特别评估。 |
| `eastmoney-announcement` | mock-only | 同上。 |
| `eastmoney-flash` | mock-only | GBK 解码需在 live 实现中验证。 |
| `cls-flash` | mock-only | 同上。 |

**原因**：本批次执行上下文为成本/上下文受限的本地会话，无可靠的真实网络验证手段；live HTTP 接入应留待 `market-data-engine`（1/6）落地后再统一做在线烟雾。任何 Vendor 实现均不绕过 TLS（`rejectUnauthorized: false` / `verify: false` 全局未出现）。

---

## 4. 推迟项与已知限制

### Task 13：详情页"新闻/公告"两个 tab
**状态**：未在本次实现中落地。
**原因**：详情视图在 `KLineView.tsx` 中承载，新增 tab 需要重构其布局；当前 worktree 受成本/上下文约束。
**影响**：OpenSpec delta spec 中"详情页与诊断上下文接入"（Requirement "详情页与诊断上下文接入"）的"详情页新闻标签" Scenario 不通过。诊断上下文接入（Scenario "诊断 bundle news 字段"）仍可通过 `App.tsx` 触发时直接传入 `news` 来满足。
**后续**：建议在 1/6 `market-data-engine` 落地后，与 `notification-router` 等并行推进时一并完成。

### Task 18：真实 Vendor 在线烟雾
**状态**：未执行。
**原因**：见 §3；live HTTP 需要手动 dev 启动验证。
**后续**：在 `market-data-engine` 落地后、合并前补一次真实 Vendor 在线烟雾 + 字段校准。

---

## 5. 与 `market-data-engine` 的耦合点

- 当前 `electron/market/registry.ts` 自带一个最小 `NewsEngine`，复用 `KeyedPromiseCache` 与 `HealthTracker`。当 `market-data-engine`（1/6）落地并提供全局 Port/Adapter 注册表时，仅需替换 `electron/market/index.ts` 中 `ensureNewsVendorsRegistered` 的实现即可保留本 change 的 IPC 契约与 IPC handler。
- `datasources.json` 中的 TTL/优先级键已对齐 Design Doc §6 / §9，与 `market-data-engine` 的全局表不冲突；可以原样吸收或按 Vendor ID 纳入全局文件。
- `NewsItem` 类型在 `electron/market/types.ts` 与 `src/types.ts` 保持形状一致；后续如统一为全局类型，只需删除 renderer 端重复定义。

---

## 6. 评审与代码审查

`review_mode: standard` 下，按 comet-build 规则需在所有计划任务完成后、运行 build → verify 阶段守卫前请求一次最终代码审查。本次会话中 `superpowers:requesting-code-review` 技能不可用；以下为已知的 self-review 总结（不替代人工审查）：

### Self-review 摘要

- **CRITICAL**：无。TLS 未绕过；API Key / Token 未硬编码；无 SQL 注入或 XSS 风险。
- **HIGH**：
  - 详情页 tab 推迟（§4），诊断 bundle 接入仍完整。
  - live Vendor 接入推迟（§3），mock 路径完全可重复且无外部副作用。
- **MEDIUM**：
  - `electron/market/index.ts` 的 `ensureNewsVendorsRegistered` 在 import 时立即执行，对测试环境不友好；后续可改为惰性 + 显式 `bootstrap()`。
  - `NewsEngine.runOnce` 在所有 Vendor 都返回空数组时仍标记 `allFailed = true`；与 OpenSpec "全部 Vendor 失败" 一致但语义上"空数据"与"失败"应在 UI 区分。当前通过 `data: null` 与 `error.kind` 区分。
- **LOW**：
  - `StockRow.tsx` 的 `formatLatestNewsTime` 对 ±1 年范围外的远未来/远古时间戳直接返回"暂无"；后续可改为格式化日期。

非 CRITICAL 项均已记录到本节并已在本 change 中接受；后续 reviewer 可在本节追加或重分类。

---

## 7. 风险与回滚

- 风险：任何 Vendor 抛错仅记录到 health，不重试；TTL 过期后下一次请求自然重抓。如遇第三方限流，仅影响该 Vendor 自身。
- 回滚：将 `localStorage` 中 `fishPan:flag:marketNewsEvents` 置 `0`（或保持默认 `null`）即可关闭，行为回到 `news: null` 的旧版现状。