#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  assertValidDatabaseProfileArtifact,
  assertValidEntityModelArtifact,
  scanDatabaseProfileSafety,
} = require("./check-truth-readiness");

function compactString(value) {
  return String(value || "").trim();
}

function fingerprintFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, mtimeMs: null, sha256: "" };
  }
  const buffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    size: stat.size,
    mtimeMs: Math.round(stat.mtimeMs),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function buildSourceArtifacts(input = {}) {
  const result = {};
  for (const [key, filePath] of Object.entries(input)) {
    if (!filePath) continue;
    result[key] = {
      file: path.basename(filePath),
      fingerprint: fingerprintFile(filePath),
    };
  }
  return result;
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

function buildEntityUniverse(input = {}) {
  const modelEntities = Array.isArray(input.entityModel?.entities) ? input.entityModel.entities : [];
  const profileEntities = Array.isArray(input.databaseProfile?.entityCandidates)
    ? input.databaseProfile.entityCandidates
    : [];
  const entities = modelEntities.length
    ? modelEntities.map((item) => ({
        entity: item.entity,
        table: item.table,
        confidence: item.confidence,
        statusColumns: item.statusFields,
        timeColumns: item.timeFields,
        evidence: item.evidence,
        sources: item.sources,
      }))
    : profileEntities;
  return uniqueBy(
    entities
      .filter((item) => item && compactString(item.entity))
      .map((item) => ({
        name: compactString(item.entity),
        table: compactString(item.table),
        confidence: compactString(item.confidence || "low"),
        statusColumns: Array.isArray(item.statusColumns) ? item.statusColumns : [],
        timeColumns: Array.isArray(item.timeColumns) ? item.timeColumns : [],
        evidence: item.evidence || {},
        sources: normalizeSourceList(item.sources, [sourceRef("db-table", item.table, item.entity)]),
      })),
    (item) => `${item.table}::${item.name}`,
  );
}

function normalizeSourceList(sources, fallback = []) {
  return Array.isArray(sources) && sources.length ? sources : fallback;
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

function buildEntityRelations(entityModel = {}) {
  return uniqueBy(
    (entityModel.relations || [])
      .filter((item) => item && compactString(item.from) && compactString(item.to))
      .map((item) => ({
        from: compactString(item.from),
        to: compactString(item.to),
        type: compactString(item.type || "database-relation"),
        columns: Array.isArray(item.columns) ? item.columns.filter(Boolean) : [],
        confidence: compactString(item.confidence || "low"),
        sources: normalizeSourceList(item.sources, []),
      })),
    (item) => `${item.from}::${item.to}::${item.type}::${item.columns.join(",")}`,
  );
}

function hasObjectContent(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function assertSafeDatabaseProfile(databaseProfile = {}) {
  if (!hasObjectContent(databaseProfile)) return;
  try {
    assertValidDatabaseProfileArtifact(databaseProfile);
  } catch (error) {
    throw new Error(
      [
        "database-profile.json is not a valid database profile artifact; refusing to build function universe artifacts.",
        error.message,
      ].join(" "),
    );
  }
  const safety = scanDatabaseProfileSafety(databaseProfile);
  if (!safety.pass) {
    throw new Error(
      [
        "database-profile.json is not safely redacted; refusing to build function universe artifacts.",
        ...safety.failures,
      ].join(" "),
    );
  }
}

function assertValidEntityModelInput(entityModel = {}) {
  if (!hasObjectContent(entityModel)) return;
  try {
    assertValidEntityModelArtifact(entityModel);
  } catch (error) {
    throw new Error(
      [
        "entity-model.json is not a valid entity model artifact; refusing to build function universe artifacts.",
        error.message,
      ].join(" "),
    );
  }
}

function buildFunctionUniverseArtifact(input = {}) {
  const evidenceSummary = input.evidenceSummary || {};
  const databaseProfile = input.databaseProfile || {};
  const entityModel = input.entityModel || {};
  assertSafeDatabaseProfile(databaseProfile);
  assertValidEntityModelInput(entityModel);
  const modules = buildModuleUniverse(evidenceSummary);
  const functions = buildFunctionUniverse(evidenceSummary);
  const entities = buildEntityUniverse({ databaseProfile, entityModel });
  const links = buildFunctionEntityLinks(functions, entities);
  const entityRelations = buildEntityRelations(entityModel);
  return {
    artifactType: "function-universe",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: evidenceSummary.system || databaseProfile.system || null,
    modules,
    functions,
    entities,
    links,
    entityRelations,
    coverage: {
      moduleCount: modules.length,
      functionCount: functions.length,
      entityCount: entities.length,
      linkedFunctionCount: new Set(links.map((item) => `${item.module}::${item.function}`)).size,
      entityRelationCount: entityRelations.length,
    },
    sourceArtifacts: input.sourceArtifacts || {},
    rules: {
      noConclusion: true,
      purpose: "Candidate universe for later verified-claims generation; not final business claims.",
    },
  };
}

function readOptionalExistingJsonObject(filePath, label) {
  const resolved = path.resolve(String(filePath || ""));
  if (!fs.existsSync(resolved)) return {};
  return readRequiredJsonObject(resolved, { label });
}

function buildFunctionUniverseFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const evidenceSummaryPath = options.evidenceSummaryPath || path.join(dir, "evidence-summary.json");
  const databaseProfilePath = options.databaseProfilePath || path.join(dir, "database-profile.json");
  const entityModelPath = options.entityModelPath || path.join(dir, "entity-model.json");
  const evidenceSummary = readRequiredJsonObject(
    evidenceSummaryPath,
    { label: "Evidence summary" },
  );
  const databaseProfile = readOptionalExistingJsonObject(databaseProfilePath, "Database profile");
  const entityModel = readOptionalExistingJsonObject(entityModelPath, "Entity model");
  const artifact = buildFunctionUniverseArtifact({
    evidenceSummary,
    databaseProfile,
    entityModel,
    sourceArtifacts: buildSourceArtifacts({
      evidenceSummary: evidenceSummaryPath,
      databaseProfile: databaseProfilePath,
      entityModel: entityModelPath,
    }),
  });
  const outputPath = options.outputPath || path.join(dir, "function-universe.json");
  writeJson(outputPath, artifact);
  return { outputPath, artifact };
}

module.exports = {
  buildFunctionUniverseArtifact,
  buildFunctionUniverseFromDir,
  buildSourceArtifacts,
  fingerprintFile,
  readOptionalExistingJsonObject,
  scoreFunctionEntityMatch,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/build-function-universe.js --input outputs/system");
  }
  const result = buildFunctionUniverseFromDir(args.input, {
    outputPath: args.output,
    evidenceSummaryPath: args["evidence-summary"],
    databaseProfilePath: args["database-profile"],
    entityModelPath: args["entity-model"],
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
