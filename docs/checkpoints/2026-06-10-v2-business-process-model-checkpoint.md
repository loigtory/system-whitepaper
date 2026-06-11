# V2 通用业务流程模型检查点

日期：2026-06-10

## 范围

- 将原先偏 ADP 的默认业务流程推理替换为通用 V2 模型。
- 增加显式 domain profile 支持，并拒绝 secret、URL、连接串等不应进入模型或白皮书的内容。
- 增加 business-process readiness gate，覆盖 V2 契约、来源新鲜度、确定性 content hash、防伪造、步骤证据缺失和默认领域词污染。
- Phase 3B compact prompt 输入保留业务流程模型的 derivation、status、evidence 和 boundary 元数据。
- narrative quality 增加 inferred / partially observed 业务流程边界检查。
- pipeline、batch、smoke、package files 和测试覆盖接入 workflow-spec / business-process 节点。

## 证据与安全

- ADP 仍只作为试点和评估数据。默认 builder 只使用通用类别、角色、状态信号、模块记录、workflow spec、evidence summary 和 verified claims。
- Domain profile 只能作为显式 JSON 输入；`profileId` 不会被当作允许默认领域词的证据来源。
- secrets、cookies、tokens、私有 URL、原始数据库连接信息、原始数据库样本会被拒绝或排除在 prompt / 白皮书面向产物之外。
- 数据库元数据保持可选且只在脚本侧使用；除非系统配置显式要求数据库证据，缺少 DB profile 不阻断 truth readiness。

## Review 后修复

- 将 pipeline state 中的 `business-process` 调整到 `build-spec` 和 `workflow-spec` 之后，保证看板/current-node 顺序与真实证据依赖链一致。
- readiness blocker 支持同时返回多个业务流程阻断项，避免 forged content 掩盖 default-domain vocabulary leakage。
- 增加回归测试：domain profile id 包含 ADP 词也不能让无证据支持的 ADP 词通过。

## 验证

- `node scripts/system-whitepaper.test.js`：412 通过，0 失败。
- `npm run test:gate:core`：通过。
- `npm run test:gate:full`：通过。
- Full gate 摘要：
  - `pack:check`: entryCount 70.
  - `agent:isolation`: `.agents/4-agent-plan.json` 通过。
  - `truth:readiness`: 100%, `canSubmitReview=true`.
  - `batch:acceptance`: `status=accepted`, `accepted=1/1`, `minTruth=100%`.
  - `delivery:check`: `status=ready`, `ready=1/1`, `smoke=0`.
  - `real:check`: `status=in-progress`, `canStart=true`, `canDeliver=false`.

## 剩余风险

- 当前 real-run 状态还不是最终交付：`real:check` 报告 `canDeliver=false`，但允许继续执行。
- 通用推理规则是确定性的、偏保守的；V3 仍应增加财务、人力、内部基础系统等 golden fixtures，强化跨域行为。
- Domain profile 当前只支持标签映射。更成熟的流程模板仍应保持 opt-in，并且不能改变 observed / inferred 边界。
