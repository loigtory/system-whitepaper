#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

const DEFAULT_MIN_COVERAGE = 0.95;
const DEFAULT_MIN_CRITICAL_COVERAGE = 0.8;
const DEFAULT_MAX_OVERCLAIMS = 0;

function normalizeEvalThreshold(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number > 1 ? number / 100 : number;
}

function normalizeCount(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，。；、：:,.!?！？（）()[\]【】「」"'`*_>#|]/g, "")
    .toLowerCase();
}

function normalizeTerms(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return list
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function fingerprintFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
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

function buildSourceArtifact(filePath) {
  if (!filePath) return null;
  return {
    file: path.basename(filePath),
    fingerprint: fingerprintFile(filePath),
  };
}

function buildGoldenEvalSourceArtifacts(paths = {}) {
  const result = {};
  if (paths.markdownPath) result.markdown = buildSourceArtifact(paths.markdownPath);
  if (paths.goldenFactsPath) result.goldenFacts = buildSourceArtifact(paths.goldenFactsPath);
  if (paths.truthModelPath) result.truthModel = buildSourceArtifact(paths.truthModelPath);
  if (paths.factCheckPath) result.factCheck = buildSourceArtifact(paths.factCheckPath);
  return result;
}

function assertValidGoldenFactsArtifact(artifact = {}) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("golden facts must be a JSON object.");
  }
  if (artifact.artifactType !== "golden-facts" && artifact.schemaVersion === undefined) {
    throw new Error("golden facts artifactType must be golden-facts.");
  }
  if (!Array.isArray(artifact.facts)) {
    throw new Error("golden facts facts must be an array.");
  }
  for (const fact of artifact.facts) {
    if (!fact || typeof fact !== "object" || Array.isArray(fact)) {
      throw new Error("golden facts entries must be objects.");
    }
    if (!String(fact.id || "").trim()) {
      throw new Error("golden facts entries must include id.");
    }
  }
}

function assertValidGoldenEvalReportArtifact(report = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("golden-eval-report.json must be a JSON object.");
  }
  if (report.artifactType !== "golden-eval-report") {
    throw new Error("golden-eval-report.json artifactType must be golden-eval-report.");
  }
  if (typeof report.canPass !== "boolean") {
    throw new Error("golden-eval-report.json canPass must be a boolean.");
  }
  if (!report.metrics || typeof report.metrics !== "object" || Array.isArray(report.metrics)) {
    throw new Error("golden-eval-report.json metrics must be an object.");
  }
  for (const key of [
    "factCount",
    "coveredCount",
    "partialCount",
    "missingCount",
    "overclaimCount",
    "coverageRatio",
  ]) {
    if (!Number.isFinite(Number(report.metrics[key]))) {
      throw new Error(`golden-eval-report.json metrics.${key} must be numeric.`);
    }
  }
  if (report.metrics.overclaimCount > 0 && report.canPass) {
    throw new Error("golden-eval-report.json cannot pass when overclaims exist.");
  }
  if (!Array.isArray(report.results)) {
    throw new Error("golden-eval-report.json results must be an array.");
  }
  if (!Array.isArray(report.failures)) {
    throw new Error("golden-eval-report.json failures must be an array.");
  }
}

function termMatches(sourceText, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  return normalizeText(sourceText).includes(normalizedTerm);
}

function forbiddenPatternMatches(pattern, markdown) {
  const rawPattern = String(pattern || "").trim();
  if (!rawPattern) return false;
  const rawMarkdown = String(markdown || "");
  const regex = new RegExp(rawPattern, "i");
  if (regex.test(rawMarkdown)) return true;
  const compactPattern = normalizeText(rawPattern);
  const compactMarkdown = normalizeText(rawMarkdown);
  return Boolean(compactPattern && compactMarkdown.includes(compactPattern));
}

function buildRequiredGroups(fact = {}) {
  const match = fact.match && typeof fact.match === "object" ? fact.match : {};
  const requiredGroups = [];
  for (const term of normalizeTerms(match.all || fact.mustCover || [])) {
    requiredGroups.push([term]);
  }
  const groups = Array.isArray(match.groups) ? match.groups : [];
  for (const group of groups) {
    const alternatives = normalizeTerms(group);
    if (alternatives.length) requiredGroups.push(alternatives);
  }
  return requiredGroups;
}

function splitEvidenceWindows(markdown = "") {
  const source = String(markdown || "");
  const paragraphCandidates = source
    .split(/\r?\n\s*\r?\n/g)
    .filter((candidate) => candidate.split(/\r?\n/g).filter((line) => line.trim()).length <= 1);
  const candidates = [...paragraphCandidates, ...source.split(/\r?\n/g), ...source.split(/[。！？!?；;]/g)];
  const seen = new Set();
  const windows = [];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    windows.push(value);
  }
  return windows.length ? windows : [source];
}

