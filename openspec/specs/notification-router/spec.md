# notification-router Specification

## Purpose
TBD - created by archiving change notification-router. Update Purpose after archive.
## Requirements
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

#### Scenario: 旧枚举兼容
- **WHEN** 历史写入仍使用旧枚举 `sent | failed | no-notification`
- **THEN** 历史记录中 `overall` 字段保留该值

#### Scenario: 新结构可见
- **WHEN** 新结构写入历史
- **THEN** 历史详情显示每个渠道独立状态与失败原因

### Requirement: 渠道配置接口
The system SHALL 在设置页提供“通知渠道”标签，并允许用户新增、编辑、启用、禁用渠道和发送测试消息。

#### Scenario: 渠道启用与禁用
- **WHEN** 用户在设置页禁用 Bark 渠道
- **THEN** Router 不再调用该渠道，历史中也不再出现该渠道

#### Scenario: 发送测试消息
- **WHEN** 用户点击某渠道的“测试”按钮
- **THEN** 系统在 5 秒内返回该渠道的成功或失败结果并写入测试日志

### Requirement: 协议嗅探与配置错误识别
The system SHALL 在发送前对渠道目标做基本协议嗅探（如 URL 前缀 / Host），不匹配则立即失败。

#### Scenario: Telegram 配置错误
- **WHEN** Telegram 渠道的 Bot Token 与 chat_id 缺失或不匹配
- **THEN** 系统立即返回 `failed` 并写入“配置错误”原因

#### Scenario: Webhook 配置错误
- **WHEN** 通用 Webhook 的目标 URL 不是 http/https
- **THEN** 系统立即返回 `failed` 并写入“配置错误”原因

### Requirement: 通知事件结构稳定
The system SHALL 保证 Router 接收的事件至少包含 `eventId` / `code` / `ruleId` / `observedAt` / `signature` / `summary` 字段；任何 Adapter 不得自行扩展必填字段。

#### Scenario: 事件结构校验
- **WHEN** Router 接收到事件但缺少 `eventId`
- **THEN** 系统丢弃该事件并写入错误日志

