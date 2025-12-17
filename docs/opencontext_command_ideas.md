# OpenContext Slash Command 构想

OpenContext 的定位是“共享且可被 AI/人类协作使用的上下文存储器”。理想状态下，最终用户无需了解底层 CLI，只要通过几个语义明确的 slash command（或等价 workflow）就能在“提出想法 → 迭代想法 → 实现想法 → 归档想法”各阶段调用 OpenContext。本文梳理第一版可行的命令集与它们关联的底层操作，便于后续在 Cursor/Claude 等 IDE 中实现。

---

## 设计原则

1. **语义驱动**：命令名称描述“我想做什么”，而不是“我想运行哪个 CLI”。
2. **最少记忆**：覆盖一个想法生命周期的 4 大节点，让用户/模型只需要记住这一套命令即可。
3. **自动化桥接**：每个命令内部自动调用 `oc folder/doc/context` 等 CLI（或 MCP 工具），完成目录检索、manifest 生成、文档更新等步骤，再把结果反馈给用户/模型。
4. **双向沉淀**：命令既能“读取上下文”，也能“把新的结论写回 OpenContext”，鼓励持续积累。

---

## 命令概览

| 阶段 | 命令（建议命名） | 目标 | 背后操作（示意） |
| --- | --- | --- | --- |
| 提出想法 | `/opencontext-create` | 捕捉新的想法/问题陈述，并在目标目录下生成草稿文档 | - 根据输入选择/创建 `contexts/<space>/ideas/`<br>- 生成 `idea-YYYYMMDD.md`（include 描述、关联需求）<br>- 输出文档路径供进一步编辑 |
| 迭代想法 | `/opencontext-iterate` | 在已有想法文档基础上追加笔记、资料、manifest | - 通过 `oc context manifest <space>` 检索相关内容<br>- 逐个 `read_file(abs_path)` 注入当前对话<br>- 支持将新的洞察写入原文档（e.g. 附加“迭代记录”段落） |
| 实现想法 | `/opencontext-implement` | 对接实际任务（代码/设计等），同时维持上下文引用 | - 生成/更新 `tasks` 文档（或 TODO 列表）<br>- 提示模型在实现过程中随时调用 `/opencontext-iterate` 获取更多上下文<br>- 完成后将产出链接写回想法文档 |

> 注：命名可根据具体工具进行微调（如 `/opencontext:propose`）。关键是保持四个阶段语义固定，便于用户和 AI 理解流程。

---

## 命令细节建议

### `/opencontext-create`
- **输入**：空间/主题（可选）、想法标题/描述。
- **逻辑**：
  1. 判断空间是否存在；如无则 `oc folder create <space>/ideas`。
  2. 在 `contexts/<space>/ideas/` 创建新 Markdown，填入标题、时间、初始描述。
  3. 返回文档路径与下一步建议（例如提醒用户使用 `/opencontext-iterate` 补充资料）。

### `/opencontext-iterate`
- **输入**：空间或具体文档路径、迭代方向提示。
- **逻辑**：
  1. 调用 `oc context manifest <space>`（可带 `--limit`，或根据提示关键词过滤）；
  2. 将 manifest 中的 `abs_path` 逐条 `read_file` 注入当前对话；
  3. 根据用户/AI 输出，将新的见解附加在原想法文档末尾（如“Iteration Log”章节），并更新描述。

### `/opencontext-implement`
- **输入**：目标文档/任务概述。
- **逻辑**：
  1. 在 `contexts/<space>/tasks/` 下生成任务列表或工作说明；
  2. 提醒模型实施过程中使用 `/opencontext-iterate` 获取补充材料；
  3. 完成后将结果链接/commit 记录写回原想法文档。

---

## 后续扩展思路

 - **命令参数化**：例如 `/opencontext-create <space> <title>`，直接在命令调用时填写必要信息。
- **命令组合**：允许模型在一次命令调用中同时生成 manifest + 写回迭代记录，减少来回步骤。
- **自定义模版**：支持用户配置每个阶段的 Markdown 模板内容（头部字段、日志结构等）。
- **多工具同步**：除 Cursor 外，还可以在 `.windsurf/workflows/`、`.github/prompts/` 等目录生成对应命令文件，使同一流程在不同 IDE 中复用。
- （可选）如果未来需要 Topic 合并能力，可以再引入单独的命令与视图（本版本不生成对应命令文件）。

---

## Slash Command 生成策略（初稿）

为了让用户/模型在 Cursor 等 IDE 中直接触发上述命令，建议 `oc init` 按以下规则生成命令模板（初版重点支持 Cursor）：

| 命令 | 目标文件 | 触发内容（草案） |
| --- | --- | --- |
| `/opencontext-create` | `.cursor/commands/opencontext-create.md` | 提示 AI：1) 询问用户所属空间与标题；2) 运行 `oc folder create`（必要时）；3) 创建 `ideas/<slug>.md`；4) 回显文档路径并开始填充。 |
| `/opencontext-iterate` | `.cursor/commands/opencontext-iterate.md` | 1) 让用户选择/输入目标文档；2) 调用 `oc context manifest` 获取相关资料；3) 将 manifest 中的 `abs_path` 逐条 `read_file`；4) 把新的见解附加回原文档。 |
| `/opencontext-implement` | `.cursor/commands/opencontext-implement.md` | 1) 基于想法文档生成 `tasks` 列表或实现计划；2) 提示在实现过程中可随时调用 `/opencontext-iterate`；3) 将完成结果写回想法文档。 |

每个 workflow 文件都引用全局 CLI（`oc ...`）并在顶部提醒若 MCP 已启用可改用 `oc_manifest` 等工具。未来可按同样模式为 Claude Code (`.claude/workflows/`)、Copilot (`.github/prompts/`) 等生成对应命令。

---

## Web UI 命令（`oc ui`）

- 启动方式：`oc ui [--port <n>] [--host <h>] [--no-open]`。
- 行为：直接读取预先构建好的 `dist/ui`（发布流程中由 `npm run ui:build` 生成），启动 Express 服务（REST API + React 静态资源），并默认打开浏览器。
- 功能：浏览空间与文档列表、预览/编辑 Markdown、保存修改；所有数据与 CLI 共享 `contexts/` 和 `opencontext.db`。
- 技术栈：React + Vite + Tailwind + HeroUI；后端复用 `src/core/store` 提供的 service 接口。

---

## 下一步实施建议

1. **模板细化**：为每个命令写出具体的 Markdown/JSON 模板（问答脚本、需要调用的 CLI 步骤、如何处理输出）。
2. **CLI 支持**：在 `oc init` 中根据用户选择的 IDE 自动写入上述模板；同时允许自定义（例如 `oc init --cursor --windsurf`）。
3. **状态看板**：实现 `oc list --status` 或 `/opencontext-status` 命令，方便挑选要迭代/合并/归档的文档。
4. **文档同步**：在 AGENTS 模板中明确列出这些 slash 命令及其触发条件，让模型在听到“有新想法/需要归档”等提示时主动调用。

---

## 下一步

1. 根据上述命令框架设计具体的命令模板（例如 Cursor slash command、Claude Code 工作流等）。
2. 在 `oc init` 中加入“选择要生成哪些命令文件”的交互，或默认生成通用模板。
3. 当底层 CLI/MCP 能力扩展（如关键词搜索、自动摘要、批量归档）时，更新对应命令的逻辑描述。

透过这组命令，OpenContext 将对外呈现为“想法生命周期助手”，而不是一组零散的 CLI，既方便用户记忆，也能指导 AI 模型在正确时机调用上下文存储。***

