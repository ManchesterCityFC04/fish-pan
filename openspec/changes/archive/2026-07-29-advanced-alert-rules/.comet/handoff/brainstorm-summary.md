# Brainstorm Summary

- Change: advanced-alert-rules
- Date: 2026-07-28

## 关键决策

- **Condition DSL**：`price / change_pct / turnover / volume / volume_ratio` 五种；操作符 `> >= < <= == != between`；AND/OR 组合。
- **生命周期字段**：`enabled / expiresAt / sessionWindow / dailyCap / repeatMode / cooldownMs`。
- **签名去重**：`signature = combine + 条件签名 + 命中侧`，数据库 `(rule_id, signature, minute_bucket)` 唯一约束。
- **解析错误降级**：字段缺失时返回"条件无法评估"，不计入历史。
- **feature flag: advancedAlertRules** 默认关闭，回退到现有 4 类单条件规则。
- **测试**：纯函数 + 离线断言（`tools/verify-alert-dsl.mjs`）。

## 取舍与风险

- **TLS 不绕过**；`MarketData.fetch({ kind: 'quote' })` 提供统一价格源。
- **不引入新 IPC**：`alertEngine` 仍是纯函数评估；IPC 入口 `db-save-alert` 扩展接收 conditions/combine 字段。
- **不引入后台服务**：应用退出即停。

## 测试策略

- `tools/verify-alert-dsl.mjs` 覆盖：组合条件、AND/OR、签名稳定、dailyCap、expiresAt、sessionWindow、字段缺失降级。

## Spec Patch
无（现有 delta spec 已覆盖）。

## 下一步

- 创建 Design Doc → `comet state set advanced-alert-rules design_doc` + `comet guard ... design --apply` → Build → Verify → Archive。