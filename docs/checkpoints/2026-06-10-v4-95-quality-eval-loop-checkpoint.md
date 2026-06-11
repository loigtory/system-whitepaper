# V4 95% 质量评测闭环检查点

日期：2026-06-10

## 范围

- 新增 Golden Eval 作为 formal gate：系统配置金标事实后必须生成并通过 `golden-eval-report.json`，否则 truth readiness 不允许进入正式 review。
- 未配置金标事实的系统保持可运行：`golden-eval` pipeline 节点会 skip，truth readiness 将其记录为 optional / unavailable，不阻断通用系统。
- pipeline / batch / dashboard / review-rerun 链路接入 `golden-eval`，顺序固定为 `fact-check -> golden-eval -> quality -> truth-readiness`。
- dashboard 从 truth readiness 摘要暴露 Golden Eval 指标：required、available、pass、coverageRatio、criticalCoverageRatio、overclaimCount、scorePercent。
- 自动 repair / blocker rerunNodes 统一补入 `golden-eval`，避免重写叙事或 fact-check 后绕过金标评测。

## 关键设计

- Golden Eval 是评估层，不是写稿层。金标事实只给 `scripts/run-golden-eval.js` 和 readiness gate 使用，不进入 Phase 3B prompt、不进入 `whitepaper-plan.json`、不进入 `business-process-model.json`。
- 金标事实路径通过系统配置或 CLI 显式提供，例如 `goldenFactsPath` / `goldenEval.factsPath` / `--golden`。ADP 只是试点，财务、人力、内部基础等系统共用同一可选配置模型。
- `check-truth-readiness.js` 校验 `golden-eval-report.json` 的 artifact contract、source fingerprints、覆盖率、P0 覆盖率和 overclaim；配置 required 时缺失即 P0 blocker。
- Golden Eval 分数只在 required 或已有报告时进入总分；未配置系统不会因为缺少金标样本被降分。
- `withGoldenEvalNode()` 统一修复链路，确保自动派生的 `fact-check -> quality -> truth-readiness` 链会插入 Golden Eval。
- secrets / db / browser auth 仍只允许脚本侧辅助采集元数据；本次没有让模型直连数据库，也没有把数据库连接、cookies、tokens、私有 URL 写入 prompt、白皮书或 checkpoint。

## 本次修复

- `scripts/check-truth-readiness.js`：增加 `goldenEval` gate、过期来源检查、coverage / critical coverage / overclaim blockers、required 配置、score integration、artifact contract 兼容校验。
- `scripts/run-whitepaper-pipeline.js`：新增可跳过的 `golden-eval` 节点；配置金标事实时执行 `scripts/run-golden-eval.js`，并在 truth readiness 中启用 `--require-golden-eval`。
- `scripts/pipeline-state.js`：注册 `golden-eval` 节点与 artifact，reconcile 时支持 optional skipped 与 truth-readiness 依赖顺序。
- `scripts/run-review-decision.js`、`scripts/run-whitepaper-batch.js`：返工链路和批量全量节点接入 `golden-eval`。
- `scripts/local-dashboard/server.js`：truth readiness snapshot 输出 Golden Eval 指标。
- `scripts/system-whitepaper.test.js`：补充 Golden Eval optional / required missing / stale / overclaim / pipeline / dashboard / repair-chain 回归测试。

## 验证

- `node --test --test-name-pattern "golden eval.*readiness|pipeline golden-eval|pipeline default node list|dashboard snapshot exposes golden" scripts/system-whitepaper.test.js`：8 通过，0 失败，418 跳过。
- `node --test --test-name-pattern "dashboard rejected evidence refresh auto reruns evidence then full narrative|pipeline maps missing writable claims to scoped coverage repair narrative part|truth readiness rejects stale fact check source fingerprints" scripts/system-whitepaper.test.js`：3 通过，0 失败，423 跳过。
- `node scripts/system-whitepaper.test.js`：426 通过，0 失败。
- `npm run pack:check`：通过，entryCount 71。
- `npm run test:gate:core`：通过。
- `npm run test:gate:full`：通过。

Full gate 摘要：

- `agent:isolation`：`.agents/4-agent-plan.json` 通过，workers 4/4。
- `truth:readiness`：98.9%，`canSubmitReview=true`。
- `batch:acceptance`：`status=accepted`，`accepted=1/1`，`minTruth=98.9%`。
- `delivery:check`：`status=ready`，`ready=1/1`，`smoke=0`。
- `real:check`：`status=in-progress`，`canStart=true`，`canDeliver=false`。

## 本地 ignored 产物

- 门禁运行刷新了本地 ignored `outputs/adp/truth-readiness-report.json` 等运行产物。
- `.tmp/` 中保留本次测试日志：`v4-golden-targeted.log`、`system-whitepaper-full.log`、`pack-check.log`、`test-gate-core.log`、`test-gate-full.log`。
- 未提交或生成 secrets、cookies、tokens、数据库连接串、私有 URL、真实客户数据或原始数据库样本。

## 剩余风险

- 当前没有为 ADP 造假的金标事实样本；真实系统需要由业务方或已有验收材料配置 golden facts 后才能启用 hard Golden Eval gate。
- `real:check` 仍为 `canDeliver=false`，代表真实运行交付闭环未最终完成，但代码质量门禁已通过。
- 后续应补多系统 golden fixtures，覆盖财务、人力、内部基础等非 ADP 场景，验证通用配置和领域无关 overclaim 检测。
