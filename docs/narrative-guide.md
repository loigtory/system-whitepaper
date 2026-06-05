# 白皮书叙事成稿规则（阶段 3b）

> 适用节点：**成稿 · 写稿**、**审定 · 审阅驳回后的重写决策**。  
> 输入必须来自压缩后的 `evidence-summary.json`、`quality-report.json`、`verified-claims.json`、截图索引与审核意见；阶段 3b 不直接读取 `whitepaper.draft.md` 或完整 `evidence.json`。

## 1. 定位

`generate-whitepaper.js` 只生成**底稿**，用于保存事实、字段、截图索引和证据链。真正的白皮书正文由 Agent / LLM 在本规则约束下完成，输出 `whitepaper.pending-review.md`。确定性业务结论必须来自 `verified-claims.json` 中 `writable=true` 的 claim；数据库-only 或 non-writable claim 只能写入证据边界、待确认或辅助说明。

Agent 的任务不是把按钮和字段重新排列，而是把证据翻译成业务人员能理解的内容：

- 这个系统解决什么业务问题
- 哪些角色会用它
- 核心业务对象是什么
- 页面、弹窗、写操作如何支撑业务流程
- 哪些内容已经取证，哪些仍需确认

## 2. 总原则

1. **证据优先**：没有证据，不写确定结论；只能写入待确认事项。
2. **业务可读**：避免把页面标题、按钮清单当功能说明。
3. **少写技术**：URL、接口名、DOM、脚本细节只在影响业务理解时出现。
4. **少写验证噪声**：不要在每个功能后重复“本轮只读采证”；只在高风险、未验证、写操作处说明。
5. **不美化能力**：看到“提交”按钮不等于完成审批流；看到“运行报表”不等于已生成报表。
6. **保留证据链**：关键结论要能追溯到菜单、页面、截图、字段、操作日志或测试数据。

## 3. 输入文件

| 文件 | 用途 |
|------|------|
| prompt 内联 `evidence-summary` | Agent 主输入，包含模块、功能、字段、截图、流程候选 |
| prompt 内联 quality 摘要 | 判断是否存在覆盖缺口 |
| `narrative-brief.md` | 低 Token 写作规程 |
| `whitepaper.skeleton.md` | 分片写稿时的章节骨架；仅用于保持结构 |
| `test-data-ledger` 摘要 | 判断写操作是否可作为已验证流程 |
| 审核意见 | 驳回后决定重写、重跑或升级模型 |

若 `evidence-summary.json` 不存在，Agent 应停止阶段 3b，要求先执行 **成稿 · 摘要**，不要直接读取超大 `evidence.json` 或 `whitepaper.draft.md` 写稿。运行时私有目录（`secrets/`、`.playwright-*`）、截图二进制、仓库脚本和无关系统产物均不属于写稿输入。

## 4. 章节写法

### 4.1 系统概览

必须写成**业务定位**，不是菜单复述。

推荐结构：

1. **一句定位**：系统位于哪条业务链路，解决什么问题。
2. **价值说明**：帮助谁完成核对、配置、处理、出表、留痕等工作。
3. **证据边界**：一句标注“依据测试环境页面取证归纳，非官方口径”。

禁止：

- “系统用于维护或查询相关数据”这类空泛句
- 只罗列一级菜单
- 把测试环境 URL 写入业务定位

### 4.2 功能模块概览

每个一级模块用一句业务语言说明：

- 写“业务对象 + 使用目的”
- 不写“共 N 个菜单页”
- 不写“页面提供新增、删除、查询等能力”作为模块定位

### 4.3 核心功能说明

每个功能控制在 5–8 行，优先回答：

1. 谁会用
2. 用来处理/查看什么业务对象
3. 关键字段说明什么
4. 可见操作中哪些已验证，哪些仅取证

推荐模板：

```markdown
#### [功能名]

**业务用途**：用于……，帮助……完成……。  
**页面入口**：……  
**关键内容**：……  
**常用操作**：查询、导出、查看详情等；涉及新增/删除/提交时以测试数据验证结果为准。  
```

