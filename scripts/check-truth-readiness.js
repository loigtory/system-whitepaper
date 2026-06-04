#!/usr/bin/env node

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { parseArgs, writeJson } = require("./system-whitepaper-lib");
const {
  assertValidFactCheckReportArtifact,
  assertValidVerifiedClaimsArtifact,
  buildFactCheckReport,
} = require("./fact-check-whitepaper");
const { assertValidNarrativeQualityReportArtifact } = require("./check-narrative");
const { assertValidQualityReportArtifact } = require("./check-quality");
const {
  assertValidOperationGuideGateArtifact,
  assertValidOperationSpecArtifact,
} = require("./operation-spec/lib");

const DEFAULT_THRESHOLD = 0.95;
const REDACTED_VALUE = "[redacted]";
const MAX_SAFE_SAMPLE_ROWS = 3;
const SECRET_KEY_PATTERN = /(password|passwd|pwd|secret|token|key|credential|dsn|url|host|port|user|username|conn|connection|jdbc)/i;
const SENSITIVE_DATA_KEY_PATTERN =
  /(phone|mobile|tel|email|idcard|identity|cert|card|bank|account|address|name|customer|client|user|\u59d3\u540d|\u624b\u673a|\u7535\u8bdd|\u90ae\u7bb1|\u8bc1\u4ef6|\u8eab\u4efd\u8bc1|\u94f6\u884c\u5361|\u5730\u5740|\u5ba2\u6237|\u7528\u6237|\u8d26\u53f7|\u8d26\u6237)/i;
const SENSITIVE_SAMPLE_VALUE_PATTERN =
  /\b1[3-9]\d{9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:\d{15}|\d{17}[0-9X])\b|\b(?:\d[ -]?){13,19}\b/i;
const ALLOWED_SOURCE_SECRET_KEYS = new Set(["type", "databaseType", "driver", "database", "db", "readOnly", "mode"]);

const REQUIRED_ARTIFACTS = {
  quality: "quality-report.json",
  narrative: "narrative-quality-report.json",
  claims: "verified-claims.json",
  factCheck: "fact-check-report.json",
};

const OPTIONAL_ARTIFACTS = {
  evidence: "evidence.json",
  evidenceSummary: "evidence-summary.json",
  operationSpec: "operation-spec.json",
  operationGuideGate: "operation-guide-gate.json",
  dataDictionary: "data-dictionary.json",
  entityModel: "entity-model.json",
  functionUniverse: "function-universe.json",
  databaseProfile: "database-profile.json",
};

const CONTENT_ARTIFACTS = {
  pendingReview: "whitepaper.pending-review.md",
};

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeThreshold(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_THRESHOLD;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_THRESHOLD;
  return clamp01(number > 1 ? number / 100 : number);
}

function percent(value) {
  return Math.round(clamp01(value) * 1000) / 10;
}

function assertJsonObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertFiniteNumber(value, message) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(message);
  }
}

function assertNumberRange(value, min, max, message) {
  assertFiniteNumber(value, message);
  const number = Number(value);
  if (number < min || number > max) {
    throw new Error(message);
  }
}

