# Comet Design Handoff

- Change: notification-router
- Phase: design
- Mode: compact
- Context hash: 7911d99640cc9155a0d8c81bef93813aa3e5f57c656ad0d7f9363b23e2ed0429

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/notification-router/proposal.md

- Source: openspec/changes/notification-router/proposal.md
- Lines: 1-31
- SHA256: b0304fa0ae1ef4fe65f7dc6df83d6da1daf602d20480e87f1a742ab03c741b7a

```md
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
```

## openspec/changes/notification-router/design.md

- Source: openspec/changes/notification-router/design.md
- Lines: 1-54
- SHA256: aa429fffa7989790a02d3ba543be489e17b67456f783249bcaee668f0e2d88f3

```md
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
```

## openspec/changes/notification-router/tasks.md

- Source: openspec/changes/notification-router/tasks.md
- Lines: 1-30
- SHA256: f674779aee4a8403cf0e791da82e35f52038cf55ebda486b2dc6cbe0e839fdee

```md
## 1. 渠道 Adapter 与 Registry

- [ ] 1.1 在 `electron/notifications/` 下创建 `ChannelAdapter` 接口与 `ChannelRegistry`。
- [ ] 1.2 实现 Windows / Bark / Telegram / 通用 Webhook 四个 Adapter。
- [ ] 1.3 在 `electron/notifications/` 下创建 `ChannelConfig` 持久化层和默认 `redactChannelConfig`。

## 2. Router 主入口

- [ ] 2.1 在主进程侧实现 `NotificationRouter.dispatch(event)`，按 `enabledChannels` 并行派发。
- [ ] 2.2 在 Router 内实现静默时段判断与“仅记录历史 / 延后发送”两种行为。
- [ ] 2.3 在 Router 内实现按渠道独立的指数退避与暂停状态。
- [ ] 2.4 把现有 `app.emit('alert-trigger', ...)` 处理器切换为 `NotificationRouter.dispatch`。

## 3. 历史与持久化

- [ ] 3.1 扩展 `alert_events` 表结构加入 `notification_status_per_channel`（JSON）。
- [ ] 3.2 历史详情渲染时按渠道展示成功 / 失败 / 跳过状态与原因。
- [ ] 3.3 在 `bundle.ts` 中识别 `channels` 字段并按 `includeSecrets` 控制导出与导入。

## 4. 设置 UI

- [ ] 4.1 在设置页新增“通知渠道”标签与渠道列表编辑入口。
- [ ] 4.2 为每个渠道提供“测试”按钮，调用 Router 的 `testChannel(id)`。
- [ ] 4.3 静默时段配置表单：起始时间 / 结束时间 / 行为选择。

## 5. 验证与归档

- [ ] 5.1 新增 `tools/verify-notifications.mjs`，覆盖静默时段、退避、并发失败与重投。
- [ ] 5.2 通过 `feature flag: notificationRouter` 控制新旧路径；关闭时回退到 Windows 单渠道。
- [ ] 5.3 运行 `comet guard notification-router open --apply` 推进阶段。
- [ ] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/notification-router/verification.md`，勾选本任务清单后归档。
```

## openspec/changes/notification-router/specs/notification-router/spec.md

- Source: openspec/changes/notification-router/specs/notification-router/spec.md
- Lines: 1-136
- SHA256: 61b9b87fd316a90bd2295c19c799669ec18678d2478a2b19fea4b0adb8a4a0f2

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: 通知路由与多渠道调度
The system SHALL 提供 `NotificationRouter`，对每个告警事件并行调度所有已启用渠道，并独立记录每个渠道的发送结果。

#### Scenario: 多渠道同时发送
- **WHEN** 一条告警事件被派发且用户启用了 Windows 与 Bark 两个渠道
- **THEN** Router 并行调用两个渠道 Adapter 并将各自结果写入历史

#### Scenario: 单渠道失败不影响其他渠道
- **WHEN** Bark 渠道因网络失败抛出错误而 Windows 渠道成功
- **THEN** 历史记录显示 Bark 状态为 `failed` 且 Windows 为 `success`

### Requirement: 第一版支持的渠道
The system SHALL 第一版支持 Windows 原生通知、Bark、Telegram Bot 和通用 Webhook 四种渠道。

#### Scenario: Windows 渠道
- **WHEN** 启用 Windows 渠道且触发告警
- **THEN** 系统调用 `Notification` API 并写入历史

#### Scenario: Bark 渠道
- **WHEN** 启用 Bark 渠道且触发告警
- **THEN** 系统向 Bark Endpoint 发送 POST 请求并按响应码写入历史

#### Scenario: Telegram Bot 渠道
- **WHEN** 启用 Telegram 渠道且触发告警
- **THEN** 系统调用 `sendMessage` API 并写入历史

#### Scenario: 通用 Webhook 渠道
- **WHEN** 启用通用 Webhook 渠道且触发告警
- **THEN** 系统以 JSON 形式 POST 到目标 URL 并写入历史

### Requirement: 静默时段
The system SHALL 支持 `quietHours` 配置，在配置时段内可选择“仅记录历史”或“延后发送”。

#### Scenario: 仅记录历史
- **WHEN** 当前时间在静默时段内且 `behavior: 'log-only'`
- **THEN** 系统仅写入历史而不调用任何渠道 Adapter

#### Scenario: 延后发送
- **WHEN** 当前时间在静默时段内且 `behavior: 'defer'`
- **THEN** 系统将事件暂存并在时段结束后补发，状态标记为 `deferred-then-sent`

#### Scenario: 跨午夜时段
- **WHEN** `quietHours` 跨过午夜（如 22:00–07:00）
- **THEN** 系统正确判断当前时间是否处于该区间

### Requirement: 渠道失败重试与退避
The system SHALL 在渠道 Adapter 返回失败时按指数退避重试，并超过失败上限后暂停一段时间。

#### Scenario: 指数退避
- **WHEN** 同一渠道连续失败
- **THEN** 系统按 30s / 60s / 120s / 300s 的间隔推迟下次发送

#### Scenario: 暂停渠道
- **WHEN** 渠道失败次数达到 `maxFailures`
- **THEN** 系统将该渠道状态置为 `paused` 并在暂停窗口内不再发送

#### Scenario: 恢复发送
- **WHEN** 暂停窗口结束且渠道仍有事件
- **THEN** 系统恢复发送并将状态置为 `active`

### Requirement: 敏感字段保护
The system MUST 在备份导出时将渠道 Token / Webhook URL 替换为 `<redacted>`，除非用户在导出选项中显式勾选“包含敏感字段”。

#### Scenario: 默认导出不含 Token
- **WHEN** 用户导出备份未勾选“包含敏感字段”
- **THEN** 备份 JSON 中 `channels[*].token` 与 `webhookUrl` 均为 `<redacted>`

#### Scenario: 显式导出含 Token
- **WHEN** 用户导出备份勾选“包含敏感字段”
- **THEN** 备份 JSON 中保留渠道 Token 与 Webhook URL 明文

#### Scenario: 导入后强制重填
- **WHEN** 备份中渠道配置被 redact
- **THEN** 系统要求用户在导入完成后重新填写敏感字段才能启用该渠道

### Requirement: 历史结构升级
The system SHALL 把 `AlertEvent.notificationStatus` 扩展为对象结构 `{ overall, perChannel[] }`，其中 `overall` 保留旧枚举以兼容。


```

Full source: openspec/changes/notification-router/specs/notification-router/spec.md