禁止：

- 重复写“页面可见操作包括……”
- 把按钮全量堆进一句话
- 把编号、树节点、无业务含义文本写成主要操作
- 每页都写相同的“本轮为只读采证”

### 4.4 典型业务流程

流程必须围绕**业务目标**，不是点击步骤。每条流程包含：

- 核心用途
- 适用角色/场景
- 已取证步骤
- 未覆盖边界
- 关键截图

## 5. 写操作表述

写操作只有在满足以下条件时，才可写为“已验证”：

- 使用 `AI_AUTO_TEST_` 测试数据
- `test-data-ledger.json` 有登记
- 操作日志有结果
- 截图或页面反馈可追溯

否则只能写：

- “已取证入口”
- “已识别表单字段”
- “未提交验证”
- “需业务确认规则”

## 6. 质量自检

写完 `whitepaper.pending-review.md` 后，Agent 必须自检：

| 检查项 | 失败表现 |
|--------|----------|
| 业务定位 | 像菜单复述、没有业务价值 |
| 功能说明 | 大量重复模板句 |
| 操作说明 | 只罗列按钮 |
| 结论证据 | 写了证据里没有的模块/流程 |
| 可写结论 | 把 non-writable 或 database-only claim 写成确认功能 |
| 写操作 | 把“看到按钮”写成“已验证” |
| 待确认 | 未验证内容没有进入待确认 |

自检失败时，不应输出待审核稿；应返回需要重跑或重写的节点。

## 7. 审核驳回决策

当 H5 提交“不通过 + 修改意见”时，`run-review-decision.js` 必须输出结构化决策，Agent 只在 `--review-rerun` 写稿时读取并执行：

```json
{
  "status": "rejected",
  "comment": "原始审核意见",
  "rerunNodes": ["narrative", "quality"],
  "rewriteScope": "overview-flow | function-sections | evidence-refresh | narrative",
  "targetSections": ["1", "4"],
  "targetModules": [],
  "narrativePart": "overview-flow | function-sections | 模块名",
  "instructions": "重跑时要重点修改什么",
  "decidedAt": "ISO 时间"
}
```

字段名以 `run-review-decision.js` 落盘的 `review-decision.json` 为准；不要输出旧字段 `decision`、`nodes`、`phase`、`reason` 作为自动重跑依据。

脚本分类规则：

| 审核意见类型 | `rerunNodes` / `rewriteScope` |
|--------------|-------------------------------|
| 文案生硬、定位不到位 | `narrative,quality` / `overview-flow` |
| 某模块描述错误 | `narrative,quality` / `function-sections`，优先具体模块名；识别不到才用 `function-sections` |
| 证据缺失、截图不足 | `collect,inspect,summary,narrative,quality` / `evidence-refresh` |
| 字段、弹窗、表单的业务含义或说明缺失 | `narrative,quality` / `function-sections`，不补采证据 |
| 字段、弹窗、表单需要补采但未明确缺截图/缺证据 | `inspect,summary,quality`，后续再按摘要触发叙事重写 |
| 登录/环境问题 | 暂停，不应伪造叙事或证据 |

强模型润色只作为人工高级优化，不作为审核驳回自动闭环的默认动作；先用局部分片重写控制成本。

## 8. 输出约束

- 不手写完整附录；附录由脚本根据 `evidence-summary` 生成，正文只保留必要截图和证据引用。
- 正式待审核稿写入 `whitepaper.pending-review.md`。
- 不覆盖 `whitepaper.draft.md`。
- 只使用固定 `## 1` 至 `## 6` 正文章节；第 6 章“待确认事项”使用扁平 bullet，不新增 `### P0`、`### 模块与功能` 等自定义分组标题。
- 审核通过且当前 `truth-readiness-report.json` 达标、指纹非 stale、非 smoke/e2e 后，才生成 `whitepaper.final.md` 和 Word。
- Word 必须带 `.docx.manifest.json`，用于证明当前 `.docx` 绑定当前 `whitepaper.final.md`。
