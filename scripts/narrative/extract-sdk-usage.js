const { attachUsageCost } = require("./usage-cost");

const TOKEN_KEY_PATTERN =
  /^(input|output|total|prompt|completion|cacheRead|cacheWrite)?tokens?$/i;
const TOKEN_FIELD_PATTERN = /token|usage|billing|cost/i;
const CHARS_PER_TOKEN_ESTIMATE = 1.8;

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function toSafeInteger(value) {
  const number = toNumber(value);
  return number === null ? 0 : Math.floor(number);
}

function normalizeUsageRecord(record = {}) {
  const inputTokens =
    toNumber(record.inputTokens) ??
    toNumber(record.input_tokens) ??
    toNumber(record.promptTokens) ??
    toNumber(record.prompt_tokens);
  const outputTokens =
    toNumber(record.outputTokens) ??
    toNumber(record.output_tokens) ??
    toNumber(record.completionTokens) ??
    toNumber(record.completion_tokens);
  const cacheReadTokens =
    toNumber(record.cacheReadTokens) ??
    toNumber(record.cache_read_tokens) ??
    toNumber(record.cacheReadInputTokens);
  const cacheWriteTokens =
    toNumber(record.cacheWriteTokens) ??
    toNumber(record.cache_write_tokens) ??
    toNumber(record.cacheCreationInputTokens);
  const totalTokens =
    toNumber(record.totalTokens) ??
    toNumber(record.total_tokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  if (inputTokens === null && outputTokens === null && totalTokens === null) {
    return null;
  }

  const normalized = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens || 0) + (outputTokens || 0),
    source: record.source || "sdk",
    estimated: Boolean(record.estimated),
  };

  if (cacheReadTokens !== null) normalized.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens !== null) normalized.cacheWriteTokens = cacheWriteTokens;
  return normalized;
}

function scoreUsageCandidate(record) {
  if (!record) return -1;
  if (record.estimated) return 1;
  return (
    (record.inputTokens ? 2 : 0) +
    (record.outputTokens ? 2 : 0) +
    (record.totalTokens ? 1 : 0) +
    (record.cacheReadTokens ? 1 : 0) +
    (record.cacheWriteTokens ? 1 : 0)
  );
}

function mergeUsageCandidates(current, candidate) {
  if (!candidate) return current;
  if (candidate.estimated && current && !current.estimated) return current;
  if (!current || scoreUsageCandidate(candidate) > scoreUsageCandidate(current)) {
    return candidate;
  }
  return current;
}

function mergeSdkUsageRecords(...records) {
  const usable = records.filter(Boolean);
  if (!usable.length) return null;

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasCacheRead = false;
  let hasCacheWrite = false;
  let estimated = true;
  let source = "sdk";

  for (const record of usable) {
    if (!record.estimated) estimated = false;
    if (record.source && record.source !== "estimated") source = record.source;
    if (record.inputTokens) {
      inputTokens += record.inputTokens;
      hasInput = true;
    }
    if (record.outputTokens) {
      outputTokens += record.outputTokens;
      hasOutput = true;
    }
    if (record.cacheReadTokens) {
      cacheReadTokens += record.cacheReadTokens;
      hasCacheRead = true;
    }
    if (record.cacheWriteTokens) {
      cacheWriteTokens += record.cacheWriteTokens;
      hasCacheWrite = true;
    }
  }

  if (!hasInput && !hasOutput) return null;

  const merged = {
    inputTokens: hasInput ? inputTokens : 0,
    outputTokens: hasOutput ? outputTokens : 0,
    totalTokens: (hasInput ? inputTokens : 0) + (hasOutput ? outputTokens : 0),
    source,
    estimated,
  };
  if (hasCacheRead) merged.cacheReadTokens = cacheReadTokens;
  if (hasCacheWrite) merged.cacheWriteTokens = cacheWriteTokens;
  return merged;
}

function visitUsageNode(value, depth, best, seen) {
  if (!value || depth > 8) return best;
  if (typeof value !== "object") return best;

  if (Array.isArray(value)) {
    let next = best;
    for (const item of value.slice(0, 40)) {
      next = visitUsageNode(item, depth + 1, next, seen);
    }
    return next;
  }

  if (seen.has(value)) return best;
  seen.add(value);

  const direct = normalizeUsageRecord(value);
  let next = mergeUsageCandidates(best, direct);

  for (const [key, child] of Object.entries(value)) {
    if (!TOKEN_FIELD_PATTERN.test(key) && !TOKEN_KEY_PATTERN.test(key)) continue;
    if (child && typeof child === "object") {
      const nested = normalizeUsageRecord(child);
      next = mergeUsageCandidates(next, nested ? { ...nested, source: key } : null);
      next = visitUsageNode(child, depth + 1, next, seen);
    }
  }

  return next;
}

function extractSdkUsageFromTurnEndedUsages(usages = []) {
  const normalized = (Array.isArray(usages) ? usages : [])
    .map((usage) => normalizeUsageRecord(usage))
    .filter(Boolean);
  return mergeSdkUsageRecords(...normalized.map((item) => ({ ...item, source: "sdk" })));
}

function extractSdkUsageFromConversation(turns = []) {
  const usages = [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    const steps = turn?.turn?.steps || turn?.steps || [];
    for (const step of steps) {
      if (step?.type === "turn-ended" && step?.usage) {
        usages.push(step.usage);
      }
    }
  }
  return extractSdkUsageFromTurnEndedUsages(usages);
}

