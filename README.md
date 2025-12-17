# OpenContext

[中文文档](README.zh-CN.md)

If you’ve never heard of OpenContext, you’re probably wondering:

- What problem does this solve?
- What do I get out of it?
- How do I start using it (without learning a bunch of internals)?

OpenContext solves a very practical pain: when you use an AI assistant to build things, **context gets lost** (across days, repos, chats). You end up re-explaining background, repeating decisions, and sometimes the assistant continues with the wrong assumptions.

OpenContext is a lightweight **personal context / knowledge store** for AI assistants (Agents) and Cursor users. You write down important project context as documents, and OpenContext provides **tool-friendly read/write interfaces** so an assistant can “load history first, then act; ship, then persist”.

It comes with:

- **`oc` CLI**: manage a global `contexts/` library (folders/docs, manifests, search)
- **`oc mcp` (for IDEs/agent platforms)**: an MCP server (stdio) so Cursor/Agents can call OpenContext as tools
- **Desktop app (optional)**: manage/search/edit contexts as a Tauri desktop app
- **`oc ui` (optional)**: a local Web UI to browse/edit contexts (no desktop install required)

What you get as a user:

- **Less repeating yourself**: assistants can load your background automatically
- **Fewer repeated mistakes**: persist “known pitfalls / best practices / acceptance criteria” as reusable docs
- **Traceability**: cite sources via stable links like `oc://doc/<stable_id>`
- **Cross-repo reuse**: contexts are global by default (`~/.opencontext/contexts`)

## Install

```bash
npm install -g opencontext
# or use npx without global install:
# npx opencontext <command>
```

## Beginner quick start (the shortest path)

One sentence: **run `oc init`, then use `/opencontext-*` inside Cursor**.

### 1) Initialize (once per machine)

```bash
oc init
```

Defaults:

- **Contexts**: `~/.opencontext/contexts`
- **Database**: `~/.opencontext/opencontext.db`

Optional overrides:

```bash
export OPENCONTEXT_CONTEXTS_ROOT="/path/to/contexts"
export OPENCONTEXT_DB_PATH="/path/to/opencontext.db"
```

### 2) Use it in Cursor (5 commands for beginners)

After `oc init`, your repo will have Cursor command templates under `.cursor/commands/opencontext-*.md`. In Cursor, use these slash commands:

- **`/opencontext-help`**: start here if you’re not sure which command to use
- **`/opencontext-context`**: load background/context before working (safe default)
- **`/opencontext-search`**: discover relevant existing docs (does **not** auto-build indexes)
- **`/opencontext-create`**: create a new doc/idea
- **`/opencontext-iterate`**: persist what you learned / decided (Iteration Log + citations)

> Important: these commands read/write your **global** OpenContext library (default `~/.opencontext/contexts`). They do **not** copy docs into your project repo.

### 3) If you don’t use Cursor: CLI or Desktop app

#### A) CLI

```bash
# Create folders and docs (docs must be created/registered via oc)
oc folder create project-a -d "My project"
oc doc create project-a design.md -d "Design doc"

# Generate a “manifest” (a file list for assistants to batch-read)
oc context manifest project-a
```

#### B) Desktop app (Tauri)

If you prefer a “notes app” experience, use the desktop app to browse/search/edit contexts.

- **Dev (this repo)**:

```bash
npm run tauri:dev
```

- **Build installers (this repo)**:

```bash
npm run tauri:build
```

> The desktop app uses the same `contexts/` and database. It’s the same UI packaged as a desktop app (Tauri) with desktop capabilities.

## Search (/opencontext-search) and “index cost”

Recommended read flow:

1. **Not sure what to read**: search first (`/opencontext-search` or `oc search ... --format json`)  
2. **Confirm candidates**: use a manifest and read files one by one (`/opencontext-context` or `oc context manifest ...`)  
3. **Cite sources**: prefer `oc://doc/<stable_id>` stable links

### Why search may be “not available”

Semantic search typically requires building an index (`oc index build`). Index building may incur external embedding cost and varies with corpus size, so the default policy is:

- **Do not let an AI assistant auto-run `oc index build`**
- If the index is missing, **degrade gracefully**: use manifest + doc descriptions / filenames first; you can choose to build the index manually if needed

## MCP (for VibeCoding IDEs / agent platforms)

OpenContext provides `oc mcp` as an MCP server (stdio).

- **Start manually**:

```bash
oc mcp
```

- **Cursor auto-config**: `oc init` generates `.cursor/mcp.json` and registers an MCP server named `opencontext` pointing to `oc mcp`.

> In most cases you don’t need to touch MCP config. Run `oc init`, then use `/opencontext-*` in Cursor.

## Web UI (experimental)

Run:

```bash
oc ui
```

The CLI serves the bundled UI assets and starts a local server (default `http://127.0.0.1:4321`) and opens your browser. It supports:

- Browsing folders/docs
- Previewing/editing/saving Markdown docs
- Sharing the same `contexts/` and database with the CLI

Options:

- `--port <port>`: set port
- `--host <host>`: set host
- `--no-open`: do not open the browser automatically

> The published npm package includes the `dist/ui` bundle. Only local UI development requires `npm run ui:dev` / `npm run ui:build`.

