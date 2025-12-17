# Cursor Slash Command 模板（草稿）

以下模板用于在 `.cursor/commands/` 目录中生成可直接触发的 OpenContext 命令。每个文件都是一个 Markdown workflow，Cursor 会将其 `title` 作为命令名称（如 `/opencontext-create`），内容则指导 AI 如何调用 CLI/MCP。

> 说明：模板中的 `<...>` 占位符需在实际生成时替换为用户输入或动态信息。CLI/MCP 调用部分可根据实际环境自动选择（优先使用 MCP，若不可用则使用 CLI）。
>
> **全局存储约定**：所有命令都应直接操作全局上下文目录  
> `CONTEXTS_ROOT=${OPENCONTEXT_CONTEXTS_ROOT:-$HOME/.opencontext/contexts}` 下的 Markdown 文件。CLI 已负责创建/移动文件，模型不要在项目仓库内再复制一份。

---

## `/opencontext-create`

```markdown
---
title: /opencontext-create
description: Capture a new idea/problem statement into OpenContext
---

1. 推断所属空间与想法标题；若空间不明确则先询问用户指定（不要默认 `product`），并整理初始描述。
2. 根据标题生成 slug（kebab-case）；若生成失败，用 `idea-<YYYYMMDDHHmm>` 兜底。
3. 执行 `oc folder create <space>/ideas -d "<space> ideas"`，确保目标目录存在（可重复执行）。
4. 运行 `oc doc create <space>/ideas <slug>.md -d "<title>"` 创建 Markdown。
5. 以 `CONTEXTS_ROOT=${OPENCONTEXT_CONTEXTS_ROOT:-$HOME/.opencontext/contexts}` 解析最终文件，直接编辑 `${CONTEXTS_ROOT}/<space>/ideas/<slug>.md`（不要在仓库内复制）。
6. 写入该文件的基础模版：
   - 标题 / 问题陈述
   - 初始描述/背景
   - “Related Requests” 列表（允许为空或放占位符）
7. 回显文档路径，并提示下一步可使用 `/opencontext-iterate` 继续补充。
```

(注：该命令在代码生成层面已更名为 `/opencontext-create`，若你在旧项目里看到 `/opencontext-propose`，请重新运行 `oc init` 刷新命令文件。)

## `/opencontext-iterate`

```markdown
---
title: /opencontext-iterate
description: Iterate on an existing idea with additional context
---

1. 定位需要迭代的想法文档（若上下文模糊则先询问），使用 `CONTEXTS_ROOT=${OPENCONTEXT_CONTEXTS_ROOT:-$HOME/.opencontext/contexts}` 读取 `${CONTEXTS_ROOT}/<target_doc>` 了解现状。
2. 根据文档路径推断所属 space（例如 `<space>/ideas/foo.md` → `<space>`），执行 `oc context manifest <space> --limit 10` 并逐个 `read_file(abs_path)`。
3. 在原文档中维护“## Iteration Log”：若不存在则创建；新增条目需含 ISO 时间戳、主要洞察、引用的文档、下一步行动/风险。
   - **引用规则（不要跳过）**：在 `Iteration Log` 引用 OpenContext 文档时，默认只使用稳定链接 `oc://doc/<stable_id>`；仅在需要审计/精确到行证据时再补充 `abs_path + range`。如果 manifest 输出里已有 `stable_id`，不要只写文件路径。
4. 如有必要同步更新其它章节（例如 Overview、Requirements、Implementation Notes）。
5. 保存修改后运行 `oc doc set-desc <target_doc> "<latest summary>"`，并回显引用清单与最终文档路径。
```

## `/opencontext-implement`

```markdown
---
title: /opencontext-implement
description: Prepare and execute implementation tasks linked to an idea
---

1. 确认要实现的想法文档并加载内容，提取标题/目标。
2. 生成 slug（失败则用 `implementation-<YYYYMMDDHHmm>`），推断 space，执行 `oc folder create <space>/tasks -d "<space> tasks"`。
3. 设定任务文档路径 `<space>/tasks/<slug>-implementation.md`，运行 `oc doc create <space>/tasks <slug>-implementation.md -d "Implementation plan for <title>"`（已存在则直接加载），并仅编辑 `${CONTEXTS_ROOT}/<space>/tasks/<slug>-implementation.md`。
4. 在该文档中写入：标题/范围简介、指向原想法文档的链接、Goals/Non-goals、依赖/参考（引用 manifest）、Checklist（负责人/截止时间）。
   - **引用规则（建议强制）**：凡是来自 manifest 的 OpenContext 文档引用，默认只使用稳定链接 `oc://doc/<stable_id>`；仅在需要审计/精确到行证据时再补充 `abs_path`/`range`。
5. 更新原想法文档的 “Implementation” 段落，概述计划并链回任务文档，同时提醒执行中可多次调用 `/opencontext-iterate`。
6. 回显任务文档与想法文档路径，并点出未完成的 checklist 项。
```

## `/opencontext-refer`

```markdown
---
title: /opencontext-refer
description: Load OpenContext docs and ground your response in them
---

1. 询问或确认用户希望引用的文档/目录；若不明确则先澄清。
2. 设置 `CONTEXTS_ROOT=${OPENCONTEXT_CONTEXTS_ROOT:-$HOME/.opencontext/contexts}`，对每个指定文档执行 `read_file(${CONTEXTS_ROOT}/<doc_path>)`（不要在当前仓库复制内容）。
3. 若用户给的是目录/标签，先运行 `oc context manifest <folder> --limit 10`，挑选需要的 `abs_path` 再读取。
4. 以读取到的内容完成任务（分析、编码、规划等），引用证据时：
   - 若已知 `stable_id`（例如来自 manifest 或用户提供 `oc://doc/...`），默认只用 `oc://doc/<stable_id>`；
   - 仅在需要“精确到行”的证据时使用 `abs_path + range`（或 `<space>/...`）兜底。
5. 如果发现信息缺口或需要更新，说明差距并建议调用 `/opencontext-iterate`、`/opencontext-create` 等命令，而不是私下修改文档。
6. 在最终回答中附上 “References” 列表，列出本次读取的所有文档（默认用 `oc://doc/<stable_id>`；仅在需要审计时补充 `abs_path`）。
```

---

## 生成策略

- `oc init` 在检测到 `.cursor/` 目录时，自动写入上述 workflow 文件。
- 若用户启用 MCP，模板中可提示“也可以改用 \`oc_manifest\` 等工具，免去 CLI”。
- 未来若扩展到其他 IDE（Claude Code、Copilot 等），可基于同样的步骤生成对应命令描述。

