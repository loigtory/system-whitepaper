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

const OPTIONAL_DRIVER_MODULES = {
  mysql: "mysql2/promise",
  mysql2: "mysql2/promise",
  postgres: "pg",
  postgresql: "pg",
};
const MAX_DATABASE_PROFILE_SAMPLE_ROWS = 3;
const MAX_CONNECTOR_SAMPLE_ROWS = MAX_DATABASE_PROFILE_SAMPLE_ROWS;
const MAX_CONNECTOR_SAMPLE_TABLES = 50;
const MAX_CONNECTOR_SAMPLE_COLUMNS = 20;
const SENSITIVE_VALUE_PATTERN = /\b1[3-9]\d{9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:\d{15}|\d{17}[0-9X])\b/i;
const SENSITIVE_CONTEXT_PATTERN = /(customer|client|user|username)/i;
const SENSITIVE_LOCALE_PATTERN = /(\u59d3\u540d|\u624b\u673a|\u7535\u8bdd|\u90ae\u7bb1|\u8bc1\u4ef6|\u8eab\u4efd\u8bc1|\u94f6\u884c\u5361|\u5730\u5740|\u5ba2\u6237|\u7528\u6237|\u8d26\u53f7|\u8d26\u6237)/u;

function isSensitiveDataText(text) {
  return SENSITIVE_DATA_PATTERN.test(text) || SENSITIVE_CONTEXT_PATTERN.test(text) || SENSITIVE_LOCALE_PATTERN.test(text);
}

function maskValue(value) {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (text.length <= 2) return "***";
  return `${text.slice(0, 1)}***${text.slice(-1)}`;
}

function maskSensitiveSampleValue(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) return "[redacted]";
  return maskValue(value);
}

function sanitizeSampleValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeSampleValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveDataText(key) ? maskSensitiveSampleValue(item) : sanitizeSampleValue(item),
      ]),
    );
  }
  if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) return maskValue(value);
  return value;
}

function sanitizeSampleRow(row = {}, columns = []) {
  const sanitized = {};
  const sensitiveKeys = new Set(
    (columns || [])
      .filter((column) => isSensitiveDataText(`${column.name || ""} ${column.comment || ""}`))
      .map((column) => String(column.name || "")),
  );
  for (const [key, value] of Object.entries(row || {})) {
    const sensitive =
      isSensitiveDataText(key) ||
      sensitiveKeys.has(key) ||
      (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value));
    sanitized[key] = sensitive ? maskSensitiveSampleValue(value) : sanitizeSampleValue(value);
  }
  return sanitized;
}

function sanitizeSecretValue(key, value) {
  if (SECRET_FIELD_PATTERN.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => sanitizeSecretValue("", item));
  if (value && typeof value === "object") return sanitizeSecret(value);
  return value;
}

function sanitizeSecret(secret = {}) {
  if (!secret || typeof secret !== "object" || Array.isArray(secret)) return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(secret)) {
    sanitized[key] = sanitizeSecretValue(key, value);
  }
  return sanitized;
}

function normalizeConnectorType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "mysql2") return "mysql";
  if (type === "postgresql") return "postgres";
  return type;
}

function redactConnectionSource(secret = {}) {
  return sanitizeSecret({
    type: secret.type || secret.databaseType || "",
    driver: secret.driver || "",
    host: secret.host || "",
    port: secret.port || "",
    database: secret.database || secret.db || "",
    user: secret.user || secret.username || "",
    readOnly: Boolean(secret.readOnly),
  });
}

function assertReadOnlyConnector(secret = {}, profileConfig = {}) {
  if (secret.readOnly === true || profileConfig.readOnly === true) return;
  throw new Error(
    "Database connector mode requires readOnly=true in secrets/db/<system>.json or databaseProfile.readOnly.",
  );
}

