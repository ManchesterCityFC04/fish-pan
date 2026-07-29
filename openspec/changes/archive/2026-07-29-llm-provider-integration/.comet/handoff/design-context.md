# Comet Design Handoff

- Change: llm-provider-integration
- Phase: design
- Mode: compact
- Context hash: ed1daf96a5f276c5b726c8c641102743eb423f42138cf2f54433414c9bb1a26c

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/llm-provider-integration/proposal.md

- Source: openspec/changes/llm-provider-integration/proposal.md
- Lines: 1-30
- SHA256: 14adeb585c12b2af1d537c37ea3436535ef06ee3737e4992617d90d8d3039caf

```md
## Why

fish-pan 当前“一键诊断”只生成可粘贴 prompt，由用户手工复制到外部 LLM 后粘贴结果，无法作为闭环工具使用。PanWatch 拥有完整的 LLM 设置面板（base URL / model / key）与多 Provider 适配能力；fish-pan 需要在不复制其多 Agent / 多步推理框架的前提下，把 LLM 接入到诊断流程并支持 OpenAI 兼容协议和兜底的手工模式。

## What Changes

- 在设置页新增“AI 设置”标签，包含 baseUrl、model、apiKey、temperature、timeout、system prompt 字段。
- 引入 `LlmProvider` 抽象，统一支持 OpenAI 兼容协议（覆盖 OpenAI、Azure、Ollama、自定义 endpoint）。
- 在 Electron 主进程侧增加 IPC `llm:chat` 与 `llm:test`，处理鉴权、超时、取消和结构化校验。
- 把现有 `OneClickDiagnosis` 升级为可调用 Provider；响应按现有 brief schema 校验，校验失败时不写入历史并显示可理解错误。
- 保留现有“复制 prompt、手动粘贴结果”兜底流程；未配置 AI 时一键诊断自动回退到手动模式。
- 支持取消：用户取消时通过 AbortController 中断 LLM 请求，不保存半截结果。
- API Key 视为敏感字段：默认不写入备份导出，必须由用户显式勾选“包含敏感字段”。
- **BREAKING**：将当前 `OneClickDiagnosis` 中“当前未集成 LLM”提示文本替换为“有 AI 配置”和“无 AI 配置”两态文案。

## Capabilities

### New Capabilities
- `llm-provider-integration`: 接入 OpenAI 兼容 LLM，提供可取消、可校验、可降级的诊断调用与设置面板。

### Modified Capabilities
- `one-click-diagnosis`: 诊断调用走 Provider；保留手工兜底；UI 文案区分有 / 无 AI 配置。
- `ai-analysis-history`: 历史记录支持 `model` 与 `providerId` 字段，便于区分手工与自动分析。

## Impact

- 主要影响 `electron/main.js`、`src/views/OneClickDiagnosis.tsx`、`src/views/SettingsBackupView.tsx`、`src/diagnosis.ts`、`src/types.ts` 与新增的 `src/llm/` 目录。
- 新增 SQL 表或扩展现有 `llm-config.json` 配置存储；密钥按现有敏感字段策略处理。
- 引入 Vitest 单元测试覆盖 `LlmProvider` 的鉴权、超时、取消与重试分支。
- 渲染端需要新建设置页路由 `settings.ai` 与一键诊断 UI 文案更新。
- 文档 README 需要说明如何获取兼容 endpoint 与设置步骤，但不暴露任何默认 key。
```

## openspec/changes/llm-provider-integration/design.md

- Source: openspec/changes/llm-provider-integration/design.md
- Lines: 1-56
- SHA256: 916f4a8a0f299578289871e4bdbe690b8eb6c6d18eb4f6cb5c20e5337f984960

```md
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
```

## openspec/changes/llm-provider-integration/tasks.md

- Source: openspec/changes/llm-provider-integration/tasks.md
- Lines: 1-30
- SHA256: 9301a0729b6d939ca9559e9498e0f94c6468b6c848d7a3fb16527782a28ff7a7

