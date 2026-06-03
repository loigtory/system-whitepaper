#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const {
  buildQualityReport,
  computeEvidenceMetrics,
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function readOperationGuideGate(gatePath) {
  if (!fs.existsSync(gatePath)) return null;
  return readRequiredJsonObject(gatePath, { label: "Operation guide gate" });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.input;

  if (!inputDir) {
    throw new Error("Usage: node scripts/check-quality.js --input outputs/system");
  }

  const evidencePath = path.join(inputDir, "evidence.json");
  const evidence = readRequiredJsonObject(evidencePath, { label: "Evidence file" });

  const metrics = computeEvidenceMetrics(evidence);
  const report = buildQualityReport({
    ...metrics,
    blockedItems: evidence.blockedItems || [],
  });

  const gatePath = path.join(inputDir, "operation-guide-gate.json");
  const guideGate = readOperationGuideGate(gatePath);
  if (guideGate) {
    report.operationGuideGate = guideGate;
    report.canComposeGuide = Boolean(guideGate.canComposeGuide);
    if (!guideGate.canComposeGuide) {
      report.canFinalize = false;
      for (const failure of guideGate.failures || []) {
        report.failures.push(`operation-guide: ${failure}`);
      }
    }
  }

  const output = path.join(inputDir, "quality-report.json");
  writeJson(output, { ...report, counts: metrics.counts });
  console.log(`Quality report written: ${output}`);
  console.log(
    `Coverage: menus ${metrics.counts.visitedMenus}/${metrics.counts.coreMenus}, pages ${metrics.counts.pages}, actions ${metrics.counts.actions}`,
  );
  if (guideGate) {
    console.log(
      `Operation guide gate: readiness=${guideGate.readinessPercent}% canComposeGuide=${guideGate.canComposeGuide}`,
    );
  }

  if (!report.canFinalize) {
    console.error(report.failures.join("\n"));
    process.exit(2);
  }
}

module.exports = {
  readOperationGuideGate,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