function loadOptionalDriver(type) {
  const moduleName = OPTIONAL_DRIVER_MODULES[type];
  if (!moduleName) {
    throw new Error(`Unsupported database connector type: ${type || "unknown"}`);
  }
  try {
    return require(moduleName);
  } catch {
    throw new Error(
      `Database connector driver is not installed: ${moduleName}. Install it locally or provide metadataFile.`,
    );
  }
}

function normalizeOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1", "on"].includes(text)) return true;
  if (["false", "no", "n", "0", "off"].includes(text)) return false;
  return Boolean(value);
}

function normalizePrimaryKeyFlag(value) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["pri", "primary", "pk", "pkey", "true", "yes", "y", "1", "on"].includes(text)) return true;
  if (["false", "no", "n", "0", "off"].includes(text)) return false;
  return Boolean(value);
}

function normalizeColumn(column = {}) {
  return {
    name: String(column.name || column.columnName || ""),
    type: String(column.type || column.dataType || ""),
    comment: String(column.comment || column.description || ""),
    nullable: normalizeOptionalBoolean(column.nullable),
    primaryKey: normalizePrimaryKeyFlag(column.primaryKey ?? column.isPrimaryKey),
    dictionary: Array.isArray(column.dictionary) ? column.dictionary : [],
  };
}

function normalizeTable(table = {}, options = {}) {
  const columns = Array.isArray(table.columns) ? table.columns.map(normalizeColumn) : [];
  const sampleRows = options.allowSampleData && Array.isArray(table.sampleRows)
    ? table.sampleRows.slice(0, options.sampleRows).map((row) => sanitizeSampleRow(row, columns))
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

function groupColumnsByTable(rows = []) {
  const tables = new Map();
  for (const row of rows || []) {
    const schema = String(row.schema || row.table_schema || "");
    const name = String(row.name || row.table_name || "");
    if (!name) continue;
    const key = `${schema}.${name}`;
    if (!tables.has(key)) {
      tables.set(key, {
        schema,
        name,
        comment: String(row.tableComment || row.table_comment || ""),
        rowCount: Number.isFinite(Number(row.rowCount ?? row.table_rows))
          ? Number(row.rowCount ?? row.table_rows)
          : null,
        columns: [],
      });
    }
    tables.get(key).columns.push({
      name: row.columnName || row.column_name,
      type: row.dataType || row.data_type || row.columnType || row.column_type,
      comment: row.columnComment || row.column_comment,
      nullable: normalizeOptionalBoolean(row.nullable ?? row.is_nullable),
      primaryKey: normalizePrimaryKeyFlag(row.primaryKey ?? row.column_key),
    });
  }
  return [...tables.values()];
}

function resolveConnectorSampleLimit(profileConfig = {}) {
  if (!profileConfig.allowSampleData) return 0;
  const requested = Number(profileConfig.sampleRows || 0);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), MAX_CONNECTOR_SAMPLE_ROWS);
}

function resolveDatabaseProfileSampleLimit(profileConfig = {}) {
  if (!profileConfig.allowSampleData) return 0;
  const requested = Number(profileConfig.sampleRows || 0);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(Math.floor(requested), MAX_DATABASE_PROFILE_SAMPLE_ROWS);
}

function resolveConnectorSampleTableLimit(profileConfig = {}) {
  const requested = Number(profileConfig.sampleTables || 0);
  if (!Number.isFinite(requested) || requested <= 0) return MAX_CONNECTOR_SAMPLE_TABLES;
  return Math.min(Math.floor(requested), MAX_CONNECTOR_SAMPLE_TABLES);
}

function isSensitiveSampleColumn(column = {}) {
  return isSensitiveDataText(`${column.name || ""} ${column.comment || ""}`);
}

function selectSampleColumns(table = {}) {
  return (table.columns || [])
    .filter((column) => column.name && !isSensitiveSampleColumn(column))
    .slice(0, MAX_CONNECTOR_SAMPLE_COLUMNS);
}

function quoteMysqlIdentifier(value) {
  return `\`${String(value || "").replace(/`/g, "``")}\``;
}

function quotePostgresIdentifier(value) {
  return `"${String(value || "").replace(/"/g, "\"\"")}"`;
}

