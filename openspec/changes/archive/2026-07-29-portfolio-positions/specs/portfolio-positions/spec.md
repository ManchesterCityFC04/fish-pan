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
- **WHEN** 用户导出备份
- **THEN** 备份文件 `version: 2` 且包含 `accounts` / `positions` 字段

#### Scenario: 导入旧版备份
- **WHEN** 用户导入 `version: 1` 备份
- **THEN** 系统识别旧版并提示升级路径，旧数据被保留

#### Scenario: 导入新版备份
- **WHEN** 用户导入 `version: 2` 备份
- **THEN** `accounts` 与 `positions` 数据被原子替换进数据库

### Requirement: 备份默认不包含敏感字段
The system MUST 在导出与导入路径中保持既有敏感字段策略：备份默认不包含 LLM 代理 URL 等敏感信息，必须由用户显式勾选才能包含。

#### Scenario: 默认导出不含代理 URL
- **WHEN** 用户导出备份未勾选“包含敏感字段”
- **THEN** 备份 JSON 中 `proxyUrl` 被替换为 `<redacted>` 占位

### Requirement: 账户与持仓导入安全
The system MUST 在导入新表数据前校验账户和持仓的必填字段（名称、币种、股票代码、数量、成本），缺失则拒绝整批导入并展示具体错误。

#### Scenario: 字段缺失拒绝导入
- **WHEN** 备份中的某条持仓缺少数量或成本
- **THEN** 整个导入被拒绝且 UI 显示哪条记录违反约束
