# Cursor Token 消耗分析与优化方向

> 目标：在 **不牺牲白皮书「升华」质量** 的前提下，将 **成稿 · 写稿（phase3b）** 的单份 Cursor 费用从「几十美元」量级显著压降。  
> 范围：主要分析 `cursor-sdk` Provider；Codex 套餐路径见 `docs/CODEX-INTEGRATION.md`。

## 1. 现状：钱主要花在哪

当前已完成的基础优化（`scripts/narrative/phase3b.js`）：

```javascript
await agent.send(prompt, {
  apiKey,
  model: { id: context.model || "composer-2.5" },
  local: { cwd: outputs/{code} },  // 单系统输出目录
});
```

Prompt 使用 `narrative-brief.md` + inline 压缩摘要，避免让 Agent 自行读取大文件：

| 文件 | 作用 | 体量风险 |
|------|------|----------|
| `narrative-brief.md` | 写作规则压缩包 | 小 |
| inline `evidence-summary` | 主输入，已裁剪模块/功能/截图字段 | **随页面数线性增长** |
| inline quality summary | 质检摘要 | 小 |
| `whitepaper.draft.md` | 机械底稿，默认不让 Agent 读取 | 大系统可达数百 KB |

### 1.1 高消耗机制（根因）

1. **Agent 多轮工具调用**  
   `Agent.prompt` 不是「一次问答」，而是带读文件、写文件、可能多轮自检的 **Agent 循环**。每一轮都会把已读内容再次带入上下文。

2. **工作区已收窄，但仍需防探索**  
   `cwd` 已默认指向 `outputs/{code}/`，避免扫 `scripts/`、`node_modules/` 和其他系统产物；后续仍应保持 prompt 明确禁止读取 `evidence.json`、截图二进制和无关文件。

3. **输入重复已初步压缩**  
   `whitepaper.draft.md` 默认不再作为 Agent 输入；仍需继续控制 `evidence-summary` 的函数数量、字段数量和截图数量，避免大系统 inline 输入过长。

4. **输出一次性过长**  
   财务中台级系统：§3 逐页功能 + §7 附录，Agent 一次生成 **上万字**，输出 token 本身就很贵。

5. **重跑放大**  
   - 节点 `maxRetries: 3`（已降为默认 1 次）  
   - 历史问题：审核驳回曾整份 `narrative` 重跑；现已映射到 `overview-flow`、`function-sections` 或具体模块分片  
   - H5「高级优化」若切 **GPT 5.5**，单价显著高于 Composer 2.5  

6. **与 Playwright 取证无关**  
   阶段 1–2 不消耗 Cursor token；**几乎 100% 在 phase3b**。

### 1.2 为何 adp 试点便宜、大系统贵

| 系统 | 页面规模 | 典型现象 |
|------|----------|----------|
| `adp`（试点） | 1 页 + 侧栏 | 一次 Agent 跑通，费用低 |
| `fin-center`（全量） | 数十～上百菜单页 | summary 巨大、输出长、重跑多 → 仍可能高成本 |

---

## 2. 优化原则

1. **能脚本就不 Agent**：结构、附录、字段清单已在 `draft` / `summary` 里，不要让 Agent 重新「发现」。
2. **能注入就不让 Agent 读盘**：把必要上下文 **inline 进 prompt**，限制工具读文件次数。
3. **能分段就不一次成稿**：§1/§4 要「升华」；§3 可模块分批；§7 尽量机械拼接。
4. **能局部改就不全文重跑**：驳回意见映射到章节，而非整份 `whitepaper.pending-review.md`。
5. **强模型只用在刀刃上**：Composer 2.5 写主体和驳回自动闭环；GPT 5.5 仅作人工高级优化，优先润色 §1/§4。

---

## 3. 优化方向（按优先级）

### P0 — 预期降本 50%～70%（建议先做）

#### 3.1 收窄 Agent 工作区（已完成基础版）

- `local.cwd` 已改为 **`outputs/{code}/` 单系统目录**，不要整个 repo。
- 在该目录放置 **最小规程包**（见 3.2），禁止 Agent 访问 `evidence.json`、截图二进制、仓库脚本。

#### 3.2 「规程压缩包」替代全量 Skill 阅读（已完成基础版）

新增 `outputs/{code}/narrative-brief.md`（由 `build-evidence-summary` 或 phase3b 前一步生成，约 2～3KB）：