function assertBoolean(value, message) {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertMetricEquals(metrics = {}, key, expected, fileName, containerName = "metrics") {
  assertFiniteNumber(metrics[key], `${fileName} ${containerName}.${key} must be numeric.`);
  if (Number(metrics[key]) !== expected) {
    throw new Error(`${fileName} ${containerName}.${key} must match the artifact body count.`);
  }
}

function sameStringSet(left = [], right = []) {
  const normalize = (items) => [...new Set(items.map((item) => String(item ?? "")))].sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function numbersMatch(left, right, epsilon = 0.000001) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= epsilon;
}

function artifactKeyText(value) {
  return String(value || "").trim();
}

function functionUniverseFunctionKey(item = {}) {
  return `${artifactKeyText(item.module)}::${artifactKeyText(item.name)}`;
}

function functionUniverseLinkFunctionKey(item = {}) {
  return `${artifactKeyText(item.module)}::${artifactKeyText(item.function)}`;
}

function functionUniverseEntityKey(item = {}) {
  return `${artifactKeyText(item.table)}::${artifactKeyText(item.name)}`;
}

function functionUniverseLinkEntityKey(item = {}) {
  return `${artifactKeyText(item.table)}::${artifactKeyText(item.entity)}`;
}

function assertSourceArtifactObject(value, fileName) {
  assertJsonObject(value, `${fileName} sourceArtifacts must be a JSON object.`);
}

function assertValidDatabaseProfileArtifact(value = {}) {
  assertJsonObject(value, "database-profile.json must be a JSON object.");
  if (value.artifactType !== "database-profile") {
    throw new Error("database-profile.json artifactType must be database-profile.");
  }
  if (value.version !== undefined) {
    assertFiniteNumber(value.version, "database-profile.json version must be numeric when present.");
  }
  if (value.generatedAt !== undefined && !String(value.generatedAt || "").trim()) {
    throw new Error("database-profile.json generatedAt must be non-empty when present.");
  }
  if (value.system !== undefined && value.system !== null) {
    assertJsonObject(value.system, "database-profile.json system must be a JSON object when present.");
  }
  if (value.source !== undefined && value.source !== null) {
    assertJsonObject(value.source, "database-profile.json source must be a JSON object when present.");
  }
  assertJsonObject(value.safety, "database-profile.json safety must be a JSON object.");
  if (value.safety.secretRedacted !== true) {
    throw new Error("database-profile.json safety.secretRedacted must be true.");
  }
  if (value.tables !== undefined) {
    assertArray(value.tables, "database-profile.json tables must be an array when present.");
  }
  if (value.entityCandidates !== undefined) {
    assertArray(value.entityCandidates, "database-profile.json entityCandidates must be an array when present.");
  }
}

function assertValidTruthReadinessReportArtifact(report = {}) {
  assertJsonObject(report, "truth-readiness-report.json must be a JSON object.");
  if (report.artifactType !== "truth-readiness-report") {
    throw new Error("truth-readiness-report.json artifactType must be truth-readiness-report.");
  }
  assertFiniteNumber(report.version, "truth-readiness-report.json version must be numeric.");
  assertNumberRange(report.threshold, 0, 1, "truth-readiness-report.json threshold must be between 0 and 1.");
  assertNumberRange(report.score, 0, 1, "truth-readiness-report.json score must be between 0 and 1.");
  assertNumberRange(report.scorePercent, 0, 100, "truth-readiness-report.json scorePercent must be between 0 and 100.");
  if (Math.abs(Number(report.scorePercent) - percent(report.score)) > 0.000001) {
    throw new Error("truth-readiness-report.json scorePercent must match score.");
  }
  assertBoolean(report.canSubmitReview, "truth-readiness-report.json canSubmitReview must be a boolean.");
  assertBoolean(report.canFinalize, "truth-readiness-report.json canFinalize must be a boolean.");
  assertJsonObject(report.requirements, "truth-readiness-report.json requirements must be a JSON object.");
  assertBoolean(
    report.requirements.databaseEvidenceRequired,
    "truth-readiness-report.json requirements.databaseEvidenceRequired must be a boolean.",
  );
  assertJsonObject(report.gates, "truth-readiness-report.json gates must be a JSON object.");
  for (const gateId of ["evidence", "claims", "factCheck", "narrative", "database", "lineage"]) {
    assertJsonObject(report.gates[gateId], `truth-readiness-report.json gates.${gateId} must be a JSON object.`);
    assertBoolean(
      report.gates[gateId].pass,
      `truth-readiness-report.json gates.${gateId}.pass must be a boolean.`,
    );
  }
  if (!Array.isArray(report.blockers)) {
    throw new Error("truth-readiness-report.json blockers must be an array.");
  }
  if (report.canSubmitReview && report.blockers.length > 0) {
    throw new Error("truth-readiness-report.json canSubmitReview=true requires zero blockers.");
  }
  if (report.canSubmitReview && Number(report.score) < Number(report.threshold)) {
    throw new Error("truth-readiness-report.json canSubmitReview=true requires score >= threshold.");
  }
  if (report.canSubmitReview) {
    for (const gateId of ["evidence", "claims", "factCheck", "narrative", "database", "lineage"]) {
      if (report.gates[gateId].pass !== true) {
        throw new Error(`truth-readiness-report.json canSubmitReview=true requires gates.${gateId}.pass=true.`);
      }
    }
  }
  if (report.canFinalize && !report.canSubmitReview) {
    throw new Error("truth-readiness-report.json canFinalize=true requires canSubmitReview=true.");
  }
  if (report.canFinalize && (report.gates.factCheck.pass !== true || report.gates.evidence.pass !== true)) {
    throw new Error("truth-readiness-report.json canFinalize=true requires evidence and fact-check gates to pass.");
  }
  if (
    report.canSubmitReview &&
    report.requirements.databaseEvidenceRequired &&
    report.gates.database.profileAvailable !== true
  ) {
    throw new Error("truth-readiness-report.json canSubmitReview=true requires profileAvailable database evidence when database evidence is required.");
  }
  if (!Array.isArray(report.improvementActions)) {
    throw new Error("truth-readiness-report.json improvementActions must be an array.");
  }
  assertJsonObject(report.sourceArtifacts, "truth-readiness-report.json sourceArtifacts must be a JSON object.");
  if (!String(report.generatedAt || "").trim()) {
    throw new Error("truth-readiness-report.json generatedAt must be present.");
  }
}

function assertValidDataDictionaryArtifact(value = {}) {
  assertJsonObject(value, "data-dictionary.json must be a JSON object.");
  if (value.artifactType !== "data-dictionary") {
    throw new Error("data-dictionary.json artifactType must be data-dictionary.");
  }
  assertFiniteNumber(value.version, "data-dictionary.json version must be numeric.");
  if (!String(value.generatedAt || "").trim()) {
    throw new Error("data-dictionary.json generatedAt must be present.");
  }
  assertJsonObject(value.source, "data-dictionary.json source must be a JSON object.");
  if (value.source.artifact !== "database-profile.json") {
    throw new Error("data-dictionary.json source.artifact must be database-profile.json.");
  }
  assertArray(value.tables, "data-dictionary.json tables must be an array.");
  assertArray(value.columns, "data-dictionary.json columns must be an array.");
  assertJsonObject(value.metrics, "data-dictionary.json metrics must be a JSON object.");
  assertMetricEquals(value.metrics, "tableCount", value.tables.length, "data-dictionary.json");
  assertMetricEquals(value.metrics, "columnCount", value.columns.length, "data-dictionary.json");
  assertJsonObject(value.safety, "data-dictionary.json safety must be a JSON object.");
  assertBoolean(value.safety.rawSecretsIncluded, "data-dictionary.json safety.rawSecretsIncluded must be a boolean.");
  assertBoolean(value.safety.rawSampleRowsIncluded, "data-dictionary.json safety.rawSampleRowsIncluded must be a boolean.");
  if (value.safety.rawSecretsIncluded !== false || value.safety.rawSampleRowsIncluded !== false) {
    throw new Error("data-dictionary.json must not include raw secrets or raw sample rows.");
  }
  if (value.safety.sourceMustBeRedactedDatabaseProfile !== true) {
    throw new Error("data-dictionary.json safety.sourceMustBeRedactedDatabaseProfile must be true.");
  }
  assertSourceArtifactObject(value.sourceArtifacts, "data-dictionary.json");
  assertJsonObject(
    value.sourceArtifacts.databaseProfile,
    "data-dictionary.json must record sourceArtifacts.databaseProfile.",
  );
}

function assertValidEntityModelArtifact(value = {}) {
  assertJsonObject(value, "entity-model.json must be a JSON object.");
  if (value.artifactType !== "entity-model") {
    throw new Error("entity-model.json artifactType must be entity-model.");
  }
  assertFiniteNumber(value.version, "entity-model.json version must be numeric.");
  if (!String(value.generatedAt || "").trim()) {
    throw new Error("entity-model.json generatedAt must be present.");
  }
  assertJsonObject(value.source, "entity-model.json source must be a JSON object.");
  if (value.source.artifact !== "data-dictionary.json") {
    throw new Error("entity-model.json source.artifact must be data-dictionary.json.");
  }
  assertArray(value.entities, "entity-model.json entities must be an array.");
  assertArray(value.relations, "entity-model.json relations must be an array.");
  assertJsonObject(value.metrics, "entity-model.json metrics must be a JSON object.");
  assertMetricEquals(value.metrics, "entityCount", value.entities.length, "entity-model.json");
  assertMetricEquals(value.metrics, "relationCount", value.relations.length, "entity-model.json");
  assertJsonObject(value.safety, "entity-model.json safety must be a JSON object.");
  assertBoolean(value.safety.rawSecretsIncluded, "entity-model.json safety.rawSecretsIncluded must be a boolean.");
  assertBoolean(value.safety.rawSampleRowsIncluded, "entity-model.json safety.rawSampleRowsIncluded must be a boolean.");
  if (value.safety.rawSecretsIncluded !== false || value.safety.rawSampleRowsIncluded !== false) {
    throw new Error("entity-model.json must not include raw secrets or raw sample rows.");
  }
  if (value.safety.databaseOnlyClaimsRequireUiConfirmation !== true) {
    throw new Error("entity-model.json safety.databaseOnlyClaimsRequireUiConfirmation must be true.");
  }
  assertSourceArtifactObject(value.sourceArtifacts, "entity-model.json");
  assertJsonObject(
    value.sourceArtifacts.databaseProfile,
    "entity-model.json must record sourceArtifacts.databaseProfile.",
  );
  assertJsonObject(
    value.sourceArtifacts.dataDictionary,
    "entity-model.json must record sourceArtifacts.dataDictionary.",
  );
}

function assertValidFunctionUniverseArtifact(value = {}) {
  assertJsonObject(value, "function-universe.json must be a JSON object.");
  if (value.artifactType !== "function-universe") {
    throw new Error("function-universe.json artifactType must be function-universe.");
  }
  assertFiniteNumber(value.version, "function-universe.json version must be numeric.");
  if (!String(value.generatedAt || "").trim()) {
    throw new Error("function-universe.json generatedAt must be present.");
  }
  assertArray(value.modules, "function-universe.json modules must be an array.");
  assertArray(value.functions, "function-universe.json functions must be an array.");
  assertArray(value.entities, "function-universe.json entities must be an array.");
  assertArray(value.links, "function-universe.json links must be an array.");
  assertArray(value.entityRelations, "function-universe.json entityRelations must be an array.");
  assertJsonObject(value.coverage, "function-universe.json coverage must be a JSON object.");
  assertMetricEquals(value.coverage, "moduleCount", value.modules.length, "function-universe.json", "coverage");
  assertMetricEquals(value.coverage, "functionCount", value.functions.length, "function-universe.json", "coverage");
  assertMetricEquals(value.coverage, "entityCount", value.entities.length, "function-universe.json", "coverage");
  assertMetricEquals(
    value.coverage,
    "entityRelationCount",
    value.entityRelations.length,
    "function-universe.json",
    "coverage",
  );
  const functionKeys = new Set(value.functions.map(functionUniverseFunctionKey));
  const entityKeys = new Set(value.entities.map(functionUniverseEntityKey));
  const linkedFunctionKeys = new Set();
  for (const [index, link] of value.links.entries()) {
    assertJsonObject(link, `function-universe.json links[${index}] must be a JSON object.`);
    const functionKey = functionUniverseLinkFunctionKey(link);
    const entityKey = functionUniverseLinkEntityKey(link);
    if (!artifactKeyText(link.module) || !artifactKeyText(link.function)) {
      throw new Error(`function-universe.json links[${index}] must record module and function.`);
    }
    if (!functionKeys.has(functionKey)) {
      throw new Error(`function-universe.json links[${index}] must reference an existing function.`);
    }
    if (!artifactKeyText(link.table) || !artifactKeyText(link.entity)) {
      throw new Error(`function-universe.json links[${index}] must record table and entity.`);
    }
    if (!entityKeys.has(entityKey)) {
      throw new Error(`function-universe.json links[${index}] must reference an existing entity.`);
    }
    linkedFunctionKeys.add(functionKey);
  }
  assertMetricEquals(
    value.coverage,
    "linkedFunctionCount",
    linkedFunctionKeys.size,
    "function-universe.json",
    "coverage",
  );
  assertJsonObject(value.rules, "function-universe.json rules must be a JSON object.");
  if (value.rules.noConclusion !== true) {
    throw new Error("function-universe.json must declare rules.noConclusion=true.");
  }
  assertSourceArtifactObject(value.sourceArtifacts, "function-universe.json");
  assertJsonObject(
    value.sourceArtifacts.evidenceSummary,
    "function-universe.json must record sourceArtifacts.evidenceSummary.",
  );
}

function readJsonArtifact(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", value: null, error: "" };
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "invalid", value: null, error: "Artifact must be a JSON object." };
    }
    return { status: "ok", value, error: "" };
  } catch (error) {
    return { status: "invalid", value: null, error: error.message };
  }
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

