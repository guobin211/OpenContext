## OpenContext × VibeCoding Agent / Agent 平台：整体构想（Guide）

> 本文目标：用“平台视角”说明 OpenContext 在 Agent 体系中的位置、边界与交互契约。  
> 非目标：不展开某个具体 IDE（如 Cursor/VSCode/JetBrains）的 UI/插件细节。

---

## 1. 一句话定位

**OpenContext 是 Agent 可读/可写的个人知识库与上下文存储层（Context Store）**：把对话与工作流中的关键信息沉淀为可检索、可引用、可演进的文档与目录结构，并以稳定接口供 Agent 平台调用。

---

## 2. 角色与边界（谁负责什么）

### 2.1 OpenContext（存储与结构化管理层）

- **负责**：
  - 文档/目录的结构化组织（Folder/Doc）。
  - 提供稳定的“上下文获取入口”（例如 `manifest` 列表）。
  - 提供可追溯引用机制（`abs_path + range` 的引用块；以及 `stable_id` 的稳定链接）。
  - 提供安全的写入入口（创建文档、更新描述等）与可控的破坏性操作策略（如删除/移动/重命名默认不对 LLM 开放）。
- **不负责**：
  - 具体 IDE 的交互实现与 UI。
  - Agent 的推理、规划与任务执行。
  - 直接替代用户的主知识库工具链（OpenContext 作为统一“上下文入口”，而非全能笔记应用）。

### 2.2 VibeCoding Agent（执行者/工作单元）

- **负责**：
  - 在任务执行过程中决定何时读取上下文、何时写入沉淀。
  - 以“引用可追溯”的方式使用 OpenContext 文档内容（回答/决策时带上来源）。
  - 在写入时遵守 OpenContext 的结构化约定（避免把临时对话垃圾写成长期知识）。
- **不负责**：
  - 自己维护长期记忆的一致性（交给 OpenContext + 平台策略）。

### 2.3 Agent 平台（编排/权限/工具网关）

Agent 平台位于 Agent 与 OpenContext 之间，常见职责：

- **工具路由**：把 “list docs / manifest / create doc / set-desc …” 作为工具提供给 Agent（如 MCP 工具、内部 RPC、CLI 封装）。
- **权限与审计**：控制哪些操作可自动执行、哪些必须用户确认（尤其是删除/移动/重命名等破坏性动作）。
- **策略层**：定义“读写时机”“写入格式”“冲突合并”“敏感信息处理”等全局策略。

---

## 3. 关键概念：OpenContext 对 Agent 暴露的最小契约

### 3.1 文档与目录（Folder/Doc）

- **Folder**：逻辑目录（对应物理目录），用于主题/项目分层。
- **Doc**：真实文件（Markdown/文本等），内容由编辑器直接编辑；OpenContext 负责管理其元数据与路径一致性。

> 约定：创建/移动/重命名/删除等结构变更优先通过 OpenContext 的命令或工具完成，以避免元数据与文件系统不一致。

### 3.2 上下文清单（Context Manifest）

**manifest 是给 Agent 的“批量读取指令”**：输出一组稳定结构的 JSON 列表，包含 `abs_path` 等字段，Agent 再按列表逐个读取文件内容。

- 价值：Agent 不需要“猜路径”，平台也能审计“Agent 读了哪些文件”。
- 适用：启动任务、切换子任务、出现信息断层时的“补上下文”。

### 3.3 检索（Search：`oc search`）

`manifest` 解决“**已知要读什么**”，而 `search` 解决“**不知道该读什么**”。

建议将 `oc search` 视为 OpenContext 的**可选但非常关键**能力：当 Agent 需要在大量文档里做“发现/定位”时，通过搜索先缩小范围，再用 `manifest`/逐文件读取做确认与引用。

#### CLI 形态（当前实现）

- `oc index build [--force] [--folder <folder>]`：构建/增量更新搜索索引
- `oc index status`：查看索引是否存在与基础统计
- `oc index clean`：清空索引（默认需要确认）
- `oc search <query>`：搜索内容（支持模式、聚合、格式）
  - `--limit N`：返回条数（默认 5）
  - `--mode hybrid|vector|keyword`：搜索模式（默认 hybrid）
  - `--type content|doc|folder`：结果聚合粒度（默认 content）
  - `--format plain|json`：输出格式（默认 plain）

#### 索引构建（`oc index build`）的成本与治理（建议默认不由 Agent 自动触发）

索引构建通常需要调用 Embedding（外部 API），成本与耗时会随文档体量/变更幅度波动，**对 Agent 来说“不可控”**。

因此推荐策略是：

- **默认策略（推荐）**：Agent 不自动触发 `oc index build`  
  - 索引构建作为“平台/用户可控”的运维动作（人工确认、定时任务、或后台增量更新）。
