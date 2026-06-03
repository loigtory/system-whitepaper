const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");

const REGISTRY_SHEET_NAME = "系统清单";
const REGISTRY_HEADERS = [
  "启用",
  "简称code",
  "系统名称",
  "测试环境URL",
  "负责部门",
  "优先级",
  "环境域名",
  "环境IP",
  "允许写操作",
  "禁止操作",
  "备注",
];

const REGISTRY_HEADER_ALIASES = {
  enabled: ["enabled", "启用", "enable", "是否启用"],
  code: ["code", "简称code", "简称", "系统简称", "系统code"],
  name: ["name", "系统名称", "名称", "系统全称"],
  url: ["url", "测试环境url", "测试环境URL", "入口", "测试入口"],
  owner: ["owner", "负责部门", "归属", "业务方"],
  priority: ["priority", "优先级"],
  menuapipath: ["menuapipath", "菜单api", "菜单API", "menuApiPath"],
  expectedhost_hostname: [
    "expectedhost_hostname",
    "环境域名",
    "域名",
    "expectedHost.hostname",
  ],
  expectedhost_allowedips: [
    "expectedhost_allowedips",
    "环境ip",
    "环境IP",
    "ip白名单",
    "allowedIps",
  ],
  allowedwriteactions: ["allowedwriteactions", "允许写操作", "允许操作"],
  forbiddenactions: ["forbiddenactions", "禁止操作", "禁止动作"],
  notes: ["notes", "备注", "说明"],
};

function normalizeRegistryHeader(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/^\uFEFF/, "");
  const key = raw.toLowerCase().replace(/\s+/g, "");
  for (const [field, aliases] of Object.entries(REGISTRY_HEADER_ALIASES)) {
    if (
      aliases.some((alias) => alias.toLowerCase().replace(/\s+/g, "") === key) ||
      field === key
    ) {
      return field;
    }
  }
  return "";
}

function cellToString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseRegistryTable(tableRows) {
  const rows = (tableRows || []).filter((row) =>
    (row || []).some((cell) => cellToString(cell)),
  );
  if (!rows.length) return [];

  const headerCells = rows[0].map((cell) => cellToString(cell));
  const headerMap = headerCells.map((cell) => normalizeRegistryHeader(cell));
  const missing = ["code", "name", "url"].filter((field) => !headerMap.includes(field));
  if (missing.length) {
    throw new Error(
      `系统清单缺少必要列：${missing.join(", ")}（需要 简称code / 系统名称 / 测试环境URL）`,
    );
  }

  const parsed = [];
  for (let lineIndex = 1; lineIndex < rows.length; lineIndex += 1) {
    const cells = rows[lineIndex].map((cell) => cellToString(cell));
    if (!cells.some(Boolean)) continue;
    const row = {};
    for (let colIndex = 0; colIndex < headerMap.length; colIndex += 1) {
      const field = headerMap[colIndex];
      if (!field) continue;
      row[field] = cells[colIndex] ?? "";
    }
    parsed.push(row);
  }
  return parsed;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return [];
  return parseRegistryTable(lines.map((line) => parseCsvLine(line)));
}

function parseXlsxBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName =
    workbook.SheetNames.find((name) => name === REGISTRY_SHEET_NAME) ||
    workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const tableRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return parseRegistryTable(tableRows);
}

function parseRegistryFile(registryPath) {
  const ext = path.extname(registryPath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return parseXlsxBuffer(fs.readFileSync(registryPath));
  }
  if (ext === ".csv") {
    return parseCsv(fs.readFileSync(registryPath, "utf8"));
  }
  throw new Error(`不支持的系统清单格式：${ext}（请使用 .xlsx 或 .csv）`);
}

