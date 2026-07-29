## 1. 数据模型与迁移

- [x] 1.1 在 `electron/main.js` 启动迁移脚本中为 `alerts` 表新增 `conditions` / `combine` / `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` 字段。
- [x] 1.2 在 `alert_events` 表新增 `signature` 字段并创建 `(rule_id, signature, minute_bucket)` 唯一约束。
- [x] 1.3 在 `src/types.ts` 暴露新 `Condition` / `RuleLifecycle` / `CombineMode` 等类型。

## 2. 评估引擎

- [x] 2.1 在 `src/alertEngine.ts` 重写 `evaluateAlert` 与 `evaluateAlerts`，支持 `AND` / `OR`、签名计算、字段缺失分支。
- [x] 2.2 在评估器入口实现每日上限与会话时段判断。
- [x] 2.3 在历史写入路径中加入签名去重；并发刷新下保证同一 `(rule_id, signature, minute_bucket)` 仅一条记录。

## 3. 编辑器与 UI

- [x] 3.1 在 `src/views/AlertEditor.tsx` 中增加分步表单：先选指标、再选操作符与阈值、再选组合方式。
- [x] 3.2 编辑器支持配置 `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` / `cooldownMs`。
- [x] 3.3 在自选和持仓列表中显示规则的“条件无法评估”状态。

## 4. 兼容与回滚

- [x] 4.1 在启动迁移脚本中将现有 4 类单条件规则转换为 DSL 形式，写入 `conditions` / `combine`，保留 `cooldownMs`。
- [x] 4.2 增加 `feature flag: advancedAlertRules`；关闭时回退到旧版 `price_above` / `price_below` / `pct_above` / `pct_below` 行为。

## 5. 验证与归档

- [x] 5.1 扩展 `tools/verify-alerts.mjs`，覆盖组合条件、签名去重、字段缺失与每日上限。
- [x] 5.2 新增 `tools/verify-alert-dsl.mjs`，覆盖 AND/OR、sessionWindow、expiresAt 与 dailyCap。
- [x] 5.3 运行 `comet guard advanced-alert-rules open --apply` 推进阶段。
- [x] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/advanced-alert-rules/verification.md`，勾选本任务清单后归档。