function qualifyTableName(table = {}, quoteIdentifier) {
  const parts = [table.schema, table.name].filter(Boolean).map(quoteIdentifier);
  return parts.join(".");
}

async function attachMysqlSampleRows(connection, tables = [], profileConfig = {}) {
  const sampleLimit = resolveConnectorSampleLimit(profileConfig);
  if (!sampleLimit) return;
  const tableLimit = resolveConnectorSampleTableLimit(profileConfig);
  for (const table of tables.slice(0, tableLimit)) {
    const columns = selectSampleColumns(table);
    if (!columns.length) {
      table.sampleRows = [];
      continue;
    }
    const sql = [
      `SELECT ${columns.map((column) => quoteMysqlIdentifier(column.name)).join(", ")}`,
      `FROM ${qualifyTableName(table, quoteMysqlIdentifier)}`,
      "LIMIT ?",
    ].join(" ");
    try {
      const [rows] = await connection.execute(sql, [sampleLimit]);
      table.sampleRows = (rows || []).slice(0, sampleLimit).map((row) => sanitizeSampleRow(row, table.columns));
    } catch {
      table.sampleRows = [];
    }
  }
}

async function attachPostgresSampleRows(client, tables = [], profileConfig = {}) {
  const sampleLimit = resolveConnectorSampleLimit(profileConfig);
  if (!sampleLimit) return;
  const tableLimit = resolveConnectorSampleTableLimit(profileConfig);
  for (const table of tables.slice(0, tableLimit)) {
    const columns = selectSampleColumns(table);
    if (!columns.length) {
      table.sampleRows = [];
      continue;
    }
    const sql = [
      `SELECT ${columns.map((column) => quotePostgresIdentifier(column.name)).join(", ")}`,
      `FROM ${qualifyTableName(table, quotePostgresIdentifier)}`,
      "LIMIT $1",
    ].join(" ");
    try {
      const result = await client.query(sql, [sampleLimit]);
      table.sampleRows = (result.rows || []).slice(0, sampleLimit).map((row) => sanitizeSampleRow(row, table.columns));
    } catch {
      table.sampleRows = [];
    }
  }
}

function resolveIncludeSchemas(secret = {}, profileConfig = {}, fallback = [secret.database || secret.db]) {
  const schemas = Array.isArray(profileConfig.includeSchemas) && profileConfig.includeSchemas.length
    ? profileConfig.includeSchemas
    : fallback;
  const normalized = schemas.map((item) => String(item || "").trim()).filter(Boolean);
  if (!normalized.length) {
    throw new Error("databaseProfile.includeSchemas or secret.database is required for connector mode.");
  }
  return normalized;
}

function appendSqlInPlaceholders(values = []) {
  return values.map(() => "?").join(", ");
}

async function collectMysqlMetadata(driver, secret = {}, profileConfig = {}) {
  const connection = await driver.createConnection({
    host: secret.host,
    port: secret.port,
    user: secret.user || secret.username,
    password: secret.password,
    database: secret.database || secret.db,
    ssl: secret.ssl,
  });
  try {
    const schemas = resolveIncludeSchemas(secret, profileConfig, [secret.database || secret.db].filter(Boolean));
    const [rows] = await connection.execute(
      [
        "SELECT c.TABLE_SCHEMA AS `schema`, c.TABLE_NAME AS name,",
        "t.TABLE_COMMENT AS tableComment, t.TABLE_ROWS AS rowCount,",
        "c.COLUMN_NAME AS columnName, c.COLUMN_TYPE AS columnType, c.DATA_TYPE AS dataType,",
        "c.COLUMN_COMMENT AS columnComment, c.IS_NULLABLE AS is_nullable, c.COLUMN_KEY AS column_key",
        "FROM information_schema.COLUMNS c",
        "LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME",
        `WHERE c.TABLE_SCHEMA IN (${appendSqlInPlaceholders(schemas)})`,
        "ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION",
      ].join(" "),
      schemas,
    );
    const tables = groupColumnsByTable(rows);
    await attachMysqlSampleRows(connection, tables, profileConfig);
    return {
      databaseType: "mysql",
      tables,
    };
  } finally {
    await connection.end();
  }
}

