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