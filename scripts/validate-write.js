#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function resolveWriteValidationPlanPath(options = {}) {
  if (options.planPath) return path.resolve(String(options.planPath));
  if (options.systemOutput) {
    return path.join(path.resolve(String(options.systemOutput)), "write-validation-plan.json");
  }
  return path.resolve("write-validation-plan.json");
}

function resolveWriteValidationResultPath(options = {}) {
  if (options.resultPath) return path.resolve(String(options.resultPath));
  if (options.systemOutput) {
    return path.join(path.resolve(String(options.systemOutput)), "write-validation-result.json");
  }
  return path.resolve("write-validation-result.json");
}

function readWriteValidationPlan(planPath) {
  if (!fs.existsSync(planPath)) return null;
  return readRequiredJsonObject(planPath, { label: "Write validation plan" });
}

function assertScenarioSafety(scenario) {
  const action = String(scenario.action || "").toLowerCase();
  const writeActions = new Set([
    "create",
    "edit",
    "submit",
    "approve",
    "delete",
    "publish",
    "overwrite",
  ]);
  if (!writeActions.has(action)) return true;

  const targetName = String(scenario.targetName || scenario.dataName || scenario.name || "");
  if (!targetName.includes("AI_AUTO_TEST_")) {
    throw new Error(
      `Write validation scenario ${scenario.id || scenario.name || ""} target must include AI_AUTO_TEST_ prefix.`,
    );
  }
  return true;
}

function validateWriteValidationPlan(plan) {
  const scenarios = Array.isArray(plan?.scenarios) ? plan.scenarios : [];
  for (const scenario of scenarios) {
    assertScenarioSafety(scenario);
  }
  return scenarios;
}

function loadWriteValidationContext(options = {}) {
  if (options.config && options.system) {
    return { config: options.config, system: options.system };
  }
  if (!options.configPath || !options.systemCode) return null;
  const configPath = path.resolve(String(options.configPath));
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  normalizeAuthPaths(config, path.dirname(configPath));
  const system = (config.systems || []).find((item) => item.code === options.systemCode);
  if (!system) {
    throw new Error(`System not found in config: ${options.systemCode}`);
  }
  return { config, system };
}

async function runWriteValidation(options = {}) {
  const planPath = resolveWriteValidationPlanPath(options);
  const resultPath = resolveWriteValidationResultPath(options);
  const plan = readWriteValidationPlan(planPath);

  if (!plan) {
    const result = {
      status: "skipped",
      systemCode: options.systemCode || "",
      reason: `No write validation plan found: ${planPath}`,
      scenarios: [],
    };
    writeJson(resultPath, result);
    return result;
  }

  const scenarios = validateWriteValidationPlan(plan);
  if (!scenarios.length) {
    const result = {
      status: "skipped",
      systemCode: options.systemCode || "",
      reason: "Write validation plan has no scenarios.",
      scenarios: [],
    };
    writeJson(resultPath, result);
    return result;
  }

  if (options.execute === false) {
    const result = {
      status: "skipped",
      systemCode: options.systemCode || "",
      reason: "Write validation execution disabled; plan safety passed.",
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id || "",
        action: scenario.action || "",
        targetName: scenario.targetName || scenario.dataName || scenario.name || "",
        status: "planned",
      })),
    };
    writeJson(resultPath, result);
    return result;
  }

  const runtimeContext = loadWriteValidationContext(options);
  if (!runtimeContext) {
    const result = {
      status: "skipped",
      systemCode: options.systemCode || "",
      reason: "Write validation execution requires config and system context.",
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id || "",
        action: scenario.action || "",
        targetName: scenario.targetName || scenario.dataName || scenario.name || "",
        status: "planned",
      })),
    };
    writeJson(resultPath, result);
    return result;
  }

  const { executeWriteValidationBrowser } = require("./collect-evidence");
  const prioritized = scenarios.filter((scenario) => scenario.buttonText || scenario.pageId);
  const executableScenarios = prioritized.length ? prioritized : scenarios;
  const result = await executeWriteValidationBrowser({
    config: runtimeContext.config,
    system: runtimeContext.system,
    systemOutput: path.resolve(String(options.systemOutput)),
    scenarios: executableScenarios,
    args: options.args || {},
  });
  writeJson(resultPath, result);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runWriteValidation({
    systemCode: args.system,
    systemOutput: args["system-output"],
    planPath: args.plan,
    resultPath: args.output,
    configPath: args.config,
    execute: args["dry-run"] !== true,
    args,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  assertScenarioSafety,
  readWriteValidationPlan,
  resolveWriteValidationPlanPath,
  runWriteValidation,
  validateWriteValidationPlan,
};
