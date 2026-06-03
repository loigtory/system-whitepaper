# 操作指引优先 — 流水线简要优化方案（约束版）

> 版本：2026-05-26  
> 状态：**方案定稿，后续实现须按本文约束**  
> 目标：在**无 README/操作手册/源码**的系统上，主交付 **`{系统}_操作指引.md`**，质量逼近人工 `操作指引手册.md`；白皮书降为可选第二层。  
> 硬约束：**禁止把原始采集洪流直接交给 AI**；必须「确定性抽取 → 分层摘要 → 小上下文成稿」。

---

## 1. 产品方向（不可偏离）

| 项 | 约束 |
|----|------|
| 主交付物 | `{系统}_操作指引.md` + Word |
| 次交付物 | `{系统}_系统功能白皮书.md`（可选，证据达标后才生成） |
| 取证核心 | **交互路径 mining** = 主动走流程 + 被动读浏览器（DOM / Network / Toast / a11y） |
| 结构化真源 | `operation-spec.json`（成稿唯一事实来源，AI 不得绕过） |
| 无 docs 默认 | 纯 UI 探索；有 docs 时仅作 **校验与 diff**，非依赖 |

### 1.1 系统定位策略（禁止「首页依赖症」）

**约束：首页不是默认真源。** 许多系统首页为空、仪表盘、跳转壳或一句话，**不足以**推断业务定位；adp 属于「首页信息较丰富」的例外，**不可**推广为通用策略。

**定位句 `positioning.text` 须按优先级多源合成，并带 `confidence`：**

| 优先级 | 来源 | confidence 规则 |
|--------|------|-----------------|
| P1 | `systems-registry` 的 `businessHint`（人工维护） | `high` |
| P2 | 可选 `referenceDocs`（有则校验，无则跳过） | `high` |
| P3 | **模块聚合**：菜单名 + 列表列名 + 查询项 + 主流程名 + 字段 label 去重归纳（L1 机械） | `medium`～`high`（≥3 模块且有列/字段） |
| P4 | Network/API 语义：`/api/…` path、响应 key（如 `taskTypes`、`companies`） | `medium` |
| P5 | 各模块页标题 / 面包屑 / Tab 名（跨页汇总） | `medium` |
| P6 | 首页 welcome、副标题、流程图区（**仅当**有效文案 ≥30 字或非空流程块） | `low`～`medium` |
| P7 | L2 AI 归纳（输入 **module-digest 全集摘要 ≤1KB**，**禁止**仅喂首页） | ≤`medium`，须标注 `ai-inferred` |

**成稿规则：**

- `confidence: low` → 定位句必带「待业务确认」；不得写进白皮书确定结论。
- 首页无实质内容时，`positioning.source` 不得为 `homepage-text`；改用 `module-aggregate` 或 `registry`。
- **操作指引 §一「平台简介」**：优先写 **模块能做什么**（来自 spec）；定位句 1～2 句即可，缺失则写「见各章模块说明」。
- VLM/OCR **不得**默认只扫首页；仅当首页被 L1 判定为 `rich-home` 时才扫（见 §11.1）。

---

## 2. 信息架构（防 Token 洪流）

### 2.1 原则

1. **机器能确定的，不用 AI**（DOM 解析、JSON 字段、表格列头、API path、枚举 key）。
2. **AI 只吃摘要，不吃原始**（禁止整包 `evidence.json`、整段 HAR、全量 Network body）。
3. **分模块、分步骤、分次调用**（每步上下文有硬上限）。
4. **模板优先，AI 润色**（操作指引 80% 由模板填表，AI 只写定位/FAQ/衔接句）。
5. **累计 Token 预算**（单系统单轮成稿默认上限见 §2.3）。

### 2.2 四层流水线（L0→L3）

