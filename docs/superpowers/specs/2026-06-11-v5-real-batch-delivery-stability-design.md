# V5 Real Batch Delivery Stability Design

日期：2026-06-11

## 目标

V5 证明 V1-V4 的真相链路可以稳定支撑真实批量运行与交付。由于真实 ADP fresh reset 需要显式授权，本设计先拆成：

- V5.1：本地可验证的批量诊断、dashboard 可见性、repair queue、batch acceptance、delivery readiness 收口。
- V5.2：用户授权后执行 ADP fresh reset 与真实交付验收，只写 ignored outputs 和 checkpoint。

## 范围

V5.1 不新增事实判断规则，不降低 95% 门禁，也不接入 Browser Use、Stagehand、Crawlee。它只把现有 formal gates 的结果稳定暴露到批量交付层：

- `workflow`：operation flow / observed workflow step 缺口。
- `businessProcess`：业务过程模型缺失、过期、伪造、缺少 evidence 或通用性违规。
- `whitepaperPlan`：写作计划缺失、过期、伪造、required item 覆盖不足。
- `goldenEval`：required missing、stale、coverage、critical coverage、overclaim。
- `factCheck`：writable claim 覆盖。

## 设计

### Batch Diagnosis

`scripts/run-whitepaper-batch.js` 的 `buildBatchTruthSummary()` 从 `truth-readiness-report.json` 读取 gates，构造统一的 `truthGateSummary`：

- 每个 gate 暴露 `pass`、`scorePercent`、关键 metrics、failure count。
- `buildSystemDiagnosis()` 根据未通过 gate 生成标准化 gaps，类型固定为 `workflow-evidence`、`business-process`、`whitepaper-plan`、`golden-eval`、`writable-claim-coverage` 等。
- diagnosis summary 增加 `gapTypes` 计数，便于 dashboard 和 repair queue 分组展示。

### Repair Queue

Repair queue 不自动运行 Agent-writing 任务，除非 `allowAgentWriting=true`。队列项新增：

- `gapTypes`：该系统当前阻断类型。
- `primaryGapType`：优先修复类型。
- `actionId`、`nodes`、`quotaImpact` 仍由 truth blockers / improvement actions 决定。

所有需要重写 narrative 或刷新 fact-check 的链路必须保留 `golden-eval`，顺序为：

```text
narrative -> fact-check -> golden-eval -> quality -> truth-readiness
```

无金标配置时 pipeline 的 `golden-eval` 节点会 skip，不阻断非 ADP 系统。

### Dashboard

`scripts/local-dashboard/server.js` 的 truth snapshot 增加 `gateSummary`，直接暴露 flow/process/plan/golden 的关键指标和失败数量。UI/H5 可以从同一 JSON 读取，不需要重新计算 truth。

### Batch Acceptance And Delivery

`scripts/check-batch-acceptance.js` 和 `scripts/check-delivery-readiness.js` 的建议重跑节点统一经过 `withGoldenEvalNode()`：

- 任何包含 `fact-check -> quality -> truth-readiness` 的链路自动插入 `golden-eval`。
- DB-only、review-only、truth-readiness-only 链路不强行插入。

## 安全边界

- 不读取或写入 secrets、cookies、tokens、数据库凭证、私有 URL、原始客户数据。
- DB 仍只允许脚本侧使用脱敏 profile/metadata；模型不直连数据库。
- Golden facts 仍只用于评测，不进入 prompt、`whitepaper-plan.json`、`business-process-model.json` 或白皮书正文。
- ADP 只是试点，所有新增字段必须对财务、人力、内部基础等系统通用。

## 验收

- Synthetic 非 ADP 系统能在 batch diagnosis 中展示 workflow/process/plan/golden 缺口，不出现 ADP 特化假设。
- repair queue 能按 gap type 分类，并对 Agent-writing 项保持 blocked，除非显式允许。
- batch acceptance / delivery readiness 的 narrative/fact-check 修复链包含 `golden-eval`。
- dashboard truth snapshot 暴露 workflow、businessProcess、whitepaperPlan、goldenEval 指标。
- `node scripts/system-whitepaper.test.js`、`npm run test:gate:core`、`npm run test:gate:full` 通过，或报告明确 blocker。
