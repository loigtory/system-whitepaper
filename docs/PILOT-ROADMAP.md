# 财务中台试点：实现回顾与后续计划

> 状态基准：`outputs/fin-center` 证据包（2026-05-20），脚本目录 `skill/system-whitepaper`  
> 质量门禁：`canFinalize: true`（核心菜单 86/86，页面 55，动作 310，表格 77）

---

## 一、已实现能力（收敛清单）

### 1. 工程与 Skill 骨架

| 项 | 说明 |
|----|------|
| Skill 主控 | `SKILL.md` + 模板/证据 schema/安全规则/质量清单 |
| 脚本四件套 | `collect-evidence.js`、`refresh-huntian-cookie.js`、`generate-whitepaper.js`、`check-quality.js` |
| 共享库 | `system-whitepaper-lib.js`（菜单解析、证据合并、白皮书渲染、质量指标） |
| 单元测试 | `system-whitepaper.test.js`（37 项，菜单/ Cookie/ 缩放/ 滚动合并等） |
| 本地配置 | `config/systems.local.yaml`（试点系统、IP 白名单、`pageZoom`、`evidenceScroll`、`persistentProfile`） |

### 2. 登录与环境

| 项 | 说明 |
|----|------|
| 浑天 Cookie 自动刷新 | `refresh-huntian-cookie.js`，写入 `secrets/huntian-cookie-header.txt` |
| 企微快捷登录 | 默认无头；匹配「继续在浏览器中登录访问」，`--persistent-profile`；`--headed` 仅扫码/排查 |
| 采集集成刷新 | `--refresh-cookie`、占位符/会话失效自动重试；`REFRESH_COOKIE=skip` 可跳过 |
| 持久化 Profile | 默认 `secrets/playwright-huntian-profile/`，采集默认 `persistentProfile: true` |
| 环境门禁 | `expectedHost` 解析 IP 白名单，非测试 IP 阻断采集 |

### 3. 菜单与页面采集

| 项 | 说明 |
|----|------|
| 菜单 API | `/api/venus/center/getMenuList` → `menuMap` |
| 叶子菜单策略 | 只采叶子页，跳过父级目录/壳菜单/数字噪声项 |
| 导航 | 侧栏 href 优先 → 菜单文字点击 → URL 回退；SPA 路由等待 |
| 续跑 | `--resume` + 已有截图跳过（`menu-already-screenshot`） |
| 误采清理 | 欢迎页误采剔除；`markVisitedMenus` 以有效截图为准 |

### 4. 页面证据质量

| 项 | 说明 |
|----|------|
| 结构化采集 | 按钮/表单/表格/链接，多 frame（含 iframe）合并 |
| 页面缩放 | `runtime.pageZoom: 0.6`（CDP + CSS 回退） |
| 证据滚动 | `runtime.evidenceScroll`：纵向 + 表格横向 + 嵌套区有限步进；**截图仍 fullPage，不为此滚动** |
| 安全探测 | `isSafeExplorationClick` / `isSafeInspectionClick`，禁止高危写操作 |
| 弹窗模式 | `--inspect-only`：不重复菜单截图，仅 `inspectSafeContainers` |

### 5. 试点产出

| 产出 | 路径 |
|------|------|
| 证据包 | `outputs/fin-center/evidence.json` |
| 白皮书 | `outputs/fin-center/{系统名称}_系统功能白皮书_{YYYYMMDD}.md` |
| 质量报告 | `outputs/fin-center/quality-report.json` |
| 操作日志 | `outputs/fin-center/operation-log.jsonl` |
| 截图目录 | `outputs/fin-center/screenshots/` |

---

## 二、已知缺口（未完成 / 不充分）

### A. 阻塞级（影响续跑）

| # | 缺口 | 现状 |
|---|------|------|
| A1 | **无有效 Profile / 仅二维码时会卡在浑天登录** | 空 profile 需扫码；有会话时无头可点快捷登录（企微 iframe） |
| A2 | **弹窗/抽屉证据为 0** | `evidence.json` 无 `type: container`；`--inspect-only` 未在有效会话下跑通 |

