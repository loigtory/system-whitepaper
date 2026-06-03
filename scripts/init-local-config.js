#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("./system-whitepaper-lib");

function initLocalConfig(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const configPath = path.resolve(projectRoot, options.config || "config/systems.local.yaml");
  const examplePath = path.resolve(
    projectRoot,
    options.example || "examples/systems.example.yaml",
  );
  const secretsDir = path.resolve(projectRoot, options.secretsDir || "secrets");
  const outputsDir = path.resolve(projectRoot, options.outputsDir || "outputs");

  if (!fs.existsSync(examplePath)) {
    throw new Error(`Example config not found: ${examplePath}`);
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.mkdirSync(outputsDir, { recursive: true });

  let createdConfig = false;
  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(examplePath, configPath);
    createdConfig = true;
  }

  return {
    configPath,
    createdConfig,
    examplePath,
    outputsDir,
    secretsDir,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = initLocalConfig(args);
  console.log(
    result.createdConfig
      ? `Initialized config: ${result.configPath}`
      : `Config already exists, left unchanged: ${result.configPath}`,
  );
  console.log(`Secrets directory: ${result.secretsDir}`);
  console.log(`Outputs directory: ${result.outputsDir}`);
  if (result.createdConfig) {
    console.log("Edit the config and write secrets/huntian-token.txt before running pipeline.");
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
  initLocalConfig,
};