function matchRequiredGroups(requiredGroups = [], sourceText = "") {
  const matchedTerms = [];
  const missingTerms = [];
  let matchedGroupCount = 0;

  for (const group of requiredGroups) {
    const matched = group.find((term) => termMatches(sourceText, term));
    if (matched) {
      matchedGroupCount += 1;
      matchedTerms.push(matched);
    } else {
      missingTerms.push(group.join(" / "));
    }
  }

  return { matchedGroupCount, matchedTerms, missingTerms };
}

function scoreGoldenFact(fact = {}, markdown = "") {
  const requiredGroups = buildRequiredGroups(fact);
  const globalMatch = matchRequiredGroups(requiredGroups, markdown);
  const bestWindowMatch = splitEvidenceWindows(markdown)
    .map((windowText) => ({ windowText, ...matchRequiredGroups(requiredGroups, windowText) }))
    .sort((left, right) => {
      if (right.matchedGroupCount !== left.matchedGroupCount) {
        return right.matchedGroupCount - left.matchedGroupCount;
      }
      return right.matchedTerms.length - left.matchedTerms.length;
    })[0] || { matchedGroupCount: 0, matchedTerms: [], missingTerms: [] };

  const overclaims = [];
  for (const forbidden of fact.forbiddenClaims || fact.overclaimIf || []) {
    if (typeof forbidden === "string") {
      if (termMatches(markdown, forbidden)) {
        overclaims.push({ factId: fact.id || "", pattern: forbidden, message: forbidden });
      }
      continue;
    }
    const pattern = String(forbidden?.pattern || "").trim();
    if (!pattern) continue;
    if (forbiddenPatternMatches(pattern, markdown)) {
      overclaims.push({
        factId: fact.id || "",
        pattern,
        message: forbidden.message || `Forbidden claim matched: ${pattern}`,
      });
    }
  }

  const total = requiredGroups.length;
  let status = "missing";
  if (overclaims.length) status = "overclaim";
  else if (total > 0 && bestWindowMatch.matchedGroupCount === total) status = "covered";
  else if (globalMatch.matchedGroupCount > 0) status = "partial";
  const missingTerms =
    status === "partial" && globalMatch.matchedGroupCount === total
      ? ["同一证据窗口内未同时覆盖全部要点"]
      : globalMatch.missingTerms;

  return {
    id: fact.id || "",
    category: fact.category || "",
    priority: fact.priority || "",
    statement: fact.statement || fact.claim || "",
    status,
    score: status === "covered" ? 1 : status === "partial" ? 0.5 : 0,
    matchedTerms: globalMatch.matchedTerms,
    missingTerms,
    overclaims,
  };
}

function scoreGoldenFacts(goldenFacts = {}, markdown = "") {
  assertValidGoldenFactsArtifact(goldenFacts);
  return goldenFacts.facts.map((fact) => scoreGoldenFact(fact, markdown));
}

function buildGoldenEvalReport(options = {}) {
  const goldenFacts = options.goldenFacts || {};
  const markdown = String(options.markdown || options.whitepaperMarkdown || "");
  const minCoverageRatio = normalizeEvalThreshold(options.minCoverageRatio ?? options.minCoverage, DEFAULT_MIN_COVERAGE);
  const minCriticalCoverageRatio = normalizeEvalThreshold(
    options.minCriticalCoverageRatio ?? options.minCriticalCoverage,
    DEFAULT_MIN_CRITICAL_COVERAGE,
  );
  const maxOverclaims = normalizeCount(options.maxOverclaims, DEFAULT_MAX_OVERCLAIMS);
  const results = scoreGoldenFacts(goldenFacts, markdown);
  const overclaims = results.flatMap((result) => result.overclaims || []);
  const factCount = results.length;
  const coveredCount = results.filter((result) => result.status === "covered").length;
  const partialCount = results.filter((result) => result.status === "partial").length;
  const missingCount = results.filter((result) => result.status === "missing").length;
  const criticalResults = results.filter((result) => String(result.priority || "").toUpperCase() === "P0");
  const criticalCoveredCount = criticalResults.filter((result) => result.status === "covered").length;
  const coverageRatio = factCount ? coveredCount / factCount : 0;
  const criticalCoverageRatio = criticalResults.length ? criticalCoveredCount / criticalResults.length : 0;
  const failures = [];
  const warnings = [];
  const blockers = [];

  if (coverageRatio < minCoverageRatio) {
    failures.push(
      `Golden Eval coverage ${(coverageRatio * 100).toFixed(1)}% is below ${(minCoverageRatio * 100).toFixed(1)}%.`,
    );
    blockers.push({
      id: "golden.coverage-below-threshold",
      severity: "P0",
      message: "Golden Eval coverage is below threshold.",
      rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
    });
  }
  if (criticalCoverageRatio < minCriticalCoverageRatio) {
    failures.push(
      `Golden Eval critical coverage ${(criticalCoverageRatio * 100).toFixed(1)}% is below ${(minCriticalCoverageRatio * 100).toFixed(1)}%.`,
    );
    blockers.push({
      id: "golden.critical-coverage-below-threshold",
      severity: "P0",
      message: "Golden Eval P0 coverage is below threshold.",
      rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
    });
  }
  if (overclaims.length > maxOverclaims) {
    failures.push(`Golden Eval overclaims ${overclaims.length} exceeds ${maxOverclaims}.`);
    blockers.push({
      id: "golden.overclaim",
      severity: "P0",
      message: "Golden Eval detected overclaims.",
      rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
    });
  }

  const canPass = failures.length === 0;
  const report = {
    artifactType: "golden-eval-report",
    version: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    system: {
      code: options.systemCode || goldenFacts.systemCode || "",
      name: options.systemName || goldenFacts.systemName || "",
    },
    thresholds: {
      minCoverageRatio,
      minCriticalCoverageRatio,
      maxOverclaims,
    },
    canPass,
    canSubmitReview: canPass,
    canFinalize: canPass,
    metrics: {
      factCount,
      coveredCount,
      partialCount,
      missingCount,
      overclaimCount: overclaims.length,
      coverageRatio,
      criticalFactCount: criticalResults.length,
      criticalCoveredCount,
      criticalCoverageRatio,
    },
    results,
    overclaims,
    failures,
    warnings,
    blockers,
    sourceArtifacts: options.sourceArtifacts || {},
  };
  assertValidGoldenEvalReportArtifact(report);
  return report;
}

