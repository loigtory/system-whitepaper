# Scripts Interface

第一版 Skill 允许配套 `Playwright + Node.js` 脚本，但脚本必须服从 `SKILL.md`、`safety-rules.md` 和 `evidence-schema.md`。

## 系统清单与输出目录

**推荐用 Excel 维护 `config/systems-registry.xlsx`**，保存后一条命令同步到 `systems.local.yaml`。脚本**直接读 xlsx**，不用手工转 CSV。

| 步骤 | 操作 |
| --- | --- |
| 1 | Excel 打开/编辑 `config/systems-registry.xlsx`（工作表「系统清单」） |
| 2 | `node scripts/sync-systems-registry.js --config config/systems.local.yaml` |
| 3 | 采集时使用 `--system {简称code}` |

也支持 `systems-registry.csv`（扩展名 `.csv` 时走 CSV 解析），便于 diff；**默认优先找 `.xlsx`**。

从现有 YAML **导出 Excel**（首次或迁移）：

```bash
node scripts/sync-systems-registry.js --config config/systems.local.yaml --export
# 默认写出 config/systems-registry.xlsx
```

表格列说明（xlsx / csv 相同）：

| 列 | 含义 |
| --- | --- |
| 启用 | Y/N；N 的行不同步 |
| 简称code | 唯一英文标识 → `outputs/{code}/`、`--system` |
| 系统名称 | 中文全称 → 白皮书文件名 |
| 测试环境URL | 系统欢迎页/入口 |
| 负责部门 / 优先级 | 可选 |
| 环境域名 / 环境IP | IP 白名单门禁；多个 IP 用 `;` 分隔 |
| 允许写操作 / 禁止操作 | 多个动作用 `;` 分隔 |
| 备注 | 仅表格备注，不同步到 YAML |

**菜单 API 路径（`menuApiPath`）不在 Excel 中维护**：首次登录后程序会从网络请求自动识别（如 `getMenuList`），写入 `outputs/{code}/menu-api-path.txt` 与 `menu-list-cache.json`。同步 Excel 时会保留 YAML 里已有的技术字段，不会清空。

可选导出 CSV（便于 git diff）：

```bash
node scripts/sync-systems-registry.js --config config/systems.local.yaml --export --registry config/systems-registry.csv
```

`config/systems.local.yaml`（或 `examples/systems.example.yaml`）中的 **`systems`** 由同步脚本生成。每条记录对应关系：

| code（简称） | name（全称） | 证据包目录 | CLI 参数 |
| --- | --- | --- | --- |
| `pilot` | 财务中台系统 | `outputs/pilot/` | `--system pilot` |
| `contract` | 合同管理系统 | `outputs/contract/` | `--system contract` |

约定：

- **`code`**：小写英文/字母，**唯一**；命令行 `--system`、输出目录 `outputs/{code}/`、Playwright profile 缓存路径均用它。
- **`name`**：中文系统名；白皮书默认文件名 `{name}_系统功能白皮书_{YYYYMMDD}.md`、正文标题用它。
- **同一系统**的 `evidence.json`、`screenshots/`、日志、质量报告、白皮书都在 **`outputs/{code}/`** 下，不会跨目录混放。
- **勿随意改 `code`**：改名等于换目录，旧证据需手动迁移或重新采集。

新增系统时在 CSV 增加一行，执行 sync，再跑采集即可。

## 建议命令

```bash
node scripts/collect-evidence.js --config examples/systems.example.yaml --system contract --init-only
node scripts/collect-evidence.js --config examples/systems.example.yaml --system contract --max-pages 10
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --resume --max-pages 50
# 默认无头（runtime.headless: true）；仅排查登录问题时加 --headed
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --persistent-profile
node scripts/generate-whitepaper.js --input outputs/contract/evidence.json --output outputs/contract/whitepaper.draft.md
node scripts/build-evidence-summary.js --input outputs/contract/evidence.json
node scripts/run-phase3b.js --config config/systems.local.yaml --system contract --provider manual
node scripts/run-phase3b.js --config config/systems.local.yaml --system contract --provider manual --narrative-part overview-flow --review-rerun
node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system contract --nodes draft,summary,narrative --provider manual --reset
node scripts/validate-write.js --system contract --system-output outputs/contract
# 后续无人值守流水线会继续执行：摘要 -> 写稿 -> 质检 -> 审阅
node scripts/check-quality.js --input outputs/contract
node scripts/check-narrative.js --input outputs/contract
node scripts/run-review-decision.js --input outputs/contract --status rejected --comment "系统定位需要更业务化"
node scripts/export-whitepaper-word.js --input outputs/contract/whitepaper.final.md
node scripts/local-dashboard/server.js --config config/systems.local.yaml --port 3920
node scripts/run-local-e2e-smoke.js --config config/systems.local.yaml --system adp --date 2026-05-20
```