- 仅含：§1/§2/§3/§4 写法要点（从 `narrative-guide.md` 抽取）
- 输出路径、禁止编造、写操作规则
- **不要求** Agent 再读 `SKILL.md` / 完整 `narrative-guide.md`

Prompt 改为：「只读 `narrative-brief.md` + 下方 inline 的 JSON，不要读其他文件。」

#### 3.3 Inline 输入，取消读 `whitepaper.draft.md`（已完成基础版）

- 将 `evidence-summary.json` **全文嵌入 prompt**（或 `--input-schema` 式单文件）。
- `whitepaper.draft.md` **不再作为 Agent 输入**；仅保留为人工对照与 mechanical 归档。
- `quality-report.json` 只嵌入 `failures` / `blockingIssues` / `counts` 摘要（约 20 行）。

> summary 已含 modules、functions、containers、screenshots；draft 的重复价值极低。

#### 3.4 分阶段写稿（已完成基础版：分片 prompt + 分片组装）

| 趟次 | 模型 | 产出 | 输入大小 |
|------|------|------|----------|
| **A** | composer-2.5 | §1 系统概览 + §2 模块 + §4 典型流程 + §5 角色 + §6 待确认 | 已生成 `phase3b-prompts/overview-flow-prompt.md` |
| **B** | composer-2.5 | §2 模块概览条目 + §3 核心功能（**按模块拆分**，每模块一次） | 已按模块生成 `phase3b-prompts/module-*-prompt.md` |

§7 附录：**脚本从 draft/summary 机械合并**，不经过 LLM。

大系统 §3 从「1 次 × 100 页」变为「5～10 次 × 10 页」，单次 context 小、总 token 通常 **显著低于** 一次塞满。

`cursor-sdk` 和独立 `run-phase3b.js` CLI 已支持 `--narrative-part`：未传时保持全量主 prompt；传 `overview-flow`、`function-sections` 或具体模块名时只发送对应分片 prompt，多个模块名可用 `,`、`，` 或 `、` 分隔；完成后用旧 `narrative-fragments.md` 保留未重写章节并重新组装待审稿。

---

### P1 — 再降 20%～30%

#### 3.5 机械底稿承担「骨架」，Agent 只做「升华层」（已完成基础版）

`run-phase3b.js` 会生成：

- `whitepaper.skeleton.md`：已有正确标题、章节骨架、模块/功能占位、附录占位。
- `phase3b-prompts/*.md`：按概览/模块拆分的成稿提示词。
- `narrative-fragments/*.md`：分片输出目录；存在分片时会自动组装成 `narrative-fragments.md` 和 `whitepaper.pending-review.md`。

#### 3.6 驳回局部重写（已完成基础版）

扩展 `run-review-decision.js`：

- 意见含「系统定位/流程」→ 只重跑 **趟次 A**
- 意见含「某模块功能描述」→ 只重跑 **该模块趟次 B**，替换该模块的 §2 概览条目和 §3 模块小节
- 默认 **不** 全文 `narrative` 重跑
- H5 驳回自动重跑会把 `overview-flow` / `function-sections` / 具体模块名传入 `run-whitepaper-pipeline.js --narrative-part ...`。
- H5 驳回自动重跑和人工 CLI 驳回重跑都应传 `--review-rerun`；普通全量写稿默认忽略旧 `review-decision.json`，防止历史审核意见污染新一轮生成。
- `--review-rerun` 会在写稿 usage 中记录 `reviewRerun`、`reviewComment` 和 `reviewDecision` 摘要；H5 写稿消耗卡片据此展示“审核重写依据”、驳回意见摘要、重写范围、目标章节/模块。
- 兼容旧 usage：若历史 `phase3b-usage.json` 缺少 `reviewRerun` 元数据，H5 仅在同目录 `review-decision.json` 为驳回、写稿分片/目标模块匹配、且写稿完成时间在决策后 24 小时内时推断为审核重写；否则仍显示普通局部分片。显式 `reviewRerun` 记录也只有在磁盘决策匹配时才借用其详情。
- 功能描述类意见会优先从 `evidence-summary.json` 的模块名、入口名、功能名和菜单路径识别 `targetModules`；识别到单模块时只重跑并替换该模块的 §2/§3 分片，识别不到才回退全部 `function-sections`。
- “页面说明/功能描述不准确”、字段/弹窗/表单的业务含义、说明、使用场景缺失，以及流程、角色、权限边界缺口，均按写稿问题处理；命中具体模块时只重跑该模块，未命中且属于系统定位/流程/角色/权限边界时重跑 `overview-flow`。
- 只有“截图/证据/采集缺失、页面/弹窗/字段没采到、未采集、无法打开、没有截图”等明确证据缺口才触发 `collect/inspect/summary/narrative/quality`，补证据后重新成稿。

