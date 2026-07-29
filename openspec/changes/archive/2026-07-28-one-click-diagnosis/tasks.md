## 1. Input Bundler

- [x] 1.1 Implement `src/diagnosis.ts` with `buildDiagnosisBundle({quote, kline, news, position, alerts})`
- [x] 1.2 Cap news count to a small N (e.g., 5) and K-line bars to the most recent 30
- [x] 1.3 Implement `parseBrief(text)` returning a typed `Brief` object or a structured error
- [x] 1.4 Implement `Brief` type with `summary`, `sentiment`, `drivers[]`, `risks[]`, `observations[]`, `watchPoints[]`
- [x] 1.5 Add a Node-side self-test script under `tools/verify-diagnosis.mjs` covering parsing and validation

## 2. LLM Prompt

- [x] 2.1 Define the prompt template as a constant alongside the existing news template
- [x] 2.2 Make the prompt include a strict "do not invent numbers" instruction and a "cite the input section" instruction
- [x] 2.3 Limit the prompt token count to a configurable cap

## 3. UI

- [x] 3.1 Add `DiagnosisModal` with a "analyzing" state and explicit current step
- [x] 3.2 Add cancel action that uses an `AbortController`
- [x] 3.3 Render the brief in a structured layout: summary, sentiment, drivers, risks, observations, watch points
- [x] 3.4 Add a "一键诊断" button on the per-stock surface
- [x] 3.5 Show a recoverable error for malformed LLM responses
- [x] 3.6 Match existing theme and compact layout

## 4. Persistence

- [x] 4.1 After a successful LLM response, send the brief to the `ai-analysis-history` capability
- [x] 4.2 On persistence failure, log the error and continue showing the brief
- [x] 4.3 Verify the existing news flow remains unchanged

## 5. Verification

- [x] 5.1 Run `node tools/verify-diagnosis.mjs`
- [x] 5.2 Run `npx tsc --noEmit`
- [x] 5.3 Run `openspec validate one-click-diagnosis --strict`
- [x] 5.4 Verify cancel aborts the request before the response is rendered
