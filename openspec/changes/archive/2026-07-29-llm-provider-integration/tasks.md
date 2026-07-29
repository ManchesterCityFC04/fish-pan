## 1. Provider 与配置

- [x] 1.1 在 `src/llm/` 下创建 `LlmProvider` 接口与 `OpenAIProvider` 实现。
- [x] 1.2 在 `src/llm/` 下创建 `LlmConfigStore`，按 `userData/llm-config.json` 持久化。
- [x] 1.3 在保存路径加入 baseUrl 协议嗅探与字段校验。

## 2. 主进程 IPC

- [x] 2.1 在主进程侧实现 IPC `llm:chat` / `llm:test` / `llm:cancel`，统一处理鉴权、超时、取消。
- [x] 2.2 在 preload 暴露对应 API。
- [x] 2.3 在 `bundle.ts` 中把 `llmConfig` 视为敏感字段，默认 redact。

## 3. 设置 UI

- [x] 3.1 在设置页新增 `settings.ai` 路由与表单组件。
- [x] 3.2 “测试连接”按钮调用 `llm:test` 并展示结果。
- [x] 3.3 提供“清空 API Key”显式操作。

## 4. 一键诊断升级

- [x] 4.1 在 `OneClickDiagnosis` 中接入 Provider，保留手工兜底；按配置状态切换 UI 文案。
- [x] 4.2 通过 AbortController 实现取消并接入 IPC `llm:cancel`。
- [x] 4.3 在 `ai_analyses` 表新增 `providerId` 与 `providerModel` 字段。
- [x] 4.4 通过 `feature flag: llmProvider` 控制新旧路径；关闭时回退到手工模式。

## 5. 验证与归档

- [x] 5.1 新增 `tools/verify-llm-provider.mjs`，覆盖鉴权、超时、取消、响应校验与敏感字段保护。
- [x] 5.2 新增 `tools/verify-llm-config.mjs`，覆盖 baseUrl 协议嗅探、redact 与导入强制重填。
- [x] 5.3 运行 `comet guard llm-provider-integration open --apply` 推进阶段。
- [x] 5.4 运行 `npm run build` 与新增断言脚本，记录到 `openspec/changes/llm-provider-integration/verification.md`，勾选本任务清单后归档。