async function collectPostgresMetadata(driver, secret = {}, profileConfig = {}) {
  const client = new driver.Client({
    host: secret.host,
    port: secret.port,
    user: secret.user || secret.username,
    password: secret.password,
    database: secret.database || secret.db,
    ssl: secret.ssl,
  });
  await client.connect();
  try {
    const schemas = resolveIncludeSchemas(secret, profileConfig, ["public"]);
    const result = await client.query(
      [
        "SELECT c.table_schema AS schema, c.table_name AS name,",
        "NULL AS \"tableComment\",",
        "NULL AS \"rowCount\", c.column_name AS \"columnName\", c.data_type AS \"dataType\",",
        "NULL AS \"columnComment\",",
        "c.is_nullable, false AS \"primaryKey\"",
        "FROM information_schema.columns c",
        "WHERE c.table_schema = ANY($1)",
        "ORDER BY c.table_schema, c.table_name, c.ordinal_position",
      ].join(" "),
      [schemas],
    );
    const tables = groupColumnsByTable(result.rows);
    await attachPostgresSampleRows(client, tables, profileConfig);
    return {
      databaseType: "postgres",
      tables,
    };
  } finally {
    await client.end();
  }
}

async function collectMetadataViaConnector(secret = {}, profileConfig = {}, options = {}) {
  assertReadOnlyConnector(secret, profileConfig);
  const type = normalizeConnectorType(secret.type || secret.databaseType || profileConfig.type);
  const adapter = options.adapter || options.connectorAdapter;
  if (adapter) {
    const metadata = await adapter({ secret, profileConfig, type });
    return {
      databaseType: metadata.databaseType || type,
      tables: Array.isArray(metadata.tables) ? metadata.tables : [],
    };
  }
  const driver = options.driver || loadOptionalDriver(type);
  if (type === "mysql") return collectMysqlMetadata(driver, secret, profileConfig);
  if (type === "postgres") return collectPostgresMetadata(driver, secret, profileConfig);
  throw new Error(`Unsupported database connector type: ${type || "unknown"}`);
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
    sampleRows: Math.min(
      MAX_DATABASE_PROFILE_SAMPLE_ROWS,
      Math.max(0, Number(context.sampleRows ?? 0)),
    ),
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
      secret: context.mode === "connector" ? redactConnectionSource(context.secret || {}) : sanitizeSecret(context.secret || {}),
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
    mode: String(profile.mode || "").trim(),
    type: profile.type || "",
    readOnly: profile.readOnly === undefined ? null : Boolean(profile.readOnly),
    includeSchemas: Array.isArray(profile.includeSchemas) ? profile.includeSchemas : [],
    allowSampleData: Boolean(profile.allowSampleData),
    sampleRows: Math.max(0, Number(profile.sampleRows || 0)),
    sampleTables: Math.max(0, Number(profile.sampleTables || 0)),
  };
}

