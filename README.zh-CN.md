# OpenContext

如果你第一次看到这个仓库，可能会有三个疑问：

- **这到底解决什么问题？**
- **对我有什么好处？**
- **我该怎么用？**

OpenContext 要解决的是：当你用 AI 助手做事时，**上下文会丢、历史决策会忘、跨天/跨仓库会断片**。你很容易重复解释背景、重复踩坑，甚至让 AI 在错误前提下继续执行。

OpenContext 是一个**面向 AI 助手（Agent）与 Cursor 用户**的“个人上下文/知识库”（Context Store）：把你日常做事过程中重要的背景、决策、规范、坑点沉淀成文档，并提供**可被工具调用**的读写入口，让 AI 助手能“先读历史再动手、做完再沉淀”。

它包含三类能力：

- **`oc` CLI**：初始化并管理你的全局 `contexts/` 文档库（创建目录/文档、生成清单、检索等）
- **`oc mcp`（给 IDE/Agent 平台用）**：启动 MCP Server（stdio），让 Cursor/Agent 通过工具调用读写 OpenContext
- **桌面版应用（可选）**：用桌面应用管理/搜索/编辑 contexts（基于 Tauri）
- **`oc ui`（可选）**：启动本地 Web UI 浏览/编辑文档（不装桌面版也能用）

你能获得的直接收益：

- **少解释**：AI 开始工作前先加载历史背景，不用你每次重复讲一遍
- **少踩坑**：把“已知坑/最佳实践/验收标准”沉淀为文档，后续自动复用
- **可追溯**：回答/决策可以带引用（稳定链接 `oc://doc/<stable_id>`），方便回溯
- **跨项目复用**：contexts 默认是全局的（`~/.opencontext/contexts`），切换仓库也能用同一套知识

## 安装

```bash
npm install -g opencontext
# 或者无需全局安装，直接用 npx：
# npx opencontext <command>
```

## 小白快速开始（推荐路径：先能用，再慢慢精进）

你只需要记住一句话：**先 `oc init`，然后在 Cursor 用 `/opencontext-*` 命令完成工作流**。

### 1) 初始化（只做一次 / 换机器再做一次）

```bash
oc init
```

默认会创建/使用：

- **文档库**：`~/.opencontext/contexts`
- **数据库**：`~/.opencontext/opencontext.db`

如需自定义位置，可设置环境变量（可选）：

```bash
export OPENCONTEXT_CONTEXTS_ROOT="/path/to/contexts"
export OPENCONTEXT_DB_PATH="/path/to/opencontext.db"
```

### 2) 在 Cursor 里怎么用（面向小白的 5 个命令）

`oc init` 会在当前项目生成 Cursor 命令模板：`.cursor/commands/opencontext-*.md`，你在 Cursor 里直接输入这些 slash command 即可：

- **`/opencontext-help`**：不知道用哪个就用它
- **`/opencontext-context`**：开始做事前先加载背景（安全路径）
- **`/opencontext-search`**：想找“以前写过什么”就用它（默认不自动建索引）
- **`/opencontext-create`**：要新建一篇文档/想法就用它
- **`/opencontext-iterate`**：做完把结果沉淀回 OpenContext（带 Iteration Log + 引用）

> 重要：这些命令读取/写入的都是全局 OpenContext（默认 `~/.opencontext/contexts`），**不会把文档复制到你的项目仓库里**。

### 3) 不用 Cursor 也能用（两种方式）

#### A. 命令行（CLI）

```bash
# 创建目录与文档（文档必须用 oc 创建/注册）
oc folder create project-a -d "某个项目"
oc doc create project-a design.md -d "设计文档"

# 生成“上下文清单”（给 AI 助手批量读取用）
oc context manifest project-a
```

#### B. 桌面版应用（Desktop App）

如果你更喜欢“像笔记软件一样”的使用方式，可以用桌面版应用来管理 contexts（浏览/搜索/编辑）。

- **开发/本地运行（本仓库）**：

```bash
npm run tauri:dev
```

- **构建桌面安装包（本仓库）**：

```bash
npm run tauri:build
```

> 桌面版使用的是同一套 `contexts/` 与数据库；本质上是把 UI 以桌面方式打包（Tauri）并增强了一些桌面能力。

## 搜索（/opencontext-search）与“索引成本”怎么理解？

OpenContext 的推荐读取路径是：

1. **不知道读什么**：先搜索（`/opencontext-search` 或 `oc search ... --format json`）缩小范围  
2. **确定候选**：再用 manifest 列出文件并逐个读取（`/opencontext-context` 或 `oc context manifest ...`）  
3. **回答/实现时记得引用**：优先使用 `oc://doc/<stable_id>`（稳定链接）

### 索引为何可能“不可用”？

语义搜索通常需要先构建索引（`oc index build`）。索引构建可能涉及 embedding 等外部成本，且随文档体量变化而波动，所以默认策略是：

- **不让 AI 助手自动触发 `oc index build`**
- 如果搜索提示索引缺失：就先降级走 **manifest + 文档描述/文件名筛选**，必要时你再手动决定要不要建索引

## MCP（给 VibeCoding IDE / Agent 平台用）

如果你的 IDE/平台支持 MCP（例如 Cursor），OpenContext 提供 `oc mcp` 作为 MCP server（stdio）。

- **手动启动**：

```bash
oc mcp
```

- **自动配置（Cursor）**：从当前版本开始，`oc init` 会在项目里生成 `.cursor/mcp.json`，自动注册名为 `opencontext` 的 MCP server（指向 `oc mcp`）。

> 你一般不需要自己写 MCP 配置；先跑 `oc init`，再在 Cursor 里用 `/opencontext-*` 命令即可。

## Web UI（实验功能）

运行：

```bash
oc ui
```

CLI 会直接使用已经打包好的 UI 资源，启动本地服务（默认 `http://127.0.0.1:4321`）并自动打开浏览器。界面支持：

- 浏览空间/文档列表；
- 预览、编辑并保存 Markdown 文档；
- 与 CLI 共用同一 `contexts/` 与数据库。

可用参数：

- `--port <port>`：自定义端口；
- `--host <host>`：自定义监听地址；
- `--no-open`：启动后不自动打开浏览器。

> 默认发布到 npm 的包已经包含 `dist/ui` 静态资源。仅当本地开发 UI 时，才需要手动运行 `npm run ui:dev` 或 `npm run ui:build`。


