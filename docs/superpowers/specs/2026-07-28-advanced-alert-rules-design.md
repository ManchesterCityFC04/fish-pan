---
comet_change: advanced-alert-rules
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-advanced-alert-rules
status: final
---

# Design Doc: advanced-alert-rules

> 本文档是对 OpenSpec `openspec/changes/advanced-alert-rules/design.md` 的深度技术细化。OpenSpec delta spec 仍为 canonical spec。

## 1. 目标与范围

把现有 4 类单条件价格提醒升级为 DSL，支持多种原子条件、AND/OR 组合、交易时段约束、每日上限、单次/重复与到期时间。保持向后兼容，自动迁移旧规则。

**非目标**：不引入后台服务；不引入跨标的组合告警；不做交易建议。

## 2. 核心数据结构

```ts
type AlertAtomKind = 'price' | 'change_pct' | 'turnover' | 'volume' | 'volume_ratio';
type AlertOp = '>' | '>=' | '<' | '<=' | '==' | '!=' | 'between';
type CombineMode = 'AND' | 'OR';
type RepeatMode = 'single' | 'repeat';

interface AlertCondition {
  kind: AlertAtomKind;
  op: AlertOp;
  threshold: number | [number, number];  // between 时为双元素
}

interface AlertSessionWindow {
  start: string;  // 'HH:mm'
  end: string;
}

interface AlertLifecycle {
  enabled: boolean;
  expiresAt: number | null;
  sessionWindow: AlertSessionWindow | null;
  dailyCap: number | null;       // null = 无上限
  repeatMode: RepeatMode;
  cooldownMs: number;
}

interface AlertRule {
  id?: number;
  code: string;
  conditions: AlertCondition[];
  combine: CombineMode;
  lifecycle: AlertLifecycle;
  prevValue: number | null;        // 兼容：首次观察值
}
```

## 3. 评估引擎

`src/alertEngine.ts` 新增 `evaluateRule(rule, quote, now)` 返回 `{ status: 'hit' | 'prime' | 'unknown', missingFields: string[], signature, action }`。

- 字段缺失 → `status: 'unknown'`。
- 组合条件按 `combine` 求值；与现有阈值穿越逻辑兼容（旧 `prevValue` 字段保留）。
- `signature = combine + 条件签名 + 命中侧` 用于去重。

## 4. 签名去重

`alert_events` 表新增 `signature TEXT NOT NULL`，与 `(rule_id, signature, minute_bucket)` 唯一约束：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_sig
  ON alert_events(rule_id, signature, minute_bucket);
```

`minute_bucket = floor(triggered_at / 60000) * 60000`。

## 5. 生命周期与每日上限

- `dailyCap` 按北京时间当日命中数计算：满后不再写历史与通知。
- `expiresAt < now` → 规则 disabled，评估器跳过。
- `sessionWindow`：A 股 09:30-11:30 + 13:00-15:00；非窗口期不评估。
- `repeatMode: 'single'`：命中后自动 disable。

## 6. 兼容与迁移

启动迁移把现有 4 类规则映射为 DSL 单条件；`combine: 'AND'`、默认 `lifecycle`。`db-save-alert` IPC 接收新字段并向前兼容。

## 7. 测试

`tools/verify-alert-dsl.mjs`：组合条件、AND/OR、签名稳定、dailyCap、expiresAt、sessionWindow、字段缺失降级。

## 8. 与其他 change 的关系

- 依赖 `market-data-engine` 提供稳定价格源（已落地）。
- 与 `notification-router` 联动：评估器发出触发后由 Router 派发（4/6）。
- 与 `price-alerts` 兼容：旧规则自动迁移。

## 9. Feature Flag

`feature flag: advancedAlertRules` 默认关闭；关闭时回退到旧 4 类单条件规则。

## 10. Spec Patch

无。现有 delta spec + Modified Specs（`price-alerts` / `alert-history`）覆盖所有验收场景。