```text
L0 确定性采集（Playwright，0 Token）
    → operation-spec.raw.json（可大，仅机器读）
    → network-index.json（仅 URL/方法/字段 schema，无大 body）
    → screenshot-index（路径 + 关联 module/flow/step）

L1 机械压缩（Node 脚本，0 Token）
    → operation-spec.json（裁剪后，≤50KB/系统）
    → module-digest.json（每模块 ≤2KB：菜单/列/查询/流程名/字段名）
    → flow-digest.json（每流程每步 ≤1KB：字段 label+required+options 来源摘要）

L2 分步 AI 摘要（小模型/短 prompt，可选）
    → 仅当 L1 无法生成「业务用途一句话」时调用
    → 输入：module-digest 单条 + positioningDigest（多源摘要 ≤500 字，**非首页单源**）
    → 输出：module-summary 一句 + faq-candidates[]（每条 ≤80 字）
    → 每模块单独调用，禁止批量塞 10 个模块

L3 成稿（模板 + 轻量 AI）
    → generate-operation-guide.js：模板填 operation-spec + module-summary
    → AI 仅润色：§一 定位（受 confidence 约束）、§七 FAQ、章节过渡（输入 ≤3KB）
    → 白皮书（可选）：仅读 operation-guide.md 摘要 + positioningDigest（≤5KB）
    → Chunk RAG：按章节检索 module-digest 块，禁止 spec 全文进 prompt（见 §11.3）
```

### 2.3 Token 预算（单系统单轮默认上限）

| 阶段 | 输入上限 | 输出上限 | 说明 |
|------|----------|----------|------|
| L2 模块摘要 | 800 tokens/模块 | 200 tokens/模块 | 仅模块数 >0 且缺 businessHint 时 |
| L3 操作指引润色 | 3000 tokens 总计 | 1500 tokens | 不分模块重述字段表 |
| L3 白皮书（可选） | 5000 tokens | 4000 tokens | 仅在操作指引终稿通过后 |
| **单轮合计** | — | **≤15k output 等效** | 超出则拆轮次，禁止一次 prompt 吃全 spec |

### 2.4 禁止清单（代码 review 必查）

- ❌ 将 `evidence.json` 全文传入 Agent / phase3b
- ❌ 将 Network response body 全量写入 prompt
- ❌ 将同一模块截图 base64 送入 LLM（截图仅 H5/附录引用路径）
- ❌ 单次 Agent 任务跨 >3 个模块
- ❌ 证据未达标时调用 L3 成稿

---

## 3. operation-spec.json（最小 schema，实现须遵守）

```json
{
  "systemCode": "adp",
  "positioning": {
    "text": "…",
    "confidence": "medium",
    "sources": [
      { "type": "registry", "weight": 0.4 },
      { "type": "module-aggregate", "weight": 0.4 },
      { "type": "homepage-text", "weight": 0.2, "note": "仅 rich-home 时启用" }
    ]
  },
  "navigation": [{ "menuPath": "AI任务管理", "entry": "左侧 → …" }],
  "modules": [{
    "name": "AI任务管理",
    "list": { "columns": [], "queryFields": [], "rowActions": [] },
    "flows": [{
      "name": "新建AI任务",
      "trigger": "新建AI任务",
      "steps": [{
        "title": "定义参数",
        "fields": [{ "label": "", "required": true, "control": "select", "optionsSource": "GET /api/…" }],
        "buttons": ["下一步", "取消"],
        "screenshots": ["screenshots/…"],
        "apis": ["GET /api/insurance/companies"]
      }]
    }],
    "tabs": []
  }],
  "crossLinks": [{ "from": "删除任务", "to": "AI发布管理", "hint": "确认框文案…" }],
  "pending": [{ "topic": "", "reason": "无 Network 证据" }]
}
```

**体积约束**：裁剪后 `operation-spec.json` ≤50KB；单模块 fields 列表 ≤40 项；API 只保留 path + 响应字段名列表（不存样例值）。

---

## 4. 取证节点（相对现流水线的新增/强化）

| 节点 ID | 显示名 | 职责 | Token |
|---------|--------|------|-------|
| `collect` | 静态页面采集 | 菜单 API、**各模块列表/查询页**（主采集面）；首页仅作可选信号 | 0 |
| `inspect` | 动态页面采集 | 弹窗/抽屉/Tab | 0 |
| **`trace-flows`**（新增） | 流程采集 | wizard 分步：字段+按钮+逐步截图；关联 Network 窗口 | 0 |
| `validate-write` | 试业务操作 | 关键 flow 走通；Toast/校验文案；结果**回写 spec** | 0 |
| **`build-spec`**（新增） | 整理规格 | L0→L1：生成/裁剪 `operation-spec.json` | 0 |
| **`compose-guide`**（新增） | 生成操作指引 | L3 模板 + 可选 L2 润色 | 受 §2.3 约束 |
| `compose-whitepaper`（可选） | 生成白皮书 | 仅 spec 达标 + 操作指引已审时 | 受 §2.3 约束 |

