#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, readOptionalJsonObject, writeJson } = require("./system-whitepaper-lib");
const { runBatchAcceptance } = require("./check-batch-acceptance");
const { findStaleReadinessSources } = require("./check-truth-readiness");

const DEFAULT_TARGET_TRUTH_SCORE_PERCENT = 95;
const REQUIRED_REAL_NODES = [
  "collect",
  "truth-universe",
  "truth-claims",
  "build-spec",
  "compose-guide",
  "draft",
  "summary",
  "narrative",
  "fact-check",
  "quality",
  "truth-readiness",
];
const DB_REQUIRED_NODES = ["db-profile", "db-model"];
const OPTIONAL_OR_SKIPPABLE_NODES = ["sync", "session", "inspect", "validate-write"];

function nowIso(value) {
  return value || new Date().toISOString();
}

function mdCell(value) {
  return String(value === undefined || value === null || value === "" ? "-" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function percentFromReport(report = {}) {
  if (Number.isFinite(Number(report.scorePercent))) return Number(report.scorePercent);
  if (Number.isFinite(Number(report.score))) return Math.round(Number(report.score) * 1000) / 10;
  return 0;
}

function blocker(id, message, extra = {}) {
  return {
    id,
    severity: extra.severity || "P0",
    systemCode: extra.systemCode || "",
    message,
    rerunNodes: Array.isArray(extra.rerunNodes) ? extra.rerunNodes : [],
  };
}

function warning(id, message, extra = {}) {
  return {
    id,
    systemCode: extra.systemCode || "",
    message,
  };
}

function outputPathHasE2eSegment(outputDir) {
  return path
    .resolve(String(outputDir || ""))
    .split(/[\\/]+/)
    .some((part) => part.toLowerCase() === "_e2e");
}

function truthReportLooksLikeSmoke(report = {}) {
  const mode = String(report.mode || "").toLowerCase();
  if (mode.includes("smoke") || mode.includes("local-e2e")) return true;
  return (Array.isArray(report.improvementActions) ? report.improvementActions : []).some((item) =>
    /smoke/i.test(`${item.id || ""} ${item.message || ""}`),
  );
}

function markdownLooksLikeSmoke(markdown = "") {
  const text = String(markdown || "");
  if (/local-e2e-smoke|smoke gate|smoke artifact/i.test(text)) return true;
  if (text.includes("\u672c\u5730\u5192\u70df") || text.includes("\u5192\u70df")) return true;
  if (text.includes("\u4e0d\u4ee3\u8868\u6700\u7ec8\u4e1a\u52a1\u767d\u76ae\u4e66")) return true;
  return /local-e2e-smoke|smoke gate|本地冒烟|不代表最终业务白皮书|不代表最终业务白皮书内容/i.test(
    String(markdown || ""),
  );
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function nodeStatus(state = {}, nodeId) {
  return state.nodes?.[nodeId]?.status || "missing";
}

function nodeIsComplete(state, nodeId, options = {}) {
  const status = nodeStatus(state, nodeId);
  if (status === "success") return true;
  return options.allowSkipped && status === "skipped";
}

function buildNodeStatusSummary(state = {}, databaseProfileConfigured = false) {
  const ids = [
    ...OPTIONAL_OR_SKIPPABLE_NODES,
    ...(databaseProfileConfigured ? DB_REQUIRED_NODES : []),
    ...REQUIRED_REAL_NODES,
  ];
  return Object.fromEntries(ids.map((nodeId) => [nodeId, nodeStatus(state, nodeId)]));
}

function collectNodeBlockers(state, systemReport = {}) {
  const blockers = [];
  const code = systemReport.code || "";
  for (const nodeId of REQUIRED_REAL_NODES) {
    if (!nodeIsComplete(state, nodeId)) {
      blockers.push(
        blocker(
          "delivery.node-not-success",
          `Required real pipeline node ${nodeId} is ${nodeStatus(state, nodeId)}.`,
          { systemCode: code, rerunNodes: [nodeId] },
        ),
      );
    }
  }
  for (const nodeId of OPTIONAL_OR_SKIPPABLE_NODES) {
    if (!nodeIsComplete(state, nodeId, { allowSkipped: true })) {
      blockers.push(
        blocker(
          "delivery.node-not-complete",
          `Pipeline node ${nodeId} is ${nodeStatus(state, nodeId)}; expected success or skipped.`,
          { systemCode: code, rerunNodes: [nodeId] },
        ),
      );
    }
  }
  if (systemReport.databaseProfileConfigured) {
    for (const nodeId of DB_REQUIRED_NODES) {
      if (!nodeIsComplete(state, nodeId)) {
        blockers.push(
          blocker(
            "delivery.database-node-not-success",
            `Database evidence is configured but node ${nodeId} is ${nodeStatus(state, nodeId)}.`,
            { systemCode: code, rerunNodes: [nodeId] },
          ),
        );
      }
    }
  }
  return blockers;
}

function buildSystemDeliveryReadiness(systemReport = {}, context = {}, options = {}) {
  const code = String(systemReport.code || "").trim();
  const outputDir = path.join(context.outputRoot || "", code);
  const state = readOptionalJsonObject(path.join(outputDir, "pipeline-state.json"));
  const truth = readOptionalJsonObject(path.join(outputDir, "truth-readiness-report.json"));
  const pendingPath = path.join(outputDir, "whitepaper.pending-review.md");
  const finalPath = path.join(outputDir, "whitepaper.final.md");
  const pendingReviewExists = fileExists(pendingPath);
  const finalExists = fileExists(finalPath);
  const whitepaperExists = pendingReviewExists || finalExists;
  const pendingMarkdown = readTextIfExists(pendingPath);
  const finalMarkdown = readTextIfExists(finalPath);
  const targetTruthScorePercent = Number(
    options.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT,
  );
  const blockers = [];
  const warnings = [];
  let staleSources = [];

  if (!systemReport.accepted) {
    blockers.push(
      blocker("delivery.acceptance-system-blocked", "Batch acceptance did not accept this system.", {
        systemCode: code,
        rerunNodes: ["truth-readiness"],
      }),
    );
  }
  if (outputPathHasE2eSegment(outputDir)) {
    blockers.push(
      blocker("delivery.output-under-e2e", "System output is under an _e2e smoke directory, not a real delivery output.", {
        systemCode: code,
      }),
    );
  }
  if (!state) {
    blockers.push(
      blocker("delivery.pipeline-state-missing", "pipeline-state.json is missing or malformed.", {
        systemCode: code,
      }),
    );
  } else {
    blockers.push(...collectNodeBlockers(state, systemReport));
    if (!["review-pending", "finalized"].includes(String(state.overallStatus || ""))) {
      warnings.push(
        warning(
          "delivery.pipeline-status-not-terminal",
          `Pipeline overallStatus is ${state.overallStatus || "unknown"}; expected review-pending or finalized.`,
          { systemCode: code },
        ),
      );
    }
  }
  if (!truth) {
    blockers.push(
      blocker("delivery.truth-readiness-missing", "truth-readiness-report.json is missing or malformed.", {
        systemCode: code,
        rerunNodes: ["truth-readiness"],
      }),
    );
  } else {
    const scorePercent = percentFromReport(truth);
    staleSources = findStaleReadinessSources(outputDir, truth);
    if (truthReportLooksLikeSmoke(truth)) {
      blockers.push(
        blocker("delivery.smoke-truth-report", "truth-readiness-report.json is marked as local smoke evidence.", {
          systemCode: code,
        }),
      );
    }
    if (!truth.canSubmitReview || scorePercent < targetTruthScorePercent) {
      blockers.push(
        blocker(
          "delivery.truth-not-ready",
          `Truth readiness is not delivery-ready: canSubmitReview=${Boolean(truth.canSubmitReview)}, score=${scorePercent}%.`,
          { systemCode: code, rerunNodes: ["truth-readiness"] },
        ),
      );
    }
    if (staleSources.length) {
      blockers.push(
        blocker("delivery.truth-readiness-stale-sources", "truth-readiness source fingerprints are stale.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
  }
  if (markdownLooksLikeSmoke(pendingMarkdown)) {
    blockers.push(
      blocker("delivery.smoke-whitepaper", "Pending-review whitepaper contains local smoke wording.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (markdownLooksLikeSmoke(finalMarkdown)) {
    blockers.push(
      blocker("delivery.smoke-whitepaper", "Final whitepaper contains local smoke wording.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (!whitepaperExists) {
    blockers.push(
      blocker("delivery.whitepaper-missing", "No pending-review or final whitepaper Markdown exists.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }

  return {
    code,
    name: systemReport.name || "",
    status: blockers.length ? "blocked" : "ready",
    ready: blockers.length === 0,
    accepted: Boolean(systemReport.accepted),
    scorePercent: truth ? percentFromReport(truth) : 0,
    canSubmitReview: Boolean(truth?.canSubmitReview),
    whitepaperExists,
    pendingReviewExists,
    finalExists,
    databaseProfileConfigured: Boolean(systemReport.databaseProfileConfigured),
    databaseEvidenceAvailable: Boolean(systemReport.databaseEvidenceAvailable),
    pipelineStatus: state?.overallStatus || "",
    nodeStatus: state ? buildNodeStatusSummary(state, Boolean(systemReport.databaseProfileConfigured)) : {},
    staleSourceCount: staleSources.length,
    staleSources: staleSources.slice(0, 12),
    smokeEvidence:
      Boolean(truth && truthReportLooksLikeSmoke(truth)) ||
      markdownLooksLikeSmoke(pendingMarkdown) ||
      markdownLooksLikeSmoke(finalMarkdown),
    blockers,
    warnings,
  };
}

function summarizeSystems(systems = []) {
  return {
    total: systems.length,
    ready: systems.filter((item) => item.ready).length,
    blocked: systems.filter((item) => !item.ready).length,
    accepted: systems.filter((item) => item.accepted).length,
    smokeEvidence: systems.filter((item) => item.smokeEvidence).length,
    whitepapers: systems.filter((item) => item.whitepaperExists).length,
    staleSystems: systems.filter((item) => Number(item.staleSourceCount || 0) > 0).length,
    databaseBacked: systems.filter((item) => item.databaseEvidenceAvailable).length,
    databaseConfigured: systems.filter((item) => item.databaseProfileConfigured).length,
  };
}

function buildDeliveryReadinessReport(input = {}) {
  const acceptanceReport = input.acceptanceReport || {};
  const context = {
    configPath: acceptanceReport.configPath || input.configPath || "",
    outputRoot: acceptanceReport.outputRoot || input.outputRoot || "",
  };
  const targetTruthScorePercent = Number(
    input.targetTruthScorePercent || acceptanceReport.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT,
  );
  const systems = (Array.isArray(acceptanceReport.systems) ? acceptanceReport.systems : []).map((system) =>
    buildSystemDeliveryReadiness(system, context, { targetTruthScorePercent }),
  );
  const blockers = systems.flatMap((system) => system.blockers);
  const warnings = systems.flatMap((system) => system.warnings);
  if (acceptanceReport.status !== "accepted" || !acceptanceReport.canSubmitAll) {
    blockers.unshift(
      blocker(
        "delivery.acceptance-not-accepted",
        "Batch acceptance is not accepted; delivery readiness cannot pass.",
      ),
    );
  }
  const summary = summarizeSystems(systems);
  const ready =
    blockers.length === 0 &&
    acceptanceReport.status === "accepted" &&
    acceptanceReport.canSubmitAll === true &&
    summary.ready === summary.total &&
    summary.total > 0;
  return {
    artifactType: "delivery-readiness-report",
    version: 1,
    generatedAt: nowIso(input.now),
    status: ready ? "ready" : "blocked",
    canDeliver: ready,
    targetTruthScorePercent,
    acceptance: {
      status: acceptanceReport.status || "",
      canSubmitAll: Boolean(acceptanceReport.canSubmitAll),
      generatedAt: acceptanceReport.generatedAt || "",
      summary: acceptanceReport.summary || {},
    },
    configPath: context.configPath,
    outputRoot: context.outputRoot,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    systems,
    blockers,
    warnings,
  };
}

function renderDeliveryReadinessMarkdown(report = {}) {
  const summary = report.summary || {};
  const rows = (report.systems || []).map((item) =>
    [
      mdCell(item.code),
      mdCell(item.status),
      mdCell(`${item.scorePercent}%`),
      mdCell(item.accepted ? "yes" : "no"),
      mdCell(item.pipelineStatus || "-"),
      mdCell(item.databaseEvidenceAvailable ? "yes" : "no"),
      mdCell(item.smokeEvidence ? "yes" : "no"),
      mdCell(item.blockers?.map((blockerItem) => blockerItem.id).join(", ") || "-"),
    ].join(" | "),
  );
  const blockerRows = (report.blockers || []).map((item) =>
    [mdCell(item.severity), mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  return [
    "# Delivery Readiness Report",
    "",
    `- Generated: ${report.generatedAt || ""}`,
    `- Status: ${report.status || ""}`,
    `- Can deliver: ${report.canDeliver ? "yes" : "no"}`,
    `- Target truth score: ${report.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT}%`,
    `- Systems ready: ${summary.ready || 0}/${summary.total || 0}`,
    `- Smoke evidence: ${summary.smokeEvidence || 0}`,
    `- Database-backed systems: ${summary.databaseBacked || 0}/${summary.total || 0}`,
    `- Acceptance status: ${report.acceptance?.status || "-"}`,
    "",
    "## Systems",
    "",
    "| System | Status | Truth | Accepted | Pipeline | DB evidence | Smoke | Blockers |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - | - | - | - | - |",
    "",
    "## Blockers",
    "",
    "| Severity | System | ID | Message |",
    "| --- | --- | --- | --- |",
    blockerRows.length ? blockerRows.join("\n") : "| - | - | - | - |",
    "",
  ].join("\n");
}

function writeDeliveryReadinessReport(outputRoot, report) {
  const batchDir = path.join(outputRoot, "_batch");
  const jsonPath = path.join(batchDir, "delivery-readiness-report.json");
  const markdownPath = path.join(batchDir, "delivery-readiness-report.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, renderDeliveryReadinessMarkdown(report), "utf8");
  return {
    jsonPath,
    markdownPath,
    artifacts: {
      deliveryReadinessJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      deliveryReadinessMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function buildDeliveryReadinessStateSummary(report = {}, artifacts = {}) {
  return {
    status: report.status || "",
    canDeliver: Boolean(report.canDeliver),
    summary: report.summary || {},
    acceptance: report.acceptance || {},
    artifacts: artifacts.artifacts || artifacts || {},
    generatedAt: report.generatedAt || "",
  };
}

function runDeliveryReadiness(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const acceptanceResult =
    options.acceptanceResult ||
    (options.acceptanceReport
      ? { report: options.acceptanceReport }
      : runBatchAcceptance({
          ...options,
          args,
        }));
  const acceptanceReport = acceptanceResult.report || {};
  const report = buildDeliveryReadinessReport({
    ...options,
    acceptanceReport,
    targetTruthScorePercent: options.targetTruthScorePercent || args.threshold,
  });
  const artifacts = writeDeliveryReadinessReport(acceptanceReport.outputRoot || options.outputRoot, report);
  return {
    report,
    artifacts,
    state: buildDeliveryReadinessStateSummary(report, artifacts),
  };
}

function runDeliveryReadinessCheck(options = {}) {
  return runDeliveryReadiness(options);
}

function main() {
  const { report } = runDeliveryReadinessCheck();
  console.log(
    `Delivery readiness: status=${report.status}, ready=${report.summary.ready}/${report.summary.total}, smoke=${report.summary.smokeEvidence}`,
  );
  if (report.status !== "ready") {
    console.error(report.blockers.map((item) => `${item.id}: ${item.message}`).join("\n"));
    process.exit(2);
  }
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
  buildDeliveryReadinessReport,
  buildDeliveryReadinessStateSummary,
  buildSystemDeliveryReadiness,
  renderDeliveryReadinessMarkdown,
  runDeliveryReadiness,
  runDeliveryReadinessCheck,
  truthReportLooksLikeSmoke,
  writeDeliveryReadinessReport,
};
