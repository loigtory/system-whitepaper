#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

function compactString(value) {
  return String(value || "").trim();
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

function normalizeSource(source = {}) {
  return {
    type: compactString(source.type),
    id: compactString(source.id),
    label: compactString(source.label),
  };
}

function normalizeSources(sources = []) {
  return uniqueBy((sources || []).map(normalizeSource), (item) =>
    [item.type, item.id, item.label].join("::"),
  ).filter((item) => item.type || item.id || item.label);
}

function hasSourceType(sources, type) {
  return (sources || []).some((source) => source.type === type);
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 0;
}

function maxConfidence(...values) {
  return values.reduce(
    (best, value) => (confidenceRank(value) > confidenceRank(best) ? value : best),
    "low",
  );
}

function buildClaimId(prefix, parts = []) {
  return [prefix, ...parts]
    .map((part) =>
      compactString(part)
        .toLowerCase()
        .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join(":");
}

function classifyClaim(confidence, sources = []) {
  if (confidence === "high") return "confirmed";
  if (confidence === "medium" && hasSourceType(sources, "screenshot")) return "confirmed";
  if (confidence === "medium") return "inferred";
  return "weak";
}

function claimIsWritable(claim) {
  return claim.status === "confirmed" || claim.status === "inferred";
}

function buildModuleClaims(universe = {}) {
  return (universe.modules || []).map((module) => {
    const sources = normalizeSources(module.sources || []);
    const confidence = sources.length ? "medium" : "low";
    const claim = {
      id: buildClaimId("module", [module.name]),
      type: "module-presence",
      subject: module.name,
      module: module.name,
      text: `System exposes module "${module.name}".`,
      confidence,
      status: classifyClaim(confidence, sources),
      writable: false,
      sources,
      reasoning: "UI module/menu evidence proves presence, not full business purpose.",
    };
    claim.writable = claimIsWritable(claim);
    return claim;
  });
}

function buildFunctionClaims(universe = {}) {
  return (universe.functions || []).map((fn) => {
    const sources = normalizeSources(fn.sources || []);
    const hasScreenshot = hasSourceType(sources, "screenshot");
    const hasFields = (fn.queryFields || []).length || (fn.tableColumns || []).length;
    const confidence = hasScreenshot && hasFields ? "high" : hasScreenshot ? "medium" : "low";
    const claim = {
      id: buildClaimId("function", [fn.module, fn.name]),
      type: "function-presence",
      subject: fn.name,
      module: fn.module,
      text: `Module "${fn.module}" exposes function "${fn.name}".`,
      confidence,
      status: classifyClaim(confidence, sources),
      writable: false,
      evidence: {
        menuPath: fn.menuPath || "",
        actions: fn.actions || [],
        queryFields: fn.queryFields || [],
        tableColumns: fn.tableColumns || [],
      },
      sources,
      reasoning:
        "UI page, fields, actions, tables, and screenshots support visible function scope.",
    };
    claim.writable = claimIsWritable(claim);
    return claim;
  });
}

function buildEntityClaims(universe = {}) {
  return (universe.entities || []).map((entity) => {
    const sources = normalizeSources(entity.sources || []);
    const confidence =
      entity.confidence === "medium" || entity.confidence === "high" ? "medium" : "low";
    const claim = {
      id: buildClaimId("entity", [entity.table || entity.name]),
      type: "business-entity",
      subject: entity.name,
      table: entity.table,
      text: `Database metadata identifies business entity "${entity.name}".`,
      confidence,
      status: confidence === "medium" ? "inferred" : "weak",
      writable: false,
      evidence: {
        statusColumns: entity.statusColumns || [],
        timeColumns: entity.timeColumns || [],
      },
      sources,
      reasoning:
        "Redacted database metadata supports entity meaning; browser evidence is still required for user-facing workflow conclusions.",
    };
    claim.writable = claimIsWritable(claim);
    return claim;
  });
}

function buildFunctionEntityClaims(universe = {}) {
  return (universe.links || []).map((link) => {
    const sources = normalizeSources(link.sources || []);
    const confidence = maxConfidence(link.confidence || "low", "medium");
    const claim = {
      id: buildClaimId("link", [link.module, link.function, link.table]),
      type: "function-entity-link",
      subject: `${link.function} -> ${link.entity}`,
      module: link.module,
      function: link.function,
      entity: link.entity,
      table: link.table,
      text: `Function "${link.function}" is related to business entity "${link.entity}".`,
      confidence,
      status: classifyClaim(confidence, sources),
      writable: false,
      sources,
      reasoning:
        "UI terms and redacted database entity metadata overlap; this supports business interpretation, not completed process validation.",
    };
    claim.writable = claimIsWritable(claim);
    return claim;
  });
}

function buildStatusFieldClaims(universe = {}) {
  const claims = [];
  for (const entity of universe.entities || []) {
    for (const column of entity.statusColumns || []) {
      const sources = normalizeSources(entity.sources || []);
      const dictionary = Array.isArray(column.dictionary) ? column.dictionary : [];
      const confidence = dictionary.length ? "medium" : "low";
      const claim = {
        id: buildClaimId("status", [entity.table || entity.name, column.name]),
        type: "status-field",
        subject: column.name,
        entity: entity.name,
        table: entity.table,
        text: `Entity "${entity.name}" has status field "${column.name}".`,
        confidence,
        status: confidence === "medium" ? "inferred" : "weak",
        writable: false,
        evidence: {
          comment: column.comment || "",
          dictionary,
        },
        sources,
        reasoning:
          "Status fields support possible workflow stage inference; UI or operation feedback is needed before writing verified flow completion.",
      };
      claim.writable = claimIsWritable(claim);
      claims.push(claim);
    }
  }
  return claims;
}

function buildVerifiedClaimsArtifact(input = {}) {
  const universe = input.functionUniverse || {};
  const claims = [
    ...buildModuleClaims(universe),
    ...buildFunctionClaims(universe),
    ...buildEntityClaims(universe),
    ...buildFunctionEntityClaims(universe),
    ...buildStatusFieldClaims(universe),
  ];
  const uniqueClaims = uniqueBy(claims, (claim) => claim.id);
  const writableClaims = uniqueClaims.filter((claim) => claim.writable);
  return {
    artifactType: "verified-claims",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: universe.system || null,
    claims: uniqueClaims,
    writableClaimIds: writableClaims.map((claim) => claim.id),
    metrics: {
      claimCount: uniqueClaims.length,
      writableClaimCount: writableClaims.length,
      confirmedCount: uniqueClaims.filter((claim) => claim.status === "confirmed").length,
      inferredCount: uniqueClaims.filter((claim) => claim.status === "inferred").length,
      weakCount: uniqueClaims.filter((claim) => claim.status === "weak").length,
      supportedRatio: uniqueClaims.length ? writableClaims.length / uniqueClaims.length : 1,
    },
    rules: {
      lowConfidenceNotWritable: true,
      databaseOnlyNotConfirmed: true,
      purpose:
        "Claims are the only allowed business-writing source for the next narrative/fact-check stages.",
    },
  };
}

function buildVerifiedClaimsFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const functionUniverse = readRequiredJsonObject(
    options.functionUniversePath || path.join(dir, "function-universe.json"),
    { label: "Function universe" },
  );
  const artifact = buildVerifiedClaimsArtifact({ functionUniverse });
  const outputPath = options.outputPath || path.join(dir, "verified-claims.json");
  writeJson(outputPath, artifact);
  return { outputPath, artifact };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/build-verified-claims.js --input outputs/system");
  }
  const result = buildVerifiedClaimsFromDir(args.input, {
    outputPath: args.output,
    functionUniversePath: args["function-universe"],
  });
  console.log(`Verified claims written: ${result.outputPath}`);
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
  buildVerifiedClaimsArtifact,
  buildVerifiedClaimsFromDir,
  classifyClaim,
};