#### 3.7 限制 Agent 轮次与重试（已完成基础版）

- phase3b 节点默认自动尝试次数已从 3 改为 **1**（命令行 `--retries N` 可覆盖）。
- SDK 若支持：设置 **max turns** 或 prompt 内写明「最多读 2 个文件，写 1 个输出，不要探索仓库」

#### 3.8 记录用量（便于验证）

- phase3b 结束后写 `phase3b-usage.json`：模型、耗时、若 SDK 返回则记录 input/output tokens
- H5 展示「写稿消耗」：运行类型（全量写稿 / 局部分片 / 审核驳回重写）、实际发送 prompt、生成 prompt 总量、生成/发送分片数量、Prompt 节省比例、最近写稿历史和参考费用估算。
- 分片模式下 `promptChars` 记录实际发送给 SDK 的 prompt 字符数；`generatedPromptChars` 记录落盘生成的主 prompt + 全部分片 prompt 总字符数，避免成本估算按未发送内容虚高。
- `generatedPromptPartCount`、`sentPromptRunCount`、`sentPromptPartCount` 用于审计局部重跑是否真的只发送了目标分片；`sentPromptRuns` 记录发送目标摘要（ID/类型/模块名），不保存 prompt 正文或本地路径；未显式传发送计数时由 `writeUsage()` 从 `sentPromptRuns` 自动推导；全量写稿可能生成多个分片 prompt，但实际发送仍是主 prompt。
- 审核驳回重写时，`phase3b-usage.json` 额外记录 `reviewRerun`、`reviewComment`、`reviewDecision`，用于解释本次局部重写为何发生、重写哪些章节/模块。
- H5 中“来源：usage 元数据”表示本次 usage 已记录完整审核重写信息；“来源：由旧 usage + review-decision 推断”表示兼容旧产物的保守推断，历史记录会追加“推断”标记。

---

### P2 — 质量增强且可控溢价

#### 3.9 强模型「二段抛光」（可选）

- 趟次 A/B 仍用 **composer-2.5**
- 仅对 §1 + §4 追加 **一次** gpt-5.5 短 prompt（输入 ≤2KB 已写好的两节，输出同结构）
- 比「全文 gpt-5.5」便宜一个数量级

#### 3.9 双 Provider 分流

- 日常：`cursor-sdk` + 上述压缩策略
- 后续：`codex-cli` + ChatGPT Pro 套餐（见 `CODEX-INTEGRATION.md`），用于 **降 Cursor 账单** 而非提高质量

---

## 4. 不建议的做法

| 做法 | 原因 |
|------|------|
| 让 Agent 直接读 `evidence.json` | 体积最大，重复且易触发多轮探索 |
| 把截图 base64 塞进 prompt | 输入爆炸 |
| 为省 token 删掉 §4 典型流程 | 业务「升华」核心，质量得不偿失 |
| 全文用 GPT 5.5 | 质量提升有限，费用最高 |
| 不设 cwd 限制 | Agent 探索不可控 |

---

## 5. 推荐落地顺序（里程碑）

| 步骤 | 交付 | 预期效果 |
|------|------|----------|
| **O1** | cwd 收窄 + prompt 禁止读 draft + inline summary | 立刻降 30%+ |
| **O2** | `narrative-brief.md` 规程压缩包 | 再降 10～15% |
| **O3** | 两趟写稿 + §7 机械合并 | 大系统再降 40%+ |
| **O4** | 驳回局部重写 + usage 日志 | 避免重复全额扣费 |
| **O5** | §1/§4 可选 gpt-5.5 抛光 | 质量提升、溢价可控 |

---

## 6. 与路线图的关系

- `docs/UNATTENDED-PIPELINE-ROADMAP.md` §6 模型策略保持不变：**默认 Composer 2.5，升级仅叙事**。
- 本文是 **M10（成本优化）** 的设计基线；实现时不改变取证与质检节点，只改 phase3b 调用方式。
- Codex 接入按 `docs/CODEX-INTEGRATION.md` 执行，作为 Cursor 的 **计费替代**，不是替代 O1～O4 的压缩策略。