```md
## 1. Provider 与配置

- [ ] 1.1 在 `src/llm/` 下创建 `LlmProvider` 接口与 `OpenAIProvider` 实现。
- [ ] 1.2 在 `src/llm/` 下创建 `LlmConfigStore`，按 `userData/llm-config.json` 持久化。
- [ ] 1.3 在保存路径加入 baseUrl 协议嗅探与字段校验。

## 2. 主进程 IPC

- [ ] 2.1 在主进程侧实现 IPC `llm:chat` / `llm:test` / `llm:cancel`，统一处理鉴权、超时、取消。
- [ ] 2.2 在 preload 暴露对应 API。
- [ ] 2.3 在 `bundle.ts` 中把 `llmConfig` 视为敏感字段，默认 redact。

## 3. 设置 UI

- [ ] 3.1 在设置页新增 `settings.ai` 路由与表单组件。
- [ ] 3.2 “测试连接”按钮调用 `llm:test` 并展示结果。
- [ ] 3.3 提供“清空 API Key”显式操作。

## 4. 一键诊断升级

- [ ] 4.1 在 `OneClickDiagnosis` 中接入 Provider，保留手工兜底；按配置状态切换 UI 文案。
- [ ] 4.2 通过 AbortController 实现取消并接入 IPC `llm:cancel`。
- [ ] 4.3 在 `ai_analyses` 表新增 `providerId` 与 `providerModel` 字段。
- [ ] 4.4 通过 `feature flag: llmProvider` 控制新旧路径；关闭时回退到手工模式。

## 5. 验证与归档

- [ ] 5.1 新增 `tools/verify-llm-provider.mjs`，覆盖鉴权、超时、取消、响应校验与敏感字段保护。
- [ ] 5.2 新增 `tools/verify-llm-config.mjs`，覆盖 baseUrl 协议嗅探、redact 与导入强制重填。
- [ ] 5.3 运行 `comet guard llm-provider-integration open --apply` 推进阶段。
- [ ] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/llm-provider-integration/verification.md`，勾选本任务清单后归档。
```

## openspec/changes/llm-provider-integration/specs/llm-provider-integration/spec.md

- Source: openspec/changes/llm-provider-integration/specs/llm-provider-integration/spec.md
- Lines: 1-112
- SHA256: 4955e7278a5e048432c84a14bf05cc19a9c28fcfdf8988eca2e6c39d349c7615

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: LLM Provider 抽象
The system SHALL 提供 `LlmProvider` 抽象，至少实现 OpenAI 兼容协议，覆盖 OpenAI、Azure、Ollama 与自定义 endpoint。

#### Scenario: 配置 OpenAI 兼容 Provider
- **WHEN** 用户在设置页填入 baseUrl、model、apiKey 与 timeout
- **THEN** 系统将该 Provider 保存到本地并允许一键诊断调用

#### Scenario: 自定义 endpoint 协议嗅探
- **WHEN** 用户填入 baseUrl 但协议不是 http/https
- **THEN** 系统在保存前返回配置错误并不持久化该配置

### Requirement: AI 设置面板
The system SHALL 在设置页提供 AI 设置标签，包含 baseUrl、model、apiKey、temperature、timeout 与可选 systemPrompt 字段。

#### Scenario: 保存 AI 设置
- **WHEN** 用户填写完整 AI 设置并点击保存
- **THEN** 系统持久化配置并提示“已保存”

#### Scenario: 测试连接
- **WHEN** 用户点击 AI 设置中的“测试连接”按钮
- **THEN** 系统在 5 秒内返回成功或失败原因并显示在 UI

### Requirement: 一键诊断调用 Provider
The system SHALL 让一键诊断优先调用 Provider；调用成功后渲染响应并写入 AI 分析历史；调用失败则提示错误并不写入历史。

#### Scenario: Provider 成功响应
- **WHEN** Provider 返回符合 brief schema 的响应
- **THEN** 系统在 UI 渲染并调用 `ai-analysis-history` 持久化

#### Scenario: 响应校验失败
- **WHEN** Provider 返回的响应无法被 `parseBrief` 解析
- **THEN** 系统提示“响应格式错误”并不写入历史

#### Scenario: 请求超时
- **WHEN** Provider 在 timeout 内未返回
- **THEN** 系统显示“请求超时”并允许重试

### Requirement: 可取消的 LLM 请求
The system SHALL 支持用户在一键诊断进行中取消请求；取消时不保存半截结果且不写入历史。

#### Scenario: 用户取消
- **WHEN** 用户在诊断运行时点击取消
- **THEN** Provider 通过 AbortController 收到取消信号且历史未被写入

### Requirement: 手工兜底流程
The system MUST 在未配置 AI 时回退到现有的“复制 prompt、手动粘贴结果”流程。

#### Scenario: 未配置 AI
- **WHEN** 一键诊断启动且 `LlmProvider` 配置为空
- **THEN** 系统进入手工模式，UI 显示“复制 prompt”和“粘贴结果”输入框

#### Scenario: AI 配置后切换
- **WHEN** 用户后续补齐 AI 设置
- **THEN** 一键诊断自动切换到 Provider 流程

### Requirement: 历史携带 Provider 元数据
The system SHALL 让 `ai_analyses` 表存储 `providerId` 与 `providerModel` 字段；手工粘贴记录以 `manual` 填充。

#### Scenario: 自动分析历史
- **WHEN** 一次自动诊断完成
- **THEN** 历史记录包含 Provider ID 与模型名称

#### Scenario: 手工分析历史
- **WHEN** 用户粘贴手工结果
- **THEN** 历史记录的 Provider ID 与模型均为 `manual`

### Requirement: API Key 保护
The system MUST 在备份导出时把 `llmConfig.apiKey` 替换为 `<redacted>`，除非用户显式勾选“包含敏感字段”。

#### Scenario: 默认导出不含 Key
- **WHEN** 用户导出备份未勾选“包含敏感字段”
- **THEN** 备份 JSON 中 `llmConfig.apiKey` 为 `<redacted>`

#### Scenario: 导入后强制重填
- **WHEN** 备份中的 AI Key 被 redact
- **THEN** 系统要求用户重新输入后才能保存 Provider 配置

### Requirement: 错误不泄漏敏感信息

```

Full source: openspec/changes/llm-provider-integration/specs/llm-provider-integration/spec.md
