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