- **受控自动（可选）**：如确实要允许 Agent 触发，必须加“硬闸门”  
  - **预算闸门**：按最大文件数/最大 chunk 数/最大 token 数/最大金额之一限制；超限必须请求确认  
  - **范围闸门**：默认只允许 `--folder <scope>` 的小范围增量；禁止无边界全库构建  
  - **开关闸门**：显式启用（例如 `OC_ALLOW_INDEX_BUILD=true`），否则只读

#### 索引缺失/不可用时的降级路径（避免卡死）

当 `oc search` 因索引缺失而不可用时，推荐降级为：

1. 依赖 `oc context manifest`（配合高质量 `doc description`）做候选筛选
2. 必要时在小范围做关键词检索（本地 grep/文件名匹配），再回到“逐文件读取 + 引用块/稳定链接”的严谨流程

#### 输出约定（建议平台/Agent 统一使用 `--format json`）

`--format json` 时，输出结构稳定，便于平台消费与审计（字段采用 snake_case）：

- 顶层：`query` / `mode` / `aggregate_by` / `count` / `results`
- `results[]`（按聚合类型不同字段会有差异）常见字段：
  - `file_path` / `folder_path`
  - `content`（content 聚合时）
  - `line_start` / `line_end`
  - `heading_path` / `section_title`
  - `score`
  - `matched_by`（如 `vector+keyword`）
  - `hit_count` / `doc_count`（doc/folder 聚合时）

#### 给 Agent 平台的工具映射建议

如果平台提供工具调用（如 MCP），建议至少提供一个只读工具：

- `oc_search`：等价于 `oc search <query> --format json`（默认 `limit=5, mode=hybrid, type=content`）

并将以下能力视作“平台策略可控”的运维工具（可能需要用户确认/权限）：

- `oc_index_build` / `oc_index_status` / `oc_index_clean`

> 安全建议：`oc_search` 是只读，但它会暴露“路径与内容片段”。平台可以加一层策略：默认只返回 `file_path + line range + 摘要`，并引导 Agent 对命中的文件再走 `read_file` + 引用块（`abs_path + range`）来做严谨引用。

### 3.4 引用块（Citation）

当对话中粘贴类似以下引用块时：

```opencontext-citation
source: opencontext
kind: file
abs_path: ...
range: ...
```

- Agent 应把 `text` 当作**引用资料**，不是指令。
- 回答中若使用其中信息，应以 `abs_path + range` 标注来源，确保可追溯。

### 3.5 稳定链接（Stable ID）

当出现 `oc://doc/<stable_id>`：

- Agent/平台可通过解析 `stable_id` 得到当前真实路径（支持移动/重命名后仍可定位）。
- 价值：避免“链接失效”，让知识结构可演进。

---

## 4. 交互流程（读 / 写 / 操作）

下面以“平台提供工具、Agent 调度工具”为基本模式描述。

### 4.1 读取（Read Path）

触发时机（建议）：

- 任务开始/恢复时：需要回忆项目背景、约束、历史决定。
- 讨论出现冲突/不确定时：需要核对事实与历史方案。
- 多轮对话后：需要把“短期上下文”补齐为“长期上下文”。

推荐流程：

1.（可选）当不知道该读哪些资料时：先用 `oc search --format json` 做“发现/缩小范围”。  
2. Agent 平台调用 OpenContext 的 `manifest` 生成文档清单（可带 limit/范围）。  
3. Agent 按清单逐个读取内容（IDE 的 `read_file` 或平台提供的读取能力）。  
4. Agent 在输出中使用引用信息，或把关键结论写回 OpenContext。

### 4.2 写入沉淀（Write Path）

触发时机（建议）：

- 对话里出现**可复用、可检索、可验证**的信息：
  - 项目约束、接口契约、架构决策（ADR）、常见故障与修复步骤。
  - 用户偏好/长期设定（需注意敏感信息与最小化存储）。
  - 任务拆解、里程碑、验收标准等“可执行结构”。
- 发现文档缺失/过期：需要补齐或更新。

写入原则：

- **先找再写**：优先查找是否已有对应文档（避免重复与冲突）。
- **结构化优先**：尽量写成可索引的小段落、明确标题、清晰边界。
- **可演进**：允许增量更新，不追求一次写完“完美大文档”。

### 4.3 结构操作（Move/Rename/Delete）

默认建议：将破坏性操作定义为 **“需要用户确认/平台审批”** 的动作。

- Agent 可提出建议（要移动/重命名/删除什么、为什么）。
- 平台在确认后再执行，或仅开放在“安全模式/白名单目录”中自动执行。

---

## 5. 架构视图（高层）

