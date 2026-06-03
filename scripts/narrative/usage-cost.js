const DEFAULT_USD_TO_CNY = 7.25;

const DEFAULT_MODEL_PRICING = {
  "composer-2.5": {
    inputPer1M: 0.5,
    outputPer1M: 2.5,
    cacheReadPer1M: 0.2,
    cacheWritePer1M: 0.5,
    source: "cursor-api-pool",
  },
  "composer-2": {
    inputPer1M: 0.5,
    outputPer1M: 2.5,
    cacheReadPer1M: 0.2,
    cacheWritePer1M: 0.5,
    source: "cursor-api-pool",
  },
  "composer-1.5": {
    inputPer1M: 3.5,
    outputPer1M: 17.5,
    cacheReadPer1M: 0.35,
    source: "cursor-api-pool",
  },
  "gpt-5.5": {
    inputPer1M: 5,
    outputPer1M: 30,
    cacheReadPer1M: 0.5,
    source: "cursor-api-pool",
  },
};

const COMPOSER_POOL_PRICING = {
  inputPer1M: 1.25,
  outputPer1M: 6,
  cacheReadPer1M: 0.25,
  cacheWritePer1M: 1.25,
  source: "cursor-composer-pool",
};

function normalizeModelId(model = "") {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/^cursor\//, "");
}

function resolveModelPricing(model, pricingConfig = {}) {
  const modelId = normalizeModelId(model);
  if (pricingConfig.pool === "composer-pool") {
    return { ...COMPOSER_POOL_PRICING, modelId: modelId || "composer-pool" };
  }
  const overrides = pricingConfig.models?.[modelId] || pricingConfig.models?.[model] || {};
  const defaults = DEFAULT_MODEL_PRICING[modelId] || DEFAULT_MODEL_PRICING["composer-2.5"];
  return {
    ...defaults,
    ...overrides,
    modelId,
  };
}

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function estimateUsageCost(usage = {}, pricingConfig = {}) {
  const inputTokens = toSafeNumber(usage.inputTokens ?? usage.sdkUsage?.inputTokens);
  const outputTokens = toSafeNumber(usage.outputTokens ?? usage.sdkUsage?.outputTokens);
  const cacheReadTokens = toSafeNumber(usage.cacheReadTokens ?? usage.sdkUsage?.cacheReadTokens);
  const cacheWriteTokens = toSafeNumber(
    usage.cacheWriteTokens ?? usage.sdkUsage?.cacheWriteTokens,
  );
  if (!inputTokens && !outputTokens) {
    return null;
  }

  const pricing = resolveModelPricing(usage.model || pricingConfig.defaultModel, pricingConfig);
  const cachedInput = Math.min(Math.max(cacheReadTokens, 0), Math.max(inputTokens, 0));
  const freshInput = Math.max(0, inputTokens - cachedInput);

  const inputCost = (freshInput / 1_000_000) * toSafeNumber(pricing.inputPer1M);
  const cacheReadCost = (cachedInput / 1_000_000) * toSafeNumber(pricing.cacheReadPer1M);
  const cacheWriteCost =
    (cacheWriteTokens / 1_000_000) *
    toSafeNumber(pricing.cacheWritePer1M ?? pricing.inputPer1M);
  const outputCost = (outputTokens / 1_000_000) * toSafeNumber(pricing.outputPer1M);
  const costUsd = inputCost + cacheReadCost + cacheWriteCost + outputCost;
  const usdToCny = toSafeNumber(pricingConfig.usdToCny) || DEFAULT_USD_TO_CNY;

  return {
    costUsd: Math.round(costUsd * 10000) / 10000,
    costCny: Math.round(costUsd * usdToCny * 100) / 100,
    costCurrency: "USD",
    costEstimated: true,
    costPricingModel: pricing.modelId || normalizeModelId(usage.model),
    costPricingSource: pricing.source || "cursor-api-pool",
    costBreakdown: {
      freshInputTokens: freshInput,
      cacheReadTokens: cachedInput,
      cacheWriteTokens,
      outputTokens,
      inputCostUsd: Math.round(inputCost * 10000) / 10000,
      cacheReadCostUsd: Math.round(cacheReadCost * 10000) / 10000,
      cacheWriteCostUsd: Math.round(cacheWriteCost * 10000) / 10000,
      outputCostUsd: Math.round(outputCost * 10000) / 10000,
    },
  };
}

function attachUsageCost(usage = {}, pricingConfig = {}) {
  if (!usage || usage.provider !== "cursor-sdk") return usage;
  if (toSafeNumber(usage.costUsd) > 0 && usage.costPricingModel) {
    return usage;
  }
  const cost = estimateUsageCost(usage, pricingConfig);
  if (!cost) return usage;
  return { ...usage, ...cost };
}

function formatUsd(amount) {
  const value = toSafeNumber(amount);
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function formatCny(amount) {
  const value = toSafeNumber(amount);
  if (value >= 1) return `¥${value.toFixed(2)}`;
  return `¥${value.toFixed(2)}`;
}

module.exports = {
  DEFAULT_MODEL_PRICING,
  attachUsageCost,
  estimateUsageCost,
  formatCny,
  formatUsd,
  resolveModelPricing,
};