function runGoldenEval(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const goldenFactsInput = options.goldenFactsPath || options.golden;
  if (!goldenFactsInput) {
    throw new Error("Golden facts path is required. Use --golden <file>.");
  }
  const goldenFactsPath = path.resolve(String(goldenFactsInput));
  const markdownPath = path.resolve(
    String(options.markdownPath || options.whitepaper || path.join(inputDir, "whitepaper.pending-review.md")),
  );
  const outputPath = path.resolve(String(options.outputPath || options.output || path.join(inputDir, "golden-eval-report.json")));
  const goldenFacts = readRequiredJsonObject(goldenFactsPath, { label: "Golden facts" });
  assertValidGoldenFactsArtifact(goldenFacts);
  if (!fs.existsSync(markdownPath)) {
    throw new Error(`Whitepaper markdown not found: ${markdownPath}`);
  }
  const markdown = fs.readFileSync(markdownPath, "utf8");
  const report = buildGoldenEvalReport({
    goldenFacts,
    markdown,
    generatedAt: options.generatedAt,
    minCoverageRatio: options.minCoverageRatio ?? options.minCoverage,
    minCriticalCoverageRatio: options.minCriticalCoverageRatio ?? options.minCriticalCoverage,
    maxOverclaims: options.maxOverclaims,
    systemCode: options.systemCode,
    systemName: options.systemName,
    sourceArtifacts: buildGoldenEvalSourceArtifacts({
      markdownPath,
      goldenFactsPath,
      truthModelPath: options.truthModelPath || options.truthModel,
      factCheckPath: options.factCheckPath || options.factCheck,
    }),
  });
  writeJson(outputPath, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if ((!args.input && !args.whitepaper) || !args.golden) {
    throw new Error(
      "Usage: node scripts/run-golden-eval.js --input outputs/system --golden docs/evals/adp-golden-facts.json",
    );
  }
  const report = runGoldenEval({
    inputDir: args.input,
    goldenFactsPath: args.golden,
    markdownPath: args.whitepaper,
    outputPath: args.output,
    truthModelPath: args["truth-model"],
    factCheckPath: args["fact-check"],
    minCoverageRatio: args["min-coverage"],
    minCriticalCoverageRatio: args["min-critical-coverage"],
    maxOverclaims: args["max-overclaims"],
    systemCode: args["system-code"],
    systemName: args["system-name"],
  });
  const outputPath = args.output || path.join(path.resolve(args.input || "."), "golden-eval-report.json");
  console.log(`Golden Eval report written: ${outputPath}`);
  console.log(
    `Coverage: ${report.metrics.coveredCount}/${report.metrics.factCount}, partial=${report.metrics.partialCount}, missing=${report.metrics.missingCount}, overclaims=${report.metrics.overclaimCount}`,
  );
  if (!report.canPass) {
    console.error(report.failures.join("\n"));
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
  DEFAULT_MAX_OVERCLAIMS,
  DEFAULT_MIN_COVERAGE,
  DEFAULT_MIN_CRITICAL_COVERAGE,
  assertValidGoldenEvalReportArtifact,
  assertValidGoldenFactsArtifact,
  buildGoldenEvalReport,
  buildGoldenEvalSourceArtifacts,
  normalizeEvalThreshold,
  runGoldenEval,
  scoreGoldenFact,
  scoreGoldenFacts,
};
