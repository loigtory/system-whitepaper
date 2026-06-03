#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  isPlaceholderSecret,
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  resolveConfigRelativePath,
} = require("./system-whitepaper-lib");
const { resolveDatabaseProfileConfig } = require("./collect-database-profile");

function pushIssue(list, id, message, details = {}) {
  list.push({ id, message, ...details });
}

function checkWritableDirectory(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function validateAuth(config, failures, warnings, checks) {
  const auth = config.auth || {};
  const tokenFile = auth.tokenFile || "";
  const cookieHeaderFile = auth.cookieHeaderFile || "";

  if (!tokenFile && !cookieHeaderFile) {
    pushIssue(
      failures,
      "auth.missing-secret-path",
      "auth.tokenFile or auth.cookieHeaderFile must be configured.",
    );
    return;
  }

  if (tokenFile) {
    if (!fs.existsSync(tokenFile)) {
      pushIssue(failures, "auth.token-file-missing", `Token file not found: ${tokenFile}`);
    } else {
      const token = fs.readFileSync(tokenFile, "utf8");
      if (isPlaceholderSecret(token)) {
        pushIssue(failures, "auth.token-placeholder", `Token file is empty or placeholder: ${tokenFile}`);
      } else {
        checks.push({ id: "auth.token-file", status: "pass", message: "Token file is present." });
      }
    }
  }

  if (cookieHeaderFile) {
    if (!fs.existsSync(cookieHeaderFile)) {
      pushIssue(
        warnings,
        "auth.cookie-file-missing",
        `Cookie header file not found: ${cookieHeaderFile}; token refresh may still work.`,
      );
    } else {
      checks.push({
        id: "auth.cookie-header-file",
        status: "pass",
        message: "Cookie header file is present.",
      });
    }
  }
}

function validateRuntime(config, configDir, failures, warnings, checks) {
  const runtime = config.runtime || {};
  const environment = String(runtime.environment || "").trim();
  if (!environment) {
    pushIssue(warnings, "runtime.environment-missing", "runtime.environment is not configured.");
  } else if (environment !== "test") {
    pushIssue(
      warnings,
      "runtime.environment-not-test",
      `runtime.environment is "${environment}", expected "test" for this skill.`,
    );
  } else {
    checks.push({ id: "runtime.environment", status: "pass", message: "Runtime environment is test." });
  }

  const testDataPrefix = String(runtime.testDataPrefix || "").trim();
  if (!testDataPrefix) {
    pushIssue(failures, "runtime.test-data-prefix-missing", "runtime.testDataPrefix is required.");
  } else if (!testDataPrefix.startsWith("AI_AUTO_TEST_")) {
    pushIssue(
      failures,
      "runtime.test-data-prefix-unsafe",
      'runtime.testDataPrefix must start with "AI_AUTO_TEST_".',
      { value: testDataPrefix },
    );
  } else {
    checks.push({
      id: "runtime.test-data-prefix",
      status: "pass",
      message: "Test data prefix is safe.",
    });
  }

  const outputDir = resolveConfigRelativePath(configDir, runtime.outputDir || "./outputs");
  if (!fs.existsSync(outputDir)) {
    pushIssue(warnings, "runtime.output-dir-missing", `Output directory not found: ${outputDir}`);
  } else if (!checkWritableDirectory(outputDir)) {
    pushIssue(failures, "runtime.output-dir-not-writable", `Output directory is not writable: ${outputDir}`);
  } else {
    checks.push({ id: "runtime.output-dir", status: "pass", message: "Output directory is writable." });
  }

  const concurrency = Number(runtime.concurrency || 1);
  if (Number.isNaN(concurrency) || concurrency < 1) {
    pushIssue(failures, "runtime.concurrency-invalid", "runtime.concurrency must be a positive number.");
  } else if (concurrency > 1) {
    pushIssue(
      warnings,
      "runtime.concurrency-parallel",
      "runtime.concurrency is greater than 1; ensure each system writes to a separate output directory.",
    );
  }
}

function validateSystem(system, index, seenCodes, failures, warnings, checks, configDir) {
  const label = system?.code || `system[${index}]`;
  if (!system || typeof system !== "object") {
    pushIssue(failures, "system.invalid", `System entry ${index} is not an object.`);
    return;
  }

  for (const key of ["code", "name", "url"]) {
    if (!String(system[key] || "").trim()) {
      pushIssue(failures, `system.${key}-missing`, `${label}: ${key} is required.`);
    }
  }

  const code = String(system.code || "").trim();
  if (code) {
    if (seenCodes.has(code)) {
      pushIssue(failures, "system.code-duplicate", `Duplicate system code: ${code}`);
    }
    seenCodes.add(code);
  }

  if (system.url) {
    try {
      const url = new URL(String(system.url));
      if (!["http:", "https:"].includes(url.protocol)) {
        pushIssue(failures, "system.url-invalid-protocol", `${label}: url must use http or https.`);
      }
    } catch {
      pushIssue(failures, "system.url-invalid", `${label}: url is invalid.`);
    }
  }

  for (const arrayKey of ["allowedWriteActions", "forbiddenActions"]) {
    if (system[arrayKey] !== undefined && !Array.isArray(system[arrayKey])) {
      pushIssue(failures, `system.${arrayKey}-invalid`, `${label}: ${arrayKey} must be a list.`);
    }
  }

  if (system.databaseProfile?.enabled) {
    const databaseProfile = resolveDatabaseProfileConfig(system, configDir);
    let databaseSecret = null;
    if (!databaseProfile.secretFile) {
      pushIssue(
        failures,
        "system.database-secret-missing",
        `${label}: databaseProfile.enabled is true but secretFile is not configured.`,
      );
    } else if (!fs.existsSync(databaseProfile.secretFile)) {
      pushIssue(
        failures,
        "system.database-secret-file-missing",
        `${label}: database secret file not found: ${databaseProfile.secretFile}`,
      );
    } else {
      try {
        databaseSecret = JSON.parse(fs.readFileSync(databaseProfile.secretFile, "utf8"));
        if (!databaseSecret || typeof databaseSecret !== "object" || Array.isArray(databaseSecret)) {
          throw new Error("not object");
        }
      } catch {
        pushIssue(
          failures,
          "system.database-secret-file-malformed",
          `${label}: database secret file must be a valid JSON object: ${databaseProfile.secretFile}`,
        );
      }
    }

    if (
      databaseProfile.mode !== "connector" &&
      databaseProfile.metadataFile &&
      !fs.existsSync(databaseProfile.metadataFile)
    ) {
      pushIssue(
        warnings,
        "system.database-metadata-file-missing",
        `${label}: database metadata file not found: ${databaseProfile.metadataFile}`,
      );
    }

    if (
      databaseProfile.mode === "connector" &&
      databaseProfile.readOnly !== true &&
      databaseSecret?.readOnly !== true
    ) {
      pushIssue(
        failures,
        "system.database-connector-readonly-missing",
        `${label}: databaseProfile.mode=connector requires databaseProfile.readOnly=true or secret readOnly=true.`,
      );
    }

    if (databaseProfile.allowSampleData) {
      pushIssue(
        warnings,
        "system.database-sample-data-enabled",
        `${label}: databaseProfile.allowSampleData is true; only redacted and limited samples should be used.`,
      );
    }
  }

  checks.push({ id: `system.${label}`, status: "pass", message: `${label}: basic metadata checked.` });
}

function runDoctor(options = {}) {
  const projectRoot = path.resolve(String(options.projectRoot || process.cwd()));
  const configPath = path.resolve(
    projectRoot,
    String(options.config || options.configPath || "config/systems.local.yaml"),
  );
  const configDir = path.dirname(configPath);
  const failures = [];
  const warnings = [];
  const checks = [];

  if (!fs.existsSync(configPath)) {
    pushIssue(
      failures,
      "config.missing",
      `Config not found: ${configPath}. Run "npm run init" first, then edit config/systems.local.yaml.`,
    );
    return { ok: false, configPath, failures, warnings, checks };
  }

  let config;
  try {
    config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
    normalizeAuthPaths(config, configDir);
    checks.push({ id: "config.parse", status: "pass", message: "Config parsed successfully." });
  } catch (error) {
    pushIssue(failures, "config.parse-failed", `Config parse failed: ${error.message}`);
    return { ok: false, configPath, failures, warnings, checks };
  }

  validateAuth(config, failures, warnings, checks);
  validateRuntime(config, configDir, failures, warnings, checks);

  const systems = Array.isArray(config.systems) ? config.systems : [];
  if (!systems.length) {
    pushIssue(failures, "systems.empty", "At least one system must be configured.");
  }
  const seenCodes = new Set();
  systems.forEach((system, index) =>
    validateSystem(system, index, seenCodes, failures, warnings, checks, configDir),
  );

  return {
    ok: failures.length === 0,
    configPath,
    failures,
    warnings,
    checks,
    counts: {
      failures: failures.length,
      warnings: warnings.length,
      checks: checks.length,
      systems: systems.length,
    },
  };
}

function formatDoctorReport(report) {
  const lines = [];
  lines.push(`System whitepaper doctor: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push(`Config: ${report.configPath}`);

  if (report.failures.length) {
    lines.push("");
    lines.push("Failures:");
    for (const item of report.failures) {
      lines.push(`- [${item.id}] ${item.message}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const item of report.warnings) {
      lines.push(`- [${item.id}] ${item.message}`);
    }
  }

  if (!report.failures.length && !report.warnings.length) {
    lines.push("No blocking issues or warnings found.");
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = runDoctor({
    config: args.config,
    projectRoot: args["project-root"],
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }

  if (!report.ok) {
    process.exit(1);
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
  formatDoctorReport,
  runDoctor,
};
