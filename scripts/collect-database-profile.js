#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  parseSystemsConfig,
  readRequiredJsonObject,
  resolveConfigRelativePath,
  writeJson,
} = require("./system-whitepaper-lib");

const SECRET_FIELD_PATTERN = /(password|passwd|pwd|secret|token|key|credential|dsn|url|host|port|user|username)/i;
const SENSITIVE_DATA_PATTERN = /(phone|mobile|tel|email|idcard|identity|cert|card|bank|account|address|name|姓名|手机|电话|邮箱|证件|身份证|银行卡|地址|客户|用户|账号)/i;

function maskValue(value) {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (text.length <= 2) return "***";
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}

function sanitizeSampleRow(row = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(row || {})) {
    sanitized[key] = SENSITIVE_DATA_PATTERN.test(key) ? maskValue(value) : value;
  }
  return sanitized;
}

function sanitizeSecret(secret = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(secret || {})) {
    sanitized[key] = SECRET_FIELD_PATTERN.test(key) ? "[redacted]" : value;
  }
  return sanitized;
}

function normalizeColumn(column = {}) {
  return {
    name: String(column.name || column.columnName || ""),
    type: String(column.type || column.dataType || ""),
    comment: String(column.comment || column.description || ""),
    nullable: column.nullable === undefined ? null : Boolean(column.nullable),
    primaryKey: Boolean(column.primaryKey || column.isPrimaryKey),
    dictionary: Array.isArray(column.dictionary) ? column.dictionary : [],
  };
}

function normalizeTable(table = {}, options = {}) {
  const columns = Array.isArray(table.columns) ? table.columns.map(normalizeColumn) : [];
  const sampleRows = options.allowSampleData && Array.isArray(table.sampleRows)
    ? table.sampleRows.slice(0, options.sampleRows).map(sanitizeSampleRow)
    : [];
  return {
    schema: String(table.schema || table.tableSchema || ""),
    name: String(table.name || table.tableName || ""),
    comment: String(table.comment || table.description || ""),
    rowCount: Number.isFinite(Number(table.rowCount)) ? Number(table.rowCount) : null,
    columns,
    indexes: Array.isArray(table.indexes) ? table.indexes : [],
    foreignKeys: Array.isArray(table.foreignKeys) ? table.foreignKeys : [],
    sampleRows,
  };
}

function buildEntityCandidates(tables = []) {
  return tables
    .filter((table) => table.name)
    .map((table) => {
      const statusColumns = table.columns.filter((column) =>
        /(status|state|stage|flag|type|状态|阶段|类型|标志)/i.test(
          `${column.name} ${column.comment}`,
        ),
      );
      const timeColumns = table.columns.filter((column) =>
        /(time|date|created|updated|时间|日期)/i.test(`${column.name} ${column.comment}`),
      );
      return {
        entity: table.comment || table.name,
        table: [table.schema, table.name].filter(Boolean).join("."),
        confidence: table.comment ? "medium" : "low",
        statusColumns: statusColumns.map((column) => ({
          name: column.name,
          comment: column.comment,
          dictionary: column.dictionary,
        })),
        timeColumns: timeColumns.map((column) => ({
          name: column.name,
          comment: column.comment,
        })),
      };
    });
}

function normalizeDatabaseProfile(input = {}, context = {}) {
  const options = {
    allowSampleData: Boolean(context.allowSampleData),
    sampleRows: Math.max(0, Number(context.sampleRows ?? 0)),
  };
  const tables = Array.isArray(input.tables)
    ? input.tables.map((table) => normalizeTable(table, options))
    : [];
  return {
    artifactType: "database-profile",
    version: 1,
    generatedAt: context.generatedAt || new Date().toISOString(),
    system: context.system
      ? {
          code: context.system.code,
          name: context.system.name,
        }
      : null,
    source: {
      mode: context.mode || "metadata-file",
      databaseType: input.databaseType || context.secret?.type || "",
      includeSchemas: context.includeSchemas || [],
      sampleDataIncluded: options.allowSampleData,
      secret: sanitizeSecret(context.secret || {}),
    },
    tables,
    entityCandidates: buildEntityCandidates(tables),
    safety: {
      readOnlyRequired: true,
      secretRedacted: true,
      sampleRowsLimit: options.sampleRows,
    },
  };
}

function resolveDatabaseProfileConfig(system = {}, configDir) {
  const profile = system.databaseProfile || {};
  return {
    enabled: Boolean(profile.enabled),
    secretFile: profile.secretFile ? resolveConfigRelativePath(configDir, profile.secretFile) : "",
    metadataFile: profile.metadataFile ? resolveConfigRelativePath(configDir, profile.metadataFile) : "",
    includeSchemas: Array.isArray(profile.includeSchemas) ? profile.includeSchemas : [],
    allowSampleData: Boolean(profile.allowSampleData),
    sampleRows: Math.max(0, Number(profile.sampleRows || 0)),
  };
}

function collectDatabaseProfile(options = {}) {
  const configPath = path.resolve(String(options.config || "config/systems.local.yaml"));
  const configDir = path.dirname(configPath);
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  const systemCode = options.system || options.systemCode;
  const system = (config.systems || []).find((item) => item.code === systemCode);
  if (!system) throw new Error(`System not found in config: ${systemCode}`);

  const profileConfig = resolveDatabaseProfileConfig(system, configDir);
  if (!profileConfig.enabled) {
    throw new Error(`databaseProfile is not enabled for system: ${systemCode}`);
  }
  if (!profileConfig.secretFile) {
    throw new Error(`databaseProfile.secretFile is required for system: ${systemCode}`);
  }
  const secret = readRequiredJsonObject(profileConfig.secretFile, {
    label: "Database secret",
  });
  const metadataFile = options.metadata || profileConfig.metadataFile || secret.metadataFile;
  if (!metadataFile) {
    throw new Error(
      "Database metadata file is required until a concrete database connector is configured.",
    );
  }
  const metadataPath = resolveConfigRelativePath(configDir, metadataFile);
  const metadata = readRequiredJsonObject(metadataPath, {
    label: "Database metadata",
  });

  const outputRoot = resolveConfigRelativePath(
    configDir,
    options.output || config.runtime?.outputDir || "./outputs",
  );
  const outputPath = path.join(outputRoot, system.code, "database-profile.json");
  const profile = normalizeDatabaseProfile(metadata, {
    system,
    secret,
    mode: "metadata-file",
    includeSchemas: profileConfig.includeSchemas,
    allowSampleData: profileConfig.allowSampleData,
    sampleRows: profileConfig.sampleRows,
  });
  writeJson(outputPath, profile);
  return { outputPath, profile };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.system) {
    throw new Error(
      "Usage: node scripts/collect-database-profile.js --config config/systems.local.yaml --system <code>",
    );
  }
  const result = collectDatabaseProfile(args);
  console.log(`Database profile written: ${result.outputPath}`);
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
  collectDatabaseProfile,
  normalizeDatabaseProfile,
  resolveDatabaseProfileConfig,
  sanitizeSampleRow,
  sanitizeSecret,
};
