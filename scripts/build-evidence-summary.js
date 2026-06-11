#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  buildEvidenceSummary,
  parseArgs,
  readOptionalJsonObject,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function inferOutput(inputPath, explicitOutput) {
  if (explicitOutput) return path.resolve(String(explicitOutput));
  const dir = inputPath ? path.dirname(path.resolve(String(inputPath))) : process.cwd();
  return path.join(dir, "evidence-summary.json");
}

function operationSpecToSummaryPatch(operationSpec = {}) {
  if (!operationSpec || typeof operationSpec !== "object" || Array.isArray(operationSpec)) return null;
  const modules = Array.isArray(operationSpec.modules) ? operationSpec.modules : [];
  if (!modules.length) return null;
  const summaryModules = modules.map((module) => ({
    name: module.name || "",
    entry: module.entry || module.name || "",
    summary: module.businessHint || "",
  }));
  const summaryFunctions = modules.map((module) => ({
    module: module.name || "",
    name: module.name || "",
    menuPath: module.entry || module.name || "",
    actions: Array.isArray(module.list?.rowActions) ? module.list.rowActions : [],
    queryFields: Array.isArray(module.list?.queryFields) ? module.list.queryFields : [],
    tableColumns: Array.isArray(module.list?.columns) ? module.list.columns : [],
    screenshots: (Array.isArray(module.screenshots) ? module.screenshots : []).map((file) => ({
      id: file,
      file,
      caption: `${module.name || ""} 页面截图`,
    })),
    hasContainerEvidence: Array.isArray(module.flows) && module.flows.length > 0,
  }));
  const screenshots = modules.flatMap((module, moduleIndex) =>
    (Array.isArray(module.screenshots) ? module.screenshots : []).map((file, shotIndex) => ({
      id: `operation-spec-shot-${moduleIndex + 1}-${shotIndex + 1}`,
      file,
      module: module.name || "",
      function: module.name || "",
      caption: `${module.name || ""} 页面截图。`,
    })),
  );
  return {
    modules: summaryModules,
    functions: summaryFunctions,
    screenshots,
    counts: {
      menus: modules.length,
      coreMenus: modules.length,
      visitedMenus: modules.length,
      pages: modules.length,
      actions: modules.reduce((sum, module) => sum + (module.list?.rowActions || []).length, 0),
      tables: modules.filter((module) => (module.list?.columns || []).length > 0).length,
    },
  };
}

function mergeOperationSpecIntoEvidenceSummary(summary = {}, operationSpec = {}) {
  const patch = operationSpecToSummaryPatch(operationSpec);
  if (!patch) return summary;
  const counts = summary.metrics?.counts || {};
  const hasSummarySurface =
    Number(counts.pages || 0) > 0 ||
    (Array.isArray(summary.screenshots) && summary.screenshots.length > 0) ||
    (Array.isArray(summary.functions) && summary.functions.length > 0);
  if (hasSummarySurface) return summary;
  return {
    ...summary,
    system: {
      ...(summary.system || {}),
      code: summary.system?.code || operationSpec.systemCode || "",
      name: summary.system?.name || operationSpec.systemName || "",
      testUrl: summary.system?.testUrl || operationSpec.testUrl || "",
    },
    metrics: {
      ...(summary.metrics || {}),
      counts: {
        ...(summary.metrics?.counts || {}),
        ...patch.counts,
      },
    },
    modules: patch.modules,
    functions: patch.functions,
    screenshots: patch.screenshots,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;

  if (!input) {
    throw new Error(
      "Usage: node scripts/build-evidence-summary.js --input outputs/system/evidence.json [--output outputs/system/evidence-summary.json]",
    );
  }

  const evidence = readRequiredJsonObject(input, { label: "Evidence file" });

  const output = inferOutput(input, args.output);
  const operationSpecPath =
    args["operation-spec"] || path.join(path.dirname(path.resolve(String(input))), "operation-spec.json");
  const operationSpec = readOptionalJsonObject(operationSpecPath);
  const summary = mergeOperationSpecIntoEvidenceSummary(buildEvidenceSummary(evidence), operationSpec);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  writeJson(output, summary);
  console.log(`Evidence summary written: ${output}`);
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
  mergeOperationSpecIntoEvidenceSummary,
  operationSpecToSummaryPatch,
};
