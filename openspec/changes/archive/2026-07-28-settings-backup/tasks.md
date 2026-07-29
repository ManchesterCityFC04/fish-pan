## 1. Bundle Format and Migration

- [x] 1.1 Define the bundle schema in a renderer-readable module: version, exportedAt, watchlist, alerts, alertHistory, llmConfig (no secret), indicators
- [x] 1.2 Implement `redactSecrets(bundle, includeSecrets)` that replaces known secret fields with `"<redacted>"` unless `includeSecrets` is true
- [x] 1.3 Implement `validateBundle(obj)` returning a structured error for missing or wrong-type fields
- [x] 1.4 Add a versioned migration strategy that fills missing fields with defaults
- [x] 1.5 Add unit tests in `tools/verify-bundle.mjs` covering redaction, validation, and version handling

## 2. Main-Process IPC

- [x] 2.1 Add `db-export-bundle` IPC that reads the SQL.js store and settings, assembles the bundle, and writes it through `dialog.showSaveDialog`
- [x] 2.2 Add `db-import-bundle` IPC that reads a file, validates it, and atomically writes to the SQL.js store
- [x] 2.3 Preserve existing alert trigger history unless the bundle is replacing it
- [x] 2.4 Return a structured success/error to the renderer
- [x] 2.5 Add preload bindings for the new methods

## 3. UI

- [x] 3.1 Add an "Import / Export" section to the existing settings surface
- [x] 3.2 Add an "include secrets" checkbox with a clear warning
- [x] 3.3 Add a diff summary modal that shows counts of stocks, alerts, and history to be added or replaced
- [x] 3.4 Add confirmation and a progress indicator for large imports
- [x] 3.5 Add empty-state and error messages for failed imports

## 4. Verification

- [x] 4.1 Run `node tools/verify-bundle.mjs`
- [x] 4.2 Run `npx tsc --noEmit`
- [x] 4.3 Run `openspec validate settings-backup --strict`
- [x] 4.4 Verify no secret material is written in default redaction mode
- [x] 4.5 Verify atomic write: kill the import mid-way and confirm no data is lost