function extractSdkUsageFromStreamDelta(update) {
  if (!update || typeof update !== "object") return null;
  if (update.type === "turn-ended" && update.usage) {
    return extractSdkUsageFromTurnEndedUsages([update.usage]);
  }
  return null;
}

function extractSdkUsageFromAgentResult(result) {
  if (!result || typeof result !== "object") return null;
  const candidates = [
    result.usage,
    result.metrics?.usage,
    result.tokenUsage,
    result.run?.usage,
    result.response?.usage,
    result,
  ];
  let best = null;
  const seen = new WeakSet();
  for (const candidate of candidates) {
    best = visitUsageNode(candidate, 0, best, seen);
  }
  return best;
}

function estimateTokenUsageFromChars({ promptChars = 0, inlineSummaryChars = 0, fragmentChars = 0 } = {}) {
  const inputChars = toSafeInteger(promptChars) + toSafeInteger(inlineSummaryChars);
  const outputChars = toSafeInteger(fragmentChars);
  const inputTokens = Math.max(0, Math.round(inputChars / CHARS_PER_TOKEN_ESTIMATE));
  const outputTokens = Math.max(0, Math.round(outputChars / CHARS_PER_TOKEN_ESTIMATE));
  if (!inputTokens && !outputTokens) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source: "estimated",
    estimated: true,
  };
}

function resolvePhase3bUsage({
  turnEndedUsages = [],
  conversationTurns = [],
  agentResult = null,
  charCounts = {},
} = {}) {
  const sdkUsage = mergeSdkUsageRecords(
    extractSdkUsageFromTurnEndedUsages(turnEndedUsages),
    extractSdkUsageFromConversation(conversationTurns),
    extractSdkUsageFromAgentResult(agentResult),
  );

  if (sdkUsage && sdkUsage.totalTokens > 0 && !sdkUsage.estimated) {
    return {
      sdkUsage,
      usageSource: "sdk",
      usageEstimated: false,
      usageCaptureMethod: turnEndedUsages.length ? "turn-ended-delta" : "conversation-or-result",
    };
  }

  const estimated = estimateTokenUsageFromChars(charCounts);
  if (estimated) {
    return {
      sdkUsage: estimated,
      usageSource: "estimated",
      usageEstimated: true,
      usageCaptureMethod: "char-estimate",
    };
  }

  return {
    sdkUsage: sdkUsage && sdkUsage.totalTokens > 0 ? sdkUsage : null,
    usageSource: sdkUsage && sdkUsage.totalTokens > 0 ? "sdk" : "unavailable",
    usageEstimated: false,
    usageCaptureMethod: sdkUsage && sdkUsage.totalTokens > 0 ? "partial-sdk" : "none",
  };
}

function collectTurnEndedUsageCandidates(value, sink, depth = 0, seen = null) {
  if (!value || depth > 6) return;
  const visited = seen || new WeakSet();
  if (typeof value !== "object") return;
  if (visited.has(value)) return;
  if (!Array.isArray(value)) visited.add(value);

  if (value.type === "turn-ended" && value.usage) {
    sink.push(value.usage);
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      collectTurnEndedUsageCandidates(item, sink, depth + 1, visited);
    }
    return;
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectTurnEndedUsageCandidates(child, sink, depth + 1, visited);
    }
  }
}

function enrichPhase3bUsageRecord(usage = {}, pricingConfig = {}) {
  if (!usage || usage.provider !== "cursor-sdk") return usage;
  const existingTotal = Number(usage.totalTokens || usage.sdkUsage?.totalTokens || 0);
  if (existingTotal > 0 && usage.usageSource) {
    return attachUsageCost({ ...usage, usageUnavailable: false }, pricingConfig);
  }
  const hasSdkTokens =
    usage.usageSource === "sdk" &&
    existingTotal > 0 &&
    !usage.usageEstimated &&
    !usage.sdkUsage?.estimated;
  if (hasSdkTokens) {
    return attachUsageCost({ ...usage, usageUnavailable: false }, pricingConfig);
  }

  const estimated = estimateTokenUsageFromChars({
    promptChars: usage.promptChars,
    inlineSummaryChars: usage.inlineSummaryChars,
    fragmentChars: usage.fragmentChars,
  });
  if (!estimated) return attachUsageCost(usage, pricingConfig);

  return attachUsageCost(
    {
      ...usage,
      sdkUsage: estimated,
      inputTokens: estimated.inputTokens,
      outputTokens: estimated.outputTokens,
      totalTokens: estimated.totalTokens,
      usageSource: "estimated",
      usageEstimated: true,
      usageUnavailable: false,
      usageCaptureMethod: usage.usageCaptureMethod || "char-estimate-backfill",
    },
    pricingConfig,
  );
}

module.exports = {
  CHARS_PER_TOKEN_ESTIMATE,
  collectTurnEndedUsageCandidates,
  enrichPhase3bUsageRecord,
  estimateTokenUsageFromChars,
  extractSdkUsageFromAgentResult,
  extractSdkUsageFromConversation,
  extractSdkUsageFromStreamDelta,
  extractSdkUsageFromTurnEndedUsages,
  mergeSdkUsageRecords,
  normalizeUsageRecord,
  resolvePhase3bUsage,
};
