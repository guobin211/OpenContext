# OpenContext 实体与命令设计

本文档描述 MVP 阶段 OpenContext 的核心数据实体与命令行（CLI）接口设计，帮助快速落地「统一存储上下文」的基础能力。当前假设所有上下文文件都收拢在仓库根目录下的 `contexts/` 目录中，逻辑目录与物理目录一一对应（方案 A）。

---

## 1. 实体设计

### 1.1 Folder（原 FolderBase）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER (PK) | 自增主键 |
| `parent_id` | INTEGER | 父目录，`NULL` 表示位于 `contexts/` 根下 |
| `name` | TEXT | 目录名（也是物理目录名） |
| `description` | TEXT | 目录描述 |
| `rel_path` | TEXT | 相对 `contexts/` 的路径，例如 `project-a/design` |
| `abs_path` | TEXT | 绝对路径，便于快速在文件系统中定位 |
| `created_at` / `updated_at` | DATETIME | 时间戳 |

**约束与约定**

- `rel_path` 在全表唯一，保证逻辑目录与物理目录一一对应。
- 创建/重命名/删除目录必须通过 CLI，以免出现数据库记录与文件系统不一致。
- 将来若需要「一个目录多处引用」的高级功能，可以新增「虚拟 Folder」概念，但 MVP 不涉及。

### 1.2 Doc（原 DocBase）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER (PK) | 自增主键 |
| `folder_id` | INTEGER (FK) | 归属目录 |
| `name` | TEXT | 文件名（含扩展名，例如 `mvp.md`） |
| `rel_path` | TEXT | 相对 `contexts/` 的文件路径 |
| `abs_path` | TEXT | 绝对路径 |
| `description` | TEXT | 描述（用于 CLI/MCP 展示） |
| `created_at` / `updated_at` | DATETIME | 时间戳 |

**约束与约定**

- `rel_path` 唯一，映射到真实文件（`contexts/<folder>/...`）。  
- 文档内容的读取/编辑由 Cursor 或任意编辑器直接操作文件完成，OpenContext 不复制内容。  
- CLI 负责保证「移动/重命名/删除」时数据库与文件系统一致。

> 未来若要引入标签或其他语义标注，可额外增加表或在 `docs` 表中扩展字段，当前 MVP 不包含标签设计。

---

## 2. CLI 命令设计

CLI 主命令暂定为 `oc`（OpenContext）。所有命令默认在仓库根目录执行。

### 2.1 初始化 & 状态

| 命令 | 说明 | 示例 |
| --- | --- | --- |
| `oc init` | 初始化 OpenContext：创建 `contexts/`、初始化数据库、首次扫描已有目录/文件，并在当前项目+全局目录生成/刷新 `AGENTS.md` 与 `.cursor` 指令模板。 | `oc init` |

> 默认情况下，`oc init` 会在 `~/.opencontext/contexts` 与 `~/.opencontext/opencontext.db` 下准备全局空间。若需自定义位置，可在运行命令前设置 `OPENCONTEXT_CONTEXTS_ROOT` / `OPENCONTEXT_DB_PATH`（或 `OPENCONTEXT_ROOT`）。

### 2.2 目录（Folder）管理

| 命令 | 说明 | 关键参数 | 示例 |
| --- | --- | --- | --- |
| `oc folder ls [--all]` | 列出目录列表。`--all` 显示全树；默认仅一级。 | `--all` | `oc folder ls --all` |
| `oc folder create <path> [-d desc]` | 创建目录并入库。 | `desc`：描述 | `oc folder create project-a/design -d "设计方案"` |
| `oc folder rename <old_path> <new_name>` | 重命名目录（物理+DB）。 | `new_name` | `oc folder rename project-a/design design-v2` |
| `oc folder rm <path> [--force]` | 删除目录。默认非空不删，`--force` 递归删除并做逻辑删除。 | `--force` | `oc folder rm project-a/old --force` |

### 2.3 文档（Doc）管理

| 命令 | 说明 | 关键参数 | 示例 |
| --- | --- | --- | --- |
| `oc doc ls <folder_path> [--recursive]` | 列出目录下的文档。 | `--recursive` | `oc doc ls project-a --recursive` |
| `oc doc create <folder_path> <name> [-d desc] [--open]` | 创建新文档文件并入库，可选自动打开编辑器。 | `--open` 触发 `$EDITOR` | `oc doc create project-a design.md --open` |
| `oc doc mv <src_path> <dest_folder_path>` | 移动文档至另一目录（物理 + DB）。 | — | `oc doc mv project-a/tmp/idea.md project-a/design` |
| `oc doc rename <doc_path> <new_name>` | 重命名文档文件。 | — | `oc doc rename project-a/design/idea.md design-notes.md` |
| `oc doc rm <doc_path>` | 删除文档（当前直接删除文件，后续可扩展回收站机制）。 | — | `oc doc rm project-a/design/mvp-old.md` |

