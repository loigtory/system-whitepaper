# System Whitepaper 95%+ Truth Iteration Master Plan

> 版本：2026-06-09
> 状态：总控路线图
> 适用范围：`system-whitepaper-skill` 后续高真实度、自动写稿、证据链与质量门禁改造

## 1. 总目标

本路线图用于统筹后续所有版本改造，目标是在不依赖人工写稿、不接入 Browser Use/Stagehand/Crawlee 的前提下，使用本地 Playwright + AI Provider 成稿，达到：

- 系统真相覆盖率 >= 95%。
- 白皮书真实度 >= 95%。
- 白皮书质量 >= 95%。
- 业务流程、用途、功能总结必须基于证据合理推理，并明确区分 observed、inferred、candidate、pending。
- secrets/db 只允许脚本辅助采集脱敏元数据，不进入 prompt、不进入白皮书、不让模型或 agent 直连数据库。

核心原则：

- 先补证据，再写稿；流程证据为空时不允许靠 prompt 补流程。
- AI Provider 可做语义归纳和写稿，但不能作为最终事实裁判。
- 脚本负责 schema、fingerprint、evidenceRefs、claim 边界、门禁和安全规则。
- ADP 资料只作为 Golden Eval 标准答案，不进入生成输入。
- 每个版本都按“方案 -> 拆分任务 -> 4-agent 并行开发 -> 主 agent 集成审查 -> 测试 -> 验收”执行。

## 2. 总体架构目标态

```text
Playwright UI Evidence
  -> operation-spec / workflow-spec
  -> evidence-summary
  -> function-universe / verified-claims
  -> business-process-model / truth-model
  -> whitepaper-plan
  -> AI narrative
  -> fact-check / narrative gate / truth-readiness
  -> golden eval / batch acceptance / delivery readiness
```

目标态约束：

- `operation-spec.json` 记录模块、页面、动作、表单、容器和 observed operation flows。
- `workflow-spec.json` 只从 observed flows 生成可叙述步骤；planned/candidate 不得写成已验证流程。
- `business-process-model.json` 或后续 `truth-model.json` 只保存有来源的业务对象、状态、模块职责、流程推理和边界。
- `whitepaper-plan.json` 是写稿唯一章节计划，明确每章可写事实、禁止项、待确认项和证据引用。
- `fact-check-report.json` 与 `truth-readiness-report.json` 必须阻断无证据、低覆盖、stale lineage、unsafe DB、manual-only 写稿和流程缺失。

## 3. 版本切分总览

| 版本 | 主题 | 目标 | 优先级 | 预计工期 |
| --- | --- | --- | --- | --- |
| V0 | 执行治理与基线冻结 | 建立版本执行模板、质量基线、4-agent 计划模板 | P0 | 1-2 天 |
| V1 | 流程证据硬门禁 | 无 observed flow/workflow step 时阻断正式写稿和 review | P0 | 3-5 天 |
| V2 | 通用业务过程模型 | 去 ADP 特化，建立通用证据驱动业务对象/流程推理模型 | P0 | 5-8 天 |
| V3 | 白皮书计划层 | 以 whitepaper-plan 控制写稿，不让模型自由组织事实 | P1 | 4-6 天 |
| V4 | 95% 质量与评测闭环 | 提升 claim/process/golden 覆盖门槛并接入验收 | P1 | 4-6 天 |
| V5 | 真实批量运行与交付稳定 | ADP fresh reset + 多系统泛化 + dashboard/repair 收口 | P1/P2 | 5-8 天 |

版本推进规则：

- V0-V2 不追求白皮书漂亮，先确保“证据不足时不能写成真相”。
- V3-V4 再追求白皮书质量、真实度评分和自动修复闭环。
- V5 才做批量真实运行、dashboard 展示和交付体验收口。
- 任何版本都不能降低安全规则、证据 traceability、DB 脱敏或 readiness 阈值来换取通过。

## 4. 通用执行路线

每个版本启动时，主 agent 必须完成：

1. 读取本总控文档和当前版本计划。
2. 检查 `git status --short --branch`，确认未跟用户改动冲突。
3. 更新 `.agents/4-agent-plan.json`，声明 4 个 worker 的 worktree、branch、outputDir、handoffReport、writeScope。
4. 运行 `npm run agent:isolation`；如果创建真实 worktree，先 dry-run `npm run agent:worktrees`，审核后再 `--apply`。
5. 给每个 worker 明确：目标、文件所有权、禁止修改范围、测试命令、handoff 要求、不得回滚他人改动。
6. worker 完成后，主 agent 逐个 review handoff 和 diff，只由主 agent 合并。
7. 合并后按 auto gate 判定 quick/core/full，并补跑目标测试。
8. 验收通过后写 checkpoint，记录版本结论、风险和下一版本建议。