function readContentArtifact(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", value: null, error: "" };
  }
  return { status: "ok", value: null, error: "" };
}

function loadReadinessInputs(inputDir) {
  const dir = path.resolve(String(inputDir || "."));
  const result = {};
  for (const [key, fileName] of Object.entries(REQUIRED_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readJsonArtifact(filePath),
    };
  }
  for (const [key, fileName] of Object.entries(OPTIONAL_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readJsonArtifact(filePath),
    };
  }
  for (const [key, fileName] of Object.entries(CONTENT_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readContentArtifact(filePath),
    };
  }
  return result;
}

function buildReadinessSourceArtifacts(artifacts = {}) {
  return Object.fromEntries(
    Object.entries(artifacts).map(([key, artifact]) => [
      key,
      {
        file: artifact.file,
        status: artifact.status,
        error: artifact.error || "",
        fingerprint: artifact.fingerprint || { exists: false, size: 0, mtimeMs: null, sha256: "" },
      },
    ]),
  );
}

function normalizeSourceFingerprint(record = {}) {
  const fingerprint = record.fingerprint || {};
  return {
    exists: Boolean(fingerprint.exists),
    size: Number.isFinite(Number(fingerprint.size)) ? Number(fingerprint.size) : 0,
    sha256: String(fingerprint.sha256 || ""),
  };
}

function sourceFingerprintMatches(expected, actual) {
  const expectedFingerprint = normalizeSourceFingerprint(expected);
  const actualFingerprint = normalizeSourceFingerprint(actual);
  return (
    expectedFingerprint.exists === actualFingerprint.exists &&
    expectedFingerprint.size === actualFingerprint.size &&
    expectedFingerprint.sha256 === actualFingerprint.sha256
  );
}

function lineageMismatch(key, artifact, current, ownerFile) {
  const recorded = artifact?.value?.sourceArtifacts?.[key];
  if (!recorded) return `${ownerFile} does not record source ${current?.file || key}.`;
  if (String(recorded.file || "") !== String(current?.file || "")) {
    return `${ownerFile} source ${key} file changed from ${recorded.file || "unknown"} to ${current?.file || "unknown"}.`;
  }
  const recordedFingerprint = normalizeSourceFingerprint(recorded);
  const currentFingerprint = normalizeSourceFingerprint(current);
  if (recordedFingerprint.exists && !currentFingerprint.exists) {
    return `${ownerFile} source ${current?.file || recorded.file || key} no longer exists.`;
  }
  if (!sourceFingerprintMatches(recorded, current)) {
    return `${ownerFile} source ${current?.file || key} fingerprint is stale.`;
  }
  return "";
}

function buildLineageGate(artifacts = {}) {
  const failures = [];
  const checks = [
    ["evidence", artifacts.quality, artifacts.evidence, "quality-report.json"],
    ["operationSpec", artifacts.quality, artifacts.operationSpec, "quality-report.json"],
    ["operationGuideGate", artifacts.quality, artifacts.operationGuideGate, "quality-report.json"],
    ["operationSpec", artifacts.operationGuideGate, artifacts.operationSpec, "operation-guide-gate.json"],
    ["databaseProfile", artifacts.dataDictionary, artifacts.databaseProfile, "data-dictionary.json"],
    ["databaseProfile", artifacts.entityModel, artifacts.databaseProfile, "entity-model.json"],
    ["dataDictionary", artifacts.entityModel, artifacts.dataDictionary, "entity-model.json"],
    ["evidenceSummary", artifacts.functionUniverse, artifacts.evidenceSummary, "function-universe.json"],
    ["databaseProfile", artifacts.functionUniverse, artifacts.databaseProfile, "function-universe.json"],
    ["entityModel", artifacts.functionUniverse, artifacts.entityModel, "function-universe.json"],
    ["functionUniverse", artifacts.claims, artifacts.functionUniverse, "verified-claims.json"],
  ];
  for (const [key, artifact, current, ownerFile] of checks) {
    if (artifact?.status !== "ok" || !artifact?.fingerprint?.exists) continue;
    const recorded = artifact?.value?.sourceArtifacts?.[key];
    const recordedSourceExists = normalizeSourceFingerprint(recorded || {}).exists;
    if (!recorded && !current?.fingerprint?.exists) continue;
    if (!recordedSourceExists && !current?.fingerprint?.exists) continue;
    const failure = lineageMismatch(key, artifact, current, ownerFile);
    if (failure) failures.push(failure);
  }
  return {
    id: "lineage",
    label: "Truth artifact source lineage",
    pass: failures.length === 0,
    score: failures.length ? 0 : 1,
    scorePercent: failures.length ? 0 : 100,
    failures,
  };
}

function findStaleReadinessSources(inputDir, report = {}) {
  const recorded = report.sourceArtifacts;
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return [{ key: "sourceArtifacts", reason: "missing source artifact fingerprints" }];
  }
  const current = buildReadinessSourceArtifacts(loadReadinessInputs(inputDir));
  const keys = [...new Set([...Object.keys(current), ...Object.keys(recorded)])].sort();
  const stale = [];
  for (const key of keys) {
    const expected = recorded[key];
    const actual = current[key];
    if (!expected) {
      stale.push({ key, file: actual?.file || "", reason: "not recorded in report" });
      continue;
    }
    if (!actual) {
      stale.push({ key, file: expected.file || "", reason: "no longer part of readiness inputs" });
      continue;
    }
    if (String(expected.file || "") !== String(actual.file || "")) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "file mapping changed" });
      continue;
    }
    if (String(expected.status || "") !== String(actual.status || "")) {
      stale.push({
        key,
        file: actual.file || expected.file || "",
        reason: `status changed from ${expected.status || "unknown"} to ${actual.status || "unknown"}`,
      });
      continue;
    }
    const expectedFingerprint = normalizeSourceFingerprint(expected);
    const actualFingerprint = normalizeSourceFingerprint(actual);
    if (!expectedFingerprint.sha256 && actualFingerprint.exists) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "missing recorded sha256" });
      continue;
    }
    if (
      expectedFingerprint.exists !== actualFingerprint.exists ||
      expectedFingerprint.size !== actualFingerprint.size ||
      expectedFingerprint.sha256 !== actualFingerprint.sha256
    ) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "content fingerprint changed" });
    }
  }
  return stale;
}