### 2.4 文档元数据

| 命令 | 说明 | 示例 |
| --- | --- | --- |
| `oc doc set-desc <doc_path> "<desc>"` | 设置/更新文档描述。 | `oc doc set-desc project-a/design/mvp.md "MVP 方案"` |

### 2.5 Agent 指定上下文命令

| 命令 | 说明 | 关键参数 | 输出 |
| --- | --- | --- | --- |
| `oc context manifest <folder_path> [--limit N]` | 生成固定 JSON 结构的「上下文清单」，供 Agent 一次性拿到需要读取的文件列表。 | `folder_path`：检索范围；`--limit`：限制数量。 | JSON 列表，包含 `doc_name / rel_path / abs_path / description / updated_at`，Cursor/Agent 可据此逐个读取文件 |

**使用场景**

1. 人类先运行 `oc context manifest project-a --limit 5`，把输出传给 Agent。  
2. Agent 解析固定 JSON，知道应调用 Cursor 的 `read_file` 去读取哪些路径。  
3. 输出格式稳定后，可直接在 MCP 中暴露为 `generate_context_manifest` 工具，避免人工复制。

### 2.6 MCP Server 启动命令

| 命令 | 说明 | 示例 |
| --- | --- | --- |
| `oc mcp [--test]` | 以 stdio 方式启动 OpenContext MCP server，供 Cursor / Claude Desktop 等客户端连接；`--test` 会在启动成功后自动退出，便于脚本验证。 | `oc mcp` |

---
·
## 3. 后续扩展口子

1. **搜索 / 检索**：MVP 不提供，后续可在此文档新增 `oc search` 命令以及相应 MCP 工具。
2. **ContextItem 层**：未来引入 chunk 化存储时，本设计仍然有效，只需在 `Doc` 层之上加一层实体。
3. **GUI / MCP**：CLI 命令可映射到 HTTP/MCP 接口，命名保持一致可减少心智负担。
4. **同步与补救命令**：未来若允许用户在 CLI 之外直接操作文件，可再设计 `oc scan`/`oc register` 等自检工具。

---

## 4. 使用建议

1. **所有目录/文档的创建、移动、删除都通过 `oc` 命令完成**，避免 DB 与文件系统不同步。  
2. **内容编辑、全文搜索直接在 Cursor 中进行**，`oc` 仅负责结构化管理。  
3. **暂时仅通过 `oc` 命令修改 `contexts/` 内容**，若手动改动需自行核对数据库与文件系统是否一致（后续可补 `oc scan`）。  
4. **为关键文档补充描述**，方便后续引入 GUI/MCP 时快速筛选。

---

> 有了以上实体与命令设计，你可以立即开始实现 `oc init`、`oc folder create/ls`、`oc doc create/ls` 等基础命令，快速搭建一个可自用的上下文仓库 MVP。后续功能（搜索、ContextItem、GUI、MCP）都可以在此基础上平滑迭代。

---

## 5. MCP Server 设计（MVP）

### 5.1 设计目标

- 在支持 MCP 的客户端（例如 Cursor、Claude Desktop）中，以 **工具调度方式** 访问 OpenContext 存储。  
- 复用 CLI 同一套数据库/目录逻辑，保持单一真相。  
- MVP 仅提供「读取 + 基础写入」能力，删除等破坏性操作仍由 CLI 控制，降低误操作风险。

### 5.2 架构概览

```
┌──────────────────────────────────────────────┐
│                MCP Client (LLM)              │
│  · 调用工具（list_folders/list_docs/manifest 等） │
└──────────────────────────────────────────────┘
                 │ JSON-RPC / WebSocket
┌────────────────▼─────────────────────────────┐
│           OpenContext MCP Server             │
│  · 依赖 @modelcontextprotocol/server (Node)    │
│  · 共享 core 模块（folder/doc repository）       │
│  · 对请求做参数验证、路径归一化、安全检查           │
└────────────────▲─────────────────────────────┘
                 │ 同步访问
┌────────────────▼─────────────────────────────┐
│            OpenContext Core Layer            │
│  · SQLite（folders/docs）+ contexts/ 文件系统    │
│  · 复用 CLI 中的 repository / service 逻辑        │
└──────────────────────────────────────────────┘
```

建议在 `src/` 目录拆分：

- `src/core/db.ts`：封装 `openDatabase()`。
- `src/core/folders.ts`、`src/core/docs.ts`：导出与 CLI 相同的 CRUD 函数。
- `src/mcp/server.ts`：注册工具、启动 MCP server。

