# Brainstorm Summary

- Change: notification-router
- Date: 2026-07-28

## 关键决策

- 第一版 4 渠道：windows / bark / telegram / webhook；其他渠道不实现。
- 指数退避：30s / 60s / 120s / 300s；5 次失败暂停 30 分钟。
- 静默时段：log-only / defer；跨午夜支持。
- 协议嗅探：bark / telegram / webhook 必填字段缺失即 failed。
- 敏感字段保护：Token / Webhook URL 在备份导出 redact；IPC handler 不返回 Token。
- 测试：纯函数 + 离线断言。

## 下一步

- 创建 Design Doc → 推进 build → verify → archive。