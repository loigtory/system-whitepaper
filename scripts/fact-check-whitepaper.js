#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

const PENDING_SECTION_PATTERN =
  /(\u5f85\u786e\u8ba4|\u672a\u8986\u76d6|\u672a\u9a8c\u8bc1|Pending|Unverified|Not covered)/i;
const GENERIC_HEADING_PATTERN =
  /^(\u7cfb\u7edf\u6982\u89c8|\u7cfb\u7edf\u5b9a\u4f4d|\u529f\u80fd\u6a21\u5757\u6982\u89c8|\u6838\u5fc3\u529f\u80fd\u8bf4\u660e|\u5178\u578b\u4e1a\u52a1\u6d41\u7a0b|\u89d2\u8272\u4e0e\u6743\u9650|\u5f85\u786e\u8ba4\u4e8b\u9879|\u9644\u5f55|\u8bc1\u636e\u7d22\u5f15|\u7ed3\u8bba|\u6982\u8ff0)$/;

function compactString(value) {
  return String(value || "").trim();
}

function normalizeTerm(value) {
  return compactString(value).replace(/^["'\u300c\u300e\u3010\[]+|["'\u300d\u300f\u3011\]]+$/g, "");
}

function stripMarkdownSyntax(line) {
  return String(line || "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[[^\]]+]\([^)]*\)/g, "")
    .replace(/[`*_>#|]/g, "")
    .trim();
}

function extractHeadingCandidate(line) {
  const match = String(line || "").match(/^(#{3,6})\s+(.+)$/);
  if (!match) return "";
  return normalizeTerm(
    match[2]
      .replace(/^\d+(\.\d+)*[\u3001\uff1a:\s-]*/, "")
      .replace(/\s*\(.*?\)\s*$/g, "")
      .replace(/\s*\uff08.*?\uff09\s*$/g, ""),
  );
}

function shouldTrackTerm(term) {
  const value = normalizeTerm(term);
  if (value.length < 2) return false;
  if (/^\d+$/.test(value)) return false;
  if (GENERIC_HEADING_PATTERN.test(value)) return false;
  return true;
}

function claimTerms(claim = {}) {
  const terms = [
    claim.subject,
    claim.module,
    claim.function,
    claim.entity,
    claim.evidence?.comment,
  ];
  return Array.from(new Set(terms.map(normalizeTerm).filter(shouldTrackTerm)));
}

function buildTermIndex(claims = []) {
  const allTerms = new Map();
  const writableTerms = new Map();
  const nonWritableTerms = new Map();

  for (const claim of claims || []) {
    for (const term of claimTerms(claim)) {
      if (!allTerms.has(term)) allTerms.set(term, []);
      allTerms.get(term).push(claim);

      if (claim.writable) {
        if (!writableTerms.has(term)) writableTerms.set(term, []);
        writableTerms.get(term).push(claim);
      } else {
        if (!nonWritableTerms.has(term)) nonWritableTerms.set(term, []);
        nonWritableTerms.get(term).push(claim);
      }
    }
  }

  return { allTerms, writableTerms, nonWritableTerms };
}

function lineContainsTerm(line, term) {
  return stripMarkdownSyntax(line).includes(term);
}

function extractClaimReferences(markdown) {
  const refs = [];
  for (const match of String(markdown || "").matchAll(/\[claim:([^\]]+)]/g)) {
    refs.push(match[1].trim());
  }
  return refs;
}

function buildFactCheckReport(input = {}) {
  const markdown = String(input.markdown || "");
  const claimsArtifact = input.claimsArtifact || {};
  const claims = Array.isArray(claimsArtifact.claims) ? claimsArtifact.claims : [];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const { allTerms, writableTerms, nonWritableTerms } = buildTermIndex(claims);
  const failures = [];
  const warnings = [];
  const supported = [];
  const pendingReferences = [];
  const nonWritableAssertions = [];
  const unsupportedHeadings = [];
  const unknownClaimRefs = [];
  const nonWritableClaimRefs = [];
  const seenSupported = new Set();

  let inPendingSection = false;
  let inCodeBlock = false;
  const lines = markdown.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (/^#{1,6}\s+/.test(line)) {
      inPendingSection = PENDING_SECTION_PATTERN.test(line);
      const heading = extractHeadingCandidate(line);
      if (heading && shouldTrackTerm(heading) && !allTerms.has(heading)) {
        unsupportedHeadings.push({ line: lineNumber, term: heading });
      }
    }

    for (const term of allTerms.keys()) {
      if (!lineContainsTerm(line, term)) continue;
      const writableClaims = writableTerms.get(term) || [];
      const nonWritableClaims = nonWritableTerms.get(term) || [];
      if (writableClaims.length) {
        for (const claim of writableClaims) {
          const key = `${claim.id}:${lineNumber}`;
          if (!seenSupported.has(key)) {
            supported.push({ line: lineNumber, term, claimId: claim.id });
            seenSupported.add(key);
          }
        }
      } else if (nonWritableClaims.length) {
        const item = {
          line: lineNumber,
          term,
          claimIds: nonWritableClaims.map((claim) => claim.id),
        };
        if (inPendingSection) {
          pendingReferences.push(item);
        } else {
          nonWritableAssertions.push(item);
        }
      }
    }
  }

  for (const claimId of extractClaimReferences(markdown)) {
    const claim = claimById.get(claimId);
    if (!claim) {
      unknownClaimRefs.push(claimId);
    } else if (!claim.writable) {
      nonWritableClaimRefs.push(claimId);
    }
  }

  if (unsupportedHeadings.length) {
    failures.push("Unsupported headings appear in the whitepaper body.");
  }
  if (nonWritableAssertions.length) {
    failures.push("Non-writable claims are written as body assertions instead of pending confirmations.");
  }
  if (unknownClaimRefs.length) {
    failures.push("Whitepaper references claim ids that do not exist.");
  }
  if (nonWritableClaimRefs.length) {
    failures.push("Whitepaper references non-writable claim ids.");
  }
  if (!supported.length && claims.length) {
    warnings.push("No writable claim terms were found in the whitepaper body.");
  }

  const checkedAssertions = supported.length + nonWritableAssertions.length + unsupportedHeadings.length;
  const supportedRatio = checkedAssertions ? supported.length / checkedAssertions : 1;
  const hasEnoughSupport =
    (!claims.length || supported.length > 0) && supportedRatio >= Number(input.minSupportedRatio || 0.95);

  return {
    canSubmitReview: failures.length === 0,
    canFinalize: failures.length === 0 && hasEnoughSupport,
    failures,
    warnings,
    supported,
    pendingReferences,
    nonWritableAssertions,
    weakAssertions: nonWritableAssertions,
    unsupportedHeadings,
    unknownClaimRefs,
    nonWritableClaimRefs,
    metrics: {
      claimCount: claims.length,
      checkedAssertions,
      supportedAssertions: supported.length,
      supportedRatio,
    },
  };
}

function runFactCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const markdownPath =
    options.markdownPath || path.join(inputDir, "whitepaper.pending-review.md");
  const claimsPath = options.claimsPath || path.join(inputDir, "verified-claims.json");
  const outputPath = options.outputPath || path.join(inputDir, "fact-check-report.json");

  if (!fs.existsSync(markdownPath)) {
    const report = {
      canSubmitReview: false,
      canFinalize: false,
      failures: [`Whitepaper markdown not found: ${markdownPath}`],
      warnings: [],
      metrics: { claimCount: 0, checkedAssertions: 0, supportedAssertions: 0, supportedRatio: 0 },
    };
    writeJson(outputPath, report);
    return report;
  }

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const claimsArtifact = readRequiredJsonObject(claimsPath, {
    label: "Verified claims",
  });
  const report = buildFactCheckReport({
    markdown,
    claimsArtifact,
    minSupportedRatio: options.minSupportedRatio,
  });
  writeJson(outputPath, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/fact-check-whitepaper.js --input outputs/system");
  }
  const report = runFactCheck({
    inputDir: args.input,
    markdownPath: args.markdown,
    claimsPath: args.claims,
    outputPath: args.output,
    minSupportedRatio: args["min-supported-ratio"],
  });
  const outputPath = args.output || path.join(path.resolve(args.input), "fact-check-report.json");
  console.log(`Fact-check report written: ${outputPath}`);
  if (!report.canFinalize) {
    console.error(report.failures.concat(report.warnings).join("\n"));
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
  buildFactCheckReport,
  runFactCheck,
};
