## 1. Persistence Layer

- [x] 1.1 Add `ai_analyses` table and a migration in `electron/main.js` consistent with `add-price-alerts` style
- [x] 1.2 Add indexes for `(code, created_at DESC)` and `(kind, created_at DESC)`
- [x] 1.3 Add IPC methods: `db-list-ai-analyses`, `db-get-ai-analysis`, `db-insert-ai-analysis`, `db-delete-ai-analysis`, `db-clear-ai-analyses`
- [x] 1.4 Add a retention cap (e.g., 500) and a clear-history action
- [x] 1.5 Verify no secret material is stored

## 2. Renderer Wiring

- [x] 2.1 Extend `src/types.ts` with `AIAnalysis`, `AIAnalysisKind`, and `AIAnalysisResponse`
- [x] 2.2 Wire the existing news interpretation flow to call the new IPC after a successful response
- [x] 2.3 Add a K-line summary IPC consumer (the K-line summary is delivered by `technical-indicators` in this change, but the LLM summary flow is consumed here)
- [x] 2.4 Add a renderer-side wrapper `recordAnalysis(analysis)` to handle persistence errors

## 3. UI

- [x] 3.1 Add `AIAnalysisHistoryView` with reverse-chronological list, kind filter, code filter
- [x] 3.2 Add a detail modal that reuses the existing analysis surface
- [x] 3.3 Add delete-single and clear-all actions with confirmation
- [x] 3.4 Add an empty state
- [x] 3.5 Match existing theme and compact layout

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit`
- [x] 4.2 Run `openspec validate ai-analysis-history --strict`
- [x] 4.3 Verify the existing news modal flow remains unchanged
- [x] 4.4 Verify persistence failures do not crash the renderer
- [x] 4.5 Verify restart preserves history
