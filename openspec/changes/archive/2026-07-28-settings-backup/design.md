## Context

Fish Pan keeps user data in two places: electron-store-like JSON files for the LLM config and AI key, and SQL.js for watchlist, alerts, and trigger history. There is no way to back up or restore user data, so uninstalling or losing the userData directory loses all customization. We need a JSON export/import that is human-readable, secret-aware, and atomic.

Constraints:

- Must work without a remote backend.
- Must not embed the AI key, proxy credentials, or other secret material by default.
- Must be importable back into the same version and degrade gracefully on minor schema changes.
- Must not break the running renderer during export or import.

## Goals / Non-Goals

**Goals:**

- Export watchlist, alerts, alert history, settings (excluding secrets), and AI non-secret configuration into a single JSON file.
- Import the same JSON back, with confirmation, conflict policy, and dry-run validation.
- Preserve AI key and proxy credentials as opt-in only and re-import them only when explicitly authorized.
- Provide an in-app import/export surface consistent with the existing settings UI.

**Non-Goals:**

- Remote sync, cloud backup, or multi-device.
- Migration of historical positions (positions are stock by stock and not part of this change).
- Crypto or password protection of the bundle.

## Decisions

### 1. Bundle schema is versioned JSON

A top-level `version` field lets future imports detect mismatches. Unknown fields are ignored; missing optional fields use defaults.

### 2. Secrets are redacted by default

The LLM API key, proxy URL with embedded credentials, and any future secret-bearing field are emitted as `"<redacted>"`. The user must opt in via a checkbox to include real values.

### 3. Import is confirm-and-merge

The renderer shows a diff: counts of stocks, alerts, and events to be replaced or added. The user confirms before any mutation. Existing alert trigger history is preserved unless the user explicitly chooses to replace it.

### 4. Validation before write

The import path validates JSON shape and field types before touching the database. On failure, no state is mutated and the renderer shows the first error encountered.

### 5. IPC surface stays narrow

`db-export-bundle` and `db-import-bundle` are new main-process methods that read and write the SQL.js store plus a small settings file. The renderer never holds the raw database file path.

## Risks / Trade-offs

- **[Schema drift]** Future versions may add required fields. → Validate against a known shape; report a clear error rather than silently merging.
- **[Secret leakage]** Accidental inclusion of API keys. → Default redaction; show a “secrets included” warning when opt-in is on.
- **[Partial import]** Process killed mid-import. → Write to a temp file, validate, then swap; never mutate in place.
- **[Position data]** Positions live in localStorage and are not part of the bundle in this change. → Document this explicitly so users are not surprised.

## Migration Plan

1. Read the existing data, collect into an in-memory bundle.
2. Serialize to JSON with `version`, `exportedAt`, and explicit sections.
3. Save via Electron `dialog.showSaveDialog` and a chosen filename.
4. Reverse the process on import: read file, parse, validate, then write atomically.

## Open Questions

- Should positions be included in v1? The first version excludes them; they can be added once SQLite is unified.
- Should the export include alert `prevValue` state? Yes, to preserve the cross-run threshold baseline.
- Should the import silently re-enable disabled alerts? No; the imported `enabled` flag wins.
