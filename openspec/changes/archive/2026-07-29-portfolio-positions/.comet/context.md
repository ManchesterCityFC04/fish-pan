# Comet Design Handoff

- Change: portfolio-positions
- Phase: design
- Mode: compact
- Context hash: b509329752af3629e3003ee716807c278fc3b21e41986cd8ef184e2db5087c5e

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/portfolio-positions/proposal.md

- Source: openspec/changes/portfolio-positions/proposal.md
- Lines: 1-32
- SHA256: 48f504bf07faaad7fa4f4eab8cbc0cd1c62498c88bbd5057ecf4a52aa05fe4a3

```md
## Why

fish-pan 现状缺少任何形式的持仓与组合视图，导致加仓计算器只能依赖手工输入，一键诊断里 `position` 字段长期为 `null`，用户也看不到多账户、多币种的盈亏。PanWatch 通过账户、持仓与股票三张表的分离以及多币种折算和组合诊断，提供了本地盯盘场景的参考模型；fish-pan 需要在不复制 PanWatch 全部模块的前提下，补齐这些能力以承接后续告警、诊断和报告。

## What Changes

- 引入账户、持仓与股票分离的数据模型，新增 `accounts` / `positions` 表，并加入基础索引。
- 支持多个本地账户，每个账户可持有 A 股、港股、美股持仓，并允许相同股票出现在不同账户。
- 引入本币（人民币）折算：港股按 HKD→CNY、美股按 USD→CNY 汇率换算；汇率源复用 `market-data-engine` 的缓存与降级机制。
- 组合页展示账户切换、按账户汇总、按币种折算、当日盈亏、累计浮盈亏和最大集中度。
- 当行情不可用时，持仓记录必须保留成本和数量，相关盈亏字段明确显示“行情暂不可用”。
- 将现有只读加仓计算器接入真实持仓；选中持仓时自动填入当前成本和数量，并允许一键调起。
- 一键诊断中 `position` 不再恒为 `null`：诊断 bundle 接收用户当前账户与持仓组合。
- 备份与恢复包需要识别并包含新表的数据。
- **BREAKING**：当前 `bundle.ts` 中的 `watchlist` 字段将与新增 `accounts` / `positions` 并存；版本号升到 2，旧版本仍可读取但不再写入新字段。
- 本 change 不接入券商、不连接任何交易通道、不做模拟交易；不做税务/历史成交成本法重算；不引入自动买卖或建议。

## Capabilities

### New Capabilities
- `portfolio-positions`: 多账户持仓的持久化、币种折算、组合盈亏展示与诊断接入。

### Modified Capabilities
- `add-position-calculator`: 接收选中的持仓上下文，不再只接受手工输入；只在用户主动选择持仓时填充。
- `one-click-diagnosis`: 诊断 bundle 的 `position` 字段来自组合视图，允许传入账户与持仓组合。

## Impact

- 主要影响 `electron/main.js`、`src/api.ts`、`src/types.ts`、`src/addPosition.ts`、`src/diagnosis.ts`、`src/views/AddPositionCalculator.tsx`、`src/views/OneClickDiagnosis.tsx`、`src/bundle.ts` 与设置备份 UI。
- 备份包的 `version` 字段升到 2；导入时若发现更老版本，必须提示用户升级路径或保留旧版本字段。
- 渲染端需要新增“组合”视图并接入现有 IPC 体系；建议新视图以 `portfolio` 为路由名。
- 汇率源依赖 `market-data-engine`；汇率获取失败时组合页必须明确提示“折算暂停”，而不是展示过期或错误数字。
- 需为新表数据迁移、备份兼容、组合汇总与盈亏计算新增单元测试和集成测试。
```

## openspec/changes/portfolio-positions/design.md

- Source: openspec/changes/portfolio-positions/design.md
- Lines: 1-56
- SHA256: 5ad8e682e1fac703a4dad0fc5babb597299c0f4d6ff7a58beea96b6460397bc5

