## OpenContext + Cursor 使用指南（面向 Cursor 用户）

本文档面向「已经在本机安装 Cursor」且想直接使用 OpenContext CLI 的用户，介绍如何安装、初始化、以及在 Cursor 中集成 MCP server。

---

## 1. 安装 CLI

OpenContext 已作为 npm 包发布，你无需克隆源码，只需安装 CLI。

### 1.1 全局安装（推荐）

```bash
npm install -g opencontext
```

完成后即可直接使用 `oc` 命令。例如：

```bash
oc --help
```

### 1.2 临时使用（npx）

如果不想全局安装，可使用 `npx`：

```bash
npx opencontext <command>
```

下文出现的所有 `oc ...` 命令都可以替换为 `npx opencontext ...`。

---

## 2. 初始化上下文工作区

在任意目录执行：

```bash
oc init
```

默认情况下，OpenContext 会自动在你的家目录下创建 **全局上下文空间**：

- `~/.opencontext/contexts`：存放所有上下文文档；
- `~/.opencontext/opencontext.db`：存放目录与文档元数据。

你可以在任何地方多次运行 `oc init`，它都会指向同一套全局存储，方便在不同工程之间共享。

### 2.1 自定义存储路径（可选）

如果希望为某个项目创建独立空间，可以在运行命令前设置环境变量：

```bash
OPENCONTEXT_CONTEXTS_ROOT=$PWD/contexts \
OPENCONTEXT_DB_PATH=$PWD/opencontext.db \
oc init
```

后续的 `oc ...` / `oc mcp` 命令同样需要设置这些变量，以确保访问的是同一个自定义空间。

> 无论使用全局还是自定义空间，都请尽量通过 `oc` 命令管理 `contexts/` 内的内容，避免直接在文件系统里移动/删除导致数据库状态不一致。

---

## 3. 用 `oc` 管理上下文

以下示例默认使用 `~/.opencontext` 作为上下文根目录；如果你配置了自定义路径，请将示例中的路径替换成你的实际位置。

### 3.1 创建空间与文档

```bash
# 创建一个项目目录（contexts/project-a/）
oc folder create project-a -d "OpenContext 项目"

# 在该目录下创建文档
oc doc create project-a design.md -d "设计文档" --open
```

说明：

- `folder create` 会同时创建实际目录并记录到数据库；
- `doc create` 会生成文件、记录元数据，`--open` 会调用 `$EDITOR` 打开文件（Cursor 会自动打开该路径）。

### 3.2 查看与维护

```bash
# 列出某目录的文档
oc doc ls project-a

# 递归列出
oc doc ls project-a --recursive

# 更新文档描述
oc doc set-desc project-a/design.md "更新后的描述"

# 移动或重命名
oc doc mv project-a/design.md project-a/archive
oc doc rename project-a/archive/design.md design-v2.md
```

### 3.3 生成上下文 Manifest

```bash
oc context manifest project-a --limit 10
```

输出为 JSON 数组，每一项包含 `doc_name / rel_path / abs_path / description / updated_at`。即使暂时不用 MCP，你也可以凭借这些路径在 Cursor 中手动打开对应文件注入上下文。

---

## 4. 在 Cursor 中配置 MCP Server

OpenContext 自带 MCP server（stdio），可让 Cursor/Claude Desktop 直接调用上述 CLI 能力。

### 4.1 启动命令

在任意目录执行：

```bash
oc mcp        # 正常运行（前台阻塞）
oc mcp --test # 启动后立即退出，仅用于检测命令是否可执行
```

如果使用 npx，只需 `npx opencontext mcp`。若你采用自定义存储路径，请在运行命令前附带相同的 `OPENCONTEXT_CONTEXTS_ROOT` / `OPENCONTEXT_DB_PATH` 环境变量。

### 4.2 在 Cursor 中添加 MCP Server

