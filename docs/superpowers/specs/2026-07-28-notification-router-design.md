---
comet_change: notification-router
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-notification-router
status: final
---

# Design Doc: notification-router

> 本文档是对 OpenSpec `openspec/changes/notification-router/design.md` 的深度技术细化。OpenSpec delta spec 仍为 canonical spec。

## 1. 目标与范围

把现有 Windows 原生通知抽成统一路由；新增 Bark / Telegram Bot / 通用 Webhook 三个渠道；支持静默时段、指数退避、敏感字段保护；告警事件可由多渠道并发派发，单渠道失败不污染其他渠道。

**非目标**：不实现钉钉/企微/飞书/Server酱/PushPlus/Discord/Pushover/Apprise 等渠道；不通过通知事件反向控制应用；不引入云端转发。

## 2. 核心数据结构

```ts
type ChannelKind = 'windows' | 'bark' | 'telegram' | 'webhook';

interface ChannelConfig {
  id: string;
  kind: ChannelKind;
  enabled: boolean;
  // 各 kind 不同的配置字段：
  bark?: { endpoint: string; key: string; group?: string };
  telegram?: { botToken: string; chatId: string };
  webhook?: { url: string; headers?: Record<string, string> };
}

interface NotificationEvent {
  ruleId: number;
  code: string;
  title: string;
  body: string;
  observed: number;
  threshold: number;
  triggeredAt: number;
  signature: string;
  url?: string;
}

interface ChannelResult {
  channelId: string;
  status: 'success' | 'failed' | 'skipped' | 'paused';
  message?: string;
  sentAt?: number;
}
```

## 3. Router 主类

```ts
class NotificationRouter {
  registerChannel(config: ChannelConfig): void;
  dispatch(event: NotificationEvent): Promise<ChannelResult[]>;
  status(): { channels: ChannelHealth[] };
  testChannel(channelId: string, sample: NotificationEvent): Promise<ChannelResult>;
}
```

- 每渠道独立 `ChannelAdapter` 实现 `send(event, config)`。
- 单渠道失败 → 该渠道状态记 fail，其他渠道继续。
- 所有渠道失败 → 历史记录 `overall: 'failed'`，由 UI 展示。

## 4. 指数退避与暂停

每渠道维护 `failureCount` 与 `nextRetryAt`：
- 失败 1→2→3→4 次：推迟 30s / 60s / 120s / 300s。
- 失败 ≥ 5：暂停 30 分钟，状态 `paused`。
- 暂停期间不发也不重试；恢复后下一次 `dispatch` 才尝试。

## 5. 静默时段

- `quietHours: { start: 'HH:mm', end: 'HH:mm', behavior: 'log-only' | 'defer' }`。
- `log-only`：仅写历史，不调任何渠道。
- `defer`：暂存事件至时段结束后补发（受 cooldown 与退避影响）。
- 时段跨午夜：解析时分别比较 HH:mm。

## 6. 协议嗅探

- `bark.endpoint` 必须 https/http；不匹配即 `failed: 'invalid-config'`。
- `telegram.botToken` 与 `chatId` 必填；缺一即 `failed: 'invalid-config'`。
- `webhook.url` 必须 https/http；可加 headers 但不得含敏感字段名。

## 7. 备份导出与 redact

- `ChannelConfig.bark.endpoint` / `telegram.botToken` / `webhook.url` / `webhook.headers` 在备份导出时由 `redactChannelConfig` 替换为 `<redacted>`。
- IPC handler 不返回 Token 明文（仅返回 config 元数据如 `kind` / `enabled` / `lastError`）。

## 8. IPC 契约

主进程暴露：
- `notification:list-channels`：返回 channels 元数据（无 token）。
- `notification:test`：单渠道在线测试，5s 超时。
- `notification:status`：健康度摘要。

preload 暴露 `electronAPI.notification.{listChannels, test, status}`。

## 9. 测试

`tools/verify-notifications.mjs`：
- 单渠道失败不影响其他渠道。
- 失败次数达到上限后状态置 `paused`。
- 静默时段 `log-only`：仅写历史，不调 send。
- `between` 时段跨午夜正确识别。
- redact 不丢失非敏感字段。
- Telegram 缺 botToken 即 `failed: 'invalid-config'`。

## 10. 与其他 change 的关系

- 依赖 `advanced-alert-rules`（3/6）发出的 trigger 事件；通过 IPC handler 接收。
- 与 `price-alerts` / `alert-history` 兼容：现有 Windows 渠道仍是 fallback。

## 11. Feature Flag

`feature flag: notificationRouter` 默认关闭；关闭时只走 Windows 原生通道；新增渠道 disabled。

## 12. Spec Patch

无。现有 delta spec + Modified Specs（`price-alerts` / `alert-history`）覆盖所有验收场景。
