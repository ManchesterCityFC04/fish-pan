## Why

fish-pan 当前告警通知完全依赖 Windows 原生 Notification，离开办公电脑或关机后用户无从感知。PanWatch 拥有丰富的多渠道通知层（Telegram / Bark / 钉钉 / 企微 / 飞书等），但其实现涉及宽松的 CORS、依赖 Apprise 转发等不适合本地桌面工具的做法。fish-pan 需要在不照搬 PanWatch 全部渠道的前提下，把通知抽象为路由层并提供少量稳定渠道，配合静默时段与本地敏感配置保护。

## What Changes

- 引入 `NotificationRouter` 主入口，按告警事件调度已启用渠道；事件携带 stock / rule / observed / signature / observedAt 等结构。
- 第一版支持的渠道：Windows 原生通知、Bark、Telegram Bot 与通用 Webhook；其他渠道（钉钉 / 企微 / 飞书等）不在本批次。
- 渠道 Adapter 独立实现，每个渠道记录成功 / 失败状态、错误原因、最近一次延迟，并写入通知历史。
- 静默时段按本地时间窗配置：时段内告警事件可以选择“仅记录历史”或“延后发送”，行为在设置中切换。
- 渠道失败按指数退避（如 30s / 1m / 2m / 5m），超过上限后暂停该渠道一段时间并标记“已暂停”。
- 备份包默认不导出任何渠道 Token；导出设置时提供“包含敏感字段”复选框，未勾选时 Token / Webhook URL 显示为 `<redacted>`。
- **BREAKING**：`AlertEvent.notificationStatus` 字段扩展为对象 `{ overall, perChannel: { channelId, status, message?, sentAt? }[] }`，保留旧枚举为兼容值。
- 不实现云端转发、不实现通过通知指令反向控制应用、不构建 Bot 命令交互。
- 不引入新的 IPC 协议：告警事件仍由 `app.emit('alert-trigger', ...)` 现有通路触发；Router 改为监听该事件。

## Capabilities

### New Capabilities
- `notification-router`: 通知渠道抽象、调度、静默时段、指数退避、状态记录和敏感字段保护。

### Modified Capabilities
- `price-alerts`: 告警触发的发送路径改为通过 `NotificationRouter`；仍允许历史与通知解耦。
- `alert-history`: 历史记录携带每个渠道独立发送状态。

## Impact

- 主要影响 `electron/main.js`、`src/types.ts`、`src/alertEngine.ts` 与新增的 `electron/notifications/` 目录。
- 需要在设置页新增“通知渠道”标签，并暴露静默时段与失败上限配置。
- 备份包 `bundle.ts` 需识别新增 `channels` 字段，默认 redact。
- 单元测试新增 `tools/verify-notifications.mjs`，覆盖静默时段、并发渠道失败、退避、状态记录。
- 渲染端需要在告警历史详情中显示每个渠道发送状态与失败原因。