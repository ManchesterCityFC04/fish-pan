---
comet_change: llm-provider-integration
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-llm-provider-integration
status: final
---

# Design Doc: llm-provider-integration

> 本文档是对 OpenSpec `openspec/changes/llm-provider-integration/design.md` 的深度技术细化。

## 1. 目标与范围

把一键诊断从手工复制粘贴升级为真实 LLM 调用；支持 OpenAI 兼容协议（OpenAI、Azure、Ollama、自定义 endpoint）；支持请求取消、结构化响应校验、敏感字段保护；保留手工兜底。

**非目标**：不引入多 Agent / Function Calling；不做 token 计费；不订阅云端账户。

## 2. LlmProvider 抽象

```ts
interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  temperature: number;
  timeoutMs: number;
  systemPrompt?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResult {
  ok: boolean;
  text: string;
  error?: string;
}

interface LlmProvider {
  id: string;
  chat(messages: ChatMessage[], signal: AbortSignal): Promise<ChatResult>;
}
```

## 3. OpenAIProvider

- POST `{baseUrl}/v1/chat/completions`，Authorization: `Bearer {apiKey}`。
- 请求体 `{ model, messages, temperature, stream: false }`。
- 响应解析 `choices[0].message.content`；非 200 返回 `{ ok: false, error }`。

## 4. 配置存储

- `userData/llm-config.json`，字段：`baseUrl / model / apiKey / temperature / timeoutMs / systemPrompt`。
- IPC：`llm:save-config` / `llm:get-config`（返回时 apiKey redact 为 `<redacted>`） / `llm:test` / `llm:chat` / `llm:cancel`。
- preload 暴露 `electronAPI.llm.{saveConfig, getConfig, test, chat, cancel}`。

## 5. 取消与超时

- AbortController；`llm:cancel` 路由 abort signal。
- 超时（默认 20s）通过 `AbortSignal.timeout(timeoutMs)` 实现；超时返回 `{ ok: false, error: 'timeout' }`。

## 6. 备份兼容

- `bundle.ts` 把 `llmConfig` 视为敏感字段；默认 redact；`includeSecrets: true` 时保留 apiKey。
- 旧版本无 `llmConfig` 字段时不报错，导入路径忽略。

## 7. 测试

`tools/verify-llm-provider.mjs`：
- 协议嗅探：baseUrl 必须 https/http；否则 `invalid-config`。
- AbortController 取消：模拟取消后 `chat` 抛 abort 错误。
- 超时：timeoutMs=10ms 时返回 `error: 'timeout'`。
- redact：`getConfig` 不返回 apiKey 明文。

## 8. 一键诊断接线

`App.tsx` 在调用 `OneClickDiagnosis` 处按 `feature flag: llmProviderIntegration` 切换：
- 关闭 → 维持手工兜底（现状）。
- 开启 → 调用 `llm:chat` 替换 `parseBrief` 路径；失败回退到 `news: []` 并显示"配置失败"。

## 9. Feature Flag

`feature flag: llmProviderIntegration` 默认关闭；关闭时所有 LLM 调用入口隐藏；备份导出与设置页保留 llmConfig 字段（不显示）。

## 10. Spec Patch

无。现有 delta spec + Modified Specs（`one-click-diagnosis` / `ai-analysis-history`）覆盖所有验收场景。