### B. 证据质量（门禁通过但内容偏薄）

| # | 缺口 | 现状 |
|---|------|------|
| B1 | **未用新能力全量重采** | `evidenceScroll`、`pageZoom` 上线后，52 页证据多为旧快照，字段/表格可能仍偏视口 |
| B2 | **failedPages 历史堆积** | 约 26 条失败记录（含过期 cookie、断网），未自动去重/归档 |
| B3 | **动作未验证** | 278 条 `actionInventory` 均为 `pendingItem: true`，无真实点击校验 |
| B4 | **白皮书章节空壳** | 概览「业务定位/使用对象」待补充；§4 典型流程为空；§6 待确认已收敛父菜单误报，但缺弹窗/流程证据 |

### C. 能力边界（设计已知，非 bug）

| # | 缺口 | 说明 |
|---|------|------|
| C1 | 虚拟列表/懒加载 | 仅已渲染 DOM；长表仍不完整 |
| C2 | 弹窗内未做 evidenceScroll | 仅主页面路径滚动合并 |
| C3 | 弹窗截图 | 仍为整页 fullPage，非元素级 |
| C4 | 写操作/流程验证 | Skill 要求 `AI_AUTO_TEST_` 实测，**尚未执行** |
| C5 | 浑天 token 校验 | `verify-login` 常 skipped（无 `huntian-token.txt` 或占位） |
| C6 | 多系统复制 | 仅 `pilot` 一个系统跑通 |

---

## 三、后续计划（按优先级）

### 阶段 0：会话稳定（1 次人工 + 脚本）

**目标**：保证后续批次不再批量 `redirected-to-welcome-or-login`。

| 步骤 | 操作 | 验收 |
|------|------|------|
| 0.1 | `node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system fin-center --persistent-profile`（默认无头） | 进入财务中台欢迎页，非 huntian/login |
| 0.2 | 确认 `secrets/huntian-cookie-header.txt` 含 JSESSIONID、HUNTIANSID（及 token 若有） | 刷新日志 success |
| 0.3 | 无头试跑 `node scripts/collect-evidence.js ... --inspect-only --max-pages 3` | 至少 1 页 `inspect-only` success，非 skipped |

---

### 阶段 1：证据刷新（结构化字段 + 缩放）

**目标**：在会话稳定前提下，用 `pageZoom` + `evidenceScroll` 更新字段/表格证据；**不重复已有菜单截图**。

| 步骤 | 操作 | 验收 |
|------|------|------|
| 1.1 | `--evidence-only`：仅重采结构化字段，保留原截图 | ✅ 已实现 |
| 1.2 | 分批 `--resume` 或定向重跑（每批 20～30 菜单） | `formInventory`/`tableInventory` 条数较旧包增加或列更全 |
| 1.3 | 清理/合并 `failedPages` 中已解决项 | 失败项仅保留真实未访问菜单 |
| 1.4 | `node scripts/generate-whitepaper.js` + `check-quality.js` | `canFinalize` 仍为 true |

**建议命令（阶段 0 完成后）**：

```powershell
Set-Location "D:\核心系统白皮书\skill\system-whitepaper"
$env:REFRESH_COOKIE="skip"

# 阶段 1：补采未访问叶子菜单
node scripts/collect-evidence.js --config config/systems.local.yaml --system fin-center --resume --max-pages 30

# 阶段 1b：已有截图的页只刷新表单/表格（不重截图）
node scripts/collect-evidence.js --config config/systems.local.yaml --system fin-center --evidence-only --max-pages 30

# 阶段 2：弹窗/抽屉
node scripts/collect-evidence.js --config config/systems.local.yaml --system fin-center --inspect-only --max-pages 30
```

---

### 阶段 2：弹窗/抽屉证据（inspect-only）

**目标**：`container` 证据 > 0，白皮书可描述「新增/查询」等表单字段。

