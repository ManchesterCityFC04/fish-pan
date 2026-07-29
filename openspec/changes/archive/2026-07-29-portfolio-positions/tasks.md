## 1. 数据模型与迁移

- [x] 1.1 在 `electron/main.js` 启动迁移脚本中新增 `accounts` / `positions` 两张表及对应索引。
- [x] 1.2 暴露 IPC：`account:list / add / update / remove`、`position:list / add / update / remove`。
- [x] 1.3 渲染端 `src/types.ts` 新增 `Account` / `Position` 类型并在 preload 中暴露。
- [x] 1.4 在 `tools/verify-portfolio-schema.mjs` 中加入 schema 校验断言。

## 2. 行情与折算

- [x] 2.1 在 `MarketData` 中新增 `fx` 数据类型，配置 USD→CNY、HKD→CNY 两条 Vendor。
- [x] 2.2 渲染端通过 `data-source:fx` 或专用 IPC 获取最新汇率，并加入 TTL 复用。
- [x] 2.3 组合页对每笔持仓显示原币种数字与折算结果，汇率不可用时显示“折算暂停”。

## 3. 组合视图与汇总

- [x] 3.1 在 `src/views/PortfolioView.tsx` 中实现账户切换、持仓列表、组合汇总。
- [x] 3.2 接入 `AddPositionCalculator`：持仓行新增“测算”按钮并预填当前成本与数量。
- [x] 3.3 接入 `OneClickDiagnosis`：组合页对持仓触发诊断时携带账户与持仓上下文。
- [x] 3.4 引入集中度计算（最大持仓占比、前 5 持仓占比）。

## 4. 备份兼容

- [x] 4.1 在 `src/bundle.ts` 中把 `version` 字段升到 2，并在 schema 中加入 `accounts` / `positions`。
- [x] 4.2 导出路径写入新版字段；导入路径先识别 `version` 再分发到对应迁移分支。
- [x] 4.3 `SettingsBackupView` 在导入旧版时展示升级提示并保持原数据。
- [x] 4.4 在 `tools/verify-bundle.mjs` 中补充 v1 → v2 兼容与字段缺失拒绝用例。

## 5. 验证与归档

- [x] 5.1 在 `tools/verify-portfolio.mjs` 中加入账户汇总、币种折算、行情不可用状态与备份兼容性断言。
- [x] 5.2 运行 `comet guard portfolio-positions open --apply` 推进阶段。
- [x] 5.3 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/portfolio-positions/verification.md`。
- [x] 5.4 勾选本任务清单后归档。