## 浑天 Cookie 自动刷新

### 企微快捷登录原理

浑天 SSO 支持**企业微信快捷登录**：本机已登录企业微信客户端，或浏览器 profile 里已有浑天/企微会话时，跳转到 `huntian.hzins.com/login` 后点击 **「继续在浏览器中登录访问」** 即可直接进入，无需扫码。

快捷入口 `a.wwLogin_quick_open_wecom` 多数在 **企微 `login.work.weixin.qq.com/wwlogin` iframe** 内（浑天 login 页嵌入）；脚本在浑天帧与企微 SSO 帧中按 **class + 文案「继续在浏览器中登录访问」** 双匹配查找，不会在 `open.work.weixin.qq.com` 等其它子帧误点。单次查找预算最多 **10 秒**（各帧并行 `waitForSelector`）。点击：`evaluate(el.click)` → 坐标 → `force`。跳回业务系统由浑天 `redirectUrl` 完成。

### 为何 Playwright 持久化 profile 可能只有二维码？

| 现象 | 常见原因 |
|------|----------|
| 日常 Chrome 有「继续在浏览器中登录访问」，脚本只有企微扫码 | Playwright 使用**独立** profile（默认 `secrets/playwright-huntian-profile/`），尚无浑天/企微会话；且自动化浏览器 UA、沙箱、`--no-sandbox` 默认等与日常 Chrome 不一致 |
| 本机 Chrome 在 `chrome://flags` 将 **Local Network Access** 设为 **Disabled** 后可快捷登录 | 企微快捷登录需浏览器探测**本机企微客户端**（本地网络访问）。Chromium 默认会拦截或弹权限，导致只显示二维码 |

脚本已尽量对齐日常 Chrome 行为（仍无法 100% 保证与手工 Chrome 一致）：

| 措施 | 说明 |
|------|------|
| `--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessPermissionPrompt` | 与 Chrome flags 关闭 LNA 检查等效 |
| `context.grantPermissions(['local-network-access'], { origin })` | 对 `huntian.hzins.com`、`venus-fincenter.hzins.com` 预授权 |
| `ignoreDefaultArgs: ['--no-sandbox']` + `chromiumSandbox: true` | 减少 Playwright 默认 `--no-sandbox` 对企微探测的影响 |
| Windows + `AI-Data-Loop` UA | `runtime.useChromeUserAgent: true` 时使用常见 Chrome UA |
| `runtime.browserChannel: chrome` | 使用系统已安装的 Chrome（可选） |
| 等待快捷按钮 | 查找入口/解析链接各最多 **10s**；整段快捷登录仍受 `timeoutMs`（preflight 默认 120s）约束；仅二维码时 `qr-only-wecom-quick-login-unavailable` |

前提：**本机企业微信桌面端已登录**。

可在 `systems.local.yaml` 调整：

```yaml
runtime:
  useChromeUserAgent: true
  browserChannel: chrome          # 可选：系统 Chrome
  persistentProfileDir: ""        # 可选：Playwright 持久 profile；默认 secrets/playwright-huntian-profile
  chromeUserDataDir: ""           # 可选：本机 Chrome User Data 目录（须先完全退出 Chrome）
  chromiumDisableFeatures: ""     # 逗号分隔，追加 disable-features
  chromiumArgs: []
```

命令行可覆盖 profile：

