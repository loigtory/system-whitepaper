# 无人值守白皮书流水线 — 总体方案与实现路线图

> 版本：2026-05-19  
> 状态：**M1-M10 已实现（adp 试点 cursor-sdk 写稿通过）；H5 停止/重头、登录快路径、产物预览与约定命名已落地**  
> 试点：以 `systems-registry.xlsx` 中**新维护的页面较少系统**为准（不再以财务中台 fin-center 为主试点；fin-center 保留为大规模回归样本）

> 当前说明：本文件是历史路线图，不作为当前流程或验收依据。当前主线以 `SKILL.md`、`check-truth-readiness.js`、`check-batch-acceptance.js` 和 `check-delivery-readiness.js` 为准：数据库证据只读脱敏进入 Truth Pipeline，review/final/Word 必须通过 Truth gate，Word 交付必须有 `.docx.manifest.json`。

---

## 1. 目标

在**本机**实现：从系统清单到**可交付白皮书**的全链路**无人值守**（除浑天会话极端情况与**业务审核**外），包括：

- Playwright 确定性采集（含弹窗、低风险写操作验证）
- 机械底稿 + Cursor SDK 叙事成稿（Skill 规程驱动）
- 草稿 / 待审核稿 / 终稿（MD）分离；**审核通过后同目录生成 Word**
- 本地 H5 看板（`127.0.0.1:3920`）触发、跟踪、重试、审核
- 审核不通过时，`run-review-decision.js` **依据审核意见规则分类**并给出重跑节点

**不做**：公网部署、多租户、数据库、完整「平台化」后台。

---

## 2. 架构总览

```text
┌─────────────────────────────────────────────────────────────────┐
│  system-whitepaper Skill（规程 + narrative-guide + 反幻觉）      │
└────────────────────────────┬────────────────────────────────────┘
                             │ 3b / 审核驳回后的规则分类
┌────────────────────────────▼────────────────────────────────────┐
│  run-whitepaper-pipeline.js（总控，系统间串行）                    │
│    Provider: cursor-sdk | manual | codex(预留)                   │
└─┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
  │          │          │          │          │
  ▼          ▼          ▼          ▼          ▼
 Playwright  机械脚本   Cursor SDK  质检脚本   local-dashboard
 collect…    draft/summary  叙事3b   quality   H5 :3920
```

**分工原则**

| 层 | 技术 | 职责 |
|----|------|------|
| 确定性 | Node + Playwright | 采集、底稿、摘要、质检统计、Word 导出 |
| 叙事 | Cursor SDK + Skill | 3b 写稿、审核驳回后的局部分片重写 |
| 驳回规则 | Node 脚本 | `run-review-decision.js` 规则分类并输出 `review-decision.json` |
| 编排 | pipeline CLI | 节点状态、重试、暂停、断点 |
| 可视 | 本地 H5 | 系统列表、节点、触发、审核、重试 |

---

## 3. 链路节点（四阶段 + 两字小步）

H5 **先展示 4 个大阶段**（每阶段 2 字），展开后才是 **2 字小步**。  
大阶段看进度，小步看细节；**重试、暂停、驳回决策仍落在小步（nodeId）上**。

### 3.1 四阶段总览

| 阶段 | 2 字名 | 阶段 ID | 包含小步 | 业务含义（阶段副标题，H5 一行） |
|------|--------|---------|----------|--------------------------------|
| 一 | **准备** | `prepare` | 同步 → 登录 | 确认采哪个系统，并登录测试环境 |
| 二 | **取证** | `evidence` | 页面 → 弹窗 → 验写 | 采集页面、弹窗与关键写操作证据 |
| 三 | **成稿** | `compose` | 底稿 → 摘要 → 写稿 → 质检 | 整理证据材料，写成白皮书并自检 |
| 四 | **审定** | `approve` | 审阅 | 请您过目，通过即出 Word 终稿 |