```md
## Context

fish-pan 已有自选、A/HK/US 报价、提醒、加仓计算和只读诊断，但没有任何持仓、账户或组合视图。PanWatch 的 `Account` / `Position` / `Stock` 三表分离和 HKD/USD→CNY 折算模型为本 change 提供参考；本 change 不复制其实现，仅借鉴拆分与汇总模型，并在本地 sql.js 与 Electron 主进程下落地。

## Goals / Non-Goals

**Goals:**

- 在主进程侧引入账户、持仓数据表，并在启动迁移脚本中处理旧数据库。
- 在渲染端新增“组合”视图：账户切换、按账户汇总、按币种折算、当日盈亏、累计浮盈亏和集中度。
- 通过 `MarketData` 提供的汇率能力，把港股和美股持仓折算到 CNY 显示；汇率不可用时明确提示。
- 把持仓上下文接入只读加仓计算器，用户在组合页选中持仓可一键进入并预填成本与数量。
- 把持仓上下文接入一键诊断，bundle 的 `position` 字段不再恒为 `null`。
- 备份包 `version` 升到 2，包含新表数据；旧版本仍可读取但不写入。

**Non-Goals:**

- 不连接券商、不接入交易通道，不做模拟交易。
- 不自动生成买卖或加仓建议，不引入按规则触发的写动作。
- 不重算税务、历史成交成本或加权成本；以用户输入为准。
- 不持久化远程行情、不做跨设备同步。
- 不引入新的渲染框架或路由系统。

## Decisions

- **三表分离**：账户 (`accounts`)、持仓 (`positions`) 与股票自选保持分离；持仓通过 `account_id + code` 唯一定位。
- **币种折算模型**：默认本币 CNY；港股显示 HKD 原值与 CNY 折算，美股显示 USD 原值与 CNY 折算。折算汇率通过 `MarketData` 暴露的 `fx` Vendor 能力获取，沿用 TTL 与降级策略。
- **行情不可用策略**：成本、数量始终保留；当报价 Vendor 返回 `error.kind: "all-failed"` 时，组合页相应字段显示“行情暂不可用”，且盈亏计算改为仅展示成本基础。
- **加仓计算接入**：在组合页的持仓列表行内置“测算”按钮，将持仓上下文通过 React props 注入既有 `AddPositionCalculator`；只读约束保持不变。
- **诊断接入**：诊断 bundle 的 `position` 字段由组合页选中账户与持仓决定；当用户在自选页面触发时仍可手动选择目标账户。
- **备份兼容**：`bundle.kind` 保持 `fish-pan:settings-bundle`，`version` 从 1 升到 2；导入旧版本时保留旧数据但提示用户进行显式升级；导出新版本包含 `accounts` / `positions` 字段。
- **集中度计算**：按账户和按组合两级，分别输出最大单一持仓占比与前 5 占比；集中度仅基于当前市值计算，不引入历史波动率。

## Risks / Trade-offs

- [汇率接口波动或禁用] → 折算字段加缓存标识；折算失败时显示“折算暂停”并保留原币种数字。
- [成本输入错误] → 输入界面要求用户确认且不允许负数；记录建仓日字段以备后期校对。
- [备份兼容失误] → 旧版本导出仅含 `watchlist`/`alerts`/`alertEvents`/`aiAnalyses`；导入路径必须先识别 `version` 再分发到对应迁移分支。
- [诊断 bundle 体积膨胀] → 组合诊断按账户压缩（每账户前 10 持仓），避免一次发送过多股票。
- [加仓计算误用为交易信号] → 继续保留只读文案与按钮语义，不引入执行动作。

## Migration Plan

1. 在主进程侧新增 `accounts`、`positions` 表与对应索引，加入启动迁移脚本。
2. 在 `MarketData` 侧补充 `fx` 数据类型，提供 USD→CNY、HKD→CNY 折算。
3. 渲染端新增 `PortfolioView`，复用现有样式与布局约定。
4. 调整 `AddPositionCalculator` 与 `OneClickDiagnosis` 接收 `position` / `selectedAccount` 上下文。
5. 把 `bundle.ts` 的版本号升到 2，导出导入双路径兼容。
6. 引入 Vitest 单元测试覆盖账户/持仓汇总、币种折算、备份兼容与诊断 bundle。

回滚：保留旧 schema 与旧版本备份读取；通过 `feature flag: portfolioPositions` 关闭新视图，回到以自选为主的界面。

## Open Questions

- 第一版是否需要“组合基准（沪深 300/恒生/标普 500）”？当前未列入需求，建议下一轮单独评估。
- 多账户是否需要支持“分组 / 标签”？当前只要求按账户切换，建议作为后续增量。
- 导入旧版本备份时，是否允许一次性把旧 watchlist 转成新账户下的持仓？建议默认不迁移，并在导入 UI 中提供显式选项。
```