function findStaleFactCheckSources(artifacts = {}) {
  const factCheck = artifacts.factCheck || {};
  const value = factCheck.value || {};
  const recorded = value.sourceArtifacts;
  const required = {
    pendingReview: artifacts.pendingReview,
    claims: artifacts.claims,
  };
  const presentRequired = Object.entries(required).filter(([, artifact]) => artifact?.fingerprint?.exists);
  if (!presentRequired.length) return [];
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return [
      {
        key: "sourceArtifacts",
        file: factCheck.file || REQUIRED_ARTIFACTS.factCheck,
        reason: "missing fact-check source fingerprints",
      },
    ];
  }
  const stale = [];
  for (const [key, current] of presentRequired) {
    const expected = recorded[key];
    if (!expected) {
      stale.push({ key, file: current.file || "", reason: "not recorded in fact-check report" });
      continue;
    }
    if (String(expected.file || "") !== String(current.file || "")) {
      stale.push({ key, file: current.file || expected.file || "", reason: "file mapping changed" });
      continue;
    }
    if (String(expected.status || "") !== String(current.status || "")) {
      stale.push({
        key,
        file: current.file || expected.file || "",
        reason: `status changed from ${expected.status || "unknown"} to ${current.status || "unknown"}`,
      });
      continue;
    }
    if (!normalizeSourceFingerprint(expected).sha256 && current.fingerprint?.exists) {
      stale.push({ key, file: current.file || expected.file || "", reason: "missing recorded sha256" });
      continue;
    }
    if (!sourceFingerprintMatches(expected, current)) {
      stale.push({ key, file: current.file || expected.file || "", reason: "content fingerprint changed" });
    }
  }
  return stale;
}

function findStaleNarrativeSources(artifacts = {}) {
  const narrative = artifacts.narrative || {};
  if (!narrative?.fingerprint?.exists) return [];
  const value = narrative.value || {};
  const recorded = value.sourceArtifacts;
  const required = {
    pendingReview: artifacts.pendingReview,
    evidenceSummary: artifacts.evidenceSummary,
  };
  const presentRequired = Object.entries(required).filter(([, artifact]) => artifact?.fingerprint?.exists);
  if (!presentRequired.length) return [];
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return [
      {
        key: "sourceArtifacts",
        file: narrative.file || REQUIRED_ARTIFACTS.narrative,
        reason: "missing narrative source fingerprints",
      },
    ];
  }
  const stale = [];
  for (const [key, current] of presentRequired) {
    const expected = recorded[key];
    if (!expected) {
      stale.push({ key, file: current.file || "", reason: "not recorded in narrative report" });
      continue;
    }
    if (String(expected.file || "") !== String(current.file || "")) {
      stale.push({ key, file: current.file || expected.file || "", reason: "file mapping changed" });
      continue;
    }
    if (String(expected.status || "ok") !== String(current.status || "ok")) {
      stale.push({
        key,
        file: current.file || expected.file || "",
        reason: `status changed from ${expected.status || "ok"} to ${current.status || "ok"}`,
      });
      continue;
    }
    if (!normalizeSourceFingerprint(expected).sha256 && current.fingerprint?.exists) {
      stale.push({ key, file: current.file || expected.file || "", reason: "missing recorded sha256" });
      continue;
    }
    if (!sourceFingerprintMatches(expected, current)) {
      stale.push({ key, file: current.file || expected.file || "", reason: "content fingerprint changed" });
    }
  }
  return stale;
}

function blocker(id, severity, message, rerunNodes = [], extra = {}) {
  return { id, severity, message, rerunNodes, ...extra };
}

function action(id, message, rerunNodes = [], extra = {}) {
  return { id, message, rerunNodes, ...extra };
}

function buildEvidenceGate(artifact, artifacts = {}) {
  const value = artifact.value || {};
  const contractFailures = [];
  if (artifact.status === "ok") {
    try {
      assertValidQualityReportArtifact(value);
    } catch (error) {
      contractFailures.push(error.message);
    }
  }
  const operationSpec = artifacts.operationSpec || {};
  if (operationSpec.status === "ok" || operationSpec.fingerprint?.exists) {
    if (operationSpec.status !== "ok") {
      contractFailures.push(`${operationSpec.file || "operation-spec.json"} is ${operationSpec.status}.`);
    } else {
      try {
        assertValidOperationSpecArtifact(operationSpec.value);
      } catch (error) {
        contractFailures.push(error.message);
      }
    }
  }
  const operationGuideGate = artifacts.operationGuideGate || {};
  if (operationGuideGate.status === "ok" || operationGuideGate.fingerprint?.exists) {
    if (operationGuideGate.status !== "ok") {
      contractFailures.push(`${operationGuideGate.file || "operation-guide-gate.json"} is ${operationGuideGate.status}.`);
    } else {
      try {
        assertValidOperationGuideGateArtifact(operationGuideGate.value, operationSpec.value || null);
      } catch (error) {
        contractFailures.push(error.message);
      }
    }
  }
  const artifactContractValid = artifact.status === "ok" && contractFailures.length === 0;
  const metricKeys = [
    "menuCoverage",
    "corePageScreenshotCoverage",
    "coreFunctionClassificationCoverage",
    "writeOperationSafetyCompliance",
    "unverifiedContentLabeling",
    "coreConclusionTraceability",
  ];
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, clamp01(value[key])]));
  const score = metricKeys.length
    ? Math.min(...metricKeys.map((key) => metrics[key]))
    : 0;
  const failures = [];
  if (artifact.status !== "ok") {
    failures.push(`${artifact.file} is ${artifact.status}.`);
  }
  failures.push(...contractFailures);
  for (const failure of Array.isArray(value.failures) ? value.failures : []) {
    failures.push(String(failure));
  }
  const pass = artifactContractValid && value.canFinalize === true && failures.length === 0;
  const normalizedScore = artifactContractValid ? score : 0;
  return {
    id: "evidence",
    label: "Evidence coverage and safety",
    pass,
    artifactStatus: artifact.status,
    artifactContractValid,
    contractFailures,
    score: normalizedScore,
    scorePercent: percent(normalizedScore),
    metrics,
    counts: value.counts || {},
    failures,
  };
}

function buildClaimsGate(artifact) {
  const value = artifact.value || {};
  const contractFailures = [];
  if (artifact.status === "ok") {
    try {
      assertValidVerifiedClaimsArtifact(value);
    } catch (error) {
      contractFailures.push(error.message);
    }
  }
  const artifactContractValid = artifact.status === "ok" && contractFailures.length === 0;
  const metrics = value.metrics || {};
  const claimCount = Number(metrics.claimCount || 0);
  const writableClaimCount = Number(metrics.writableClaimCount || 0);
  const confirmedCount = Number(metrics.confirmedCount || 0);
  const inferredCount = Number(metrics.inferredCount || 0);
  const weakCount = Number(metrics.weakCount || 0);
  const databaseOnlyClaimCount = Number(metrics.databaseOnlyClaimCount || 0);
  const hasWritableClaims = writableClaimCount > 0;
  const hasConfirmedOrInferred = confirmedCount + inferredCount > 0;
  const boundaryConfigured =
    value.rules?.lowConfidenceNotWritable === true &&
    value.rules?.databaseOnlyNotConfirmed === true &&
    value.rules?.databaseOnlyNotWritable === true;
  const score =
    artifactContractValid
      ? (hasWritableClaims ? 0.65 : 0) +
        (hasConfirmedOrInferred ? 0.2 : 0) +
        (boundaryConfigured ? 0.15 : 0)
      : 0;
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  failures.push(...contractFailures);
  if (!hasWritableClaims) failures.push("No writable verified claims are available for body assertions.");
  if (!hasConfirmedOrInferred) failures.push("No confirmed or inferred claims are available.");
  if (!boundaryConfigured && !contractFailures.some((item) => /boundary rules/.test(item))) {
    failures.push("Verified claim boundary rules are incomplete.");
  }
  const warnings = [];
  if (weakCount > 0) {
    warnings.push(`${weakCount} weak claim(s) must remain pending/unverified unless later confirmed.`);
  }
  if (databaseOnlyClaimCount > 0) {
    warnings.push(`${databaseOnlyClaimCount} database-only claim(s) are evidence-only until UI evidence confirms them.`);
  }
  return {
    id: "claims",
    label: "Verified writable claims",
    pass: artifactContractValid && hasWritableClaims && hasConfirmedOrInferred && boundaryConfigured,
    artifactStatus: artifact.status,
    artifactContractValid,
    contractFailures,
    score: clamp01(score),
    scorePercent: percent(score),
    metrics: { claimCount, writableClaimCount, confirmedCount, inferredCount, weakCount, databaseOnlyClaimCount },
    writableClaimIds: Array.isArray(value.writableClaimIds) ? value.writableClaimIds : [],
    failures,
    warnings,
  };
}

