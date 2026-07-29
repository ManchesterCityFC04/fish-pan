## Why

fish-pan 当前 `price-alerts` 只能表达单一阈值穿越（price above / price below / gain / loss），缺少 AND/OR 组合、成交量与换手率类条件、交易时段限制、每日上限、单次/重复与到期等生命周期控制。这些能力是 PanWatch 已验证可用的成熟做法；fish-pan 需要在不引入 PanWatch Python 抽象的前提下，把规则模型升级为 DSL 风格，使其能服务多源数据与组合策略。

## What Changes

- 把现有 4 类单条件规则抽象为统一的 `Condition` 模型，支持 `price` / `change_pct` / `turnover` / `volume` / `volume_ratio` 五种原子指标。
- 引入条件组合：每条规则包含 `conditions: Condition[]` 与 `combine: "AND" | "OR"`，至少支持两层组合。
- 引入规则生命周期字段：`enabled`、`expiresAt`、`sessionWindow`（可限定 A 股交易时段）、`dailyCap`、`repeatMode`（single / repeat）、`cooldownMs`。
- 旧规则平滑迁移：现有 `price_above` / `price_below` / `pct_above` / `pct_below` 被映射为 DSL 单条件规则，`cooldownMs` 沿用旧值。
- 触发评估去重键改为 `(rule_id, signature)`：signature = `combine + 条件签名 + 命中侧`；数据库层保证同一签名在 1 分钟内只产生一条历史记录。
- 评估模块可独立调用，仍由 `evaluateAlerts` 主导；条件签名用于穿透到 `alert-history`。
- 行情字段缺失时，规则显示“条件无法评估”，而不是按 0 处理；这种状态不计入历史。
- 不在本 change 中增加通知渠道（仅占位）；不引入后台服务；不保证应用退出后继续扫描。

## Capabilities

### New Capabilities
- `advanced-alert-rules`: 支持多种原子条件、AND/OR 组合、交易时段、冷却、每日上限、单次/重复、到期的告警规则 DSL 与评估能力。

### Modified Capabilities
- `price-alerts`: 规则模型升级为 DSL；单条件规则继续兼容；触发与通知保持当前契约。
- `alert-history`: 历史记录携带具体命中条件签名与组合方式，便于回放。

## Impact

- 主要影响 `electron/main.js`、`src/types.ts`、`src/alertEngine.ts`、`src/App.tsx`、`src/views/AlertEditor.tsx` 与新规则编辑器。
- 启动迁移脚本需要为旧 `alerts` 表补充新字段，并保留旧规则的等价语义。
- 历史表需要新增 `signature` 字段与 `(rule_id, signature, minute_bucket)` 唯一约束。
- 测试需要扩展 `tools/verify-alerts.mjs` 与新增 `tools/verify-alert-dsl.mjs`，覆盖组合条件、每日上限、到期与时段限制。
- 评估频率仍受 `market-data-engine` 限制；本 change 不影响行情拉取节奏。