主 agent 固定管理职责：

- 拆任务和维护版本计划。
- 持有共享文件所有权：`package.json`、`SKILL.md`、`scripts/system-whitepaper.test.js`、`.agents/4-agent-plan.json`、总控文档。
- 审查 worker 是否越界修改、是否弱化门禁、是否引入 secrets/private artifacts。
- 统一跑质量门禁和真实运行命令。
- 对“完成、通过、可交付”只基于新鲜验证输出表述。

worker 固定约束：

- 一个 worker 只负责一个独立问题域。
- 必须使用独立 worktree/branch/output/handoff。
- 只能写入分配的 `writeScope`。
- 不允许修改 secrets、真实 `outputs/<system>`、全局 package、总控文档，除非版本计划明确授权。
- handoff 必须包含：完成内容、修改文件、测试命令与结果、未覆盖风险、下一步建议。

## 5. V0 执行治理与基线冻结

### 5.1 方案

V0 不做大功能，只把后续版本执行方式固化，避免并行开发时共享文件冲突和验收口径漂移。产出版本执行模板、4-agent 计划模板、质量基线检查清单和当前 P0 风险 baseline。

### 5.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V0-A 版本模板 | 增加版本计划模板和 checkpoint 模板 | `docs/` | 文档审查 |
| V0-B agent 计划模板 | 重置 `.agents/4-agent-plan.json` 为本轮通用模板 | `.agents/4-agent-plan.json` | `npm run agent:isolation` |
| V0-C gate baseline | 记录当前 auto gate、quick/core/full 触发规则 | `docs/` | `npm run test:gate:auto -- --dry-run` |
| V0-D 风险基线 | 固化当前 P0/P1/P2 backlog | `docs/` | 主 agent review |

### 5.3 4-agent 并行方式

- Agent A：版本模板与 checkpoint 规范。
- Agent B：4-agent plan 模板与 isolation 规则。
- Agent C：质量门禁触发矩阵。
- Agent D：P0/P1/P2 backlog 归档。

V0 可全部只写 docs 和 `.agents/4-agent-plan.json`，主 agent 合并后只需 quick/core 级验证。

### 5.4 验收标准

- 有一份可复用版本计划模板。
- `.agents/4-agent-plan.json` 能通过 `npm run agent:isolation`。
- 明确 V1 的 P0 任务入口。
- 不产生 runtime artifacts、secrets、真实 evidence。

## 6. V1 流程证据硬门禁

### 6.1 方案

把看板中 V1 退出门槛变成代码级阻断：正式白皮书必须有 `containers/page-internal surfaces > 0` 或等价页面内部表面证据、`operation-spec observed flows > 0`、`workflow-spec steps > 0`。缺失时，`narrative`、`review`、`final` 必须 blocked 或降级为非正式调试产物。

### 6.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V1-A workflow gate | `truth-readiness` 增加 observed flow/workflow step blocker | `scripts/check-truth-readiness.js` | targeted truth tests |
| V1-B pipeline wiring | `--with-whitepaper` 默认生成并刷新 `workflow-spec.json` | `scripts/run-whitepaper-pipeline.js`, `scripts/build-workflow-spec.js` | pipeline node tests |
| V1-C collector integration | 加强 inspect surface 合并和 SPA route/frame 恢复 | `scripts/collect-evidence.js` | targeted collector tests |
| V1-D ADP dry/fresh validation | 授权后运行 ADP reset 采集，记录 V1 指标 | ignored `outputs/`, `docs/checkpoints/` | real-run checkpoint |

### 6.3 4-agent 并行方式

- Agent A：`truth-readiness` 流程证据 blocker，写红绿测试。
- Agent B：pipeline 节点 wiring，确保 `workflow-spec` 参与 source lineage。
- Agent C：collector surface integration，不改 readiness。
- Agent D：真实 ADP 验证脚本与 checkpoint，不改生产代码。

主 agent 负责：

- 防止 Agent A/B 同时改同一段 readiness lineage 逻辑。
- 合并前重跑目标测试和 `npm run test:gate:auto -- --dry-run`。
- 真实 ADP 命令只在用户授权后执行。

### 6.4 验收标准

- Fixture 中 `operation-spec.metrics.flowCount=0` 或 `workflow-spec.metrics.stepCount=0` 时，`truth-readiness-report.json canSubmitReview=false`。
- `--with-whitepaper` 链路生成或刷新 `workflow-spec.json`。
- ADP fresh reset 后满足 V1 看板指标，或明确 blocked 原因。
- 不新增 Browser Use/Stagehand/Crawlee。
- 不让 secrets/db/cookies 进入 prompt 或白皮书。