**顺序**：`collect → inspect → trace-flows → validate-write → build-spec → compose-guide → [质检] → 审阅 → [compose-whitepaper]`。

---

## 5. 质检门禁（未达标禁止 compose-guide）

| 检查项 | adp 试点门槛 | 通用规则 |
|--------|--------------|----------|
| 业务菜单数 | ≥4 | ≥ 侧栏可见业务项 − 环境切换项 |
| 模块列表页 | 每菜单 ≥1 | 有 columns 或明确「仅仪表盘」 |
| 主流程 | AI任务管理：新建 ≥4 步 | 有「新建/添加」的模块 ≥1 条 flow |
| 字段 | 主流程每步 ≥1 field | 否则整步标 pending |
| 截图 | 每模块 ≥1 | 主流程每步 ≥1（可复用） |
| operation-spec 体积 | ≤50KB | 超限则 L1 压缩失败，不进入 L3 |

H5 展示：**操作指引就绪度 %** + 未通过项清单。

---

## 6. 分步 AI 摘要器（L2）设计要点

**何时调用**：`module.businessHint` 为空且 L1 仅有字段名无用途推断。

**输入包（单模块）**：

```json
{
  "systemName": "AI保单数据闭环平台",
  "positioningOneLine": "…",
  "module": { "name": "AI任务管理", "columns": ["…"], "flowNames": ["新建AI任务"], "fieldLabels": ["保险公司","任务类型"] }
}
```

**输出包**：

```json
{
  "businessHint": "用于配置并执行保司数据对接任务…",
  "faqCandidates": ["生成需求文档前需先选保司与任务类型"]
}
```

**不调用 L2 的情况**：registry 已有 `businessHint`；或 L1 从 **列表列名/流程名/面包屑** 已机械生成 `module.businessHint`。

**禁止**：L2 输入仅含首页文案而没有任何 module-digest。

---

## 7. 实施分期（后续 PR 须标注 P0/P1/P2）

### P0（先跑通 adp 操作指引）

1. Network 监听 + 分步关联（`trace-flows` 雏形可合入 collect）
2. 侧栏/menu API 修复；环境切换项过滤
3. `build-spec` + `operation-spec.json` schema
4. `generate-operation-guide.js`（模板成稿，L3 可暂不调用 AI）
5. 质检门禁 + H5 主交付改为操作指引
6. 试业务操作结果回写 spec

### P1（接近手册 + 控 Token）

7. L2 分模块摘要器（独立脚本，带 token 计数）
8. FAQ 从 Toast/confirm 文案机械提取 + L2 润色
9. 与 adp `操作指引手册.md` diff 评分脚本
10. 白皮书改为可选节点

### P2（多系统推广）

11. swagger / `__APP_CONFIG__` 探测
12. registry 增加 `businessHint`（**P0 必维护**）、可选 `referenceDocs?`
13. VLM 单页 OCR（**仅 `rich-home` 或指定模块页**，见 §11.1）

### P1 补充（增强手段中的优先项）

14. UI 状态 Diff 引擎（`trace-flows` 核心，见 §11.2）
15. Chunk RAG 成稿检索（见 §11.3）
16. LLM-as-Judge 质检 rubric（见 §11.4）
17. Traffic → API schema 目录（Network 索引升级版，见 §11.5）

---

## 8. 对现有组件的处置

| 现有 | 处置 |
|------|------|
| `phase3b` / narrative 白皮书 | 保留为 **compose-whitepaper（可选）**；默认关闭 |
| `evidence-summary.json` | 改为 **module-digest 的来源之一**，不直接给 Agent |
| `whitepaper.draft.md` | 降级为 debug；操作指引不依赖 fin-center 模板底稿 |
| `narrative-guide.md` | 白皮书专用；新增 `operation-guide-template.md` |

---

## 9. 验收标准（adp）

