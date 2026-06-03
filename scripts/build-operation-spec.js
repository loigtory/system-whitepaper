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
const {
  assertValidOperationGuideGateArtifact,
  assertValidOperationSpecArtifact,
  buildOperationSpec,
  buildOperationSpecSourceArtifacts,
  fingerprintFile,
} = require("./operation-spec/lib");

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
  const writeValidationPath = path.join(systemOutput, "write-validation-result.json");
  const networkIndexPath = path.join(systemOutput, "network-index.json");
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`Evidence file not found: ${evidencePath}`);
  }

  const evidence = readRequiredJsonObject(evidencePath, { label: "Evidence file" });
  const writeValidation = readOptionalJsonObject(writeValidationPath);
  const networkIndex = readOptionalJsonObject(networkIndexPath);

  const { spec, gate } = buildOperationSpec({
    evidence,
    system,
    writeValidation,
    networkIndex,
    sourceArtifacts: buildOperationSpecSourceArtifacts({
      evidencePath,
      writeValidationPath,
      networkIndexPath,
    }),
    allowDraft: Boolean(args["allow-draft"] || system.operationGuideAllowDraft),
  });

  const specPath = path.join(systemOutput, "operation-spec.json");
  const gatePath = path.join(systemOutput, "operation-guide-gate.json");
  assertValidOperationSpecArtifact(spec);
  writeJson(specPath, spec);
  gate.sourceArtifacts = {
    operationSpec: {
      file: "operation-spec.json",
      status: "ok",
      fingerprint: fingerprintFile(specPath),
    },
    evidence: spec.sourceArtifacts.evidence,
  };
  assertValidOperationGuideGateArtifact(gate, spec);
  writeJson(gatePath, gate);

  console.log(`Operation spec written: ${specPath}`);
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
