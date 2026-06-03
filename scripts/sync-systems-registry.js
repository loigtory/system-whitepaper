#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, parseSystemsConfig } = require("./system-whitepaper-lib");
const {
  exportSystemsToRegistryFile,
  resolveDefaultRegistryPath,
  syncSystemsRegistryToConfig,
} = require("./systems-registry");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config || "config/systems.local.yaml");
  const configDir = path.dirname(configPath);
  const registryPath = path.resolve(args.registry || resolveDefaultRegistryPath(configDir));

  if (args.export) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config not found: ${configPath}`);
    }
    const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
    exportSystemsToRegistryFile(config.systems || [], registryPath);
    console.log(`Registry exported: ${registryPath} (${(config.systems || []).length} systems)`);
    return;
  }

  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `Registry not found: ${registryPath}\n` +
        "请先创建 config/systems-registry.xlsx，或执行 --export 从 YAML 导出。",
    );
  }

  const result = syncSystemsRegistryToConfig({
    configPath,
    registryPath,
    parseConfig: parseSystemsConfig,
  });
  console.log(`Synced ${result.systemsCount} system(s) from ${registryPath}`);
  console.log(`Updated config: ${configPath}`);
  for (const system of result.systems) {
    console.log(`  - ${system.code} | ${system.name} -> outputs/${system.code}/`);
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
