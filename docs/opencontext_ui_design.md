# `oc ui` 功能设计草案

## 目标

为 OpenContext 提供一个本地 Web 界面，用于浏览、搜索、预览和编辑上下文文档，让用户在无需记忆 CLI 的情况下也能轻松管理知识库。`oc ui` 命令会启动一个本地服务（例如 `http://localhost:2121`），供浏览器访问。

## 核心功能

1. **空间 & 文档列表**
   - 左侧为空间（folder）树，支持展开/折叠。
   - 中间列展示选中空间内的文档列表，可按更新时间、描述等排序。
   - 支持搜索框（文本匹配文件名/描述），未来可接入 manifest/embedding。

2. **文档预览**
   - 右侧或弹窗显示文档内容（Markdown 渲染 + 原始 Markdown 切换）。
   - 提供基础的复制、下载链接。

3. **编辑与保存**
   - 在预览区域提供 “Edit” 模式，可切换到 Markdown 编辑器。
   - 保存时调用 `oc doc` 后端接口更新文件内容；必要时同步 `description`。
   - 支持新增文档（选择空间 + 文件名 + 初始内容）。

4. **安全与配置**
   - 默认仅监听 `localhost`，可通过 `oc ui --port 3000 --host 0.0.0.0` 自定义。
   - 支持读取 `OPENCONTEXT_CONTEXTS_ROOT`、`OPENCONTEXT_DB_PATH`，与 CLI 保持一致。

## 技术方案概述

| 模块 | 说明 |
| --- | --- |
| CLI 命令 `oc ui` | Node/Express 服务，复用 `src/core/store` 的 service 层提供 REST API，并默认在启动后自动打开浏览器。提供 `--port/--host/--no-open` 等选项。UI 资源在发布前构建好，运行时直接读取 `dist/ui`。 |
| 后端 API | - `GET /api/folders`、`GET /api/docs?folder=...`<br>- `GET /api/docs/content?path=...`<br>- `POST /api/docs/save`（接收路径与内容，必要时更新描述） |
| 前端 UI | React + Vite + Tailwind + HeroUI，布局包含空间树、文档列表、预览/编辑面板；后续可扩展搜索、过滤、主题切换等。 |
| 身份 & 权限 | MVP 仅本地使用，无登录；若需远程访问，可在配置中加简单的 token 或 basic auth。 |

## 可扩展点

- **多窗口联动**：允许在 UI 中复制 `oc context manifest` 的输出，或直接触发 slash command。
- **回收站 / 草稿**：UI 可提供 “Archived” 视图、富文本草稿等。
- **实时同步**：结合 `watchman` 等工具，在 UI 中监听文件变化，实现热更新提示。
- **MCP 集成提示**：UI 顶部显示 MCP server 状态，指导用户如何在 IDE 中启用 OpenContext。

## 下一步

1. 选择前端栈和 UI 组件库（例如 React + Vite + Tailwind）。
2. 发布前运行 `npm run ui:build` 生成 `dist/ui`，`oc ui` 直接读取该目录。开发阶段如需热更新，可使用 `npm run ui:dev`。
3. 编写 API 层，复用 `src/core/store.ts` 的读写逻辑，暴露 HTTP 接口。
4. 将启动信息输出到 CLI（端口、访问链接、热键等），并在 docs 中补充使用说明。

该命令完成后，用户可以在浏览器中完成大部分操作，再结合 CLI/MCP 实现“读写+自动化”全流程。