1. 打开 Cursor 设置：`Cmd/Ctrl + ,` → **Model Context Protocol (MCP)**。
2. 点击 **Add Server**，填写：
   - **Name**：`OpenContext`
   - **Command**：`oc mcp`（若未全局安装则填 `npx opencontext mcp`）
   - **Working Directory**：任意即可（默认全局模式与当前目录无关，可设置为 `$HOME`）。如果你使用了自定义存储路径，请确保 MCP server 的工作目录/环境变量与之匹配。
   - **Environment（可选）**：仅当你使用自定义路径时需要设置 `OPENCONTEXT_CONTEXTS_ROOT`、`OPENCONTEXT_DB_PATH`。
3. 保存后，Cursor 会在需要时自动启动该命令，并暴露下列工具：
   - `oc_list_folders`
   - `oc_list_docs`
   - `oc_create_doc`
   - `oc_set_doc_desc`
   - `oc_manifest`

模型即可自行调用这些工具，拿到需要的文档路径，再通过 Cursor 内置的 `read_file` 获取内容。

---

## 5. 在任何工程中复用你的上下文

即使你正在另一个项目（例如 `~/code/MyApp`）中写代码，也可以照常使用 OpenContext：

1. **上下文内容仍集中保存在 `~/.opencontext/contexts/`（或你自定义的目录）**。
2. **Cursor 配置好的 MCP server 始终运行 `oc mcp`，读取同一套全局数据**。
3. 在 `MyApp` 的聊天窗口里让模型 “调用 OpenContext 查找 project-a 的文档”，它会通过 MCP 自动查询并读取文件，而不会触碰 `MyApp` 仓库的文件结构。

这样，OpenContext 成为一个全局共享的“上下文数据库”，供任意工程复用。

---

## 6. AGENTS 指南与命令模板（由 `oc init` 自动生成）

每次运行 `oc init` 时，OpenContext 会自动：

1. **更新全局模板**
   - `~/.opencontext/agents/AGENTS.md`：完整说明何时/如何调用 `oc folder`, `oc doc`, `oc context manifest`，以及如何使用 MCP 工具。
   - `~/.opencontext/commands/cursor/opencontext-manifest.md`：供 Cursor 引用的完整工作流脚本。
2. **在当前项目生成引用文件与命令**
   - 项目根 `AGENTS.md`：指向全局说明，并提示重点步骤。
   - 项目 `.cursor/opencontext-manifest.md`：简单流程说明，引用全局命令模板。
   - 项目 `.cursor/commands/` 下的命令文件：`opencontext-create.md` / `-iterate.md` / `-implement.md` / `-refer.md`，Cursor 将它们暴露为 `/opencontext-…` slash command。

因此，你只需在项目里运行一次 `oc init`，就能让 AI 助手（即便没有 MCP）获得使用 OpenContext 的标准指引。若以后需要刷新说明，再次执行 `oc init` 即可覆盖。

---

## 7. 常见问题（FAQ）

### 6.1 我需要克隆源码吗？

不需要。直接 `npm install -g opencontext` 或 `npx opencontext ...` 即可使用。只有在你想修改源码/二次开发时才需要克隆仓库。

### 6.2 可以只用 CLI，不用 MCP 吗？

当然可以。CLI 本身已经提供导入、查询、manifest 等全部能力；MCP 只是为了让模型自动调用，免去人工复制。

### 6.3 可以把 `contexts/` 放到别的地方吗？

可以。默认情况下所有内容写入 `~/.opencontext`。如果想放到其他路径，只需在运行命令前设置：

```bash
OPENCONTEXT_CONTEXTS_ROOT=/path/to/contexts \
OPENCONTEXT_DB_PATH=/path/to/opencontext.db \
oc init
```

后续的 `oc ...` / `oc mcp` 也要携带相同的环境变量，以便持续访问该自定义空间。

### 6.4 可以直接用 Finder/VS Code 改 `contexts/` 吗？

不建议。请用 `oc folder ...` / `oc doc ...` 完成增删改，确保数据库和实际文件保持一致。

---

## 8. 总结

- 通过 npm 安装 `opencontext`，即可获得跨项目共享的上下文 CLI + MCP server。
- 在任意目录运行 `oc init`，即可准备 `~/.opencontext/contexts` + `~/.opencontext/opencontext.db` 这一套全局工作区（或你自定义的路径）。
- 利用 `oc mcp` 让 Cursor/Claude 等客户端自动获取上下文，实现“随叫随到”的知识库。