```text
【准备】同步 → 登录
    ↓
【取证】页面 → 弹窗 → 验写
    ↓
【成稿】底稿 → 摘要 → 写稿 → 质检
    ↓
【审定】审阅
```

**H5 布局建议**

```text
系统：××管理系统          总进度 ████░░  当前阶段：取证

┌─ 准备 ──────────── ✓ ─────────────────────────┐
│  [同步✓] —— [登录✓]                              │
├─ 取证 ──────────── ● 进行中 ────────────────────┤
│  [页面●] —— [弹窗○] —— [验写○]                   │
│  正在按菜单逐页打开并截图…                        │
├─ 成稿 ──────────── ○ ─────────────────────────┤
│  [底稿○] —— [摘要○] —— [写稿○] —— [质检○]       │
├─ 审定 ──────────── ○ ─────────────────────────┤
│  [审阅○]                                         │
└─────────────────────────────────────────────────┘
```

阶段状态：`pending` | `running` | `success` | `failed` | `paused`  
H5 阶段标签：**未开始 | 进行中 | 已完成 | 需处理**

---

### 3.2 小步对照表（H5 仅显示 2 字标题）

| 阶段 | 小步 | 2 字 | 节点 ID | 进行中副文案（running，可 hover/展开） | 脚本/动作 |
|------|------|------|---------|----------------------------------------|-----------|
| 准备 | 1 | **同步** | `sync` | 从 Excel 同步系统清单，核对系统名称、地址与启用状态 | `sync-systems-registry.js` |
| 准备 | 2 | **登录** | `session` | 通过浑天登录，确保测试环境可打开 | `refresh-huntian-cookie.js` |
| 取证 | 3 | **页面** | `collect` | 按菜单逐页打开，截图并记录按钮、字段、表格 | `collect-evidence.js --resume` |
| 取证 | 4 | **弹窗** | `inspect` | 打开「新增/编辑」等弹窗，补充表单说明 | `collect-evidence.js --inspect-only` |
| 取证 | 5 | **验写** | `validate-write` | 用测试数据验证新增/保存等低风险写操作 | `validate-write.js`（create 场景 Playwright 执行） |
| 成稿 | 6 | **底稿** | `draft` | 把取证结果整理成白皮书底稿 | `generate-whitepaper.js` → `.draft.md` |
| 成稿 | 7 | **摘要** | `summary` | 生成证据摘要，提炼模块、流程、字段要点 | `build-evidence-summary.js` |
| 成稿 | 8 | **写稿** | `narrative` | 改写成业务可读白皮书（待审版） | `run-phase3b.js` → `.pending-review.md` |
| 成稿 | 9 | **质检** | `quality` | 对照菜单检查遗漏与无法证实的表述 | `check-quality.js` + `check-narrative.js` |
| 审定 | 10 | **审阅** | `review` | 请您确认通过或填写修改意见 | **H5 人工**；驳回 → 脚本规则决策 |

**小步状态**（内部）：`pending` | `running` | `success` | `failed` | `paused` | `skipped`  
**H5 小步标签**：未开始 | 进行中 | 已完成 | 需处理 | 已跳过

**自动重试**：小步失败自动重试 **3 次**；仍失败 → 小步 **需处理**，当前阶段 **需处理**，不进入下一阶段。  
**登录（准备 · 登录）特殊规则**：浑天统一 SSO，登录失败常影响全批 → 整批 **暂停**；修复后对 **登录** 点 **重试** 或 **从头再来**。

**并发**：系统间 **串行**；同一时刻仅一个系统跑 Playwright。

---

## 4. 稿件文件（同目录 `outputs/{code}/`）

| 文件 | 含义 | 产生时机 |
|------|------|----------|
| `whitepaper.draft.md` | **草稿**（功能底稿） | 成稿 · **底稿** 完成后 |
| `whitepaper.pending-review.md` | **待审核稿**（业务可读白皮书） | 成稿 · **写稿** 完成后 |
| `whitepaper.final.md` | **终稿 MD** | 审定 · **审阅** 通过后 |
| `{系统名称}_系统功能白皮书_{YYYYMMDD}.docx` | **终稿 Word** | 审定 · **审阅** 通过后立即生成 |

