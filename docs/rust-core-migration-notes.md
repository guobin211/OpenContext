# Rust Core Migration – Audit Notes

## Current JavaScript Core (`src/core/store.js`)

- **Environment roots**
  - `BASE_ROOT = $OPENCONTEXT_ROOT || ~/.opencontext`
  - `CONTEXTS_ROOT = $OPENCONTEXT_CONTEXTS_ROOT || $BASE_ROOT/contexts`
  - `DB_PATH = $OPENCONTEXT_DB_PATH || $BASE_ROOT/opencontext.db`
- **Schema bootstrap**
  - `folders(id, parent_id, name, rel_path, abs_path, description, created_at, updated_at)`
  - `docs(id, folder_id, name, rel_path, abs_path, description, created_at, updated_at)`
  - Enforces FK + cascade deletes; SQLite pragma `foreign_keys = ON`.
- **Filesystem interactions**
  - Uses `fs-extra` for recursive ensure/remove.
  - Every folder/doc mutation touches both DB and filesystem (rename, move, delete).
- **Public API surface**
  - Init utilities: `initEnvironment`, `ensureFolderRecord`.
  - Folder CRUD: `listFolders`, `createFolder`, `renameFolder`, `removeFolder`.
  - Doc CRUD: `listDocs`, `createDoc`, `moveDoc`, `renameDoc`, `removeDoc`, `setDocDescription`.
  - Content helpers: `getDocContent`, `saveDocContent`.
  - Aggregations: `generateManifest`.
  - Internal helpers: `normalizeFolderPath`, `normalizeDocPath`, `findFolder`, `findDoc`, etc.
  - All functions throw JS `Error` with human-readable messages (relied upon by CLI/UI).

## Consumers of `store.js`

### CLI (`bin/oc.js`)

- Imports `store` directly and exposes subcommands (`folder/*`, `doc/*`, `context manifest`, etc.).
- Some commands rely on side-effects (e.g., `doc create --open` uses returned `abs_path`).
- Error handling expects thrown `Error` with `.message`.

### API Server (`scripts/api-server.js` → `src/ui/server.js`)

- Express routes: `/api/folders`, `/api/docs`, `/api/docs/content`, `/api/docs/save`, `/api/docs/delete`.
- Each route calls corresponding `store` method; HTTP status `400/500` on thrown errors.
- Static UI served from `dist/ui`.

### MCP Server (`src/mcp/server.js`)

- Not fully audited yet, but per README it reuses `store` for tool handlers (`oc_list_folders`, etc.).

## Additional Notes

- Multiple entry points rely on the same environment variables; Rust core must match defaults for backwards compatibility.
- File paths returned to clients are absolute; existing UI/CLI expect `abs_path` to point to real files on disk.
- Transactions: only `renameFolder`/`removeFolder` wrap multi-step operations in `db.transaction`.
- Any Rust replacement must replicate the normalization logic (e.g., stripping `.`/`..`, rejecting root doc paths).

## Next Steps

1. Mirror the API surface in Rust (function names + return payloads) to minimize downstream changes.
2. Define shared error enum with message strings equivalent to current JS errors.
3. Plan bindings:
   - `napi-rs` module exporting functions above for CLI/MCP.
   - Direct Rust calls (or Tauri commands) for desktop UI.
4. Ensure SQLite file + directory layout remain identical for seamless upgrade.
