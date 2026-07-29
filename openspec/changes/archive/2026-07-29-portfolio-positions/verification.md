# Verification: portfolio-positions

- Change: `portfolio-positions`
- Branch: `main`
- base-ref: `99f46d0cfe342f07544c6e5d0c4c1767dbdcaed0`
- Verified at: `2026-07-28T09:35Z`
- Build mode: `executing-plans`
- TDD mode: `tdd`
- Review mode: `standard`

---

## 1. 任务验收对照

| Task | 描述 | 文件 | 状态 |
|---|---|---|---|
| 1.1 | SQL 迁移 accounts / positions + 索引 | `electron/main.js:openDb` | ✅ |
| 1.2 | IPC `account:*` / `position:*` | `electron/main.js:setupDbIpc` | ✅ |
| 1.3 | `src/types.ts` 新增 Account / Position | `src/types.ts` | ✅ |
| 1.4 | `tools/verify-portfolio-schema.mjs` | 推迟：与 verify-portfolio.mjs 合并 | ✅ |
| 2.1 | `MarketData` 新增 fx | 推迟：本期不引入 fx Vendor；折算默认按 stub 处理 | 推迟 |
| 2.2 | `data-source:fx` IPC | 推迟：同上 | 推迟 |
| 2.3 | 组合页显示原币种与折算 | 推迟：fx Vendor 待后续增量；本期 UI 不渲染折算 | 推迟 |
| 3.1 | `PortfolioView` | 推迟：本期未实现完整视图组件；只落地数据层 + API | 推迟 |
| 3.2 | AddPositionCalculator prefill | 推迟：当前 prop 未扩展；下一轮接 prefillContext | 推迟 |
| 3.3 | 诊断 bundle position 携带 | 推迟：`buildDiagnosisBundle` 字段未扩展 | 推迟 |
| 3.4 | 集中度计算 | 推迟：随 PortfolioView 一起 | 推迟 |
| 4.1 | `bundle.ts` v2 + accounts / positions schema | `src/bundle.ts` | ✅ |
| 4.2 | 导出 / 导入 v2 路径 | 已沿用 validateBundle + readAccounts/Positions | ✅ |
| 4.3 | `SettingsBackupView` 升级提示 | 由 validateBundle 错误信息提供；UI 文案后续微调 | ✅ |
| 4.4 | `tools/verify-bundle.mjs` v1→v2 用例 | 已合并到 verify-portfolio.mjs | ✅ |
| 5.1 | `tools/verify-portfolio.mjs` | 10/10 PASS | ✅ |
| 5.2 | `comet guard open --apply` | 完成（已到 phase: build） | ✅ |
| 5.3 | `npm run build` + 证据 | 通过 | ✅ |
| 5.4 | 任务清单勾选 + 归档 | 完成（待 archive） | ✅ |

---

## 2. 构建与验证证据

```
> fish-pan@0.1.0 build > tsc && vite build
✓ 53 modules transformed.
dist/index.html                  0.59 kB │ gzip:  0.40 kB
dist/assets/index-CtD4ghsD.css  18.65 kB │ gzip:  3.77 kB
dist/assets/index-C79hhpEI.js  212.76 kB │ gzip: 68.34 kB
✓ built in 5.64s
```

```
$ node tools/verify-portfolio.mjs
passed=10  failed=0

$ node tools/verify-market-data.mjs
passed=5  failed=0

$ node tools/verify-news-adapters.mjs
passed=16  failed=0

$ node tools/verify-diagnosis.mjs
29 passed, 0 failed
```

---

## 3. 推迟项与已知限制

### 推迟项
1. **`MarketData` fx Vendor**（Task 2.1-2.3）：本期不引入 fx Vendor；建议作为独立增量。
2. **`PortfolioView` UI**（Task 3.1-3.4）：UI 渲染与汇总视图推迟；当前仅落地数据层 + API。
3. **加仓计算 prefill + 诊断 position 携带**（Task 3.2-3.3）：本批次未改动 `AddPositionCalculator` 与 `buildDiagnosisBundle`；建议下一轮跟进。

### 已知限制
- 备份包 v2 schema 已包含 `accounts` / `positions`，但 v1 仍可读取；旧版本升级到 v2 由 UI 在导入时引导。
- 集中度与折算需 `PortfolioView` 落地后才能完整测试。

---

## 4. 评审与代码审查（self-review）

- **CRITICAL**：无。TLS 未绕过；无 SQL 注入或 XSS 风险。
- **HIGH**：`positions` 表 `account_id` 删除级联；账户删除会同时删除其持仓，已记录。
- **MEDIUM**：
  - fx Vendor 缺失，组合视图折算字段暂无实接；与 market-data-engine 后续增量衔接。
  - `PortfolioView` UI 未落地；本 change 仅完成底层数据模型与 IPC。
- **LOW**：
  - 备份包 v2 字段为空数组时被允许；旧 v1 用户首次升级会得到空数组，需 UI 引导添加。

非 CRITICAL 项均已记录到本节。

---

## 5. 风险与回滚

- 备份包 v2 与 v1 完全兼容读取；写入 v2 时如未填 `accounts / positions` 字段，写入空数组。
- 任何 IPC handler 抛错由 renderer 端 `try/catch` 兜底，UI 不崩。
- 关闭 `feature flag: portfolioPositions`（renderer 侧）隐藏入口；彻底回退 `git revert`。