function validateFactCheckAgainstCurrentClaims(value = {}, claimsArtifact = {}) {
  const failures = [];
  if (claimsArtifact?.status !== "ok") return failures;
  const claims = Array.isArray(claimsArtifact.value?.claims) ? claimsArtifact.value.claims : [];
  const writableClaimIds = claims
    .filter((claim) => claim && claim.writable === true)
    .map((claim) => String(claim.id || ""))
    .filter(Boolean)
    .sort();
  const coveredWritableClaimIds = Array.isArray(value.coveredWritableClaimIds)
    ? [...new Set(value.coveredWritableClaimIds.map(String))].sort()
    : [];
  const missingWritableClaimIds = Array.isArray(value.missingWritableClaimIds)
    ? [...new Set(value.missingWritableClaimIds.map(String))].sort()
    : [];
  const coveredSet = new Set(coveredWritableClaimIds);
  const missingSet = new Set(missingWritableClaimIds);
  const expectedMissing = writableClaimIds.filter((id) => !coveredSet.has(id)).sort();
  const currentCoveredCount = coveredWritableClaimIds.filter((id) => writableClaimIds.includes(id)).length;
  const expectedCoverageRatio = writableClaimIds.length
    ? currentCoveredCount / writableClaimIds.length
    : 1;
  const metrics = value.metrics || {};
  if (Number(metrics.claimCount || 0) !== claims.length) {
    failures.push("fact-check-report.json metrics.claimCount must match current verified-claims.json.");
  }
  if (Number(metrics.writableClaimCount || 0) !== writableClaimIds.length) {
    failures.push("fact-check-report.json metrics.writableClaimCount must match current verified-claims.json.");
  }
  if (Number(metrics.coveredWritableClaimCount || 0) !== currentCoveredCount) {
    failures.push("fact-check-report.json metrics.coveredWritableClaimCount must match current covered writable claims.");
  }
  if (Number(metrics.missingWritableClaimCount || 0) !== expectedMissing.length) {
    failures.push("fact-check-report.json metrics.missingWritableClaimCount must match current missing writable claims.");
  }
  if (coveredWritableClaimIds.some((id) => !writableClaimIds.includes(id))) {
    failures.push("fact-check-report.json coveredWritableClaimIds must reference current writable claims only.");
  }
  if (missingWritableClaimIds.some((id) => !writableClaimIds.includes(id))) {
    failures.push("fact-check-report.json missingWritableClaimIds must reference current writable claims only.");
  }
  if (!sameStringSet(missingWritableClaimIds, expectedMissing)) {
    failures.push("fact-check-report.json missingWritableClaimIds must match current uncovered writable claims.");
  }
  if (coveredWritableClaimIds.some((id) => missingSet.has(id))) {
    failures.push("fact-check-report.json coveredWritableClaimIds and missingWritableClaimIds must not overlap.");
  }
  if (Math.abs(Number(metrics.writableClaimCoverageRatio || 0) - expectedCoverageRatio) > 0.000001) {
    failures.push("fact-check-report.json metrics.writableClaimCoverageRatio must match current verified-claims.json.");
  }
  return failures;
}

function validateFactCheckAgainstCurrentMarkdown(value = {}, artifacts = {}) {
  const failures = [];
  const pendingReview = artifacts.pendingReview || {};
  const claimsArtifact = artifacts.claims || {};
  if (pendingReview.status !== "ok" || claimsArtifact.status !== "ok") return failures;
  if (!pendingReview.path || !fs.existsSync(pendingReview.path)) return failures;
  const metrics = value.metrics || {};
  let recomputed;
  try {
    recomputed = buildFactCheckReport({
      markdown: fs.readFileSync(pendingReview.path, "utf8"),
      claimsArtifact: claimsArtifact.value,
      minWritableClaimCoverage: metrics.minWritableClaimCoverage,
    });
  } catch (error) {
    failures.push(
      `fact-check-report.json could not be recomputed from current whitepaper.pending-review.md: ${error.message}`,
    );
    return failures;
  }
  if (!sameStringSet(value.coveredWritableClaimIds || [], recomputed.coveredWritableClaimIds || [])) {
    failures.push(
      "fact-check-report.json coveredWritableClaimIds must match deterministic fact-check recomputation from current whitepaper.pending-review.md.",
    );
  }
  if (!sameStringSet(value.missingWritableClaimIds || [], recomputed.missingWritableClaimIds || [])) {
    failures.push(
      "fact-check-report.json missingWritableClaimIds must match deterministic fact-check recomputation from current whitepaper.pending-review.md.",
    );
  }
  const recomputedMetrics = recomputed.metrics || {};
  for (const key of [
    "checkedAssertions",
    "supportedAssertions",
    "supportedRatio",
    "coveredWritableClaimCount",
    "missingWritableClaimCount",
    "writableClaimCoverageRatio",
  ]) {
    if (!numbersMatch(metrics[key], recomputedMetrics[key])) {
      failures.push(
        `fact-check-report.json metrics.${key} must match deterministic fact-check recomputation from current whitepaper.pending-review.md.`,
      );
    }
  }
  if (value.canFinalize === true && recomputed.canFinalize !== true) {
    failures.push(
      "fact-check-report.json canFinalize=true must match deterministic fact-check recomputation from current whitepaper.pending-review.md.",
    );
  }
  return failures;
}

function buildFactCheckGate(artifact, artifacts = {}) {
  const value = artifact.value || {};
  const contractFailures = [];
  if (artifact.status === "ok") {
    try {
      assertValidFactCheckReportArtifact(value);
    } catch (error) {
      contractFailures.push(error.message);
    }
    contractFailures.push(...validateFactCheckAgainstCurrentClaims(value, artifacts.claims));
    contractFailures.push(...validateFactCheckAgainstCurrentMarkdown(value, artifacts));
  }
  const artifactContractValid = artifact.status === "ok" && contractFailures.length === 0;
  const metrics = value.metrics || {};
  const supportedRatio = clamp01(metrics.supportedRatio ?? (value.canFinalize ? 1 : 0));
  const writableClaimCoverageRatio = clamp01(
    metrics.writableClaimCoverageRatio ?? (value.canFinalize ? 0 : 0),
  );
  const minWritableClaimCoverage = clamp01(metrics.minWritableClaimCoverage ?? 0.8);
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  failures.push(...contractFailures);
  for (const failure of Array.isArray(value.failures) ? value.failures : []) failures.push(String(failure));
  if (artifact.status === "ok" && !Object.hasOwn(metrics, "writableClaimCoverageRatio")) {
    failures.push("Writable claim coverage metric is missing.");
  }
  if (writableClaimCoverageRatio < minWritableClaimCoverage) {
    failures.push("Writable claim coverage is below threshold.");
  }
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(String) : [];
  const pass =
    artifactContractValid &&
    value.canFinalize === true &&
    failures.length === 0 &&
    writableClaimCoverageRatio >= minWritableClaimCoverage;
  const score = artifactContractValid ? Math.min(supportedRatio, writableClaimCoverageRatio) : 0;
  return {
    id: "fact-check",
    label: "Fact-check against writable claims",
    pass,
    artifactStatus: artifact.status,
    artifactContractValid,
    contractFailures,
    score,
    scorePercent: percent(score),
    metrics: {
      claimCount: Number(metrics.claimCount || 0),
      writableClaimCount: Number(metrics.writableClaimCount || 0),
      checkedAssertions: Number(metrics.checkedAssertions || 0),
      supportedAssertions: Number(metrics.supportedAssertions || 0),
      supportedRatio,
      coveredWritableClaimCount: Number(metrics.coveredWritableClaimCount || 0),
      missingWritableClaimCount: Number(metrics.missingWritableClaimCount || 0),
      writableClaimCoverageRatio,
      minWritableClaimCoverage,
    },
    missingWritableClaimIds: Array.isArray(value.missingWritableClaimIds) ? value.missingWritableClaimIds : [],
    failures,
    warnings,
  };
}

