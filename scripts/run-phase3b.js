#!/usr/bin/env node

require("./narrative/ensure-dispose-symbols").ensureDisposeSymbols();

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, parseSystemsConfig } = require("./system-whitepaper-lib");
const { runPhase3b } = require("./narrative/phase3b");
const { resolveNarrativeProvider } = require("./narrative/resolve-provider");
const {
  readPipelineStateSafe,
  reconcilePipelineStateFromArtifacts,
  writePipelineState,
} = require("./pipeline-state");

function resolveSystem(configPath, systemCode) {
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  const system = config.systems.find((item) => item.code === systemCode);
  if (!system) {
    throw new Error(`System not found in config: ${systemCode}`);
  }
  return { config, system };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || "config/systems.local.yaml";
  const systemCode = args.system;

  if (!systemCode) {
    throw new Error(
      "Usage: node scripts/run-phase3b.js --system adp [--config config/systems.local.yaml] [--provider manual|cursor-sdk|codex] [--narrative-part overview-flow|function-sections|模块名] [--review-rerun]",
    );
  }

  const { config, system } = resolveSystem(configPath, systemCode);
  const configDir = path.dirname(path.resolve(configPath));
  const projectRoot = path.resolve(configDir, "..");
  const outputRoot = path.resolve(configDir, args.output || config.runtime?.outputDir || "outputs");
  const systemOutput = path.join(outputRoot, system.code);
  const provider = resolveNarrativeProvider({
    provider: args.provider,
    config,
    projectRoot,
  });

  const result = await runPhase3b({
    provider,
    systemCode: system.code,
    systemName: system.name,
    evidenceSummaryPath: path.join(systemOutput, "evidence-summary.json"),
    draftPath: path.join(systemOutput, "whitepaper.draft.md"),
    outputPath: path.join(systemOutput, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(systemOutput, "quality-report.json"),
    promptOutputPath: path.join(systemOutput, "phase3b-prompt.md"),
    briefPath: path.join(systemOutput, "narrative-brief.md"),
    fragmentsPath: path.join(systemOutput, "narrative-fragments.md"),
    usagePath: path.join(systemOutput, "phase3b-usage.json"),
    model: args.model || config.narrative?.defaultModel || "composer-2.5",
    narrativePart: args["narrative-part"] || args.part || "",
    reviewRerun: Boolean(args["review-rerun"]),
    projectRoot,
    sdkCwd: systemOutput,
    pricingConfig: config.narrative?.pricing || {},
  });

  const statePath = path.join(systemOutput, "pipeline-state.json");
  const state = readPipelineStateSafe(statePath);
  if (state) {
    const reconciled = reconcilePipelineStateFromArtifacts(state, systemOutput);
    if (reconciled.changed) {
      writePipelineState(statePath, reconciled.state);
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