## 7. V2 通用业务过程模型

### 7.1 方案

将当前 ADP 特化的 `business-process-model` 升级为通用业务过程推理模型。默认模型只基于模块名、字段、状态列、操作项、容器步骤、API/network 线索、DB 脱敏实体生成业务对象和流程推理；领域特定词汇必须移入可选 domain profile，不得污染通用路径。

### 7.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V2-A schema + validator | 定义 business-process-model artifact contract | `scripts/check-truth-readiness.js`, `docs/` | schema contract tests |
| V2-B generic extractor | 提取通用 business object/state/responsibility/process rules | `scripts/build-business-process-model.js` | ADP + synthetic fixtures |
| V2-C domain profile | 将 ADP/保司规则移入可选 profile，不作为默认 | `docs/evals/`, optional profile file | negative fixture |
| V2-D recompute lineage | readiness 校验模型可由当前 artifacts 确定性重算 | `scripts/check-truth-readiness.js` | forged model tests |

### 7.3 4-agent 并行方式

- Agent A：artifact contract 和 validator。
- Agent B：通用 extractor。
- Agent C：domain profile 与 ADP compatibility。
- Agent D：forged/stale/negative tests。

主 agent 负责：

- 审查通用模型里不得硬编码 ADP 业务词。
- 控制 `scripts/system-whitepaper.test.js` 合并顺序，避免测试文件冲突。
- 确认每个 inferred process 都有 evidence、reasoning、boundary、confidence cap。

### 7.4 验收标准

- 非 ADP fixture 不出现“保司、AI任务、元数据、发布上线、运行观测”等 ADP 特定词，除非 fixture 自身包含。
- 每个 process step 都有 evidence/source。
- `status=inferred` 的流程不能被写成 observed。
- forged `business-process-model.json` 被 readiness 拦截。
- ADP 现有关键流程仍可作为 inferred/partially-observed 被表达，但边界明确。

## 8. V3 白皮书计划层

### 8.1 方案

新增 `whitepaper-plan.json`，把写稿前可写事实、章节映射、claim 覆盖、流程覆盖、待确认边界、禁止写入项全部结构化。AI Provider 只按 plan 写 `narrative-fragments.md`，不直接自由消费多个原始 artifact。

### 8.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V3-A plan schema | 定义 whitepaper-plan schema 和 validator | new `scripts/build-whitepaper-plan.js`, docs | schema tests |
| V3-B plan builder | 从 verified-claims、business-process-model、workflow-spec 构造章节计划 | `scripts/build-whitepaper-plan.js` | builder tests |
| V3-C phase3b input | phase3b 优先消费 compact whitepaper-plan | `scripts/narrative/phase3b.js` | prompt contract tests |
| V3-D fact/narrative gate | 检查正文必须覆盖 plan required items | `scripts/fact-check-whitepaper.js`, `scripts/check-narrative.js` | missing-plan-item tests |

### 8.3 4-agent 并行方式

- Agent A：plan schema/validator。
- Agent B：plan builder。
- Agent C：phase3b prompt 与 assembly。
- Agent D：fact-check/narrative gate。

主 agent 负责：

- 确保 plan 中 non-writable claim 只能进入 pending/边界，不进入正文 required assertions。
- 确保 prompt 不读取 `evidence.json`、`whitepaper.draft.md`、secrets、截图二进制。
- 合并后跑 prompt 契约和 fact-check 契约测试。

### 8.4 验收标准

- `whitepaper-plan.json` 缺失或 stale 时，正式 narrative blocked。
- 每个 plan required item 未覆盖时，fact-check 或 narrative gate blocked。
- phase3b prompt 内联 plan，不暴露 non-writable claim id。
- 白皮书第 1-4 章以业务对象、模块职责、状态流转、流程边界组织，而不是菜单/按钮堆叠。

## 9. V4 95% 质量与评测闭环

### 9.1 方案

把“95%+”从口号变为可执行指标：writable claim coverage、plan required coverage、workflow/process coverage、golden eval coverage、overclaim count、narrative quality 全部进入 readiness 或版本验收。ADP golden facts 只作为评测标准，不进入生成 prompt。

### 9.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V4-A thresholds | 正式稿 claim/plan/process 覆盖阈值统一到 95% | `scripts/fact-check-whitepaper.js`, `scripts/check-truth-readiness.js` | threshold tests |
| V4-B golden eval integration | ADP 验收接入 `run-golden-eval.js` | `scripts/run-golden-eval.js`, `docs/evals/` | golden tests |
| V4-C overclaim guard | 对 forbidden/contradictory facts 强制 blocker | eval/fact scripts | overclaim fixtures |
| V4-D readiness summary | readiness 输出 95% 分项分数和改进动作 | readiness/batch/delivery scripts | report contract tests |

