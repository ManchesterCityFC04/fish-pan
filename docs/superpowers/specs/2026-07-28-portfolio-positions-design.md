---
comet_change: portfolio-positions
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-portfolio-positions
status: final
---

# Design Doc: portfolio-positions

> 本文档是对 OpenSpec `openspec/changes/portfolio-positions/design.md`（高层方案）的深度技术细化。OpenSpec delta spec 仍为 canonical spec。

## 1. 目标与范围

补齐 fish-pan 缺失的账户、持仓、成本、盈亏与多币种折算视图；让加仓计算器与一键诊断接收真实持仓上下文；保持只读立场，不接券商，不做模拟交易。

**非目标**：不接券商/不接任何交易通道；不自动生成买卖或加仓建议；不重算税务与历史成交成本法；不做模拟交易；不保存全文；不绕过 TLS。

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────┐
│ Renderer (React)                                         │
│  PortfolioView ─┐                ┌─ OneClickDiagnosis    │
│   AddPosition    │                │  position: { ... }   │
│   Calculator     │ electronAPI.   │                       │
│   (+ prefill)    │ db.* (新增)   │                       │
└──────────────────┼────────────────┼──────────────────────┘
                   │                │
┌──────────────────▼────────────────▼──────────────────────┐
│ Electron Main                                            │
│  ipcMain.handle('db-add-account' | 'db-list-accounts' | │
│    'db-update-account' | 'db-remove-account' |          │
│    'db-add-position' | 'db-list-positions' |           │
│    'db-update-position' | 'db-remove-position' |        │
│    'portfolio:summary')                                  │
│            │                                              │
│            ▼                                              │
│  SQL.js (fishpan.db) ─ accounts + positions 表          │
│  MarketData Engine ─ quote / fx（已有）                 │
└──────────────────────────────────────────────────────────┘
```

## 3. 数据模型

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'CNY',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  shares REAL NOT NULL,
  cost_price REAL NOT NULL,
  opened_at INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_account_code
  ON positions(account_id, code);
CREATE INDEX IF NOT EXISTS idx_positions_code ON positions(code);
```

## 4. 核心数据结构

```ts
interface Account {
  id?: number;
  name: string;
  baseCurrency: 'CNY' | 'USD' | 'HKD';
  createdAt: number;
}

interface Position {
  id?: number;
  accountId: number;
  code: string;            // 'sh600000' / 'hk00700' / 'usAAPL'
  shares: number;
  costPrice: number;       // in code's currency
  openedAt: number;        // epoch ms
  notes?: string;
}

interface PortfolioSummary {
  totalCost: number;        // 折算到 CNY
  totalValue: number;       // 折算到 CNY
  todayPnl: number | null;  // null 表示行情不可用
  totalPnl: number | null;
  maxSinglePct: number;     // 最大单一持仓占比
  top5Pct: number;          // 前 5 持仓占比
  positions: Array<{
    position: Position;
    account: Account;
    currentPrice: number | null;
    todayPnl: number | null;
    totalPnl: number | null;
    fxRate: number | null;  // CNY per unit foreign currency
  }>;
}
```

## 5. 持仓接入与加仓计算

`AddPositionCalculator` 接受可选 prop `prefillContext?: { shares: number; costPrice: number; code: string }`；不为空时预填当前成本与数量；只读约束不变；不写持仓。

`buildDiagnosisBundle` 扩展：`position: { shares, costPrice } | { accountId, code, shares, costPrice, openedAt } | null`；调用方在组合页传入时附 `accountId`。

## 6. 备份兼容

```json
{
  "version": 2,
  "watchlist": [...],
  "alerts": [...],
  "alertEvents": [...],
  "aiAnalyses": [...],
  "accounts": [...],
  "positions": [...]
}
```

- v2 写：包含 `accounts` / `positions`。
- v1 读：保留旧字段；导入时显示"升级路径"提示但旧数据可保留。
- `bundle.ts:validateBundle` 加固：拒绝字段缺失或类型错误。

## 7. UI 接入

- `src/views/PortfolioView.tsx` 新建：账户切换、持仓列表、组合汇总、每行"测算"按钮。
- `src/App.tsx` 新增 `view: 'portfolio'` 路由。
- 详情页 K 线视图底部留接口（推迟：与 market-news-events 详情页 tab 合并推进）。

## 8. Feature Flag 与回滚

- `feature flag: portfolioPositions` 默认关闭；
- 关闭 → 视图入口隐藏；旧自选不受影响；
- 开启 → 显示组合页。

## 9. 安全与合规

- TLS 不绕过；汇率走 `MarketData` 的 fx Vendor；
- 不接券商；API Key 不存储；
- 备份包按 `includeSecrets` 默认 redact。

## 10. 测试策略

### 10.1 `tools/verify-portfolio.mjs`
- 盈亏计算（`todayPnl = (currentPrice - prevClose) * shares`）。
- 多币种折算：USD/HKD → CNY 汇率；汇率不可用时降级为"折算暂停"。
- 行情不可用时：`todayPnl / totalPnl = null`，UI 显示"行情暂不可用"。
- 加仓计算 prefill context（不改写持仓）。
- 诊断 bundle position 字段从 null 变为非空。
- 备份 v2 → v1 兼容读取。

### 10.2 兼容回归
- `npm run build` 通过；
- `tools/verify-{market-data,news-adapters,diagnosis}.mjs` 不回归。

## 11. 实现顺序

1. SQL 迁移 + 新 IPC handler。
2. `src/types.ts` 新增 `Account / Position / PortfolioSummary` 类型。
3. `src/api.ts` 新增 `fetchAccounts / fetchPositions / fetchPortfolioSummary / addAccount / removeAccount / addPosition / removePosition`。
4. `src/views/PortfolioView.tsx` 新建。
5. `AddPositionCalculator` 支持 `prefillContext`。
6. `src/diagnosis.ts` 扩展 `buildDiagnosisBundle` 接受 `position: { accountId, code, shares, costPrice, openedAt } | null`。
7. `App.tsx` 接线（账户/持仓路由 + OneClickDiagnosis 携带 position）。
8. `bundle.ts` 升级到 v2。
9. `tools/verify-portfolio.mjs` 离线断言。
10. `npm run build` + `verification.md`。

## 12. 与其他 change 的关系

- 依赖 `market-data-engine`（1/6）的 `MarketData.fetch({ kind: 'quote' })` 与 `kind: 'fx'`（fx 字段校准后续增量）。
- 与 `add-position-calculator`（已归档 spec）耦合：本 change 改 `add-position-calculator` spec 的 prefill 场景（已通过 MODIFIED Requirements 处理）。
- 与 `one-click-diagnosis`（已归档 spec）耦合：本 change 改 `one-click-diagnosis` spec 的 position 场景（MODIFIED Requirements 处理）。

## 13. 开放问题

- 汇率来源：当前不引入 `kind: 'fx'` Vendor；本期使用 stub 1:1 汇率（仅当明确不支持时显示"折算暂停"）；fx Vendor 留作独立增量。
- 是否支持"组合基准"（沪深 300 等）？建议后续增量，本批次不做。

## 14. Spec Patch

无。OpenSpec delta spec + Modified Specs（`add-position-calculator` / `one-click-diagnosis`）已覆盖所有验收场景。