```bash
# 推荐：无头 + 持久 profile（与有头同一套快捷登录逻辑）
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --persistent-profile
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --persistent-profile --persistent-profile-dir "secrets/playwright-huntian-profile"
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --chrome-user-data-dir "C:\Users\你\AppData\Local\Google\Chrome\User Data"
```

### 最少人工：推荐操作顺序（默认无头）

1. **确认企微桌面端已登录**。
2. **写入 / 刷新 profile**（默认无头，勿加 `--headed` 除非要扫码）：
   ```bash
   node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --persistent-profile
   ```
   配置里 `runtime.persistentProfile: true` 时，`collect-evidence.js` 同样默认无头，并在企微 iframe 内自动点快捷登录。
3. **日常采集**（profile 或 cookie 有效时）：
   ```bash
   set REFRESH_COOKIE=skip
   node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --resume
   ```
4. **仅当页面只有二维码、需要人工扫码**时，再加 `--headed` 打开可见窗口扫一次。
5. **与本机 Chrome 完全一致**（可选）：配置 `runtime.chromeUserDataDir` 或 `--chrome-user-data-dir`，**先完全退出 Chrome** 再跑脚本。

### 从本机 Chrome 导出 Cookie（跳过浏览器自动化）

1. 用日常 Chrome 登录浑天并打开目标系统。
2. DevTools → Network → 任选请求 → 右键 **Copy as cURL**。
3. 从 `-b` / `Cookie:` 复制整段，粘贴到 `secrets/huntian-cookie-header.txt`（需含 `JSESSIONID`、`HUNTIANSID`、`token` 等）。
4. 采集时设置 `set REFRESH_COOKIE=skip`，避免覆盖。

### CDP 连接本机 Chrome（高级）

若希望脚本附着**已打开且已登录**的 Chrome（而非 Playwright 启动新实例）：

1. 完全退出 Chrome 后，用调试端口启动（路径按本机调整）：
   ```bat
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data"
   ```
2. 在 Chrome 中手动登录浑天。
3. 另写小脚本或临时用 Playwright `chromium.connectOverCDP('http://127.0.0.1:9222')` 读取 `context.cookies()` 并写入 `secrets/huntian-cookie-header.txt`（本仓库 refresh 脚本默认自启浏览器；CDP 为手动兜底，见上节「导出 Cookie」更简单）。

日志中若出现 `huntian-browser-continue ... skipped` 且 `loginState: qr-only`，请按本节「推荐操作顺序」处理。

### 浏览器模式（默认无头）

| 场景 | 推荐方式 |
|------|----------|
| **日常采集 / 刷新 cookie** | 默认 **无头**（`runtime.headless: true`，勿加 `--headed`） |
| **profile 已有浑天/企微会话** | 无头自动点「继续在浏览器中登录访问」（与有头同一套脚本） |
| **`huntian-cookie-header.txt` 有效、且不用 profile** | 无头 `collect-evidence.js` 注入 cookie |
| **仅二维码、需扫码** | 临时加 `--headed`，扫一次写入 profile |

要点：

- **有头 / 无头不决定有没有快捷登录**；同一 `completeHuntianQuickLogin` 逻辑。差别主要是空 profile 时无头无法人工扫码。
- **持久化 profile**（默认 `secrets/playwright-huntian-profile/`）保存会话；推荐始终 `--persistent-profile`，默认无头刷新与采集。旧的根目录 `.playwright-huntian-profile/` 不再作为默认目录，如需临时复用可显式传 `--persistent-profile-dir .playwright-huntian-profile`。
- **`--headed` 仅作排查**：看页面、扫码、对比 DOM；不要作为日常默认。

### 常用命令

```bash
# 推荐：无头 + 持久 profile
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --persistent-profile

set REFRESH_COOKIE=skip
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --resume

# 已有截图、仅刷新表单/表格/按钮（不重截图）
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --evidence-only --max-pages 30

# 弹窗/抽屉证据（不重菜单主截图；默认每轮最多 500 个待探测菜单页）
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --inspect-only
# 未采到弹窗的页不会从队列移除，最多重试 3 轮；看日志 inspect-only-summary.pendingPages

# 仅扫码或排查登录 UI
node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml --system pilot --headed --persistent-profile
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --headed

# 采集前强制刷新 / 占位符自动刷新
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot --refresh-cookie
```