## openspec/changes/portfolio-positions/tasks.md

- Source: openspec/changes/portfolio-positions/tasks.md
- Lines: 1-32
- SHA256: ddaf1d352c015c901f1650142c6d9e02cb6b0f1f0a0429e5e9e4a104eafbeb05

```md
## 1. 数据模型与迁移

- [ ] 1.1 在 `electron/main.js` 启动迁移脚本中新增 `accounts` / `positions` 两张表及对应索引。
- [ ] 1.2 暴露 IPC：`account:list / add / update / remove`、`position:list / add / update / remove`。
- [ ] 1.3 渲染端 `src/types.ts` 新增 `Account` / `Position` 类型并在 preload 中暴露。
- [ ] 1.4 在 `tools/verify-portfolio-schema.mjs` 中加入 schema 校验断言。

## 2. 行情与折算

- [ ] 2.1 在 `MarketData` 中新增 `fx` 数据类型，配置 USD→CNY、HKD→CNY 两条 Vendor。
- [ ] 2.2 渲染端通过 `data-source:fx` 或专用 IPC 获取最新汇率，并加入 TTL 复用。
- [ ] 2.3 组合页对每笔持仓显示原币种数字与折算结果，汇率不可用时显示“折算暂停”。

## 3. 组合视图与汇总

- [ ] 3.1 在 `src/views/PortfolioView.tsx` 中实现账户切换、持仓列表、组合汇总。
- [ ] 3.2 接入 `AddPositionCalculator`：持仓行新增“测算”按钮并预填当前成本与数量。
- [ ] 3.3 接入 `OneClickDiagnosis`：组合页对持仓触发诊断时携带账户与持仓上下文。
- [ ] 3.4 引入集中度计算（最大持仓占比、前 5 持仓占比）。

## 4. 备份兼容

- [ ] 4.1 在 `src/bundle.ts` 中把 `version` 字段升到 2，并在 schema 中加入 `accounts` / `positions`。
- [ ] 4.2 导出路径写入新版字段；导入路径先识别 `version` 再分发到对应迁移分支。
- [ ] 4.3 `SettingsBackupView` 在导入旧版时展示升级提示并保持原数据。
- [ ] 4.4 在 `tools/verify-bundle.mjs` 中补充 v1 → v2 兼容与字段缺失拒绝用例。

## 5. 验证与归档

- [ ] 5.1 在 `tools/verify-portfolio.mjs` 中加入账户汇总、币种折算、行情不可用状态与备份兼容性断言。
- [ ] 5.2 运行 `comet guard portfolio-positions open --apply` 推进阶段。
- [ ] 5.3 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/portfolio-positions/verification.md`。
- [ ] 5.4 勾选本任务清单后归档。
```

## openspec/changes/portfolio-positions/specs/portfolio-positions/spec.md

- Source: openspec/changes/portfolio-positions/specs/portfolio-positions/spec.md
- Lines: 1-147
- SHA256: 2b03f36fe4a60bc21ab9a72b4961490c975cb4ea72f27fb8f8006274a2f70c6b

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 多账户与持仓持久化
The system SHALL 持久化账户与持仓信息；同一账户可包含多笔持仓，同一股票允许出现在不同账户中。

#### Scenario: 创建账户
- **WHEN** 用户在组合页新增账户并提供名称和币种
- **THEN** 系统在 `accounts` 表插入记录并返回账户 ID

#### Scenario: 添加持仓
- **WHEN** 用户在账户下新增一笔持仓并填写股票代码、数量、成本与建仓日
- **THEN** 系统在 `positions` 表插入记录并在组合页立即可见

#### Scenario: 同一股票出现在多个账户
- **WHEN** 用户在两个不同账户下分别添加同一只股票
- **THEN** 系统以 `(account_id, code)` 区分两笔持仓且不冲突

### Requirement: 多币种折算
The system SHALL 在组合汇总时把港股、美股持仓按当时汇率折算到 CNY，并显示原币种数字与折算结果。

#### Scenario: 港股折算
- **WHEN** 用户添加港股持仓且 HKD→CNY 汇率可用
- **THEN** 组合页显示 HKD 原值与 CNY 折算值

#### Scenario: 汇率不可用
- **WHEN** 汇率 Vendor 返回错误
- **THEN** 组合页明确显示“折算暂停”，仍保留原币种数字，不展示虚假折算结果

### Requirement: 组合盈亏与集中度
The system SHALL 按账户和按组合展示当日盈亏、累计浮盈亏以及集中度（最大持仓占比与前五持仓占比）。

#### Scenario: 当日盈亏计算
- **WHEN** 用户查看组合且所有持仓行情可用
- **THEN** 当日盈亏 = sum((currentPrice - prevClose) * quantity) / 100

#### Scenario: 累计浮盈亏
- **WHEN** 用户查看组合
- **THEN** 累计浮盈亏 = sum((currentPrice - cost) * quantity)

#### Scenario: 集中度可见
- **WHEN** 用户查看组合汇总
- **THEN** 页面显示最大单一持仓占比与前 5 持仓占比

### Requirement: 行情不可用时的明确状态
The system SHALL 当某一持仓行情不可用时保留成本与数量，并将当日盈亏与累计浮盈亏字段标记为“行情暂不可用”，而不是显示错误数字。

#### Scenario: 单持仓行情不可用
- **WHEN** 某一持仓对应的报价 Vendor 返回 `error.kind: "all-failed"`
- **THEN** 该持仓行的当日盈亏与累计浮盈亏显示“行情暂不可用”文字

#### Scenario: 汇总行受影响
- **WHEN** 组合中任意持仓行情不可用
- **THEN** 组合汇总的当日盈亏与累计浮盈亏同样显示“行情暂不可用”

### Requirement: 加仓计算接入持仓上下文
The system SHALL 允许用户在组合页选中一笔持仓并打开加仓计算器，传入当前数量、当前成本与股票代码。

#### Scenario: 由持仓打开加仓计算
- **WHEN** 用户在持仓行点击“测算”
- **THEN** 加仓计算器打开并自动填入当前数量、当前成本与股票代码

#### Scenario: 计算结果只读
- **WHEN** 用户在加仓计算器中点击确认或取消
- **THEN** 系统不得修改持仓记录，行为与既有只读约束一致

### Requirement: 一键诊断携带持仓上下文
The system SHALL 在一键诊断 bundle 中携带当前选中账户与持仓组合；未选中账户时允许从自选页手动选择。

#### Scenario: 在组合页触发诊断
- **WHEN** 用户在组合页对持仓点击“一键诊断”
- **THEN** bundle 中 `position` 字段包含账户 ID、代码、数量、成本与建仓日

#### Scenario: 自选页无持仓诊断
- **WHEN** 用户在自选页对未持仓股票点击“一键诊断”
- **THEN** bundle 中 `position` 字段保持为 `null`，且不阻断诊断

### Requirement: 备份包升级到版本 2
The system SHALL 把 `bundle.version` 从 1 升级到 2，并在导出与导入中处理 `accounts` / `positions` 字段。

#### Scenario: 导出新版备份

```

Full source: openspec/changes/portfolio-positions/specs/portfolio-positions/spec.md