### 9.3 4-agent 并行方式

- Agent A：阈值与 fact-check。
- Agent B：golden eval。
- Agent C：overclaim/negative fixtures。
- Agent D：readiness/batch/delivery 报告整合。

主 agent 负责：

- 确认 ADP golden facts 不被任何生成节点读取。
- 防止为了 ADP 评测硬编码白皮书生成逻辑。
- 验证 negative fixtures 不误判 covered。

### 9.4 验收标准

- 正式待审稿 writable claim coverage >= 95%。
- plan required item coverage >= 95%。
- ADP golden eval coverage >= 95%，overclaim=0。
- 低覆盖、overclaim、stale eval source 都不能进入 review/final。

## 10. V5 真实批量运行与交付稳定

### 10.1 方案

在 V1-V4 基础上进行真实 ADP fresh reset 和多系统泛化验证，收口 dashboard、batch repair、delivery readiness。V5 重点不是新 truth 逻辑，而是证明真实运行、批量交付、修复闭环稳定。

### 10.2 拆分任务

| 任务 | 目标 | 文件所有权 | 验证 |
| --- | --- | --- | --- |
| V5-A ADP real-run | ADP 从 reset 到 pending-review/final readiness 全链路 | ignored outputs + checkpoint | real-run report |
| V5-B synthetic/generalization | 增加非 ADP 合成系统 fixture | tests/examples | unit tests |
| V5-C dashboard visibility | H5 展示 flow/process/plan/golden 分项 | `scripts/local-dashboard/` | dashboard tests |
| V5-D repair closure | repair queue 支持 process/plan/golden 缺口分类 | repair/batch scripts | repair tests |

### 10.3 4-agent 并行方式

- Agent A：ADP real-run 验证与 checkpoint。
- Agent B：synthetic/negative fixtures。
- Agent C：dashboard 展示。
- Agent D：repair/batch/delivery 闭环。

主 agent 负责：

- 真实 ADP/SIT 运行前确认用户授权、config、auth、DB prerequisites。
- 不提交 ignored outputs、secrets、cookies、真实客户产物。
- 交付前运行 full gate 或明确 blocked 原因。

### 10.4 验收标准

- ADP fresh reset 真实链路产物完整，truth-readiness >= 95。
- delivery readiness `status=ready`。
- dashboard 能展示每系统 flow/process/plan/golden 缺口和建议 rerun nodes。
- repair queue 不自动运行 Agent-writing 任务，除非显式授权。

## 11. 质量门禁策略

默认命令：

- 文档和计划：`npm run test:gate:auto -- --dry-run`，确认 gate 级别。
- 小脚本/单测：targeted `node --test --test-name-pattern "<pattern>" scripts/system-whitepaper.test.js`。
- 低风险 docs/tests：`npm run test:gate:quick`。
- 共享库、模型、schema、package、agent plan：`npm run test:gate:core`。
- collector、pipeline、DB、readiness、delivery、batch、auth、finalization：`npm run test:gate:full`。

如果 full gate 因私有配置、浏览器会话、DB secrets 缺失无法运行，最终报告必须写：

- 阻塞命令。
- 缺失前置条件。
- 未覆盖风险。
- 是否需要真实 ADP/SIT 授权。

## 12. 版本验收报告模板

每个版本完成后，在 `docs/checkpoints/` 写 checkpoint，建议文件名：

```text
YYYY-MM-DD-v<version>-checkpoint.md
```

必须包含：

- 版本目标。
- 分支/提交。
- 完成任务列表。
- worker handoff 汇总。
- 修改文件。
- 验证命令和结果。
- 未验证风险。
- 是否触碰真实环境、DB、secrets、outputs。
- 下一版本建议。

## 13. 当前建议启动顺序

立即启动 V0，然后进入 V1。

V0 的目标是把本总控文档落地为执行制度，不做代码大改。V1 的目标是把“流程证据为空不能正式写稿”变成不可绕过的代码门禁。只有 V1 验收后，才进入 V2 的通用业务过程模型改造。

建议下一步：

1. 创建 `docs/superpowers/plans/2026-06-09-v0-execution-governance.md`。
2. 重写 `.agents/4-agent-plan.json` 为 V0 专用计划。
3. 跑 `npm run agent:isolation` 和 `npm run test:gate:auto -- --dry-run`。
4. V0 checkpoint 完成后启动 V1。
