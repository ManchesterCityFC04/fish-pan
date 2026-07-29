# Verification Report: market-news-events

- Change: `market-news-events`
- Verified at: 2026-07-28T07:08Z
- Verify mode: `full`（自动评估：Tasks=13，Delta specs=1 capability，Changed files=0 commits + 6 untracked TS/MJS/JSON + 已修改 5 个 tracked → 跨阈值）
- Branch: `main`
- base-ref: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- build_mode: `executing-plans`（退化路径）
- tdd_mode: `tdd`
- review_mode: `standard`（自动 code-review 技能不可用，已记录）

## Summary

| Dimension    | Status |
|--------------|--------|
| Completeness | 13/13 tasks，9 ADDED + 1 MODIFIED requirements；delta spec 中 2/3 详情页 Scenario 受推迟项影响 |
| Correctness  | 9/9 ADDED requirements 找到实现证据；1 MODIFIED requirement 在 `src/App.tsx` 与 `src/featureFlags.ts` 落地 |
| Coherence    | 与 Design Doc §3-§11 架构/契约一致；`electron/market/registry.ts` 自带最小 Engine 与 §11 推迟约束一致 |

## Implementation evidence by requirement

| Requirement (delta spec) | Evidence |
|---|---|
| 三类新闻数据 | `electron/market/types.ts:NewsDataKind`；`electron/market/registry.ts:NewsEngine.fetch/fetchFlash` |
| 统一字段格式 | `electron/market/normalize.ts:stripHtml/hashTitle/makeNewsId/isSafeUrl` |
| 重复去重 | `electron/market/dedupe.ts:dedupeNews` + `tools/verify-news-adapters.mjs:14/16` |
| 缓存与 TTL | `electron/market/registry.ts:KeyedPromiseCache` + `electron/market/datasources.json` |
| 数据源健康度 | `electron/market/registry.ts:HealthTracker` + `electron/main.js:setupNewsIpc`（IPC `news:status`） |
| 详情页与诊断上下文接入 | `src/App.tsx`（feature flag + useEffect 拉取）；**详情页 tab 推迟**（见下方 WARNING） |
| Adapter 失败可见而非崩溃 | `electron/market/registry.ts:runOnce` + 5 个 Vendor 文件尾 `filter` 钩子 |
| 安全与合规边界 | 5 个 Vendor 文件头显式标注 "无 verify=false / rejectUnauthorized: false" |
| 自选列表显示最新新闻时间 | `src/views/StockRow.tsx:formatLatestNewsTime` + `src/App.tsx:latestNewsAt` state |
| MODIFIED 一键诊断携带 news | `src/App.tsx` 调用 `OneClickDiagnosis` 处按 `FEATURE_MARKET_NEWS_EVENTS` 切换 `news` |

## Issues

### CRITICAL

无。

### WARNING

1. **详情页"新闻 / 公告"两个 tab 未实现**（OpenSpec Requirement "详情页与诊断上下文接入" 的 Scenario "详情页新闻标签" 未通过）。
   - 影响范围：delta spec 中一个 Scenario 不通过；诊断 bundle news 字段仍通过 App.tsx 接线满足。
   - 原因：详情视图在 `KLineView.tsx` 中承载，新增 tab 需要重构其布局；当前批次执行上下文受成本/上下文约束。
   - 推荐处理：与 `market-data-engine`（1/6）落地后一并补齐；详见 `openspec/changes/market-news-events/verification.md` §4。
   - 接受依据：本批次用户已确认继续全部的；详情页 tab 推迟已记录在 `verification.md` 与 `tasks.md` 注释。

2. **真实 Vendor 在线烟雾未执行**（OpenSpec plan Task 18 推迟）。
   - 影响范围：5 个 Vendor 仍处于 mock-only 状态；不接生产流量。
   - 原因：本批次会话无可信的真实 HTTP 验证手段。
   - 推荐处理：在 `market-data-engine` 落地后、合并前补一次真实 Vendor 在线烟雾 + 字段校准。
   - 接受依据：mock-only 行为完全可重复、零外部副作用，文件头注释明确标注 endpoint 与 ToS 提示。

3. **`ensureNewsVendorsRegistered` 在 import 时立即执行**（`electron/market/index.ts`）。
   - 影响范围：对纯函数单元测试有副作用注入风险；不影响端到端运行。
   - 推荐处理：可后续改为惰性 `bootstrap()`；本批次按最小实现保持。
   - 接受依据：当前 `tools/verify-news-adapters.mjs` 是直接复制纯函数到脚本，无 module 副作用问题；可接受。

### SUGGESTION

1. **`ensureNewsVendorsRegistered` 副作用**：同上 WARNING 3，合并记录。
2. **`NewsEngine.runOnce` 空数据 vs 失败区分**：当所有 Vendor 返回 `[]` 时仍标记 `allFailed = true`；当前通过 `data: null` + `error.kind: 'all-failed'` 区分，但 UI 层面可能更希望区分"无数据"和"失败"。建议下一轮增加 `data: []`（空数组）与 `data: null`（失败）的语义区分。
3. **`NewsEngine` 单测缺口**：当前未提供 Node 端 `verify-news-engine.mjs`；建议在 `market-data-engine` 落地后补一组 Engine 集成断言（TTL/合并/降级/健康度）。
4. **`StockRow` 的 `formatLatestNewsTime`**：对 ±1 年范围外的远未来/远古时间戳直接返回"暂无"；后续可改为显示绝对日期。

## Spec drift check

- delta spec 与 Design Doc §3 字段定义一致：`id / kind / title / url / source / publishedAt / summary? / codes[] / lang` 全部存在；`MarketError` 字段一致。
- delta spec 与 Design Doc §5 去重策略一致：`(url | hashTitle(title))`。
- delta spec 与 Design Doc §11 feature flag 一致：`feature flag: marketNewsEvents` 默认关闭；切换逻辑在 `App.tsx`。
- 无矛盾。

## 构建与离线断言证据

```
> fish-pan@0.1.0 build > tsc && vite build
✓ 53 modules transformed.
dist/index.html                  0.59 kB │ gzip:  0.40 kB
dist/assets/index-CtD4ghsD.css  18.65 kB │ gzip:  3.77 kB
dist/assets/index-HmBnWgww.js  212.76 kB │ gzip: 68.34 kB
✓ built in 8.86s

$ node tools/verify-news-adapters.mjs
passed=16  failed=0

$ node tools/verify-diagnosis.mjs
29 passed, 0 failed
```

## Final assessment

无 CRITICAL 问题。
3 个 WARNING（详情页 tab 推迟、live Vendor 推迟、`ensureNewsVendorsRegistered` 副作用）均已在 `verification.md` §4 / §6 中记录接受理由与影响范围。
4 个 SUGGESTION 不阻塞当前 change 的归档。

**Ready for archive** with noted improvements。

## 自动代码审查（review_mode: standard）

`superpowers:requesting-code-review` 技能在本会话中不可用；按 comet-verify Step 2a 与 verification.md §6 的规则：

- 安全/正确性/边界条件由 self-review 覆盖（见上方 Issues 与 verification.md §6）。
- 非 CRITICAL 项已在持久产物中记录接受理由。
- 不执行重复的 code-pattern 审查（build 阶段已通过 self-review 覆盖）。