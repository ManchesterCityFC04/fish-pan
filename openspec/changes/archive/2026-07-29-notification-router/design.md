## Context

fish-pan 现在的告警通知只走 Windows 原生 Notification，渠道单一且无远程兜底。PanWatch 通过 `NotifierManager` + 多渠道 Adapter 实现统一路由，并支持静默时段、重试退避和去重 TTL，但同时存在宽松 CORS 等不适合本地工具的做法。本 change 借鉴其“事件 + Adapter + Router”架构，落地到 fish-pan 的 Electron 主进程侧；不引入云端转发、不实现反向指令。

## Goals / Non-Goals

**Goals:**

- 把通知发送抽象为 `NotificationRouter`，按事件调度多个渠道 Adapter。
- 第一版支持 Windows 原生通知、Bark、Telegram Bot、通用 Webhook；其他渠道后续单独评估。
- 支持静默时段、按渠道独立重试退避、失败上限与暂停。
- 备份默认不导出任何渠道 Token / Webhook URL。
- 告警历史携带每个渠道独立发送状态，便于用户识别失败原因。

**Non-Goals:**

- 不实现钉钉 / 企微 / 飞书 / Server酱 / PushPlus / Discord / Pushover / Apprise 等其他渠道。
- 不做云端中转或账号体系。
- 不通过通知事件反向控制应用、不实现 Bot 命令交互。
- 不重写告警评估逻辑，发送路径只替换通知出口。

## Decisions

- **路由模型**：`NotificationRouter` 监听告警事件，对每个事件按用户配置的 `enabledChannels` 并行派发；渠道 Adapter 决定发送方式。
- **Adapter 接口**：`ChannelAdapter = { id, kind, send(event, config): Promise<ChannelResult> }`；`ChannelResult` 至少包含 `status: 'success' | 'failed' | 'skipped'` 与 `message`。
- **静默时段**：用户在设置中维护 `quietHours: { start: 'HH:mm', end: 'HH:mm', behavior: 'log-only' | 'defer' }`；跨午夜区间支持。
- **退避策略**：每个渠道维护 `failureCount` 与 `nextRetryAt`；失败一次后指数退避（30s / 60s / 120s / 300s），超过 `maxFailures`（默认 5）后暂停 30 分钟。
- **敏感字段保护**：渠道配置字段（如 `botToken` / `webhookUrl`）在备份导出时被 `redactChannelConfig` 替换为 `<redacted>`；导入时强制要求用户重新填写。
- **历史结构**：扩展 `AlertEvent.notificationStatus` 为对象 `{ overall, perChannel[] }`；旧枚举值映射为 `overall`。
- **发送语义**：保留原“通知发送失败时仍记录历史”行为；新结构按渠道区分成功与失败。

## Risks / Trade-offs

- [外部渠道限流与封禁] → 退避机制 + 失败上限，避免高频轰炸；Telegram 渠道默认建议低频触发。
- [Bot Token 误提交到错误渠道] → 渠道 Adapter 在发送前对目标做协议嗅探（URL 前缀 / Host）；不匹配则立即失败并提示配置错误。
- [静默时段跨午夜出错] → 使用本地时间解析；解析失败则按非静默时段处理，并提示配置异常。
- [历史结构变更] → `notificationStatus` 字段兼容旧值；新字段以可空形式加入。
- [WebHook 安全边界] → 通用 Webhook 默认不发送可识别用户身份的元数据；支持自定义 Headers 时要求用户显式勾选“包含敏感字段”。

## Migration Plan

1. 新增 `electron/notifications/` 目录，包含 `Router`、`ChannelRegistry`、各渠道 Adapter 和 `ChannelConfig` 存储。
2. 主进程内把 `app.emit('alert-trigger', ...)` 的处理器改为 `NotificationRouter.dispatch`。
3. 在 SQL 持久层加入 `channels` 表与 `notification_status_per_channel` 字段。
4. 设置页新增“通知渠道”标签；按渠道展示最近发送状态与“测试”按钮。
5. `bundle.ts` 升级以识别 `channels` 字段并按 `includeSecrets` 控制导出内容。
6. 编写 `tools/verify-notifications.mjs`，覆盖静默时段、退避、并发失败和重投。

回滚：通过 `feature flag: notificationRouter` 控制新旧路径；关闭 Router 时回退到旧的 Windows 原生通知单通道。

## Open Questions

- Telegram 渠道是否需要支持 inline 按钮或 Reply 接收？建议不做。
- 通用 Webhook 是否需要 TLS Pinning？建议不做，避免误伤。
- 静默时段是否支持按工作日/节假日区分？建议先按单一时间段实现，后续增量。