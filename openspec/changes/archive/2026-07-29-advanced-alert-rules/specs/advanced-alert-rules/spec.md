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
- **WHEN** 启动时检测到旧的 `price_above` 规则
- **THEN** 系统迁移为单条 `price` 条件且 `combine: 'AND'`

#### Scenario: 旧规则冷却保留
- **WHEN** 旧规则曾设置过冷却时间
- **THEN** 迁移后规则保留 `cooldownMs` 字段