CLI (`bin/oc.js`) 与 MCP server 共享 core 层，避免重复实现。

### 5.3 工具列表（MVP）

| 工具 ID | 说明 | 入参 | 出参 |
| --- | --- | --- | --- |
| `oc_list_folders` | 列出所有目录（含描述、相对路径） | `{ scope?: "root" \| "all" }` | `[ { rel_path, description, created_at, updated_at } ]` |
| `oc_list_docs` | 获取某目录下的文档列表，可递归 | `{ folder_path: string, recursive?: boolean }` | `[ { rel_path, doc_name, description, updated_at } ]` |
| `oc_create_doc` | 在指定目录创建空文档（可附加描述） | `{ folder_path: string, doc_name: string, description?: string }` | `{ rel_path, abs_path }` |
| `oc_set_doc_desc` | 更新文档描述 | `{ doc_path: string, description: string }` | `{ success: true }` |
| `oc_manifest` | 生成上下文清单 | `{ folder_path: string, limit?: number }` | `[ { doc_name, rel_path, abs_path, description, updated_at } ]` |

> 破坏性操作（删除/移动/重命名）暂不对 LLM 暴露，后续视安全策略再开放。

### 5.4 工具 Schema 示例

以 `oc_manifest` 为例（JSON Schema）：

```json
{
  "name": "oc_manifest",
  "description": "列出某目录及其子目录下的文档清单，供 LLM 按路径读取上下文",
  "input_schema": {
    "type": "object",
    "properties": {
      "folder_path": {
        "type": "string",
        "description": "相对 contexts/ 的目录，如 \"project-a/design\""
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "description": "可选，限制返回文档数量"
      }
    },
    "required": ["folder_path"],
    "additionalProperties": false
  }
}
```

返回值直接复用 CLI manifest 输出的结构化 JSON，客户端无需转换。

### 5.5 启动与配置

- 入口文件：`src/mcp/server.ts`，示意：

```ts
import { Server } from "@modelcontextprotocol/server";
import { listFolders, listDocs, createDoc, setDocDescription, generateManifest } from "../core";

const server = new Server({
  name: "opencontext-mcp",
  version: "0.1.0"
});

server.tool("oc_list_folders", async ({ scope }) => listFolders(scope === "all"));
server.tool("oc_list_docs", async ({ folder_path, recursive }) => listDocs(folder_path, recursive));
server.tool("oc_create_doc", async ({ folder_path, doc_name, description }) => createDoc(folder_path, doc_name, description));
server.tool("oc_set_doc_desc", async ({ doc_path, description }) => setDocDescription(doc_path, description));
server.tool("oc_manifest", async ({ folder_path, limit }) => generateManifest(folder_path, limit));

server.start();
```

- **配置**：在 MCP 客户端中，将 `command` 指向 `node dist/mcp/server.js`（或 ts-node 开发模式），`env` 中可自定义 `CONTEXTS_ROOT`、`DB_PATH`（默认为仓库根下的 `contexts/` 与 `opencontext.db`）。
- **本仓库默认启动方式**：`npm run mcp`（实质是 `node src/mcp/server.js`，工作目录需为 `OpenContext` 根目录）；若已将 CLI 安装/链接为全局命令，则可直接运行 `oc mcp` 启动。Cursor / Claude Desktop 等客户端可以把 command 配置为上述任一形式并指定 `cwd=/Users/.../OpenContext`。
- **日志**：建议统一写入 `logs/mcp.log`，方便排查 LLM 调用问题。

### 5.6 安全与错误处理

1. **路径白名单**：所有 `folder_path`/`doc_path` 必须通过 `normalize` 后再拼到 `contexts/`，禁止 `../` 等越界访问。  
2. **并发控制**：`better-sqlite3` 为同步 API，单进程内天然串行；若后续引入异步操作，可在 core 层加锁。  
3. **错误暴露**：错误消息要友好、可读，例如「Folder 'foo' 不存在，请先通过 `oc folder create foo` 创建」。  
4. **权限策略**：MVP 中 MCP 仅允许创建/更新描述，不开放删除，避免 LLM 误删文件。  
5. **资源占用**：若 Manifest 目录过大，可在 server 端设置全局 `MAX_MANIFEST_ITEMS`（如 100），超出则提示人工缩小范围。

### 5.7 迭代路线

1. **阶段 1（当前）**：实现上述 5 个工具，确保与 CLI 共用逻辑。  
2. **阶段 2**：视需求增加 `oc_move_doc` / `oc_rename_doc` 等写操作，并在 server 内做权限/确认机制。  
3. **阶段 3**：当引入 ContextItem 层或搜索能力时，只需在 MCP 新增 `oc_search_context` 等工具，客户端无需修改。

