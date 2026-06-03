const path = require("node:path");
const { resolveCursorApiKey } = require("./phase3b");

function resolveProjectRoot(options = {}) {
  if (options.projectRoot) return path.resolve(String(options.projectRoot));
  return path.resolve(__dirname, "..", "..");
}

function isCursorSdkConfigured(options = {}) {
  return Boolean(
    resolveCursorApiKey({
      apiKey: options.apiKey,
      cursorApiKeyFile:
        options.cursorApiKeyFile || path.join(resolveProjectRoot(options), "secrets", "cursor-api-key.txt"),
    }),
  );
}

function resolveNarrativeProvider(options = {}) {
  const explicit = String(options.provider || "").trim();
  if (explicit) return explicit;

  const configured = String(options.config?.narrative?.defaultProvider || "auto").trim().toLowerCase();
  if (configured === "manual" || configured === "cursor-sdk" || configured === "codex") {
    return configured;
  }

  return isCursorSdkConfigured(options) ? "cursor-sdk" : "manual";
}

module.exports = {
  isCursorSdkConfigured,
  resolveNarrativeProvider,
};
