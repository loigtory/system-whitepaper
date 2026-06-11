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
  scanDatabaseProfileSafety,
} = require("./check-truth-readiness");

const STATUS_FIELD_PATTERN = /(status|state|stage|flag|type|状态|阶段|类型|标识)/i;
const TIME_FIELD_PATTERN = /(time|date|created|updated|创建|更新|时间|日期)/i;
const ID_FIELD_PATTERN = /(^id$|_id$|Id$|编号|编码|主键)/i;
const SENSITIVE_FIELD_PATTERN = /(phone|mobile|tel|email|idcard|identity|cert|card|bank|account|address|name|姓名|手机|手机号|手机号码|电话|联系电话|邮箱|电子邮箱|证件|证件号|身份证|身份证号|身份证号码|银行卡|银行卡号|银行账号|地址|收件地址|客户|用户|账号)/i;

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
  if (input.databaseProfilePath) {
    result.databaseProfile = {
      file: path.basename(input.databaseProfilePath),
      fingerprint: fingerprintFile(input.databaseProfilePath),
    };
  }
  return result;
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

function tableRef(table = {}) {
  return [table.schema, table.name].map(compactString).filter(Boolean).join(".");
}

function sourceRef(type, id, label = "") {
  return { type, id: compactString(id), label: compactString(label) };
}

function normalizeColumn(table = {}, column = {}) {
  const name = compactString(column.name || column.columnName);
  const comment = compactString(column.comment || column.description);
  const text = `${name} ${comment}`;
  return {
    table: tableRef(table),
    name,
    type: compactString(column.type || column.dataType),
    comment,
    nullable: column.nullable === undefined ? null : column.nullable,
    primaryKey: Boolean(column.primaryKey || column.isPrimaryKey),
    dictionary: Array.isArray(column.dictionary) ? column.dictionary.map(compactString).filter(Boolean) : [],
    semanticTags: [
      STATUS_FIELD_PATTERN.test(text) ? "status" : "",
      TIME_FIELD_PATTERN.test(text) ? "time" : "",
      ID_FIELD_PATTERN.test(text) ? "identifier" : "",
      SENSITIVE_FIELD_PATTERN.test(text) ? "sensitive" : "",
    ].filter(Boolean),
    sources: [sourceRef("db-column", `${tableRef(table)}.${name}`, comment || name)],
  };
}

function normalizeTable(table = {}) {
  const ref = tableRef(table);
  const columns = Array.isArray(table.columns)
    ? table.columns.map((column) => normalizeColumn(table, column)).filter((column) => column.name)
    : [];
  const statusFields = columns.filter((column) => column.semanticTags.includes("status"));
  const timeFields = columns.filter((column) => column.semanticTags.includes("time"));
  const identifierFields = columns.filter((column) => column.semanticTags.includes("identifier"));
  const sensitiveFields = columns.filter((column) => column.semanticTags.includes("sensitive"));
  return {
    table: ref,
    schema: compactString(table.schema || table.tableSchema),
    name: compactString(table.name || table.tableName),
    entity: compactString(table.comment || table.description || table.name || table.tableName),
    comment: compactString(table.comment || table.description),
    rowCount: Number.isFinite(Number(table.rowCount)) ? Number(table.rowCount) : null,
    columns,
    statusFields,
    timeFields,
    identifierFields,
    sensitiveFieldCount: sensitiveFields.length,
    sampleRowsIncluded: Array.isArray(table.sampleRows) && table.sampleRows.length > 0,
    sampleFieldNames: Array.isArray(table.sampleRows) && table.sampleRows.length
      ? Object.keys(table.sampleRows[0] || {}).map(compactString).filter(Boolean)
      : [],
    indexes: Array.isArray(table.indexes) ? table.indexes : [],
    foreignKeys: Array.isArray(table.foreignKeys) ? table.foreignKeys : [],
    sources: [sourceRef("db-table", ref, table.comment || table.name)],
  };
}

function buildDataDictionary(profile = {}, options = {}) {
  const tables = Array.isArray(profile.tables) ? profile.tables.map(normalizeTable).filter((table) => table.name) : [];
  const columns = tables.flatMap((table) => table.columns);
  return {
    artifactType: "data-dictionary",
    version: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    system: profile.system || null,
    source: {
      artifact: "database-profile.json",
      mode: profile.source?.mode || "",
      databaseType: profile.source?.databaseType || "",
      sampleDataIncluded: Boolean(profile.source?.sampleDataIncluded),
      secretRedacted: profile.safety?.secretRedacted === true,
    },
    tables,
    columns,
    metrics: {
      tableCount: tables.length,
      columnCount: columns.length,
      statusFieldCount: columns.filter((column) => column.semanticTags.includes("status")).length,
      timeFieldCount: columns.filter((column) => column.semanticTags.includes("time")).length,
      sensitiveFieldCount: columns.filter((column) => column.semanticTags.includes("sensitive")).length,
      sampleBackedTableCount: tables.filter((table) => table.sampleRowsIncluded).length,
    },
    safety: {
      rawSecretsIncluded: false,
      rawSampleRowsIncluded: false,
      sourceMustBeRedactedDatabaseProfile: true,
    },
  };
}

