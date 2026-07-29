# Brainstorm Summary

- Change: llm-provider-integration
- Date: 2026-07-28

## 关键决策

- 仅实现 OpenAI 兼容 Provider；Azure / Ollama / 自定义 endpoint 走同一 Provider。
- 配置存于 userData/llm-config.json；IPC 不返回 apiKey 明文。
- AbortController 取消；20s 默认超时。
- 一键诊断接线：feature flag 切换，关闭维持手工兜底。
- 测试：纯函数 + mock fetch。

## 下一步

- 创建 Design Doc → build → verify → archive。