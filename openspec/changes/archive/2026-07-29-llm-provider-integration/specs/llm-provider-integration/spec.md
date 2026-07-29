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
The system MUST 在请求失败时仅返回错误类别与简短原因，不得把 API Key、完整 URL 或请求体写入错误提示或日志。

#### Scenario: 鉴权失败
- **WHEN** Provider 返回 401 / 403
- **THEN** 系统提示“鉴权失败”且不显示 API Key 或完整 URL
