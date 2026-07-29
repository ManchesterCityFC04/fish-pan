## Context

Today, the LLM is invoked in `src/App.tsx` from a single news-interpretation flow. The result is rendered into a modal, then dropped. We need to keep the same renderer-driven flow but persist a structured record so the user can browse, search, and revisit.

Constraints:

- Must reuse the existing SQL.js store and the same migration pattern used by `add-price-alerts`.
- Must not store the API key or any other secret in the history.
- Must survive app restart.
- Must be safe to read from the renderer via the existing IPC layer.

## Goals / Non-Goals

**Goals:**

- Persist each LLM invocation as a record with: id, kind (`news`/`kline`/`diagnosis`), code, model, createdAt, prompt template id, input summary, structured response, optional rating.
- Expose list/get/delete IPCs.
- Provide an in-app history view with kind filter, code filter, and a detail view.
- Use the same migration approach (`migrateAlerts`-style) for any schema additions.

**Non-Goals:**

- Editing or regenerating past analyses.
- Cross-device sync.
- AI-driven recommendations based on prior analyses.

## Decisions

### 1. Single `ai_analyses` table, kind discriminator

A single table with a `kind` field keeps the schema simple. The structured response is stored as JSON text.

### 2. Renderer owns the LLM call; main process owns persistence

The renderer continues to call the LLM directly through the existing `electronAPI` flow. After the response, it sends the structured payload to the new IPC for persistence. This keeps the main process free of provider-specific code.

### 3. List is reverse-chronological with cap

List view returns the latest N (default 200) records. The renderer applies filters client-side.

### 4. Detail view reuses the existing modal pattern

The detail view uses the same modal layout as the existing news interpretation, so users see a familiar UI.

## Risks / Trade-offs

- **[Storage growth]** Analyses can grow unbounded. → Add a retention cap (e.g., 500) and a manual clear-history action.
- **[Schema drift]** Future prompt templates may add fields. → Store the response as a JSON blob; the renderer is responsible for rendering the version it knows about.
- **[Privacy]** Analyses can contain user reactions. → Provide a clear-all action; document that the data is local-only.

## Migration Plan

1. Add `ai_analyses` table and migration in `electron/main.js`.
2. Add IPC methods `db-list-ai-analyses`, `db-get-ai-analysis`, `db-insert-ai-analysis`, `db-delete-ai-analysis`, `db-clear-ai-analyses`.
3. Extend `src/types.ts` and `src/electron.d.ts`.
4. Wire the existing news flow to call the new IPC after a successful response.
5. Add the in-app history view.

## Open Questions

- Should the history support export/import as part of `settings-backup`? Yes, but it ships in the backup change, not here.
