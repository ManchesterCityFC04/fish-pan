# Comet Design Handoff

- Change: advanced-alert-rules
- Phase: design
- Mode: compact
- Context hash: 103f2ac0c991c3bc2fe567bc2fb982e116a63458c94233bb8e29bfa539c37c46

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/advanced-alert-rules/proposal.md

- Source: openspec/changes/advanced-alert-rules/proposal.md
- Lines: 1-30
- SHA256: 84598de12f462c598a11c597477fff87d26c4cad35f007863d397e1cdaab424c

```md
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
```

## openspec/changes/advanced-alert-rules/design.md

- Source: openspec/changes/advanced-alert-rules/design.md
- Lines: 1-56
- SHA256: 9b93540ec4aec9c55079ed0fa31167f91dd267d3e6d27d0e57106d7b54c88272

```md
## Context

fish-pan 当前只有 `price_above / price_below / pct_above / pct_below` 四类单条件规则，缺乏组合条件、成交量类指标和生命周期控制。PanWatch 的 `PriceAlertRule` 通过 DSL 风格定义条件、支持 AND/OR 与生命周期参数，是可直接借鉴的成熟模型。本 change 在不复制 PanWatch Python 实现的前提下，把 fish-pan 的规则模型升级为 DSL，并保留向后兼容。

## Goals / Non-Goals

**Goals:**

- 把现有规则模型抽象为统一的 `Condition` 类型，并支持 `AND` / `OR` 组合。
- 引入 `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` / `cooldownMs` 生命周期字段。
- 保持旧规则的语义兼容并平滑迁移。
- 触发评估去重到 `(rule_id, signature)` 维度，并在数据库层做分钟级去重。
- 行情字段缺失时显示“条件无法评估”，不计入历史。

**Non-Goals:**

- 不实现新的通知渠道（仅占位），不做应用退出后的后台监控。
- 不实现跨标的组合告警。
- 不把告警变为交易信号或自动执行。
- 不引入新的渲染框架。

## Decisions

- **Condition DSL**：`Condition = { kind: 'price' | 'change_pct' | 'turnover' | 'volume' | 'volume_ratio', op: '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between', threshold: number | [number, number] }`。
- **组合模型**：规则包含 `conditions: Condition[]` 与 `combine: 'AND' | 'OR'`；评估先按 combine 求值，再参与既有阈值穿越。
- **生命周期**：`enabled` 默认 `true`；`expiresAt` 为绝对时间或 `null`；`sessionWindow` 为 `[openHHmm, closeHHmm]` 表示 A 股交易时段；`dailyCap` 为正整数；`repeatMode` 为 `single | repeat`。
- **签名 (signature)**：用于触发去重与历史回放，签名 = `combine + 条件签名 + 命中侧`；`minute_bucket` 取评估时刻的整分钟。
- **数据库层去重**：在 `alert_events` 表上新增 `(rule_id, signature, minute_bucket)` 唯一约束，保证同一签名在同一分钟内只产生一条记录。
- **兼容映射**：旧 4 类规则在启动迁移中映射为对应 DSL 单条件规则，`cooldownMs` 默认 10 分钟。
- **行情字段缺失**：评估器在 `evaluateAlert` 顶部对所需字段进行存在性检查；缺失时返回 `{ status: 'unknown', missingFields }`，由历史层和 UI 区分显示。
- **去重与冷却并存**：签名去重与冷却同时生效；冷却期内即使重新触发也不产生新事件；签名去重主要防止并发刷新内的同分钟重复。

## Risks / Trade-offs

- [DSL 复杂度升高 → 编辑器 UI 风险] → 采用分步表单（先选指标，再选操作符与阈值，再选组合方式），并提供模板示例。
- [旧规则迁移出错] → 启动迁移脚本必须幂等；`tools/verify-alerts.mjs` 覆盖四类旧规则的迁移结果。
- [每日上限与冷却的语义冲突] → 每日上限以自然日（北京时间）为准；冷却以分钟为准；两者独立生效。
- [sessionWindow 仅覆盖 A 股] → 对港美股规则，sessionWindow 仅作为可选区间；缺省时不限制。
- [行情字段临时不可用] → 通过 `missingFields` 显示明确状态而不是按 0 触发，避免误报。

## Migration Plan

1. 升级 `alerts` 表 schema：新增 `conditions` / `combine` / `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` 字段。
2. 启动迁移把旧 4 类规则转写为 DSL 形式并写入新字段。
3. 在 `alert_events` 表上新增 `signature` 字段与 `(rule_id, signature, minute_bucket)` 唯一约束。
4. 重写 `evaluateAlert` 与 `evaluateAlerts`，支持组合条件、签名计算、字段缺失分支与每日上限。
5. 编辑器 UI 增加组合、生命周期与会话时段配置入口。
6. 新增 `tools/verify-alert-dsl.mjs` 并扩展 `tools/verify-alerts.mjs`。
7. 通过 `feature flag: advancedAlertRules` 切换新旧评估路径；关闭时回退到旧版逻辑。

回滚：保留旧字段为可空，关闭 feature flag 即走旧版路径；不破坏已有数据。

## Open Questions

- `volume_ratio` 的数值口径（与 `turnover` 的差异）需要在文档中固定；当前不引入新 Vendor，沿用现有 `market-data-engine` 暴露字段。
- `between` 操作符是否需要纳入第一版？建议先以单边比较为主，避免编辑器复杂度膨胀。
- 历史回放的 UI 是否要在本 change 提供？建议仅在告警编辑器内提供简单预览，不在本 change 扩展 history 视图。
```