跳过自动刷新（使用手动 cookie）：

```bash
set REFRESH_COOKIE=skip
node scripts/collect-evidence.js --config config/systems.local.yaml --system pilot
```

刷新成功后写入 `secrets/huntian-cookie-header.txt`（`JSESSIONID; HUNTIANSID; token`），检测到 `token` 时同步 `secrets/huntian-token.txt`。日志只输出 cookie 名称，不打印 secret。

### 页面缩放（pageZoom）

进入系统页面后，脚本会将浏览器缩放至约 60%，以便宽屏后台页面在截图中完整展示。配置项：

```yaml
runtime:
  pageZoom: 0.6          # 推荐：0.6 表示 60%
  # browserZoomPercent: 60  # 等价写法
```

实现顺序：CDP `Emulation.setPageScaleFactor` → `Page.setDeviceMetricsOverride` → CSS `document.documentElement.style.zoom`。持久化 profile 还会通过 `context.addInitScript` 在每次导航时预置缩放。

## collect-evidence.js 职责

- 读取系统清单和本地 token。
- 通过浑天登录接口确认用户信息。
- 打开目标系统测试环境地址。
- 采集首页标题、URL、链接、按钮、表单、代表性截图。
- 按 `--max-pages` 限制遍历同域链接，避免无限爬取。
- 仅访问目标系统同源 HTTP/HTTPS 页面，跳过 `javascript:`、`mailto:`、外域链接。
- 自动尝试展开安全的动态菜单、树菜单、折叠菜单。
- 展开逻辑会跳过删除、提交、审批、发布、覆盖、结算、发送等高影响动作。
- 自动尝试打开安全的检查入口，例如新增、查看详情、高级查询、筛选。
- 弹窗/抽屉采集会记录标题、按钮、表单字段和截图，然后使用 Escape 关闭。
- 弹窗/抽屉检查入口会跳过保存、删除、提交、审批、发布等高影响动作。
- 后续继续扩展 iframe 的深度采集。
- 保存截图、操作日志、测试数据清单和证据包。

### 页面滚动与快照范围

| 能力 | 现状 |
|------|------|
| 整页纵向截图 | `page.screenshot({ fullPage: true })`：按**文档高度**纵向拼接；**截图前不额外滚动**（采集后会 `scrollTo(0,0)` 复位，与视口一致） |
| 页面缩放 | `runtime.pageZoom`（默认 `0.6`）经 CDP/CSS zoom 应用于截图，便于一屏展示更多内容 |
| 结构化字段采集 | `collectPageSnapshot` 在**截图之前**对各可见 `frame` 做**有限步进滚动**（`runtime.evidenceScroll`），合并表单/按钮/表格列；**不为截图而滚动** |
| 横向表格列 | 对 `.ant-table-body`、`.el-table__body-wrapper` 等横向滚动容器左右步进采样，按列名去重合并 |
| 嵌套滚动 | `nestedDepth`（默认 2）内对常见内容区纵向步进；总步数受 `maxTotalSteps` 上限 |
| iframe | 遍历 `page.frames()`，仅 `isFrameVisible` 为真的 frame 参与合并去重 |
| 菜单/按钮点击 | `scrollIntoViewIfNeeded` 仅用于**点击前**滚入视口 |
| 虚拟列表/表格 | 仍仅采集当前 DOM 已渲染节点；未挂载行/列不会出现 |
| 弹窗截图 | 容器检查成功后仍用**整页** `fullPage: true`，非元素级截图 |

配置示例（`config/systems.local.yaml`）：

```yaml
runtime:
  pageZoom: 0.6
  evidenceScroll:
    enabled: true
    maxVerticalSteps: 5
    maxHorizontalSteps: 4
    nestedDepth: 2
```
- 支持断点续跑。
- 未安装 Playwright 时，写入 P0 阻断并返回退出码 2，不伪造成功证据。

安装浏览器采集依赖：

```bash
npm install playwright
npx playwright install chromium
```

## generate-whitepaper.js 职责

