#!/usr/bin/env node

const path = require("node:path");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
  normalizeUiText,
  isEnvironmentSwitcherMenu,
} = require("./system-whitepaper-lib");

function loadEvidence(inputPath) {
  return readRequiredJsonObject(inputPath, { label: "Evidence" });
}

function buildScenariosFromEvidence(evidence, options = {}) {
  const prefix = options.testDataPrefix || "AI_AUTO_TEST_";
  const pages = Array.isArray(evidence?.pageInventory) ? evidence.pageInventory : [];
  const pageIds = new Set(pages.map((item) => item.id).filter(Boolean));
  const pagePaths = new Set(
    pages.map((item) => normalizeUiText(String(item.menuPath || ""))).filter(Boolean),
  );
  const actions = Array.isArray(evidence?.actionInventory) ? evidence.actionInventory : [];
  const scenarios = [];
  const seen = new Set();

  for (const action of actions) {
    if (action.type !== "create" || action.risk === "high") continue;
    if (action.pageId && !pageIds.has(action.pageId)) continue;
    const buttonText = normalizeUiText(String(action.name || "").split("\n")[0]);
    if (!buttonText || !/新增|新建|创建/.test(buttonText)) continue;
    const page = pages.find((item) => item.id === action.pageId);
    const menuPath = normalizeUiText(page?.menuPath || "");
    if (!menuPath || seen.has(menuPath)) continue;
    if (!pagePaths.has(menuPath)) continue;
    seen.add(menuPath);
    const safeId = menuPath.replace(/[^\w\u4e00-\u9fff/-]+/g, "_").slice(0, 40);
    scenarios.push({
      id: `auto-${safeId}`,
      name: `${prefix}${menuPath}`,
      action: "create",
      targetName: `${prefix}${menuPath}`,
      menuPath,
      buttonText,
      pageId: action.pageId || "",
      note: "基于取证 create 入口自动生成，执行时会在目标页面尝试打开新建表单。",
    });
  }

  const menus = Array.isArray(evidence?.menuMap) ? evidence.menuMap : [];
  if (!scenarios.length) {
    for (const menu of menus.slice(0, 12)) {
      if (isEnvironmentSwitcherMenu(menu)) continue;
      const title = String(menu.title || menu.menuPath || "").trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      const safeId = title.replace(/\s+/g, "_").slice(0, 40);
      scenarios.push({
        id: `auto-${safeId}`,
        name: `${prefix}${title}`,
        action: "create",
        targetName: `${prefix}${title}`,
        menuPath: menu.menuPath || title,
        note: "自动生成验写计划：仅登记 AI_AUTO_TEST_ 前缀数据，执行仍由 validate-write 节点处理。",
      });
    }
  }

  if (!scenarios.length) {
    scenarios.push({
      id: "auto-default",
      name: `${prefix}默认验写`,
      action: "create",
      targetName: `${prefix}默认验写`,
      note: "证据中未识别到菜单，生成占位验写场景。",
    });
  }

  return scenarios;
}

function generateWriteValidationPlan(options = {}) {
  const inputPath = path.resolve(String(options.input || options.inputPath || "evidence.json"));
  const outputPath =
    options.outputPath ||
    path.join(path.dirname(inputPath), "write-validation-plan.json");
  const evidence = loadEvidence(inputPath);
  const plan = {
    systemCode: options.systemCode || evidence?.systemInfo?.code || "",
    generatedAt: new Date().toISOString(),
    scenarios: buildScenariosFromEvidence(evidence, options),
  };
  writeJson(outputPath, plan);
  return { outputPath, scenarioCount: plan.scenarios.length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error(
      "Usage: node scripts/generate-write-validation-plan.js --input outputs/adp/evidence.json",
    );
  }
  const result = generateWriteValidationPlan({
    input: args.input,
    outputPath: args.output,
    systemCode: args.system,
    testDataPrefix: args.prefix,
  });
  console.log(`Write validation plan: ${result.outputPath} (${result.scenarioCount} scenarios)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildScenariosFromEvidence,
  generateWriteValidationPlan,
};
