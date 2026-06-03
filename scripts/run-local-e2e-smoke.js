#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  parseSystemsConfig,
  readOptionalJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  createPipelineState,
  updateNodeStatus,
  writePipelineState,
} = require("./pipeline-state");
const { runReviewDecision } = require("./run-review-decision");

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function buildSmokePendingReview(options = {}) {
  const systemName = options.systemName || "系统";
  const summary = options.evidenceSummary || {};
  const moduleCount = Array.isArray(summary.modules) ? summary.modules.length : 0;
  const functionCount = Array.isArray(summary.functions) ? summary.functions.length : 0;
  return [
    `# ${systemName} 系统功能白皮书`,
    "",
    "## 1. 系统定位",
    `${systemName} 用于验证核心系统白皮书流水线的本地端到端能力。本冒烟稿不作为业务终稿，只用于确认待审稿、审核通过、终稿 Markdown 与 Word 导出链路可以闭环运行。`,
    "",
    "## 2. 功能概览",
    `本轮证据摘要中识别到 ${moduleCount} 个模块、${functionCount} 个功能点。若真实取证尚未覆盖页面，该冒烟稿会保留待确认边界，避免把测试文本误认为正式业务结论。`,
    "",
    "## 3. 核心功能说明",
    "本地冒烟重点不评价业务功能完整性，只验证流水线产物之间的衔接：证据摘要可读取、待审稿可生成、审核决策可落盘、终稿和 Word 可输出。",
    "",
    "## 4. 典型业务流程",
    "典型流程为：读取系统配置与证据摘要 -> 准备待审稿 -> 提交审定节点 -> 审核通过后生成终稿 Markdown -> 同目录导出 Word 文件。该流程覆盖 H5 后续审核动作依赖的核心后端能力。",
    "",
    "## 5. 证据边界",
    "本文件由 M9 本地冒烟自动生成，不代表最终业务白皮书内容。真实交付仍需使用 Cursor Agent 按 narrative-guide 生成待审稿，并经业务审核后确认。",
  ].join("\n");
}

function prepareSmokeOutput(options = {}) {
  const sourceOutput = path.resolve(String(options.sourceOutput));
  const smokeOutput = path.resolve(String(options.smokeOutput));
  fs.mkdirSync(smokeOutput, { recursive: true });

  for (const fileName of [
    "evidence-summary.json",
    "whitepaper.draft.md",
    "quality-report.json",
    "narrative-quality-report.json",
  ]) {
    copyIfExists(path.join(sourceOutput, fileName), path.join(smokeOutput, fileName));
  }

  const summary = readOptionalJsonObject(path.join(smokeOutput, "evidence-summary.json"), {});
  const pendingPath = path.join(smokeOutput, "whitepaper.pending-review.md");
  fs.writeFileSync(
    pendingPath,
    buildSmokePendingReview({
      systemName: options.systemName,
      evidenceSummary: summary,
    }),
    "utf8",
  );
  writeJson(path.join(smokeOutput, "truth-readiness-report.json"), {
    artifactType: "truth-readiness-report",
    version: 1,
    mode: "local-e2e-smoke",
    threshold: 0.95,
    score: 0.99,
    scorePercent: 99,
    canSubmitReview: true,
    canFinalize: true,
    gates: {
      evidence: { pass: true, scorePercent: 100 },
      claims: { pass: true, scorePercent: 100 },
      factCheck: { pass: true, scorePercent: 100 },
      narrative: { pass: true, scorePercent: 100 },
      database: { pass: true, available: false, scorePercent: 0 },
    },
    blockers: [],
    improvementActions: [
      {
        id: "smoke-only",
        message: "Smoke gate validates approval/export plumbing only; it is not business truth evidence.",
        rerunNodes: [],
      },
    ],
    generatedAt: new Date().toISOString(),
  });

  let state = createPipelineState({
    code: options.systemCode,
    name: options.systemName,
  });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "draft",
    "summary",
    "narrative",
    "quality",
  ]) {
    state = updateNodeStatus(state, nodeId, "success");
  }
  writePipelineState(path.join(smokeOutput, "pipeline-state.json"), state);

  return { smokeOutput, pendingPath };
}

function runLocalE2ESmoke(options = {}) {
  const systemCode = options.systemCode || "adp";
  const systemName = options.systemName || "AI保单数据闭环平台";
  const sourceOutput = path.resolve(String(options.sourceOutput));
  const smokeOutput = path.resolve(String(options.smokeOutput));

  prepareSmokeOutput({
    sourceOutput,
    smokeOutput,
    systemCode,
    systemName,
  });

  const decision = runReviewDecision({
    inputDir: smokeOutput,
    status: "approved",
    systemName,
    date: options.date,
  });

  const checks = {
    pendingReview: fs.existsSync(path.join(smokeOutput, "whitepaper.pending-review.md")),
    finalMarkdown: fs.existsSync(path.join(smokeOutput, "whitepaper.final.md")),
    docx: Boolean(decision.docxPath && fs.existsSync(decision.docxPath)),
  };
  const passed = Object.values(checks).every(Boolean);
  const result = {
    status: passed ? "passed" : "failed",
    systemCode,
    systemName,
    sourceOutput,
    smokeOutput,
    finalPath: decision.finalPath,
    docxPath: decision.docxPath,
    checks,
    generatedAt: new Date().toISOString(),
  };
  writeJson(path.join(smokeOutput, "e2e-smoke-report.json"), result);
  return result;
}

function resolveSystemFromConfig(configPath, systemCode) {
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  const system = config.systems.find((item) => item.code === systemCode);
  if (!system) throw new Error(`System not found in config: ${systemCode}`);
  const configDir = path.dirname(path.resolve(configPath));
  const outputRoot = path.resolve(configDir, config.runtime?.outputDir || "outputs");
  return {
    system,
    outputRoot,
    sourceOutput: path.join(outputRoot, system.code),
    smokeOutput: path.join(outputRoot, "_e2e", `${system.code}-smoke`),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || "config/systems.local.yaml";
  const systemCode = args.system || "adp";
  const resolved = resolveSystemFromConfig(configPath, systemCode);
  const result = runLocalE2ESmoke({
    systemCode: resolved.system.code,
    systemName: resolved.system.name,
    sourceOutput: args["source-output"] || resolved.sourceOutput,
    smokeOutput: args["smoke-output"] || resolved.smokeOutput,
    date: args.date,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "passed") process.exit(2);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  buildSmokePendingReview,
  prepareSmokeOutput,
  resolveSystemFromConfig,
  runLocalE2ESmoke,
};