- 读取 `evidence.json`，调用 `renderWhitepaper` 生成**底稿** Markdown。
- 无人值守流程中推荐输出：`outputs/{code}/whitepaper.draft.md`。
- **注意**：底稿不是最终白皮书；正式待审核稿由 **成稿 · 写稿** 节点通过 Cursor Agent / LLM 生成 `whitepaper.pending-review.md`。
- 兼容旧模式：未传 `--output` 时仍可按 `{系统名称}_系统功能白皮书_{YYYYMMDD}.md` 推断输出文件名。
- 可用 `--output` 覆盖路径。
- 无证据内容不得写成确定结论；关键截图插入对应功能或流程位置。

## build-evidence-summary.js 职责

- 读取 `evidence.json`，生成 `evidence-summary.json`。
- 摘要面向 **成稿 · 写稿** 节点，压缩模块、功能、字段、截图、弹窗、待确认项和质量指标。
- Agent / LLM 写稿时优先读取 `evidence-summary.json`，不要直接把超大的 `evidence.json` 当主输入。
- 默认输出：`outputs/{code}/evidence-summary.json`；可用 `--output` 覆盖。

## run-phase3b.js 职责

- 执行 **成稿 · 写稿** 节点。
- 读取系统配置，生成 `narrative-brief.md`，并把压缩后的 `evidence-summary` 与 quality 摘要 inline 到 Agent 提示词。
- `cursor-sdk` 默认把 Agent 工作目录限制在 `outputs/{code}/`，避免探索脚本、依赖、完整 `evidence.json`、截图二进制或其他系统产物。
- 同时生成 `whitepaper.skeleton.md`、`phase3b-prompts/overview-flow-prompt.md` 和按模块拆分的 `phase3b-prompts/module-*-prompt.md`；分片输出写入 `narrative-fragments/*.md` 后会自动组装为 `whitepaper.pending-review.md`。
- 支持局部写稿：`--narrative-part overview-flow` 只重写 §1/§2/§4/§5/§6；`--narrative-part function-sections` 重写全部模块分片；`--narrative-part 模块名` 只重写该模块的 §2 模块概览条目和 §3 模块小节；多个模块可用 `,`、`，` 或 `、` 分隔。`cursor-sdk` 会只发送选中的分片 prompt，并用现有 `narrative-fragments.md` 保留未重写章节和其他模块。
- 审核驳回重跑需要应用 `review-decision.json` 时必须传 `--review-rerun`；普通全量写稿默认忽略旧审核意见，避免历史驳回意见污染新一轮生成。
- `--review-rerun` 会读取当前系统目录的 `review-decision.json`，并把 `reviewRerun`、`reviewComment`、`reviewDecision` 摘要写入 `phase3b-usage.json`，用于审计本次重写依据。
- `cursor-sdk` Provider 的密钥读取顺序：
  1. `CURSOR_API_KEY` 环境变量
  2. `secrets/cursor-api-key.txt`（文件内只放一行 key，不写 `CURSOR_API_KEY=`，不加引号）
- Provider：
  - `manual`：生成 `outputs/{code}/phase3b-prompt.md`，供 Cursor IDE 手工执行兜底。
  - `cursor-sdk`：通过 `CURSOR_API_KEY` + `@cursor/sdk` 批量无人值守调用 Agent（依赖后续安装/配置）。
  - `codex`：预留方案，当前代码尚未实现；不要作为日常 Provider 使用。
  - Cursor token 优化方向见 `docs/CURSOR-TOKEN-OPTIMIZATION.md`。