function parseSemicolonList(value) {
  return String(value || "")
    .split(/[;；|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRegistryRowEnabled(value) {
  const normalized = String(value || "Y")
    .trim()
    .toLowerCase();
  return !["n", "no", "0", "false", "否", "禁用", "disabled"].includes(normalized);
}

function rowValue(row, field) {
  if (row[field] != null && String(row[field]).trim()) return String(row[field]).trim();
  const lower = String(field).toLowerCase();
  if (row[lower] != null && String(row[lower]).trim()) return String(row[lower]).trim();
  return "";
}

function registryRowToSystem(row) {
  const code = rowValue(row, "code");
  const name = rowValue(row, "name");
  const url = rowValue(row, "url");
  if (!code || !name || !url) {
    throw new Error(`系统清单行不完整（code/name/url 必填）：${JSON.stringify(row)}`);
  }

  const system = { code, name, url };
  const owner = rowValue(row, "owner");
  const priority = rowValue(row, "priority");
  if (owner) system.owner = owner;
  if (priority) system.priority = priority;

  const hostname = rowValue(row, "expectedHost_hostname");
  const allowedIps = parseSemicolonList(rowValue(row, "expectedHost_allowedIps"));
  if (hostname || allowedIps.length) {
    system.expectedHost = { hostname };
    if (allowedIps.length) system.expectedHost.allowedIps = allowedIps;
  }

  const allowedWriteActions = parseSemicolonList(rowValue(row, "allowedWriteActions"));
  if (allowedWriteActions.length) system.allowedWriteActions = allowedWriteActions;

  const forbiddenActions = parseSemicolonList(rowValue(row, "forbiddenActions"));
  if (forbiddenActions.length) system.forbiddenActions = forbiddenActions;

  return system;
}

function parseSystemsRegistryRows(rows) {
  return rows
    .filter((row) => isRegistryRowEnabled(rowValue(row, "enabled")))
    .map((row) => registryRowToSystem(row));
}

function parseSystemsRegistryCsv(text) {
  return parseSystemsRegistryRows(parseCsv(text));
}

function parseSystemsRegistryFile(registryPath) {
  return parseSystemsRegistryRows(parseRegistryFile(registryPath));
}

function systemToRegistryRow(system) {
  return [
    "Y",
    system.code || "",
    system.name || "",
    system.url || "",
    system.owner || "",
    system.priority || "",
    system.expectedHost?.hostname || "",
    (system.expectedHost?.allowedIps || []).join(";"),
    (system.allowedWriteActions || []).join(";"),
    (system.forbiddenActions || []).join(";"),
    "",
  ];
}

function exportSystemsToRegistryXlsx(systems, registryPath) {
  const tableRows = [REGISTRY_HEADERS, ...(systems || []).map(systemToRegistryRow)];
  const worksheet = XLSX.utils.aoa_to_sheet(tableRows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 18 },
    { wch: 42 },
    { wch: 12 },
    { wch: 10 },
    { wch: 28 },
    { wch: 16 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, REGISTRY_SHEET_NAME);
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  XLSX.writeFile(workbook, registryPath);
}

function exportSystemsToRegistryCsv(systems, registryPath) {
  const header = `${REGISTRY_HEADERS.join(",")}\n`;
  const rows = (systems || []).map((system) =>
    systemToRegistryRow(system)
      .map((cell) => {
        const text = String(cell);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(","),
  );
  const body = `\uFEFF${header}${rows.join("\n")}\n`;
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, body, "utf8");
}

function exportSystemsToRegistryFile(systems, registryPath) {
  const ext = path.extname(registryPath).toLowerCase();
  if (ext === ".csv") {
    exportSystemsToRegistryCsv(systems, registryPath);
    return;
  }
  exportSystemsToRegistryXlsx(systems, registryPath);
}

function resolveDefaultRegistryPath(configDir) {
  const xlsxPath = path.join(configDir, "systems-registry.xlsx");
  const csvPath = path.join(configDir, "systems-registry.csv");
  if (fs.existsSync(xlsxPath)) return xlsxPath;
  if (fs.existsSync(csvPath)) return csvPath;
  return xlsxPath;
}

function yamlScalar(value) {
  const text = String(value ?? "");
  if (/[:#{}[\],&*?|>-]/.test(text) || /^\s/.test(text)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function serializeSystemsToYaml(systems) {
  const lines = ["systems:"];
  if (!systems.length) {
    lines.push("  []");
    return lines.join("\n");
  }

  for (const system of systems) {
    lines.push(`  - code: ${yamlScalar(system.code)}`);
    lines.push(`    name: ${yamlScalar(system.name)}`);
    lines.push(`    url: ${yamlScalar(system.url)}`);
    if (system.owner) lines.push(`    owner: ${yamlScalar(system.owner)}`);
    if (system.priority) lines.push(`    priority: ${yamlScalar(system.priority)}`);
    if (system.menuApiPath) lines.push(`    menuApiPath: ${yamlScalar(system.menuApiPath)}`);

    if (system.expectedHost) {
      lines.push("    expectedHost:");
      if (system.expectedHost.hostname) {
        lines.push(`      hostname: ${yamlScalar(system.expectedHost.hostname)}`);
      }
      if (system.expectedHost.allowedIps?.length) {
        lines.push("      allowedIps:");
        for (const ip of system.expectedHost.allowedIps) {
          lines.push(`        - ${yamlScalar(ip)}`);
        }
      }
    }

    if (system.allowedWriteActions?.length) {
      lines.push("    allowedWriteActions:");
      for (const action of system.allowedWriteActions) {
        lines.push(`      - ${yamlScalar(action)}`);
      }
    }

    if (system.forbiddenActions?.length) {
      lines.push("    forbiddenActions:");
      for (const action of system.forbiddenActions) {
        lines.push(`      - ${yamlScalar(action)}`);
      }
    }
  }

  return lines.join("\n");
}

function replaceSystemsSection(configText, systemsYaml) {
  const match = configText.match(/^systems:/m);
  if (!match) {
    throw new Error("配置文件中未找到 systems: 段，无法同步系统清单");
  }
  const head = configText.slice(0, match.index).replace(/\s+$/, "");
  return `${head}\n\n${systemsYaml.trimEnd()}\n`;
}

function mergeRegistrySystemWithExisting(registrySystem, existingSystem) {
  if (!existingSystem) return registrySystem;
  const merged = { ...registrySystem };
  const technicalFields = ["menuApiPath", "expectedHost"];
  for (const field of technicalFields) {
    if (existingSystem[field] && !registrySystem[field]) {
      merged[field] = existingSystem[field];
    }
  }
  return merged;
}

function mergeRegistrySystemsWithExisting(registrySystems, existingSystems) {
  const existingByCode = new Map((existingSystems || []).map((item) => [item.code, item]));
  return (registrySystems || []).map((item) =>
    mergeRegistrySystemWithExisting(item, existingByCode.get(item.code)),
  );
}

function syncSystemsRegistryToConfig({ configPath, registryPath, parseConfig = null }) {
  const registrySystems = parseSystemsRegistryFile(registryPath);
  let existingSystems = [];
  if (parseConfig && fs.existsSync(configPath)) {
    existingSystems = parseConfig(fs.readFileSync(configPath, "utf8")).systems || [];
  }
  const systems = mergeRegistrySystemsWithExisting(registrySystems, existingSystems);
  const configText = fs.readFileSync(configPath, "utf8");
  const nextText = replaceSystemsSection(configText, serializeSystemsToYaml(systems));
  fs.writeFileSync(configPath, nextText, "utf8");
  return { systemsCount: systems.length, systems, registryPath };
}

module.exports = {
  REGISTRY_HEADERS,
  REGISTRY_SHEET_NAME,
  exportSystemsToRegistryCsv,
  exportSystemsToRegistryFile,
  exportSystemsToRegistryXlsx,
  parseCsv,
  mergeRegistrySystemWithExisting,
  mergeRegistrySystemsWithExisting,
  parseRegistryFile,
  parseSystemsRegistryCsv,
  parseSystemsRegistryFile,
  parseSystemsRegistryRows,
  registryRowToSystem,
  replaceSystemsSection,
  resolveDefaultRegistryPath,
  serializeSystemsToYaml,
  syncSystemsRegistryToConfig,
};