function inferEntityRelations(tables = []) {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const relations = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys || []) {
      const targetTable = compactString(fk.refTable || fk.referencedTable || fk.targetTable);
      const column = compactString(fk.column || fk.columnName);
      if (!targetTable) continue;
      relations.push({
        from: table.table,
        to: targetTable.includes(".") ? targetTable : [table.schema, targetTable].filter(Boolean).join("."),
        type: "foreign-key",
        columns: column ? [column] : [],
        confidence: "high",
        sources: [sourceRef("db-foreign-key", `${table.table}.${column}`, targetTable)],
      });
    }
    for (const column of table.columns || []) {
      const match = compactString(column.name).match(/^(.+)_id$/i);
      if (!match) continue;
      const target = byName.get(match[1]) || byName.get(`${match[1]}s`);
      if (!target || target.table === table.table) continue;
      relations.push({
        from: table.table,
        to: target.table,
        type: "naming-reference",
        columns: [column.name],
        confidence: "low",
        sources: [sourceRef("db-column", `${table.table}.${column.name}`, column.comment || column.name)],
      });
    }
  }
  return uniqueBy(relations, (item) => `${item.from}::${item.to}::${item.type}::${item.columns.join(",")}`);
}

function buildEntityModel(dataDictionary = {}, options = {}) {
  const entities = (dataDictionary.tables || []).map((table) => ({
    entity: table.entity || table.name,
    table: table.table,
    comment: table.comment,
    confidence: table.comment ? "medium" : "low",
    statusFields: table.statusFields.map((column) => ({
      name: column.name,
      comment: column.comment,
      dictionary: column.dictionary,
    })),
    timeFields: table.timeFields.map((column) => ({
      name: column.name,
      comment: column.comment,
    })),
    identifierFields: table.identifierFields.map((column) => ({
      name: column.name,
      comment: column.comment,
      primaryKey: column.primaryKey,
    })),
    evidence: {
      rowCount: table.rowCount,
      sampleRowsIncluded: table.sampleRowsIncluded,
      sampleFieldNames: table.sampleFieldNames,
      sensitiveFieldCount: table.sensitiveFieldCount,
    },
    sources: table.sources,
  }));
  const relations = inferEntityRelations(dataDictionary.tables || []);
  return {
    artifactType: "entity-model",
    version: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    system: dataDictionary.system || null,
    source: {
      artifact: "data-dictionary.json",
      sourceDatabaseMode: dataDictionary.source?.mode || "",
      sourceDatabaseType: dataDictionary.source?.databaseType || "",
    },
    entities,
    relations,
    metrics: {
      entityCount: entities.length,
      relationCount: relations.length,
      statusAwareEntityCount: entities.filter((entity) => entity.statusFields.length).length,
      sampleBackedEntityCount: entities.filter((entity) => entity.evidence.sampleRowsIncluded).length,
    },
    safety: {
      rawSecretsIncluded: false,
      rawSampleRowsIncluded: false,
      databaseOnlyClaimsRequireUiConfirmation: true,
    },
  };
}

function buildDatabaseModelArtifacts(profile = {}, options = {}) {
  try {
    assertValidDatabaseProfileArtifact(profile);
  } catch (error) {
    throw new Error(
      [
        "database-profile.json is not a valid database profile artifact; refusing to build database model artifacts.",
        error.message,
      ].join(" "),
    );
  }
  const safety = scanDatabaseProfileSafety(profile);
  if (!safety.pass) {
    throw new Error(
      [
        "database-profile.json is not safely redacted; refusing to build database model artifacts.",
        ...safety.failures,
      ].join(" "),
    );
  }
  const generatedAt = options.generatedAt || new Date().toISOString();
  const dataDictionary = buildDataDictionary(profile, { generatedAt });
  const entityModel = buildEntityModel(dataDictionary, { generatedAt });
  const sourceArtifacts = buildSourceArtifacts(options);
  dataDictionary.sourceArtifacts = sourceArtifacts;
  entityModel.sourceArtifacts = {
    ...sourceArtifacts,
    dataDictionary: {
      artifactType: "in-memory-data-dictionary",
      fingerprint: {
        exists: true,
        size: JSON.stringify(dataDictionary).length,
        mtimeMs: null,
        sha256: crypto.createHash("sha256").update(JSON.stringify(dataDictionary)).digest("hex"),
      },
    },
  };
  return { dataDictionary, entityModel };
}

function buildDatabaseModelFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const profile = readRequiredJsonObject(
    options.databaseProfilePath || path.join(dir, "database-profile.json"),
    { label: "Database profile" },
  );
  const databaseProfilePath = options.databaseProfilePath || path.join(dir, "database-profile.json");
  const artifacts = buildDatabaseModelArtifacts(profile, { ...options, databaseProfilePath });
  const dataDictionaryPath = options.dataDictionaryPath || path.join(dir, "data-dictionary.json");
  const entityModelPath = options.entityModelPath || path.join(dir, "entity-model.json");
  writeJson(dataDictionaryPath, artifacts.dataDictionary);
  artifacts.entityModel.sourceArtifacts = {
    ...(artifacts.entityModel.sourceArtifacts || {}),
    dataDictionary: {
      file: path.basename(dataDictionaryPath),
      fingerprint: fingerprintFile(dataDictionaryPath),
    },
  };
  writeJson(entityModelPath, artifacts.entityModel);
  return { ...artifacts, dataDictionaryPath, entityModelPath };
}

module.exports = {
  buildDataDictionary,
  buildDatabaseModelArtifacts,
  buildDatabaseModelFromDir,
  buildSourceArtifacts,
  buildEntityModel,
  fingerprintFile,
  inferEntityRelations,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/build-database-model.js --input outputs/system");
  }
  const result = buildDatabaseModelFromDir(args.input, {
    databaseProfilePath: args["database-profile"],
    dataDictionaryPath: args["data-dictionary"],
    entityModelPath: args["entity-model"],
  });
  console.log(`Data dictionary written: ${result.dataDictionaryPath}`);
  console.log(`Entity model written: ${result.entityModelPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
