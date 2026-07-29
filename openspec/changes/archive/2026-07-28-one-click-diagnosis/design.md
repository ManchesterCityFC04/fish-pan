## Context

The current LLM call site in `src/App.tsx` is the news interpretation flow. To produce a useful one-click diagnosis, we need to assemble a richer input bundle, send it to the LLM, and render a structured brief. The same main-process LLM bridge used today can carry a different prompt template; the renderer owns the aggregation.

Constraints:

- No new provider integration; re-use the existing LLM config.
- The LLM output must be validated into a known structure before being shown.
- Cancellation must release the prompt and the renderer state.
- Output must be persisted via the `ai-analysis-history` capability.

## Goals / Non-Goals

**Goals:**

- Add a `一键诊断` button on the per-stock surface.
- Build an input bundle: current quote, latest K-line summary, recent news, current holding, active alert rules.
- Send a dedicated prompt and parse the response into a fixed brief shape.
- Show progress, support cancel, and persist the brief through `ai-analysis-history`.
- Reject malformed responses with a recoverable error.

**Non-Goals:**

- Multi-stock or market-wide diagnosis.
- Trading recommendations phrased as buy/sell signals.
- Cross-stock briefings or portfolio-level diagnosis.

## Decisions

### 1. Renderer-side aggregation

The renderer pulls from `quotes`, `kline`, `news`, `positions`, and `alerts`, and assembles the bundle. This keeps the main process free of feature-specific business logic.

### 2. Fixed brief schema

The brief is a typed object: `summary`, `sentiment`, `drivers[]`, `risks[]`, `observations[]`, `watchPoints[]`. The renderer validates this before rendering.

### 3. Cancellation via AbortController

Use a renderer-level `AbortController` and propagate cancellation to the modal. The existing main-process LLM bridge should expose a cancellation hook in a follow-up; for this change, cancellation is honored up to the response being received.

### 4. Persistence is best-effort

If the LLM succeeds but persistence fails, the user still sees the brief and the error is logged. The `ai-analysis-history` capability is not a precondition for the diagnosis UI.

## Risks / Trade-offs

- **[LLM cost]** Sending large bundles on every click can be expensive. → Cap news count to a small N (e.g., 5) and K-line bars to the most recent 30.
- **[Hallucination]** LLMs can fabricate. → Always cite the input sections (news titles, prices) inside the brief so the user can verify.
- **[Latency]** Long prompts can take 10+ seconds. → Show explicit progress and allow cancel.

## Migration Plan

1. Add the input bundler in `src/diagnosis.ts` (pure functions).
2. Add the LLM prompt template in the renderer (alongside the news template).
3. Add the modal UI with progress, cancel, and structured rendering.
4. Persist through `ai-analysis-history`.
5. Add a one-click entry point on the per-stock surface.

## Open Questions

- Should the brief be re-runnable from history? Out of scope for v1; the history view is read-only.
- Should the prompt be configurable by the user? Out of scope for v1.