function buildFactCheckFreshnessGate(gate, artifacts = {}) {
  const staleSources = findStaleFactCheckSources(artifacts);
  if (!staleSources.length) return gate;
  return {
    ...gate,
    pass: false,
    score: 0,
    scorePercent: 0,
    staleSources,
    failures: [
      ...(Array.isArray(gate.failures) ? gate.failures : []),
      "fact-check-report.json was not generated from the current whitepaper or verified claims.",
    ],
  };
}

function buildNarrativeGate(artifact) {
  const value = artifact.value || {};
  const contractFailures = [];
  if (artifact.status === "ok") {
    try {
      assertValidNarrativeQualityReportArtifact(value);
    } catch (error) {
      contractFailures.push(error.message);
    }
  }
  const artifactContractValid = artifact.status === "ok" && contractFailures.length === 0;
  const chars = Number(value.counts?.chars || 0);
  const evidencePages = Number(value.counts?.evidencePages || 0);
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  failures.push(...contractFailures);
  for (const failure of Array.isArray(value.failures) ? value.failures : []) failures.push(String(failure));
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(String) : [];
  const score =
    artifactContractValid
      ? (value.canSubmitReview ? 0.8 : Math.min(0.6, chars / 1200)) +
        (evidencePages > 0 ? 0.2 : 0)
      : 0;
  return {
    id: "narrative",
    label: "Narrative business readability",
    pass: artifactContractValid && value.canSubmitReview === true && failures.length === 0,
    artifactStatus: artifact.status,
    artifactContractValid,
    contractFailures,
    score: clamp01(score),
    scorePercent: percent(score),
    counts: { chars, evidencePages },
    failures,
    warnings,
  };
}

function buildNarrativeFreshnessGate(gate, artifacts = {}) {
  const staleSources = findStaleNarrativeSources(artifacts);
  if (!staleSources.length) return gate;
  return {
    ...gate,
    pass: false,
    score: 0,
    scorePercent: 0,
    staleSources,
    failures: [
      ...(Array.isArray(gate.failures) ? gate.failures : []),
      "narrative-quality-report.json was not generated from the current whitepaper or evidence summary.",
    ],
  };
}

function hasStaleSources(gate = {}) {
  return Array.isArray(gate.staleSources) && gate.staleSources.length > 0;
}

function normalizeSystemCode(value) {
  return String(value || "").trim();
}

function databaseProfileSystemCode(value = {}) {
  return normalizeSystemCode(value?.system?.code);
}

function isValidDatabaseProfile(value, expectedSystem = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.artifactType !== "database-profile") {
    return false;
  }
  const expectedCode = normalizeSystemCode(expectedSystem.code || expectedSystem.systemCode);
  if (!expectedCode) return true;
  return databaseProfileSystemCode(value) === expectedCode;
}

function safePathJoin(parts = []) {
  return parts.filter(Boolean).join(".");
}

function isRedactedValue(value) {
  return value === REDACTED_VALUE;
}

function sampleValueLooksMasked(value, requireMask = false) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number" || typeof value === "boolean") return true;
  const text = String(value);
  if (requireMask) return isRedactedValue(value) || text.includes("***");
  return isRedactedValue(value) || text.includes("***") || !SENSITIVE_SAMPLE_VALUE_PATTERN.test(text);
}

function collectUnsafeSampleValues(value, pathParts = []) {
  const failures = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      failures.push(...collectUnsafeSampleValues(item, [...pathParts, `[${index}]`]));
    });
    return failures;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (SENSITIVE_DATA_KEY_PATTERN.test(key) && item && typeof item === "object") {
        if (!isRedactedValue(item)) {
          failures.push(`database-profile sample ${safePathJoin(nextPath)} contains an unredacted sensitive object.`);
        }
        continue;
      }
      failures.push(...collectUnsafeSampleValues(item, nextPath));
    }
    return failures;
  }
  const key = pathParts[pathParts.length - 1] || "";
  const sensitiveKey = SENSITIVE_DATA_KEY_PATTERN.test(key);
  const sensitiveValue = typeof value === "string" && SENSITIVE_SAMPLE_VALUE_PATTERN.test(value);
  if ((sensitiveKey || sensitiveValue) && !sampleValueLooksMasked(value, sensitiveKey)) {
    failures.push(`database-profile sample ${safePathJoin(pathParts)} contains an unredacted sensitive value.`);
  }
  return failures;
}

function collectUnsafeSecretValues(value, pathParts = []) {
  const failures = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      failures.push(...collectUnsafeSecretValues(item, [...pathParts, `[${index}]`]));
    });
    return failures;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      if (
        pathParts.length === 0 &&
        ALLOWED_SOURCE_SECRET_KEYS.has(key) &&
        !SECRET_KEY_PATTERN.test(key)
      ) {
        continue;
      }
      if (SECRET_KEY_PATTERN.test(key) && item !== "" && item !== null && item !== undefined && !isRedactedValue(item)) {
        failures.push(`database-profile source.secret.${safePathJoin(nextPath)} is not redacted.`);
        continue;
      }
      failures.push(...collectUnsafeSecretValues(item, nextPath));
    }
    return failures;
  }
  return failures;
}

function scanDatabaseProfileSafety(profile = {}) {
  const failures = [];
  const warnings = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { pass: false, failures: ["database-profile.json is not a JSON object."], warnings };
  }
  if (profile.artifactType !== "database-profile") return { pass: true, failures, warnings };
  if (profile.safety?.secretRedacted !== true) {
    failures.push("database-profile.json must declare safety.secretRedacted=true.");
  }
  if (profile.source?.secret && typeof profile.source.secret === "object") {
    failures.push(...collectUnsafeSecretValues(profile.source.secret));
  }
  const tables = Array.isArray(profile.tables) ? profile.tables : [];
  for (const [tableIndex, table] of tables.entries()) {
    const sampleRows = Array.isArray(table.sampleRows) ? table.sampleRows : [];
    if (sampleRows.length > MAX_SAFE_SAMPLE_ROWS) {
      failures.push(
        `database-profile table ${table.name || tableIndex} includes ${sampleRows.length} sample rows; maximum is ${MAX_SAFE_SAMPLE_ROWS}.`,
      );
    }
    for (const [rowIndex, row] of sampleRows.entries()) {
      failures.push(
        ...collectUnsafeSampleValues(row, [
          `tables[${tableIndex}]`,
          String(table.name || "table"),
          `sampleRows[${rowIndex}]`,
        ]),
      );
    }
  }
  if (profile.source?.sampleDataIncluded && !tables.some((table) => Array.isArray(table.sampleRows) && table.sampleRows.length)) {
    warnings.push("database-profile.json declares sampleDataIncluded=true but no sample rows are present.");
  }
  return { pass: failures.length === 0, failures: [...new Set(failures)], warnings };
}