说明：

- 终稿确定前，业务侧主要阅读 `pending-review.md`。
- **不在文档中记录审核人**；审核动作仅体现在 `pipeline-state.json` 的状态迁移。
- 可选 **高级优化**（见 §6）：在待审核阶段用更强模型生成 `whitepaper.pending-review.gpt55.md` 或覆盖 pending-review，再提交审核。

保留现有：`evidence.json`、`quality-report.json`、`operation-log.jsonl`、`screenshots/` 等。

---

## 5. 业务审核（N10）与驳回规则决策

### 5.1 H5 审核交互（审定 · 审阅）

- **通过**：写入 `whitepaper.final.md` → 触发 Word 导出 → 小步 **审阅**、阶段 **审定** 均已完成，系统总状态 `finalized`。
- **不通过**：**必填修改意见** → 系统 `review-rejected`，**审阅** 标记需处理；`run-review-decision.js` 根据意见决定重跑哪些小步（可跨阶段，如仅 **写稿** 或从 **页面** 重跑）。

### 5.2 审核驳回后的规则决策（Node 脚本）

Pipeline 将 **审核意见** 交给 `run-review-decision.js`，脚本结合本地 `evidence-summary.json` 识别目标模块并输出结构化决策 JSON；写稿 Agent 只在 `--review-rerun` 时读取该 JSON 并执行叙事重写。例如：

```json
{
  "status": "rejected",
  "comment": "业务定位描述偏技术，需重写 §1 和 §2",
  "rerunNodes": ["narrative", "quality"],
  "rewriteScope": "overview-flow",
  "targetSections": ["1", "4"],
  "targetModules": [],
  "narrativePart": "overview-flow"
}
```

**脚本分类字段**

| 字段 | 含义 | 典型值 |
|------|------|--------|
| `rerunNodes` | 实际重跑的小步 | 文案/流程缺口 → `narrative,quality`；截图/证据/采集失败 → `collect,inspect,summary,narrative,quality` |
| `rewriteScope` | 写稿重写范围 | `overview-flow`、`function-sections`、`evidence-refresh`、`narrative` |
| `narrativePart` | 传给 `run-phase3b.js --narrative-part` 的分片 | `overview-flow`、`function-sections`、具体模块名；证据刷新时为空 |
| `instructions` | 下一轮重写重点 | 强化业务定位、补充业务流程、修正模块说明等 |

H5 展示脚本决策结果，操作员可 **一键执行建议重跑** 或 **手动勾选节点重跑**。

---

## 6. 模型策略（Cursor SDK）

| 阶段 | 默认模型 | 说明 |
|------|----------|------|
| N8 叙事（3b） | **Composer 2.5** | 快、成本低，先出待审核稿 |
| 审核驳回自动闭环 | **Composer 2.5** | 优先局部分片重写，避免全量高成本重跑 |
| H5「高级优化」 | **GPT 5.5**（或 SDK `Cursor.models.list` 中更强档） | 人工触发，短输入润色叙事，不改证据事实 |
| 驳回决策 | 无模型 | `run-review-decision.js` 确定性输出 JSON；只有后续叙事重写才调用模型 |

配置示例（`config/systems.local.yaml` 或 `config/narrative.yaml`）：

```yaml
narrative:
  provider: cursor-sdk
  defaultModel: composer-2.5
  upgradeModel: gpt-5.5
  maxRetries: 3
```

**manual Provider**：无 API 或调试时，H5/CLI 打印 Cursor IDE 指令，人工 `@system-whitepaper` 完成 N8。

