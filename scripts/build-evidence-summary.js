#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  buildEvidenceSummary,
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function inferOutput(inputPath, explicitOutput) {
  if (explicitOutput) return path.resolve(String(explicitOutput));
  const dir = inputPath ? path.dirname(path.resolve(String(inputPath))) : process.cwd();
  return path.join(dir, "evidence-summary.json");
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
  const summary = buildEvidenceSummary(evidence);
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
