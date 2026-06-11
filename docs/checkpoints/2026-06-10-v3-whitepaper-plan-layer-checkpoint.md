# V3 白皮书写作计划层检查点

日期：2026-06-10

## 范围

- 新增确定性 `whitepaper-plan.json`，作为 AI 写稿前的证据约束合同。
- Phase 3B prompt 将 `whitepaper-plan` 放在 `business-process-model` 等原始派生产物之前，作为首要写作依据。
- fact-check / narrative / truth-readiness 增加 plan requiredItems 覆盖率校验，正式 review 要求覆盖率不低于 95%。
- truth-readiness 增加 `whitepaperPlan` gate，阻断缺失、格式错误、来源过期、确定性重算不一致、覆盖不足的写作计划。
- pipeline / batch / dashboard / review-rerun 链路接入 `whitepaper-plan` 节点，避免证据刷新或业务流程重建后沿用旧写作计划。
- package files 增加 `scripts/build-whitepaper-plan.js`。

## 关键设计

- `whitepaper-plan.json` 只从当前 artifacts 派生：`verified-claims.json`、`business-process-model.json`、`workflow-spec.json`、`operation-spec.json`、`evidence-summary.json`。
- writable verified claims、模块责任、业务流程、观测 workflow steps 进入 required / allowed 写作约束。
- 非 writable / weak claims 只进入 pendingItems，不能被当作正文事实。
- Builder 和 validators 拒绝 secret、token、cookie、连接串、URL 等不应进入 prompt 或白皮书的内容。
- ADP 仍只是试点；plan builder 不内置 ADP 专有业务词，后续财务、人力、内部基础等系统共用同一证据契约。

## 本次修复

- 新增 `scripts/build-whitepaper-plan.js` 及测试。
- `scripts/narrative/phase3b.js` 支持加载、压缩并注入写作计划。
- `scripts/fact-check-whitepaper.js` 增加 plan coverage 指标与来源指纹。
- `scripts/check-narrative.js` 增加 plan requiredItems 覆盖校验和 sourceArtifacts。
- `scripts/check-truth-readiness.js` 增加 workflow / businessProcess / whitepaperPlan formal gates 的组合校验。
- `scripts/run-whitepaper-pipeline.js`、`scripts/run-whitepaper-batch.js`、`scripts/pipeline-state.js`、`scripts/run-local-e2e-smoke.js` 接入 `whitepaper-plan`。
- `scripts/run-review-decision.js` 在证据刷新或业务流程重建后补跑 `whitepaper-plan`，保证返工写稿不使用旧计划。

## 验证

- `node --test --test-name-pattern "reconcilePipelineStateFromArtifacts clears|dashboard snapshot summarizes|dashboard snapshot regenerates missing docx|dashboard snapshot marks manual review|whitepaper batch runner selects|pipeline default node list|truth readiness rejects stale narrative source fingerprints|truth readiness requires real database profile|review decision requires rejection|review decision still refreshes evidence|routeRequest accepts review rejection" scripts/system-whitepaper.test.js`：12 通过，0 失败，407 跳过。
- `node scripts/system-whitepaper.test.js`：419 通过，0 失败。
- `npm run pack:check`：通过，entryCount 71。
- `npm run test:gate:core`：通过。
- `npm run truth:readiness`：通过，98.9%，`canSubmitReview=true`。
- `npm run test:gate:full`：通过。

Full gate 摘要：

- `agent:isolation`：`.agents/4-agent-plan.json` 通过，workers 4/4。
- `truth:readiness`：98.9%，`canSubmitReview=true`。
- `batch:acceptance`：`status=accepted`，`accepted=1/1`，`minTruth=98.9%`。
- `delivery:check`：`status=ready`，`ready=1/1`，`smoke=0`。
- `real:check`：`status=in-progress`，`canStart=true`，`canDeliver=false`。

## 本地 ignored 产物

- 为跑通 `test:gate:full`，已刷新本地 `outputs/adp/whitepaper-plan.json`、`fact-check-report.json`、`narrative-quality-report.json`、`truth-readiness-report.json`。
- `outputs/` 在 `.gitignore` 中，不进入版本控制。
- 未写入 secrets、cookies、tokens、数据库连接串、私有 URL 或原始数据库样本。

## 剩余风险

- `real:check` 仍显示 `canDeliver=false`，说明真实运行交付状态尚未最终闭环，但当前可继续执行。
- V3 只完成写稿约束层。后续 V4 应补多系统 golden fixtures，覆盖财务、人力、内部基础等非 ADP 场景。
- 计划覆盖率目前依赖 requiredItems 的 terms/claim markers 匹配，后续可增加语义级 claim-to-section 对齐，但不能降低 95% formal gate。