**codex-cli Provider**：方案已收敛，见 **`docs/CODEX-INTEGRATION.md`** —— ChatGPT 登录 + 套餐内 `codex exec`，**不用** OpenAI Platform API Key；实现暂缓，规程与 prompt 与 cursor-sdk 共用。

**Cursor 成本优化**：见 **`docs/CURSOR-TOKEN-OPTIMIZATION.md`**（phase3b Agent 收窄工作区、inline 输入、分段写稿）。

---

## 7. 本地 H5 看板

| 项 | 约定 |
|----|------|
| 地址 | `http://127.0.0.1:3920` |
| 实现 | `scripts/local-dashboard/`（`server.js` + 单页 `index.html`） |
| 数据 | 读 `outputs/_batch/run-state.json` + 各 `outputs/{code}/pipeline-state.json` |
| 能力 | ① 系统清单与每节点状态 ② 启动整批 / 单系统 ③ 停止整批 ④ 从头再来 ⑤ 单节点重试 ⑥ N10 审核（通过/驳回+意见）⑦ 执行脚本驳回决策 |

**不是**独立产品，仅为 pipeline 的本地 UI。

---

## 8. 状态管理（实现约定）

### 8.1 批级 — `outputs/_batch/run-state.json`

```json
{
  "batchId": "20260519-143000",
  "status": "running|paused|completed|stopped",
  "currentSystemCode": "xxx",
  "systems": [
    { "code": "xxx", "status": "running", "currentNode": "collect" }
  ],
  "startedAt": "...",
  "updatedAt": "..."
}
```

### 8.2 系统级 — `outputs/{code}/pipeline-state.json`

```json
{
  "code": "xxx",
  "overallStatus": "running|review-pending|review-rejected|finalized|failed|paused",
  "currentPhase": "evidence",
  "currentNode": "collect",
  "phases": {
    "prepare": { "status": "success", "label": "准备" },
    "evidence": { "status": "running", "label": "取证" },
    "compose": { "status": "pending", "label": "成稿" },
    "approve": { "status": "pending", "label": "审定" }
  },
  "nodes": {
    "sync": { "phase": "prepare", "label": "同步", "status": "success", "attempts": 1 },
    "session": { "phase": "prepare", "label": "登录", "status": "success", "attempts": 1 },
    "collect": { "phase": "evidence", "label": "页面", "status": "running", "attempts": 1 },
    "inspect": { "phase": "evidence", "label": "弹窗", "status": "pending", "attempts": 0 },
    "validate-write": { "phase": "evidence", "label": "验写", "status": "pending", "attempts": 0 },
    "draft": { "phase": "compose", "label": "底稿", "status": "pending", "attempts": 0 },
    "summary": { "phase": "compose", "label": "摘要", "status": "pending", "attempts": 0 },
    "narrative": { "phase": "compose", "label": "写稿", "status": "pending", "attempts": 0 },
    "quality": { "phase": "compose", "label": "质检", "status": "pending", "attempts": 0 },
    "review": { "phase": "approve", "label": "审阅", "status": "pending", "attempts": 0 }
  },
  "review": {
    "status": "pending|approved|rejected",
    "comment": "修改意见（不写入白皮书正文）",
    "decision": {
      "rerunNodes": ["narrative", "quality"],
      "rewriteScope": "overview-flow",
      "narrativePart": "overview-flow"
    }
  },
  "artifacts": {
    "draft": "whitepaper.draft.md",
    "pendingReview": "whitepaper.pending-review.md",
    "final": "whitepaper.final.md",
    "docx": "..."
  }
}
```

**阶段进度规则**：阶段内全部小步 `success` → 阶段 `success`；任一小步 `running` → 阶段 `running`；任一小步 `failed/paused` 且无后续 success → 阶段 **需处理**。

---

## 9. 新试点系统

- 以 **`systems-registry.xlsx` 中新加的启用系统** 为第一验证对象（页面少、迭代快）。
- 编码前执行：`node scripts/sync-systems-registry.js --config config/systems.local.yaml`
- fin-center / 财务中台：保留作大规模样本，**不阻塞**新试点上线。

