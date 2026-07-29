## Context

fish-pan 当前“一键诊断”只生成 prompt 并提供复制按钮，需要用户手工在外部 LLM 中粘贴执行。PanWatch 的 LLM 适配 (`llm_adapter.py`) 和 Settings 面板覆盖 base URL、模型、API Key 与超时；本 change 借鉴其“Provider + 配置面板”思路，但仅采用 OpenAI 兼容协议，不引入 TradingAgents 或多步推理。

## Goals / Non-Goals

**Goals:**

- 提供 `LlmProvider` 抽象，支持 OpenAI 兼容协议，覆盖 OpenAI、Azure、Ollama 与自定义 endpoint。
- 设置页暴露 baseUrl、model、apiKey、temperature、timeout 与可选 systemPrompt。
- 主进程侧实现 `llm:chat` 与 `llm:test`，统一处理鉴权、超时、取消与响应校验。
- `OneClickDiagnosis` 调用 Provider；保留手工兜底；UI 文案区分有 / 无 AI 配置。
- API Key 按现有敏感字段策略处理，备份导出默认 redact。

**Non-Goals:**

- 不引入多 Agent 框架或多步推理；不引入 TradingAgents。
- 不做模型 A/B、不做 token 计费、不订阅云端服务。
- 不实现复杂工具调用 / Function Calling；只在第一版提供单轮 chat 模式。
- 不在没有用户授权的情况下发送请求；不暴露任何默认 key。

## Decisions

- **Provider 模型**：`LlmProvider = { id, kind: 'openai-compatible', baseUrl, model, apiKey?, temperature, timeoutMs, systemPrompt?, chat(messages, signal): Promise<ChatResult> }`；按兼容协议实现。
- **请求体**：使用 `messages: [{role, content}]`；system prompt 单独可配置；user prompt 来自 `renderDiagnosisPrompt`。
- **取消机制**：通过 `AbortController` 暴露 signal；主进程侧 `llm:chat` 在收到取消事件后调用 `providerAbort`。
- **响应校验**：使用现有 `parseBrief` 函数校验结构；不通过则返回 `{ status: 'invalid-response', error }` 并由 UI 提示。
- **超时**：默认 20 秒，可通过设置调整；超过 timeout 视为 `failed: timeout`。
- **存储**：`llm-config.json` 存储在 `userData`；API Key 单独存放，导出时通过 `redactSecrets` 替换为 `<redacted>`。
- **兜底语义**：未配置 AI 时一键诊断按钮文案变为“复制 prompt”，且保留“粘贴结果”输入框；与现有“复制到剪贴板”体验一致。
- **历史字段**：`ai_analyses` 表新增 `providerId` 与 `providerModel` 字段；手工粘贴时填 `manual` / `manual`。

## Risks / Trade-offs

- [LLM 响应延迟不可控] → 设置可调 timeout；UI 展示“等待中”状态并允许取消。
- [响应结构不稳定] → `parseBrief` 已有兜底解析；新增 `invalid-response` 错误码并写入日志。
- [API Key 误提交到错误 endpoint] → 设置保存前对 baseUrl 做协议嗅探（http/https），不匹配则拒绝保存。
- [OpenAI 兼容协议差异] → 在 Provider 内显式声明支持的字段；不支持字段（如 tools、stream）当前不暴露。
- [历史表 schema 变更] → 新增字段以可空方式加入，启动迁移安全。

## Migration Plan

1. 新增 `src/llm/` 目录，包含 `OpenAIProvider`、`LlmConfigStore` 和 `LlmService`。
2. 主进程侧加 IPC `llm:chat` / `llm:test` / `llm:cancel`。
3. 设置页新增 `settings.ai` 路由与表单组件。
4. `OneClickDiagnosis` 升级：调用 Provider，保留手工兜底；UI 文案按配置状态切换。
5. 扩展 `ai_analyses` 表加入 `providerId` 与 `providerModel`。
6. `bundle.ts` 把 `llmConfig` 视为敏感字段，默认 redact。
7. 引入 `tools/verify-llm-provider.mjs` 与 `tools/verify-llm-config.mjs`，覆盖鉴权、超时、取消、校验与备份兼容。

回滚：通过 `feature flag: llmProvider` 控制；关闭时一键诊断回退到当前手工模式。

## Open Questions

- 是否需要支持 stream 输出？建议第一版不做。
- 是否允许用户上传自己的 model manifest？建议仅暴露已知模型清单，不引入上传。
- 是否在系统中维护“推荐模型列表”？建议 README 给出主流 OpenAI 兼容服务，不在 UI 内嵌广告。