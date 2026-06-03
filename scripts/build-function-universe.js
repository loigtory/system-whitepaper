#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  readOptionalJsonObject,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function compactString(value) {
  return String(value || "").trim();
}

function sourceRef(type, id, label = "") {
  return { type, id: compactString(id), label: compactString(label) };
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildModuleUniverse(evidenceSummary = {}) {
  return uniqueBy(
    (evidenceSummary.modules || [])
      .filter((item) => item && compactString(item.name))
      .map((item) => ({
        name: compactString(item.name),
        entry: compactString(item.entry),
        summaryHint: compactString(item.summary),
        sources: [sourceRef("ui-module", item.entry || item.name, item.name)],
      })),
    (item) => item.name,
  );
}

function buildFunctionUniverse(evidenceSummary = {}) {
  return uniqueBy(
    (evidenceSummary.functions || [])
      .filter((item) => item && compactString(item.name))
      .map((item) => ({
        name: compactString(item.name),
        module: compactString(item.module || "未归类"),
        menuPath: compactString(item.menuPath),
        actions: Array.isArray(item.actions) ? item.actions.filter(Boolean) : [],
        queryFields: Array.isArray(item.queryFields) ? item.queryFields.filter(Boolean) : [],
        tableColumns: Array.isArray(item.tableColumns) ? item.tableColumns.filter(Boolean) : [],
        screenshots: Array.isArray(item.screenshots) ? item.screenshots : [],
        evidenceStrength: item.screenshots?.length ? "medium" : "low",
        sources: [
          sourceRef("ui-function", item.menuPath || item.name, item.name),
          ...(item.screenshots || []).map((shot) => sourceRef("screenshot", shot.id || shot.file, shot.file)),
        ].filter((ref) => ref.id || ref.label),
      })),
    (item) => `${item.module}::${item.name}::${item.menuPath}`,
  );
}

function buildEntityUniverse(databaseProfile = {}) {
  return uniqueBy(
    (databaseProfile.entityCandidates || [])
      .filter((item) => item && compactString(item.entity))
      .map((item) => ({
        name: compactString(item.entity),
        table: compactString(item.table),
        confidence: compactString(item.confidence || "low"),
        statusColumns: Array.isArray(item.statusColumns) ? item.statusColumns : [],
        timeColumns: Array.isArray(item.timeColumns) ? item.timeColumns : [],
        sources: [sourceRef("db-table", item.table, item.entity)],
      })),
    (item) => `${item.table}::${item.name}`,
  );
}

function scoreFunctionEntityMatch(fn, entity) {
  const haystack = [
    fn.name,
    fn.module,
    fn.menuPath,
    ...(fn.queryFields || []),
    ...(fn.tableColumns || []),
  ].join(" ");
  const entityName = compactString(entity.name);
  const directNameMatch = entityName && haystack.includes(entityName);
  const entityTokens = [entity.name, entity.table]
    .join(" ")
    .split(/[._\s>/-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const matched = entityTokens.filter((token) => haystack.includes(token));
  if (!matched.length && !directNameMatch) return null;
  return {
    function: fn.name,
    module: fn.module,
    entity: entity.name,
    table: entity.table,
    confidence: directNameMatch || matched.length >= 2 ? "medium" : "low",
    matchedTokens: directNameMatch ? uniqueBy([entityName, ...matched], (item) => item) : matched,
    sources: [...(fn.sources || []), ...(entity.sources || [])],
  };
}

function buildFunctionEntityLinks(functions, entities) {
  const links = [];
  for (const fn of functions) {
    for (const entity of entities) {
      const link = scoreFunctionEntityMatch(fn, entity);
      if (link) links.push(link);
    }
  }
  return uniqueBy(links, (item) => `${item.module}::${item.function}::${item.table}`);
}

function buildFunctionUniverseArtifact(input = {}) {
  const evidenceSummary = input.evidenceSummary || {};
  const databaseProfile = input.databaseProfile || {};
  const modules = buildModuleUniverse(evidenceSummary);
  const functions = buildFunctionUniverse(evidenceSummary);
  const entities = buildEntityUniverse(databaseProfile);
  const links = buildFunctionEntityLinks(functions, entities);
  return {
    artifactType: "function-universe",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: evidenceSummary.system || databaseProfile.system || null,
    modules,
    functions,
    entities,
    links,
    coverage: {
      moduleCount: modules.length,
      functionCount: functions.length,
      entityCount: entities.length,
      linkedFunctionCount: new Set(links.map((item) => `${item.module}::${item.function}`)).size,
    },
    rules: {
      noConclusion: true,
      purpose: "Candidate universe for later verified-claims generation; not final business claims.",
    },
  };
}

function buildFunctionUniverseFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const evidenceSummary = readRequiredJsonObject(
    options.evidenceSummaryPath || path.join(dir, "evidence-summary.json"),
    { label: "Evidence summary" },
  );
  const databaseProfile = readOptionalJsonObject(
    options.databaseProfilePath || path.join(dir, "database-profile.json"),
    {},
  ) || {};
  const artifact = buildFunctionUniverseArtifact({
    evidenceSummary,
    databaseProfile,
  });
  const outputPath = options.outputPath || path.join(dir, "function-universe.json");
  writeJson(outputPath, artifact);
  return { outputPath, artifact };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/build-function-universe.js --input outputs/system");
  }
  const result = buildFunctionUniverseFromDir(args.input, {
    outputPath: args.output,
    evidenceSummaryPath: args["evidence-summary"],
    databaseProfilePath: args["database-profile"],
  });
  console.log(`Function universe written: ${result.outputPath}`);
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
  buildFunctionUniverseArtifact,
  buildFunctionUniverseFromDir,
  scoreFunctionEntityMatch,
};