---

## 10. 实现里程碑（编码顺序）

| 里程碑 | 交付 | 依赖 | 状态 |
|--------|------|------|------|
| **M1** | 本文档 + `docs/narrative-guide.md` + 更新 `SKILL.md`（3a/3b/N10/驳回决策） | — | 已完成 |
| **M2** | `whitepaper.draft.md` 分离；`build-evidence-summary.js` | M1 | 已完成 |
| **M3** | `narrative/providers/{cursor-sdk,manual,codex-stub}.js`；`run-phase3b.js` | M2 | 已完成 |
| **M4** | `run-whitepaper-pipeline.js` + `pipeline-state.json` + 节点重试 | M3 | 已完成 |
| **M5** | N5 写操作验证（安全骨架；无计划默认跳过） | M4 | 已完成 |
| **M6** | `check-narrative.js`；驳回决策 `run-review-decision.js` | M3 | 已完成 |
| **M7** | `local-dashboard` H5（:3920）+ 审核 + 重试 + 停止/重头 | M4 | 已完成 |
| **M8** | `export-whitepaper-word.js`（审核通过后 MD→DOCX） | M7 | 已完成 |
| **M9** | 新试点 E2E；fin-center 可选回归 | M7+M8 | 已完成：`adp` 隔离冒烟通过 |
| **M9.5** | H5 全局清单 + 单系统流水线详情；节点重试/分段连线/running 态 | M7 | 已完成 |
| **M10** | 低 Token 写稿（brief + inline + fragments + 拼装 + usage 历史） | M3 | 已完成：`adp` 实测约 1.5k prompt 字符 |
| **M10-O** | 驳回局部重写、状态与产物对齐、一键启动看板 | M10+M7 | 已完成 |

**待办（非阻塞）**：Codex Provider；fin-center 费用回归。  
**近期已做**：验写节点已接入 Playwright create 场景执行（`AI_AUTO_TEST_` 前缀 + ledger 登记）；H5 停止/重头；登录 HTTP 校验；稿件预览与约定命名；SDK usage 从 `turn-ended` 回传（无则字符估算）。

---

## 11. 配置与环境

| 项 | 要求 |
|----|------|
| `CURSOR_API_KEY` | 批量 N8 写稿 / 驳回后的叙事重写（已确认可申请） |
| Codex | Provider 预留，文档标注「密钥就绪后接入」 |
| Playwright | 已有 |
| Word 导出 | 已实现 `export-whitepaper-word.js`，审核通过后自动生成 `.docx` |

---

## 12. 验收标准（新试点）

| 类别 | 标准 |
|------|------|
| 无人值守 | 单命令启动 → 自动跑到 N10 待审核（除 N2 暂停外） |
| 稿件 | 三 MD 分离；通过后同目录有 `.docx` |
| H5 | 系统列表可见阶段与小步状态；失败可重试；可停止/重头；审核驳回必填意见 |
| 驳回闭环 | 提交意见后脚本给出 `rerunNodes` 等决策并可执行 |
| 质检 | `canFinalize: true` + 叙事质检无 P0 |
| 模型 | 默认 Composer 2.5 待审核稿；驳回自动闭环仍用局部分片；GPT 5.5 仅作人工高级优化 |

---

## 13. 与旧路线图关系

- `docs/PILOT-ROADMAP.md`：fin-center 试点记录，**不再作为无人值守主线的验收基准**。
- 阶段 3「模板归纳」视为 **3a 机械底稿**；**3b 必须以 Agent + Skill 完成**。
- 阶段 4 写操作验证 **纳入第一版**（新试点 N5）。

---

*当前进展：M1-M10 已完成；`narrative.defaultProvider: auto` 有 Key 即用 cursor-sdk；审核驳回可自动按 `rerunNodes` 重跑。*