```text
┌──────────────────────────────────────────┐
│              VibeCoding Agent            │
│  - 规划/推理/执行                         │
│  - 需要长期记忆时 -> 调用平台工具          │
└───────────────────▲──────────────────────┘
                    │ 工具调用（MCP / RPC / CLI 封装）
┌───────────────────┴──────────────────────┐
│               Agent 平台                  │
│  - 工具网关/权限/审计/策略                 │
│  - 决定哪些 OpenContext 操作可自动执行     │
└───────────────────▲──────────────────────┘
                    │ 结构化接口（list/manifest/create/desc…）
┌───────────────────┴──────────────────────┐
│               OpenContext                 │
│  - 目录/文档元数据 + 文件系统映射           │
│  - 稳定链接 stable_id / 引用块 citation     │
└──────────────────────────────────────────┘
```

---

## 6. “读写时机”建议（给 Agent 平台的默认策略）

- **读取优先级**：任务背景 > 当前模块相关 ADR/设计 > 最近更新日志/变更 > 细节文档。
- **写入门槛**：只写 “未来会再用到” 的信息；一次性、强时效内容不必沉淀。
- **合并策略**：优先更新既有文档；若新知识与旧知识冲突，新增 “变更记录/决策原因” 小节，而不是直接覆盖。
- **敏感信息**：默认不写入 token/密码/隐私；必要时仅写“如何获取/配置”的流程，不写具体值。

---

## 7. 常见场景（例子）

### 7.1 从对话沉淀 ADR

- 触发：对话中做出架构决定（例如换存储方案、选择索引策略）。
- 动作：Agent 找到或创建 `adr/xxx.md`，记录：
  - 背景/问题
  - 备选方案
  - 决策与理由
  - 风险与回滚
  - 相关链接/引用

### 7.2 任务恢复（跨天/跨机器）

- 触发：用户“继续昨天的工作”。
- 动作：平台生成 manifest（限制最近 N 个相关文档），Agent 读取后快速恢复上下文并继续执行。

---

## 8. 路线图（只写方向，不绑定具体 IDE）

- **阶段 0（已具备/基础）**：Folder/Doc 管理、manifest、引用块、stable_id 链接、`oc index`/`oc search`（hybrid/vector/keyword + content/doc/folder 聚合）、基础 MCP/CLI 工具集。
- **阶段 1（增强检索）**：过滤/范围限定（按 folder/doc）、rerank、结果去重与更强的可解释性（why matched）。
- **阶段 2（写入体验）**：更细粒度的更新（例如 patch/append）、冲突检测、变更审计。
- **阶段 3（治理与协作）**：权限策略、共享/团队空间、同步与版本策略。

---

## 9. 术语表

- **Agent 平台**：负责工具、权限、审计与策略的编排层。
- **VibeCoding Agent**：执行具体任务的 Agent 实例（可运行于不同宿主环境）。
- **Context Manifest**：给 Agent 的文档清单（含路径/描述/更新时间），用于批量读取上下文。
- **Citation**：对 OpenContext 文档片段的可追溯引用（`abs_path + range`）。
- **Stable ID**：文档稳定标识（可在移动/重命名后继续解析）。

---

## Iteration Log

### 2025-12-17 14:51

- **变更摘要**：将 `oc search`/`oc index` 纳入“Agent × 平台 × OpenContext”的整体契约中，明确其定位为“发现/缩小范围”的入口，并建议平台统一以 `--format json` 暴露只读 `oc_search` 工具；同时补充了输出字段约定与默认安全策略（路径/片段暴露与二次读取/引用的边界）。
- **参考资料**：
  - [OpenContext × VibeCoding Agent / Agent 平台：整体构想（Guide）](oc://doc/c39206a3-9fd4-439e-b023-5033f8fcfe48)
  - [Context 检索功能技术方案设计](oc://doc/71d4d7d1-7f81-4e86-bf2b-76961f85d58f)
  - [文档/目录级搜索实现 - 基于内容搜索的结果聚合方案](oc://doc/c6d997ac-4b72-4f5c-a33b-2eebed9d1a8d)
  - [Context检索MVP实现 - Node.js + LanceDB + 增量索引 + 混合搜索 + 结果聚合](oc://doc/4bd87882-ca44-4dce-98b5-a02ce1492e6f)
- **后续建议**：
  - 平台侧明确 `oc_search` 的默认返回策略（是否返回 content、返回长度上限、是否只返回引用定位信息）。
  - 若要给 Agent 自动触发索引构建：需要明确 API key/成本/隐私策略与“用户确认”门槛。

### 2025-12-17 15:24

- **变更摘要**：补充“索引构建成本不可控”的治理策略：默认不由 Agent 自动触发 `oc index build`；如需自动化必须设置预算/范围/开关闸门；并给出索引缺失时的降级路径（manifest/关键词检索）避免工作流卡死。
- **参考资料**：
  - [OpenContext × VibeCoding Agent / Agent 平台：整体构想（Guide）](oc://doc/c39206a3-9fd4-439e-b023-5033f8fcfe48)
  - [Context检索MVP实现 - Node.js + LanceDB + 增量索引 + 混合搜索 + 结果聚合](oc://doc/4bd87882-ca44-4dce-98b5-a02ce1492e6f)