- `manual` Provider 不会伪造 `whitepaper.pending-review.md`；必须由 Agent 写稿后产生。
- `phase3b-usage.json` 的 `promptChars` 表示本次实际发送给 SDK 的 prompt 字符数；`generatedPromptChars` 表示本次生成在磁盘上的主 prompt + 全部分片 prompt 总字符数；`generatedPromptPartCount`、`sentPromptRunCount`、`sentPromptPartCount` 分别记录生成分片数、SDK 发送轮次和实际发送分片数；`sentPromptRuns` 只保存发送目标的轻量摘要，不保存 prompt 正文或本地路径。若未显式传发送计数，`writeUsage()` 会从 `sentPromptRuns` 自动推导。
- H5 写稿消耗卡片会显示运行类型、`narrativePart`、实际发送 prompt、SDK 发送目标、主/分片 prompt 拆分、生成 prompt 总量、生成/发送分片数量、Prompt 节省比例和最近写稿历史，便于核对局部重跑是否真的降本。
- 若本次是审核驳回重写，H5 还会显示审核重写依据、驳回意见摘要、重写范围、目标章节/模块；历史记录会用中文展示 `review-rerun` / `part-rerun` / `full`。
- 兼容旧产物：旧 `phase3b-usage.json` 没有 `reviewRerun` 元数据时，H5 只会在同目录 `review-decision.json` 为 `rejected`、`narrativePart`/目标模块匹配、且写稿时间在决策后 24 小时内时推断为审核重写，并标记“推断”。若 usage 已显式标记 `reviewRerun`，但磁盘 `review-decision.json` 不匹配，H5 不会借用该决策详情，避免旧审核意见污染当前写稿消耗。

## run-whitepaper-pipeline.js 职责

- 串行执行系统白皮书链路节点，并写入 H5 可读取的状态文件。
- 状态文件：
  - 系统级：`outputs/{code}/pipeline-state.json`
  - 批级：`outputs/_batch/run-state.json`
- 支持节点子集执行，例如只跑已实现的成稿节点：

```powershell
node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system adp --nodes draft,summary,narrative --provider manual --reset
```

- `--nodes` 可用逗号指定小步 ID；未选择的小步在 `--reset` 时会标记为 `skipped`，但 `review` 保持 `pending`。
- 单节点默认自动重试 3 次；`narrative` 写稿节点默认 1 次，避免 Cursor token 因自动重试放大；可用 `--retries N` 覆盖。
- `--reset` 表示全新采集：`collect` 节点不会带 `--resume`，会从系统首页开始取证。
- 当前系统间仍为串行；后续 H5 将读取上述 JSON 展示 **准备 / 取证 / 成稿 / 审定** 阶段。

ADP 真实联调记录：

- `adp` 已跑通到 `review-pending`，Cursor SDK `composer-2.5` 写稿成功。
- 侧栏菜单优先从 DOM 树解析（含 `父 > 子` 层级）；API 无数据时自动回退 DOM。
- 验写节点：有计划时 Playwright 执行 **create** 场景（`AI_AUTO_TEST_` + ledger）；无计划或 `--dry-run` 时安全跳过。
- H5 看板展示写稿 Token 消耗与验写结果摘要。

## validate-write.js 职责

- 执行 **取证 · 验写** 的安全前置检查。
- 默认读取：`outputs/{code}/write-validation-plan.json`。
- 默认输出：`outputs/{code}/write-validation-result.json`。
- 没有计划文件时，安全跳过，不执行任何写操作。
- 计划中所有写操作目标必须包含 `AI_AUTO_TEST_`，否则立即报错并阻断。
- 当前版本只完成安全骨架和计划校验，真实浏览器写操作执行会在后续接入。
+ 有计划且传入 `--config` / `--system` 时，会启动 Playwright 尝试执行 **create** 场景（默认最多 3 个）。
+ 仅校验计划、不跑浏览器时加 `--dry-run`。
+ 所有写操作目标必须带 `AI_AUTO_TEST_` 前缀；提交前会再次校验表单内容。

计划示例：

```json
{
  "scenarios": [
    {
      "id": "create-demo",
      "action": "create",
      "targetName": "AI_AUTO_TEST_示例数据"
    }
  ]
}
```

## check-quality.js 职责

- 检查覆盖率。
- 检查写操作安全合规。
- 检查未验证内容是否标注。
- 检查正文结论是否可追溯到证据。
- 输出 `quality-report.json`。

## check-narrative.js 职责

- 检查 `whitepaper.pending-review.md` 是否已具备业务可读稿件的基本结构。
- 重点检查系统定位、典型业务流程、篇幅下限与证据边界提示。
- 输出 `narrative-quality-report.json`。
- 不替代 `check-quality.js`；`quality` 节点会同时执行证据质检与叙事质检。

## run-review-decision.js 职责