## openspec/changes/advanced-alert-rules/tasks.md

- Source: openspec/changes/advanced-alert-rules/tasks.md
- Lines: 1-28
- SHA256: 30c86526146e4758f1afbb0f4004905679c3ce669a56c43d627eb07b84c5711d

```md
## 1. 数据模型与迁移

- [ ] 1.1 在 `electron/main.js` 启动迁移脚本中为 `alerts` 表新增 `conditions` / `combine` / `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` 字段。
- [ ] 1.2 在 `alert_events` 表新增 `signature` 字段并创建 `(rule_id, signature, minute_bucket)` 唯一约束。
- [ ] 1.3 在 `src/types.ts` 暴露新 `Condition` / `RuleLifecycle` / `CombineMode` 等类型。

## 2. 评估引擎

- [ ] 2.1 在 `src/alertEngine.ts` 重写 `evaluateAlert` 与 `evaluateAlerts`，支持 `AND` / `OR`、签名计算、字段缺失分支。
- [ ] 2.2 在评估器入口实现每日上限与会话时段判断。
- [ ] 2.3 在历史写入路径中加入签名去重；并发刷新下保证同一 `(rule_id, signature, minute_bucket)` 仅一条记录。

## 3. 编辑器与 UI

- [ ] 3.1 在 `src/views/AlertEditor.tsx` 中增加分步表单：先选指标、再选操作符与阈值、再选组合方式。
- [ ] 3.2 编辑器支持配置 `expiresAt` / `sessionWindow` / `dailyCap` / `repeatMode` / `cooldownMs`。
- [ ] 3.3 在自选和持仓列表中显示规则的“条件无法评估”状态。

## 4. 兼容与回滚

- [ ] 4.1 在启动迁移脚本中将现有 4 类单条件规则转换为 DSL 形式，写入 `conditions` / `combine`，保留 `cooldownMs`。
- [ ] 4.2 增加 `feature flag: advancedAlertRules`；关闭时回退到旧版 `price_above` / `price_below` / `pct_above` / `pct_below` 行为。

## 5. 验证与归档

- [ ] 5.1 扩展 `tools/verify-alerts.mjs`，覆盖组合条件、签名去重、字段缺失与每日上限。
- [ ] 5.2 新增 `tools/verify-alert-dsl.mjs`，覆盖 AND/OR、sessionWindow、expiresAt 与 dailyCap。
- [ ] 5.3 运行 `comet guard advanced-alert-rules open --apply` 推进阶段。
- [ ] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/advanced-alert-rules/verification.md`，勾选本任务清单后归档。
```

## openspec/changes/advanced-alert-rules/specs/advanced-alert-rules/spec.md

- Source: openspec/changes/advanced-alert-rules/specs/advanced-alert-rules/spec.md
- Lines: 1-128
- SHA256: 8b37ac462bc3b64928dc2cee88543fae49e4c4a4a196a13c8a1d2e31b5cae337

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 多指标原子条件
The system SHALL 支持 `price` / `change_pct` / `turnover` / `volume` / `volume_ratio` 五种原子条件，每种条件包含操作符与阈值。

#### Scenario: 创建成交量类条件
- **WHEN** 用户选择 `volume` 并设置操作符 `>` 与阈值
- **THEN** 系统保存该条件并在评估时使用行情中的成交量字段

#### Scenario: 量比条件
- **WHEN** 用户选择 `volume_ratio` 并设置阈值
- **THEN** 系统使用行情中的量比字段进行评估

### Requirement: 条件组合
The system SHALL 支持 `AND` / `OR` 组合，每个规则至少包含两条原子条件并能按组合方式求值。

#### Scenario: AND 组合条件满足
- **WHEN** 规则为 `price > 10 AND volume_ratio > 3` 且两项同时满足
- **THEN** 系统将该规则视为命中

#### Scenario: OR 组合条件满足
- **WHEN** 规则为 `price > 10 OR volume_ratio > 3` 且至少一项满足
- **THEN** 系统将该规则视为命中

#### Scenario: AND 条件部分满足
- **WHEN** 规则为 `price > 10 AND volume_ratio > 3` 但仅一项满足
- **THEN** 系统不视为命中且不写入历史

### Requirement: 规则生命周期
The system SHALL 支持 `expiresAt`（到期时间）、`sessionWindow`（交易时段）、`dailyCap`（每日上限）、`repeatMode`（`single` / `repeat`）与 `cooldownMs` 字段。

#### Scenario: 规则到期自动停用
- **WHEN** 当前时间超过规则的 `expiresAt`
- **THEN** 系统停止评估该规则且不会重新武装

#### Scenario: 每日上限生效
- **WHEN** 同一规则在同一自然日已经命中 `dailyCap` 次
- **THEN** 系统停止发出更多历史记录与通知，直到次日

#### Scenario: 单次模式
- **WHEN** 规则 `repeatMode: 'single'` 且已命中过一次
- **THEN** 系统自动停用该规则且不再评估

#### Scenario: 重复模式
- **WHEN** 规则 `repeatMode: 'repeat'` 且已命中过
- **THEN** 系统在冷却结束后允许再次触发

### Requirement: 交易时段限制
The system SHALL 在规则配置了 `sessionWindow` 时仅在指定时段内评估。

#### Scenario: A 股交易时段内
- **WHEN** 规则配置了 A 股 09:30–11:30 / 13:00–15:00 时段
- **THEN** 系统仅在该时段内评估该规则

#### Scenario: 时段外不评估
- **WHEN** 当前时间不在规则配置的 `sessionWindow` 内
- **THEN** 系统跳过评估且不写入历史

### Requirement: 触发签名与去重
The system SHALL 在规则命中时计算 signature（combine + 条件签名 + 命中侧），并使用 `(rule_id, signature, minute_bucket)` 唯一约束避免同一分钟内的重复历史记录。

#### Scenario: 同分钟重复触发
- **WHEN** 同一规则在同一分钟内连续两次评估都命中同一签名
- **THEN** 数据库层去重使历史表只保留一条记录

#### Scenario: 不同签名都保留
- **WHEN** 同一规则在不同条件下分别命中（即使时间接近）
- **THEN** 历史表分别为每个 signature 增加记录

### Requirement: 行情字段缺失处理
The system SHALL 在规则所需字段缺失时返回“条件无法评估”状态，不写入历史且不触发通知。

#### Scenario: 缺少量比字段
- **WHEN** 规则包含 `volume_ratio` 但行情未提供该字段
- **THEN** 系统将该规则标记为“条件无法评估”并跳过本次评估

### Requirement: 旧规则向后兼容
The system MUST 在启动迁移中将现有 4 类单条件规则映射为 DSL 形式，保持原有行为不变。

#### Scenario: 旧 `price_above` 规则迁移

```

Full source: openspec/changes/advanced-alert-rules/specs/advanced-alert-rules/spec.md
