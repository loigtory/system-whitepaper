#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  parseSystemsConfig,
  writeJson,
  normalizeAuthPaths,
  readOptionalJsonObject,
  readRequiredJsonObject,
} = require("./system-whitepaper-lib");
const { buildOperationSpec } = require("./operation-spec/lib");

function loadSystemContext(configPath, systemCode) {
  const resolvedConfig = path.resolve(configPath);
  const config = parseSystemsConfig(fs.readFileSync(resolvedConfig, "utf8"));
  normalizeAuthPaths(config, path.dirname(resolvedConfig));
  const system = (config.systems || []).find((item) => item.code === systemCode);
  if (!system) {
    throw new Error(`System not found in config: ${systemCode}`);
  }
  const outputRoot = path.resolve(path.dirname(resolvedConfig), config.runtime?.outputDir || "outputs");
  return {
    config,
    system,
    systemOutput: path.join(outputRoot, system.code),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.input ? path.resolve(String(args.input)) : "";
  const configPath = args.config || "config/systems.local.yaml";
  const systemCode = args.system || args.systemCode || "";

  let systemOutput = inputDir;
  let system = { code: systemCode };

  if (systemCode && !inputDir) {
    const context = loadSystemContext(configPath, systemCode);
    systemOutput = context.systemOutput;
    system = context.system;
  } else if (!inputDir) {
    throw new Error(
      "Usage: node scripts/build-operation-spec.js --system adp [--config config/systems.local.yaml] | --input outputs/adp [--allow-draft]",
    );
  }

  const evidencePath = path.join(systemOutput, "evidence.json");
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Evidence file not found: ${evidencePath}`);
  }

  const evidence = readRequiredJsonObject(evidencePath, { label: "Evidence file" });
  const writeValidation = readOptionalJsonObject(
    path.join(systemOutput, "write-validation-result.json"),
  );
  const networkIndex = readOptionalJsonObject(path.join(systemOutput, "network-index.json"));

  const { spec, gate } = buildOperationSpec({
    evidence,
    system,
    writeValidation,
    networkIndex,
    allowDraft: Boolean(args["allow-draft"] || system.operationGuideAllowDraft),
  });

  writeJson(path.join(systemOutput, "operation-spec.json"), spec);
  writeJson(path.join(systemOutput, "operation-guide-gate.json"), gate);

  console.log(`Operation spec written: ${path.join(systemOutput, "operation-spec.json")}`);
  console.log(
    `Guide gate: readiness=${gate.readinessPercent}% canComposeGuide=${gate.canComposeGuide}`,
  );
  if (gate.failures.length) {
    console.error(gate.failures.join("\n"));
    if (!gate.canComposeGuide && !args["allow-draft"]) {
      process.exitCode = 2;
    }
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

module.exports = { main, readOptionalJsonObject };