- 执行 **审定 · 审阅** 的通过/驳回决策落盘。
- 审核通过：复制 `whitepaper.pending-review.md` 为 `whitepaper.final.md`，并立即生成 Word。
- 审核驳回：必须填写审核意见，并输出建议重跑节点到 `review-decision.json`。
- CLI 推荐使用 `--status approved|rejected`；`--decision` 仅保留为旧调用兼容输入，不会写入 `review-decision.json`。
- `review-decision.json` 字段以脚本 schema 为准：`status`、`comment`、`rerunNodes`、`rewriteScope`、`targetSections`、`targetModules`、`narrativePart`、`instructions`、`decidedAt`。
- H5 会调用该脚本处理“通过 / 驳回 / 重跑”交互；定位/流程类意见会映射到 `overview-flow`，功能描述类意见会优先从 `evidence-summary.json` 识别具体模块并传 `--narrative-part 模块名`，识别不到才回退 `function-sections`；自动驳回重跑会附带 `--review-rerun` 以读取本次审核意见。
- “页面说明/功能描述不准确”、字段/弹窗/表单的业务含义、说明、使用场景缺失，以及流程、角色、权限边界缺口，均按写稿问题处理；命中具体模块时只重跑该模块，未命中且属于系统定位/流程/角色/权限边界时重跑 `overview-flow`。
- 只有“截图/证据/采集缺失、页面/弹窗/字段没采到、未采集、无法打开、没有截图”等明确证据缺口才触发取证刷新，并在补完 `summary` 后重新执行 `narrative` 与 `quality`。

## export-whitepaper-word.js 职责

- 将 `whitepaper.final.md` 导出为同目录 `.docx`。
- 默认文件名：`{系统名称}_系统功能白皮书_{YYYYMMDD}.docx`。
- 导出器使用 Node 内置能力生成最小 Word OOXML 包，不依赖外部 Office 服务。
- 审核通过时由 `run-review-decision.js` 自动调用；也可手工执行：

```bash
node scripts/export-whitepaper-word.js --input outputs/adp/whitepaper.final.md
```

## local-dashboard/server.js 职责

- 启动本地 H5 看板：`http://127.0.0.1:3920`。
- 读取 `outputs/_batch/run-state.json` 和各系统 `pipeline-state.json`。
- 展示 **准备 / 取证 / 成稿 / 审定** 四阶段和两字小步状态。
- 支持单系统“从头再来”“继续执行”“重试当前”“停止当前任务”。
- 支持 **审定 · 审阅**：通过时生成 `whitepaper.final.md`；驳回时必填意见并生成 `review-decision.json`。
- 写稿消耗卡片会读取 `phase3b-usage.json` / `phase3b-usage-history.json`，展示实际发送 prompt、SDK 发送目标、生成/发送分片数量、分片节省比例、参考费用估算，以及审核驳回重写的依据摘要。
- 兼容旧 usage：若历史记录只有 `sentPromptRuns` 而没有发送计数字段，H5 会从发送目标摘要推导发送轮次和分片数。
- 当卡片显示“来源：由旧 usage + review-decision 推断”或历史记录出现“推断”时，表示这是旧产物兼容判断；新版本正常写入的 usage 会显示“来源：usage 元数据”。
- 当前实现为本地轻量页面，不引入数据库或前端框架。

## run-local-e2e-smoke.js 职责

- 执行本地端到端安全冒烟，不触发登录、页面采集或真实写操作。
- 默认读取 `outputs/{code}`，复制必要产物到 `outputs/_e2e/{code}-smoke`。
- 若正式目录尚无 `whitepaper.pending-review.md`，会在隔离目录生成仅用于冒烟的待审稿。
- 在隔离目录执行审核通过，验证 `whitepaper.final.md` 与 `.docx` 均能生成。
- 不修改正式 `outputs/{code}` 的审核状态，避免把冒烟稿误当业务终稿。

## 脚本约束

- 不把 token 写入可交付日志或白皮书。
- 不修改或删除系统已有数据。
- 写操作只允许作用于 `test-data-ledger.json` 中的 `AI_AUTO_TEST_` 数据。
- 质量检查不通过时，不输出最终定稿状态。