| 步骤 | 操作 | 验收 |
|------|------|------|
| 2.1 | Profile 有效下跑完 `inspect-only`（`pendingPages` → 0） | `containersCaptured` 累计 > 0 |
| 2.2 | 若仍 `no-new-visible-container`：加强 iframe 内「新增」定位（Ant Design） | 抽样 5 页有 container 截图 |
| 2.3 | 可选：弹窗内 `evidenceScroll` | 弹窗表单字段多于单屏 |
| 2.4 | 重生成白皮书 | §3 含弹窗字段描述或附录截图 |

```powershell
node scripts/collect-evidence.js --config config/systems.local.yaml --system fin-center --inspect-only --max-pages 30
# 重复直至 inspect-only-summary pendingPages: 0
```

---

### 阶段 3：白皮书内容提质

**目标**：从「能过门禁」到「可给人读」。

| 步骤 | 操作 | 验收 |
|------|------|------|
| 3.1 | 补 §1 业务定位/使用对象（人工或基于菜单模块归纳，标注证据来源） | 无「待补充」占位 |
| 3.2 | 补 §4 典型流程（2～3 条只读流程：查询→导出等，附截图引用） | 至少 1 条端到端 |
| 3.3 | 压缩 §3：每功能 5～8 行，代表性截图 ≤5 张入正文 | 白皮书篇幅可控 |
| 3.4 | 附录对齐 `screenshotIndex`，删除失效失败页 | 索引与 evidence 一致 |

---

### 阶段 4：安全写操作验证（可选，试点后）

**目标**：满足 Skill「写操作必须 AI_AUTO_TEST_ + ledger」。

| 步骤 | 操作 | 验收 |
|------|------|------|
| 4.1 | 选 2～3 个低风险「新增」页，ledger 登记 `AI_AUTO_TEST_*` | `test-data-ledger.json` 有记录 |
| 4.2 | 半自动填表提交（或仅打开新增弹窗采证，不提交） | 与 `safety-rules.md` 一致 |
| 4.3 | 动作 `pendingItem` → `validated` 抽样标注 | 质量报告可追溯 |

---

### 阶段 5：推广与维护

| 步骤 | 操作 | 验收 |
|------|------|------|
| 5.1 | 复制 `systems.local.yaml` 模板到第二系统 | 第二份 evidence 目录 |
| 5.2 | CI/定时任务文档：cookie 过期 → headed 刷新 SOP | README 一节 |
| 5.3 | 将 `docs/PILOT-ROADMAP.md` 勾选项随阶段更新 | 本文件状态同步 |

---

## 四、执行顺序总览

```mermaid
flowchart LR
  P0[阶段0 会话稳定] --> P1[阶段1 证据刷新]
  P1 --> P2[阶段2 弹窗采集]
  P2 --> P3[阶段3 白皮书提质]
  P3 --> P4[阶段4 写操作验证]
  P4 --> P5[阶段5 多系统推广]
```

**当前建议下一步**：完成 **阶段 0** → **阶段 2**（弹窗）与 **阶段 1**（字段重采）可并行，但必须先 0。

---

## 五、计划状态跟踪

| 阶段 | 状态 | 备注 |
|------|------|------|
| 0 会话稳定 | ✅ 试点 | 默认无头 `--persistent-profile`；有头仅扫码兜底 |
| 1 证据刷新 | 🔄 进行中 | `--resume` 补采 + `--evidence-only` 刷新字段 |
| 2 弹窗采集 | 🔄 进行中 | `--inspect-only`；已加强 Ant Modal 等待 |
| 3 白皮书提质 | ✅ 完成 | fin-center：§1/§4 证据归纳，§3 每模块 1 张代表截图 |
| 4 写操作验证 | ⬜ 可选 | 业务确认范围后 |
| 5 多系统推广 | ⬜ 待做 | 试点定稿后 |

---

*文档由试点复盘生成，随 `outputs/fin-center` 与脚本变更更新。*
