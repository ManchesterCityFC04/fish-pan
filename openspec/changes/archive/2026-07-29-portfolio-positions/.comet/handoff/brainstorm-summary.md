# Brainstorm Summary

- Change: portfolio-positions
- Date: 2026-07-28

## 用户确认的关键决策

- **数据模型**：三表分离（`accounts` / `positions`），与 `market-data-engine` 解耦。
- **多币种折算**：CNY 为本币；港美股按 `MarketData.fx` 折算；汇率不可用时显示"折算暂停"。
- **加仓计算接入**：组合页一行"测算"按钮预填当前成本与数量；保持只读。
- **诊断接入**：bundle 的 `position` 字段从 `null` 改为真实 `{ account, code, shares, costPrice, openedAt }`。
- **备份兼容**：bundle.version 升至 2；旧版本（v1）保留只读并提示升级路径。
- **测试**：纯函数 + 离线断言（`tools/verify-portfolio.mjs`）；不引入 Vitest。

## 关键取舍与风险

- **不接券商**：保持本地手工录入，避免合规与认证风险。
- **不重算税务/历史成本**：以用户输入成本为准。
- **行情不可用**：成本/数量保留，盈亏字段显示"行情暂不可用"。
- **港美股无 Vendor**：`supports()` 返回 false 时 UI 显示"不适用"。
- **TLS 不绕过**：汇率与价格走 `MarketData` 抽象的安全约束。

## 测试策略

- `tools/verify-portfolio.mjs`：
  - 盈亏计算（`(currentPrice - cost) * shares`）。
  - 多币种折算（USD/HKD → CNY 汇率不可用时降级）。
  - 行情不可用时盈亏显示"行情暂不可用"。
  - 加仓计算器 prefill context（不改写持仓）。
  - 诊断 bundle 中 `position` 字段从 `null` 改为非空。
  - 备份 v2 → v1 兼容读取。

## Spec Patch

无（现有 OpenSpec delta spec + Modified Specs 已覆盖）。

## 下一步

- 创建 Design Doc 至 `docs/superpowers/specs/2026-07-28-portfolio-positions-design.md`。
- 用户确认 → `comet state set portfolio-positions design_doc` + `comet guard portfolio-positions design --apply`。