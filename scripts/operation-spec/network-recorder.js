const path = require("node:path");
const { writeJson } = require("../system-whitepaper-lib");

const STATIC_EXT =
  /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|map)(\?|$)/i;

function normalizeApiUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url || "").split("?")[0];
  }
}

function isBusinessApiUrl(url, allowedHosts = []) {
  const value = String(url || "");
  if (!value.startsWith("http")) return false;
  if (STATIC_EXT.test(value)) return false;
  if (/\/(sockjs|websocket|hot-update|__vite|hmr)/i.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (allowedHosts.length && !allowedHosts.includes(parsed.hostname)) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

function collectJsonKeyPaths(value, prefix = "", depth = 0, limit = 40) {
  const keys = [];
  if (keys.length >= limit || depth > 4) return keys;
  if (Array.isArray(value)) {
    if (value[0] && typeof value[0] === "object") {
      keys.push(...collectJsonKeyPaths(value[0], prefix, depth + 1, limit - keys.length));
    }
    return keys.slice(0, limit);
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, nested] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    keys.push(next);
    if (keys.length >= limit) break;
    if (nested && typeof nested === "object") {
      keys.push(...collectJsonKeyPaths(nested, next, depth + 1, limit - keys.length));
    }
  }
  return keys.slice(0, limit);
}

function createNetworkRecorder(options = {}) {
  const {
    systemOutput = "",
    systemCode = "",
    allowedHosts = [],
    maxEntries = 200,
  } = options;
  const entries = [];
  const seen = new Set();

  async function recordResponse(response) {
    try {
      const request = response.request();
      const resourceType = request.resourceType();
      if (!["xhr", "fetch"].includes(resourceType)) return;
      const url = response.url();
      if (!isBusinessApiUrl(url, allowedHosts)) return;
      const method = request.method();
      const normalizedUrl = normalizeApiUrl(url);
      const key = `${method} ${normalizedUrl}`;
      if (seen.has(key)) return;
      seen.add(key);

      const contentType = String(response.headers()["content-type"] || "").toLowerCase();
      let schemaKeys = [];
      if (contentType.includes("json")) {
        const text = await response.text().catch(() => "");
        if (text) {
          try {
            schemaKeys = collectJsonKeyPaths(JSON.parse(text.slice(0, 80000)));
          } catch {
            schemaKeys = [];
          }
        }
      }

      entries.push({
        method,
        url: normalizedUrl,
        schemaKeys,
        capturedAt: new Date().toISOString(),
      });
      if (entries.length > maxEntries) {
        entries.shift();
      }
    } catch {
      // ignore recorder failures
    }
  }

  function attachPage(page) {
    page.on("response", (response) => {
      void recordResponse(response);
    });
  }

  function attachContext(context) {
    context.on("page", (page) => attachPage(page));
    for (const page of context.pages()) {
      attachPage(page);
    }
  }

  function save() {
    if (!systemOutput) return "";
    const outputPath = path.join(systemOutput, "network-index.json");
    writeJson(outputPath, {
      systemCode,
      generatedAt: new Date().toISOString(),
      entries,
    });
    return outputPath;
  }

  return {
    attachContext,
    attachPage,
    entries,
    save,
  };
}

module.exports = {
  collectJsonKeyPaths,
  createNetworkRecorder,
  isBusinessApiUrl,
  normalizeApiUrl,
};