function buildDatabaseGate(artifacts, options = {}) {
  const profile = artifacts.databaseProfile || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.databaseProfile,
    value: null,
  };
  const universeArtifact = artifacts.functionUniverse || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.functionUniverse,
    value: null,
  };
  const dataDictionaryArtifact = artifacts.dataDictionary || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.dataDictionary,
    value: null,
  };
  const entityModelArtifact = artifacts.entityModel || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.entityModel,
    value: null,
  };
  const contractFailures = [];
  const validateOptionalDerivedArtifact = (artifact, validator) => {
    if (artifact.status === "missing" && !artifact.fingerprint?.exists) return false;
    if (artifact.status !== "ok") {
      contractFailures.push(`${artifact.file || "database-derived artifact"} is ${artifact.status}.`);
      if (artifact.error) contractFailures.push(`${artifact.file || "database-derived artifact"} error: ${artifact.error}`);
      return false;
    }
    try {
      validator(artifact.value);
      return true;
    } catch (error) {
      contractFailures.push(error.message);
      return false;
    }
  };
  const dataDictionaryContractValid = validateOptionalDerivedArtifact(
    dataDictionaryArtifact,
    assertValidDataDictionaryArtifact,
  );
  const entityModelContractValid = validateOptionalDerivedArtifact(
    entityModelArtifact,
    assertValidEntityModelArtifact,
  );
  const functionUniverseContractValid = validateOptionalDerivedArtifact(
    universeArtifact,
    assertValidFunctionUniverseArtifact,
  );
  const universe = functionUniverseContractValid ? universeArtifact.value || {} : {};
  const dataDictionary = dataDictionaryContractValid ? dataDictionaryArtifact.value || {} : {};
  const entityModel = entityModelContractValid ? entityModelArtifact.value || {} : {};
  const coverage = universe.coverage || {};
  const entityCount = Number(entityModel.metrics?.entityCount || coverage.entityCount || 0);
  const linkedFunctionCount = Number(coverage.linkedFunctionCount || 0);
  const relationCount = Number(entityModel.metrics?.relationCount || coverage.entityRelationCount || 0);
  const columnCount = Number(dataDictionary.metrics?.columnCount || 0);
  const sampleBackedEntityCount = Number(entityModel.metrics?.sampleBackedEntityCount || 0);
  const expectedSystem = options.expectedSystem || options.system || {};
  const expectedSystemCode = normalizeSystemCode(expectedSystem.code || options.systemCode);
  const profileArtifactValid = profile.status === "ok" && isValidDatabaseProfile(profile.value);
  const profileSystemCode = databaseProfileSystemCode(profile.value || {});
  const profileSystemMatches = !expectedSystemCode || (profileArtifactValid && profileSystemCode === expectedSystemCode);
  const profileAvailable = profile.status === "ok" && isValidDatabaseProfile(profile.value, { code: expectedSystemCode });
  const profileSafety = profile.status === "ok" ? scanDatabaseProfileSafety(profile.value || {}) : { pass: true, failures: [], warnings: [] };
  const safeProfileAvailable = profileAvailable && profileSafety.pass;
  const derivedArtifactsPresent = [dataDictionaryArtifact, entityModelArtifact, universeArtifact].some(
    (artifact) => artifact.status === "ok" || artifact.fingerprint?.exists,
  );
  const derivedArtifactContractPass = (artifact, contractValid) => {
    if (artifact.status === "missing" && !artifact.fingerprint?.exists) return true;
    return artifact.status === "ok" && contractValid;
  };
  const derivedArtifactContractsPass =
    !derivedArtifactsPresent ||
    derivedArtifactContractPass(dataDictionaryArtifact, dataDictionaryContractValid) &&
      derivedArtifactContractPass(entityModelArtifact, entityModelContractValid) &&
      derivedArtifactContractPass(universeArtifact, functionUniverseContractValid);
  const available = safeProfileAvailable || entityCount > 0 || columnCount > 0;
  const pass = profileSafety.pass && derivedArtifactContractsPass;
  const score = available && pass ? 1 : 0;
  return {
    id: "database",
    label: "Redacted database evidence",
    pass,
    available,
    profileAvailable: safeProfileAvailable,
    rawProfileAvailable: profileAvailable,
    profileArtifactValid,
    profileSystemMatches,
    derivedArtifactContractsPass,
    contractFailures,
    profileSafety,
    score,
    scorePercent: percent(score),
    metrics: {
      entityCount,
      linkedFunctionCount,
      relationCount,
      columnCount,
      sampleBackedEntityCount,
      databaseProfileStatus: profile.status,
      databaseProfileArtifactType: profile.value?.artifactType || "",
      databaseProfileSystemCode: profileSystemCode,
      databaseProfileSafetyPass: profileSafety.pass,
      expectedSystemCode,
      dataDictionaryStatus: dataDictionaryArtifact.status,
      dataDictionaryContractValid,
      entityModelStatus: entityModelArtifact.status,
      entityModelContractValid,
      functionUniverseStatus: universeArtifact.status,
      functionUniverseContractValid,
    },
    warnings: available
      ? profileSafety.warnings
      : ["No redacted database profile was available; UI evidence remains the primary truth source."],
    failures: [...profileSafety.failures, ...contractFailures],
  };
}