- [ ] `operation-spec.json` 含 4 业务模块 + 新建任务 4 步 + 字段表
- [ ] `{系统}_操作指引.md` 结构与 `docs/操作指引手册.md` 章节对齐度 ≥80%（diff 脚本）
- [ ] 单轮成稿 Token（L2+L3）≤ 预算；日志可审计
- [ ] 无 docs 情况下，业务同学可仅凭操作指引完成「新建 AI 任务」主路径（人工抽测）
- [ ] `positioning.sources` 不含「仅 homepage-text」且 confidence=high 的组合（空首页系统抽检）

---

## 10. 后续执行约束

1. 任何取证/成稿 PR 须标注对应 **P0/P1/P2** 与本方案 §4/§5。
2. 新增 AI 调用须说明 **输入来源文件、token 上限、为何不放在 L0/L1**。
3. 禁止降低质检门槛以「先出稿」；未达标仅可出 **draft 操作指引（带水印/待确认）**。
4. adp 试点通过验收后，再复制到其他 `systems-registry` 系统。
5. **禁止**将首页作为定位或模块推断的唯一依据；违反则 PR 不予合并。

---

## 11. 增强手段（新技术，须符合 L0/L1 优先 + Token 预算）

### 11.1 VLM 单页视觉理解（非「默认扫首页」）

| 项 | 约束 |
|----|------|
| 触发 | L1 判定 `rich-home`（welcome≥30 字或可见流程图块）**或** 某模块页含 Canvas/图表且 DOM 无表 |
| 输入 | **单张**截图路径，不上传 base64 进 prompt 时优先本地 OCR/VLM API |
| 输出 | 结构化 JSON 写入 spec（流程步骤标题、图例名），`confidence` 必填 |
| 禁止 | 整站批量 Vision；空首页默认调用 |

### 11.2 UI 状态 Diff 引擎（0 Token，探索核心）

每次点击（菜单 / 新建 / 下一步 / Tab）前后：

- DOM 可见节点 diff（新增 field/button/modal）
- Network 新增请求 diff
- 截图可选

**产出**：wizard 步骤边界、字段归属步骤、联动关系；**替代**「每步让 LLM 描述页面」。

### 11.3 Chunk RAG（成稿检索，非整库灌 prompt）

- L1 将 spec 切分为 `module` / `flow-step` / `faq` chunks（每块 ≤2KB）
- L3 写 §N 时 **只检索 Top-K 相关 chunk**（K≤5）
- 向量库可选；首版可用 **menuPath 精确匹配**，0 额外 Token 基础设施

### 11.4 LLM-as-Judge（质检，非重写）

- 输入：操作指引目录 + 每章首段 + rubric 清单（≤2KB）
- 输出：`pass/fail` + 缺项，**不**输出改写全文
- 未 pass → block 审阅；可触发「补采集」而非「加大 prompt 重写」

### 11.5 Traffic → API schema 目录（Network 升级版）

- 同 path 聚类；响应 JSON **只保留 key 路径 + 类型**
- 关联到 module/flow-step（时间窗 + 触发动作）
- 写入 `optionsSource` / `listDataSource`；**0 Token**

### 11.6 Explorer / Writer 分离

| Agent | 职责 | Token |
|-------|------|-------|
| Explorer | 根据 `pendingModules[]` 决定下一采集目标 | 小，仅 digest |
| Writer | 仅 L2/L3，不控制浏览器 | 受 §2.3 约束 |

Explorer **不得**替代 L0 确定性采集；仅用于「菜单采完但 Tab/wizard 未扫」等缺口。

### 11.7 增量取证与 spec merge

- 对 `menuPath + url + domHash` 做变更检测；未变模块跳过
- merge 进 `operation-spec.json`；操作指引 **按章 diff 更新**
- 降低多系统规模化成本

### 11.8 结构化输出（全 AI 环节强制）

L2、LLM-as-Judge、Explorer 计划须 **JSON Schema / function calling**；失败则降级 L1 或 pending，不用散文兜底。

### 11.9 采纳优先级（实现顺序）

```text
P0 必做：11.2 UI Diff、11.5 Traffic schema、§1.1 多源定位
P1 推荐：11.3 Chunk RAG、11.4 LLM-as-Judge、11.6 Explorer/Writer
P2 选做：11.1 VLM（条件触发）、11.7 增量、Computer Use 兜底探索
```

---

*本文档为后续优化的唯一简要约束；细节实现写入对应脚本 README，不得与本方案冲突。*
