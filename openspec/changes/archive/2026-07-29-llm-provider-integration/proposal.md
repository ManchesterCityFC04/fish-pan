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