function collectBlockers(gates) {
  const blockers = [];
  if (!gates.evidence.pass) {
    const invalidArtifact =
      gates.evidence.artifactStatus === "invalid" ||
      (Array.isArray(gates.evidence.contractFailures) && gates.evidence.contractFailures.length > 0);
    blockers.push(
      blocker(
        invalidArtifact ? "evidence.invalid-artifact" : "evidence.coverage-or-safety",
        "P0",
        invalidArtifact
          ? "quality-report.json is not a valid quality report artifact."
          : "Evidence coverage, traceability, or write-operation safety gate did not pass.",
        ["collect", "inspect", "validate-write", "quality", "truth-readiness"],
      ),
    );
  }
  if (!gates.claims.pass) {
    const invalidArtifact =
      gates.claims.artifactStatus === "invalid" ||
      (Array.isArray(gates.claims.contractFailures) && gates.claims.contractFailures.length > 0);
    blockers.push(
      blocker(
        invalidArtifact ? "claims.invalid-artifact" : "claims.missing-writable",
        "P0",
        invalidArtifact
          ? "verified-claims.json is not a valid verified claims artifact, so the narrative cannot assert business conclusions safely."
          : "Verified writable claims are missing, so the narrative cannot assert business conclusions safely.",
        ["summary", "db-model", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (!gates.factCheck.pass) {
    const invalidArtifact =
      gates.factCheck.artifactStatus === "invalid" ||
      (Array.isArray(gates.factCheck.contractFailures) && gates.factCheck.contractFailures.length > 0);
    if (invalidArtifact) {
      blockers.push(
        blocker(
          "fact-check.invalid-artifact",
          "P0",
          "fact-check-report.json is not a valid fact-check artifact.",
          ["fact-check", "quality", "truth-readiness"],
        ),
      );
    } else if (hasStaleSources(gates.factCheck)) {
      blockers.push(
        blocker(
          "fact-check.stale-sources",
          "P0",
          "fact-check-report.json is stale; refresh fact-check and downstream gates before rewriting narrative.",
          ["fact-check", "quality", "truth-readiness"],
          { staleSources: gates.factCheck.staleSources, quotaImpact: "low" },
        ),
      );
    } else if (gates.factCheck.metrics?.writableClaimCoverageRatio < gates.factCheck.metrics?.minWritableClaimCoverage) {
      blockers.push(
        blocker(
          "fact-check.writable-coverage",
          "P0",
          "Pending-review whitepaper omits verified writable claims that should be covered before review.",
          ["narrative", "fact-check", "quality", "truth-readiness"],
          {
            rewriteScope: "function-sections",
            narrativePart: "function-sections",
            missingWritableClaimIds: gates.factCheck.missingWritableClaimIds || [],
          },
        ),
      );
    } else {
      blockers.push(
        blocker(
          "fact-check.unsupported-assertions",
          "P0",
          "Pending-review whitepaper contains unsupported, weak, or unknown assertions.",
          ["narrative", "fact-check", "quality", "truth-readiness"],
        ),
      );
    }
  }
  if (!gates.narrative.pass) {
    const invalidArtifact =
      gates.narrative.artifactStatus === "invalid" ||
      (Array.isArray(gates.narrative.contractFailures) && gates.narrative.contractFailures.length > 0);
    if (invalidArtifact) {
      blockers.push(
        blocker(
          "narrative.invalid-artifact",
          "P1",
          "narrative-quality-report.json is not a valid narrative quality artifact.",
          ["quality", "truth-readiness"],
        ),
      );
    } else if (hasStaleSources(gates.narrative)) {
      blockers.push(
        blocker(
          "narrative.stale-sources",
          "P1",
          "narrative-quality-report.json is stale; refresh quality and truth readiness before rewriting narrative.",
          ["quality", "truth-readiness"],
          { staleSources: gates.narrative.staleSources, quotaImpact: "low" },
        ),
      );
    } else {
      blockers.push(
        blocker(
          "narrative.quality",
          "P1",
          "Narrative quality gate did not pass for business readability or required sections.",
          ["narrative", "fact-check", "quality", "truth-readiness"],
        ),
      );
    }
  }
  return blockers;
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return ["1", "true", "yes", "y", "on"].includes(text);
}

function buildDatabaseRequirementGate(gate = {}, options = {}) {
  const required = normalizeBoolean(options.requireDatabaseEvidence);
  const profileAvailable = gate.profileAvailable === true;
  const failures = Array.isArray(gate.failures) ? [...gate.failures] : [];
  if (required && gate.pass !== false && !profileAvailable) {
    const expectedCode = gate.metrics?.expectedSystemCode || "";
    const actualCode = gate.metrics?.databaseProfileSystemCode || "";
    if (gate.profileArtifactValid && expectedCode && actualCode !== expectedCode) {
      failures.push(`database-profile.json belongs to ${actualCode || "unknown"}, expected ${expectedCode}.`);
    } else {
      failures.push("Valid redacted database-profile.json is required but missing.");
    }
  }
  const pass = gate.pass !== false && (!required || profileAvailable) && failures.length === 0;
  return {
    ...gate,
    required,
    pass,
    profileAvailable,
    failures,
    warnings:
      required || gate.available
        ? []
        : ["No redacted database profile was available; UI evidence remains the primary truth source."],
  };
}

function collectDatabaseRequirementBlockers(gates, options = {}) {
  if (gates.database.profileSafety?.pass === false) {
    return [
      blocker(
        "database.profile-unsafe",
        "P0",
        "database-profile.json is not safely redacted for Truth Pipeline use.",
        ["db-profile", "db-model", "truth-universe", "truth-claims", "truth-readiness"],
        { failures: gates.database.failures || [], quotaImpact: "low" },
      ),
    ];
  }
  if (gates.database.derivedArtifactContractsPass === false) {
    return [
      blocker(
        "database.derived-artifact-invalid",
        "P0",
        "Database-derived Truth Pipeline artifacts are malformed or inconsistent.",
        ["db-model", "truth-universe", "truth-claims", "truth-readiness"],
        { failures: gates.database.contractFailures || [], quotaImpact: "low" },
      ),
    ];
  }
  if (!normalizeBoolean(options.requireDatabaseEvidence) || gates.database.profileAvailable) return [];
  const expectedCode = gates.database.metrics?.expectedSystemCode || "";
  const actualCode = gates.database.metrics?.databaseProfileSystemCode || "";
  return [
    blocker(
      "database.required-profile-missing",
      "P0",
      gates.database.profileArtifactValid && expectedCode && actualCode !== expectedCode
        ? `databaseProfile.enabled=true but database-profile.json belongs to ${actualCode || "unknown"}, expected ${expectedCode}.`
        : "databaseProfile.enabled=true but no redacted database evidence is available.",
      ["db-profile", "db-model", "truth-universe", "truth-claims", "truth-readiness"],
    ),
  ];
}

function buildImprovementActions(gates, blockers) {
  const actions = blockers.map((item) => action(item.id, item.message, item.rerunNodes));
  if (gates.factCheck.missingWritableClaimIds?.length) {
    actions.push(
      action(
        "narrative.cover-missing-writable-claims",
        "Rerun the function-section narrative with the missing writable claim list from fact-check-report.json.",
        ["narrative", "fact-check", "quality", "truth-readiness"],
        {
          rewriteScope: "function-sections",
          narrativePart: "function-sections",
          missingWritableClaimIds: gates.factCheck.missingWritableClaimIds,
        },
      ),
    );
  }
  if (!gates.database.available && !gates.database.required) {
    actions.push(
      action(
        "database.optional-profile",
        "Add redacted test-database metadata when available to strengthen entity and status-field reasoning.",
        ["db-profile", "db-model", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (gates.claims.warnings?.length) {
    actions.push(
      action(
        "claims.weak-boundary",
        "Keep weak/database-only claims in pending confirmations unless browser evidence confirms them.",
        ["narrative", "fact-check", "truth-readiness"],
      ),
    );
  }
  return actions;
}

function buildTruthReadinessReport(input = {}) {
  const threshold = normalizeThreshold(input.threshold);
  const artifacts = input.artifacts || {};
  const databaseGate = buildDatabaseRequirementGate(buildDatabaseGate(artifacts, input), input);
  const lineageGate = buildLineageGate(artifacts);
  const gates = {
    evidence: buildEvidenceGate(artifacts.quality || { status: "missing", file: REQUIRED_ARTIFACTS.quality }, artifacts),
    claims: buildClaimsGate(artifacts.claims || { status: "missing", file: REQUIRED_ARTIFACTS.claims }),
    factCheck: buildFactCheckFreshnessGate(
      buildFactCheckGate(
        artifacts.factCheck || { status: "missing", file: REQUIRED_ARTIFACTS.factCheck },
        artifacts,
      ),
      artifacts,
    ),
    narrative: buildNarrativeFreshnessGate(
      buildNarrativeGate(
        artifacts.narrative || { status: "missing", file: REQUIRED_ARTIFACTS.narrative },
      ),
      artifacts,
    ),
    database: databaseGate,
    lineage: lineageGate,
  };
  const score =
    gates.evidence.score * 0.35 +
    gates.claims.score * 0.25 +
    gates.factCheck.score * 0.25 +
    gates.narrative.score * 0.15;
  const blockers = [
    ...collectBlockers(gates),
    ...collectDatabaseRequirementBlockers(gates, input),
  ];
  if (!gates.lineage.pass) {
    blockers.push(
      blocker(
        "truth.lineage-stale",
        "P0",
        "Truth Pipeline artifacts were not generated from the current upstream evidence/database inputs.",
        ["db-model", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (score < threshold) {
    blockers.push(
      blocker(
        "truth.score-below-threshold",
        "P0",
        `Truth readiness score ${percent(score)}% is below ${percent(threshold)}%.`,
        ["truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  const canSubmitReview = blockers.length === 0 && score >= threshold;
  return {
    artifactType: "truth-readiness-report",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: input.system || artifacts.evidenceSummary?.value?.system || artifacts.claims?.value?.system || null,
    threshold,
    requirements: {
      databaseEvidenceRequired: gates.database.required,
    },
    score: clamp01(score),
    scorePercent: percent(score),
    canSubmitReview,
    canFinalize: canSubmitReview && gates.factCheck.pass && gates.evidence.pass,
    gates,
    blockers,
    improvementActions: buildImprovementActions(gates, blockers),
    sourceArtifacts: buildReadinessSourceArtifacts(artifacts),
  };
}

function runTruthReadinessCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const artifacts = loadReadinessInputs(inputDir);
  const expectedSystem = options.expectedSystem || {
    code: options.systemCode || options.system,
    name: options.systemName,
  };
  const report = buildTruthReadinessReport({
    artifacts,
    threshold: options.threshold,
    requireDatabaseEvidence: options.requireDatabaseEvidence,
    expectedSystem,
  });
  const outputPath = options.outputPath || path.join(inputDir, "truth-readiness-report.json");
  writeJson(outputPath, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/check-truth-readiness.js --input outputs/system");
  }
  const report = runTruthReadinessCheck({
    inputDir: args.input,
    outputPath: args.output,
    threshold: args.threshold,
    requireDatabaseEvidence: args["require-database-evidence"],
    systemCode: args["system-code"] || args.system,
    systemName: args["system-name"],
  });
  const outputPath = args.output || path.join(path.resolve(args.input), "truth-readiness-report.json");
  console.log(`Truth readiness report written: ${outputPath}`);
  console.log(`Truth readiness: ${report.scorePercent}% canSubmitReview=${report.canSubmitReview}`);
  if (!report.canSubmitReview) {
    console.error(report.blockers.map((item) => `${item.id}: ${item.message}`).join("\n"));
    process.exit(2);
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
  DEFAULT_THRESHOLD,
  assertValidDatabaseProfileArtifact,
  assertValidDataDictionaryArtifact,
  assertValidEntityModelArtifact,
  assertValidFunctionUniverseArtifact,
  assertValidTruthReadinessReportArtifact,
  buildReadinessSourceArtifacts,
  buildLineageGate,
  buildTruthReadinessReport,
  findStaleFactCheckSources,
  findStaleNarrativeSources,
  findStaleReadinessSources,
  isValidDatabaseProfile,
  loadReadinessInputs,
  normalizeThreshold,
  runTruthReadinessCheck,
  scanDatabaseProfileSafety,
};
