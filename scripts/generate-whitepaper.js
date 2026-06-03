#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  readRequiredJsonObject,
  renderWhitepaper,
  resolveDraftOutputPath,
} = require("./system-whitepaper-lib");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;

  if (!input) {
    throw new Error(
      "Usage: node scripts/generate-whitepaper.js --input outputs/system/evidence.json [--output outputs/system/whitepaper.draft.md]",
    );
  }

  const evidence = readRequiredJsonObject(input, { label: "Evidence file" });

  const output = resolveDraftOutputPath(input, args.output);
  const markdown = renderWhitepaper(evidence);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, markdown, "utf8");
  console.log(`Whitepaper draft written: ${output}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
