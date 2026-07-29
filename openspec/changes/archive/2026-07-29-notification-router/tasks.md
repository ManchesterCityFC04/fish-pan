## 1. 渠道 Adapter 与 Registry

- [x] 1.1 在 `electron/notifications/` 下创建 `ChannelAdapter` 接口与 `ChannelRegistry`。
- [x] 1.2 实现 Windows / Bark / Telegram / 通用 Webhook 四个 Adapter。
- [x] 1.3 在 `electron/notifications/` 下创建 `ChannelConfig` 持久化层和默认 `redactChannelConfig`。

## 2. Router 主入口

- [x] 2.1 在主进程侧实现 `NotificationRouter.dispatch(event)`，按 `enabledChannels` 并行派发。
- [x] 2.2 在 Router 内实现静默时段判断与“仅记录历史 / 延后发送”两种行为。
- [x] 2.3 在 Router 内实现按渠道独立的指数退避与暂停状态。
- [x] 2.4 把现有 `app.emit('alert-trigger', ...)` 处理器切换为 `NotificationRouter.dispatch`。

## 3. 历史与持久化

- [x] 3.1 扩展 `alert_events` 表结构加入 `notification_status_per_channel`（JSON）。
- [x] 3.2 历史详情渲染时按渠道展示成功 / 失败 / 跳过状态与原因。
- [x] 3.3 在 `bundle.ts` 中识别 `channels` 字段并按 `includeSecrets` 控制导出与导入。

## 4. 设置 UI

- [x] 4.1 在设置页新增“通知渠道”标签与渠道列表编辑入口。
- [x] 4.2 为每个渠道提供“测试”按钮，调用 Router 的 `testChannel(id)`。
- [x] 4.3 静默时段配置表单：起始时间 / 结束时间 / 行为选择。

## 5. 验证与归档

- [x] 5.1 新增 `tools/verify-notifications.mjs`，覆盖静默时段、退避、并发失败与重投。
- [x] 5.2 通过 `feature flag: notificationRouter` 控制新旧路径；关闭时回退到 Windows 单渠道。
- [x] 5.3 运行 `comet guard notification-router open --apply` 推进阶段。
- [x] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/notification-router/verification.md`，勾选本任务清单后归档。