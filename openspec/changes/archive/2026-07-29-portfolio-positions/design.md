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