function normalizeComparablePath(value) {
  if (!value) return "";
  const normalized = path.resolve(String(value)).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameResolvedPath(left, right) {
  return Boolean(
    normalizeComparablePath(left) &&
      normalizeComparablePath(left) === normalizeComparablePath(right),
  );
}

function isPathInsideDirectory(filePath, directoryPath) {
  const resolvedFile = path.resolve(String(filePath || ""));
  const resolvedDirectory = path.resolve(String(directoryPath || ""));
  const relative = path.relative(resolvedDirectory, resolvedFile);
  return Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowUnsafeExternalDbPaths(options = {}) {
  return Boolean(
    options.unsafeAllowExternalDbPaths ||
      options["unsafe-allow-external-db-paths"] ||
      options.allowExternalDbPaths,
  );
}

function resolvePrivateDatabaseSecretsDir(configDir) {
  return resolveConfigRelativePath(configDir, "secrets/db");
}

function resolveExpectedDatabaseSecretPath(system = {}, configDir) {
  const code = String(system.code || system.systemCode || "").trim();
  if (!code) return "";
  return path.join(resolvePrivateDatabaseSecretsDir(configDir), `${code}.json`);
}

function assertPrivateDatabaseSecretPath(system = {}, configDir, profileConfig = {}, options = {}) {
  const secretFile = profileConfig.secretFile || "";
  if (!secretFile || allowUnsafeExternalDbPaths(options)) return secretFile;
  const expectedPath = resolveExpectedDatabaseSecretPath(system, configDir);
  if (!sameResolvedPath(secretFile, expectedPath)) {
    throw new Error(
      `databaseProfile.secretFile must be secrets/db/${system.code}.json for system ${system.code}; actual=${secretFile}`,
    );
  }
  return secretFile;
}

function assertPrivateDatabaseMetadataPath(system = {}, configDir, metadataFile, options = {}) {
  if (!metadataFile || allowUnsafeExternalDbPaths(options)) {
    return metadataFile ? resolveConfigRelativePath(configDir, metadataFile) : "";
  }
  const metadataPath = resolveConfigRelativePath(configDir, metadataFile);
  const secretsDir = resolvePrivateDatabaseSecretsDir(configDir);
  if (!isPathInsideDirectory(metadataPath, secretsDir)) {
    throw new Error(
      `database metadata file for system ${system.code} must stay under secrets/db/: actual=${metadataPath}`,
    );
  }
  return metadataPath;
}

async function collectDatabaseProfile(options = {}) {
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
  assertPrivateDatabaseSecretPath(system, configDir, profileConfig, options);
  const secret = readRequiredJsonObject(profileConfig.secretFile, {
    label: "Database secret",
  });
  const metadataFile = options.metadata || profileConfig.metadataFile || secret.metadataFile;
  const useConnector = Boolean(options.connector || profileConfig.mode === "connector" || (!metadataFile && options.adapter));
  let metadata = null;
  let mode = "metadata-file";
  if (useConnector) {
    metadata = await collectMetadataViaConnector(secret, profileConfig, options);
    mode = "connector";
  } else {
    if (!metadataFile) {
      throw new Error(
        "Database metadata file is required unless connector mode is enabled.",
      );
    }
    const metadataPath = assertPrivateDatabaseMetadataPath(system, configDir, metadataFile, options);
    metadata = readRequiredJsonObject(metadataPath, {
      label: "Database metadata",
    });
  }

  const outputRoot = resolveConfigRelativePath(
    configDir,
    options.output || config.runtime?.outputDir || "./outputs",
  );
  const outputPath = path.join(outputRoot, system.code, "database-profile.json");
  const profile = normalizeDatabaseProfile(metadata, {
    system,
    secret,
    mode,
    includeSchemas: profileConfig.includeSchemas,
    allowSampleData: profileConfig.allowSampleData,
    sampleRows: resolveDatabaseProfileSampleLimit(profileConfig),
  });
  writeJson(outputPath, profile);
  return { outputPath, profile };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config || !args.system) {
    throw new Error(
      "Usage: node scripts/collect-database-profile.js --config config/systems.local.yaml --system <code>",
    );
  }
  const result = await collectDatabaseProfile(args);
  console.log(`Database profile written: ${result.outputPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  assertReadOnlyConnector,
  assertPrivateDatabaseMetadataPath,
  assertPrivateDatabaseSecretPath,
  collectDatabaseProfile,
  collectMetadataViaConnector,
  groupColumnsByTable,
  MAX_DATABASE_PROFILE_SAMPLE_ROWS,
  normalizeDatabaseProfile,
  resolveIncludeSchemas,
  resolveDatabaseProfileConfig,
  resolveDatabaseProfileSampleLimit,
  resolveExpectedDatabaseSecretPath,
  resolvePrivateDatabaseSecretsDir,
  sanitizeSampleRow,
  sanitizeSecret,
};
