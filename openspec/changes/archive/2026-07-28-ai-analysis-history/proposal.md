## Why

Fish Pan currently invokes the LLM only for the per-news interpretation flow. Each invocation is in-memory: when the user closes the modal, the analysis is gone. Users cannot compare two analyses, audit which model produced what, or share a useful summary later. Without a persistent record the AI capability is invisible in the long run — and the application cannot use prior analyses to enrich new ones.

## What Changes

- Persist every LLM-driven analysis (news interpretation and any future K-line summary) to a SQL.js table keyed by id, kind, code, model, createdAt, and the structured response.
- Expose list, get-by-id, and delete operations through the existing IPC surface.
- Add an in-app history view with stock filter, kind filter, and a detail view.
- Re-use the existing SQL.js persistence boundary; do not introduce a second store.

## Capabilities

### New Capabilities

- `ai-analysis-history`: Persistent record of every LLM analysis produced by the renderer, with list/get/delete and an in-app review surface.

## Impact

- Existing news modal in `src/App.tsx`.
- Existing `electron/main.js` SQL.js schema and IPC.
- Existing `src/types.ts` and `vite-env.d.ts` declarations.
- The current LLM config (`AIConfig` in `electron/main.js`) — no secret material is read into history records.
