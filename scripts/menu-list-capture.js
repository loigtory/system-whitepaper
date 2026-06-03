const fs = require("node:fs");
const path = require("node:path");
const {
  menuApiPayloadHasMenus,
  mergeMenuMapEntries,
  parseMenuApiResponse,
  readOptionalJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

const MENU_LIST_CACHE_FILE = "menu-list-cache.json";
const MENU_API_PATH_FILE = "menu-api-path.txt";
const MENU_API_PATH_HINTS = [/getMenuList/i, /menuList/i, /menu-list/i, /\/menus\b/i];
const MENU_API_PROBE_PATHS = ["/menu", "/api/menu", "/api/getMenuList", "/api/menu/list", "/menus"];

function resolveMenuListCachePath(systemOutput) {
  return path.join(systemOutput, MENU_LIST_CACHE_FILE);
}

function resolveMenuApiPathHintFile(systemOutput) {
  return path.join(systemOutput, MENU_API_PATH_FILE);
}

function loadMenuListCacheRawText(systemOutput) {
  const cachePath = resolveMenuListCachePath(systemOutput);
  if (!fs.existsSync(cachePath)) return "";
  const cached = readOptionalJsonObject(cachePath, {});
  return String(cached?.rawText || "").trim();
}

function loadCachedMenuApiPath(systemOutput) {
  const hintFile = resolveMenuApiPathHintFile(systemOutput);
  if (fs.existsSync(hintFile)) {
    const hint = fs.readFileSync(hintFile, "utf8").trim();
    if (hint) return hint;
  }
  const cachePath = resolveMenuListCachePath(systemOutput);
  if (!fs.existsSync(cachePath)) return "";
  const cached = readOptionalJsonObject(cachePath, {});
  return String(cached?.menuApiPath || "").trim();
}

function saveMenuApiPathHint(systemOutput, menuApiPath) {
  if (!menuApiPath) return;
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(resolveMenuApiPathHintFile(systemOutput), `${menuApiPath}\n`, "utf8");
  const cachePath = resolveMenuListCachePath(systemOutput);
  const cached = fs.existsSync(cachePath) ? readOptionalJsonObject(cachePath, {}) : {};
  writeJson(cachePath, {
    ...cached,
    menuApiPath,
    menuApiPathUpdatedAt: new Date().toISOString(),
  });
}

function saveMenuListCache(systemOutput, rawText, options = {}) {
  const cachePath = resolveMenuListCachePath(systemOutput);
  writeJson(cachePath, {
    capturedAt: new Date().toISOString(),
    rawText: String(rawText || ""),
    menuCount: parseMenuApiResponse(rawText).menuCount,
    menuApiPath: options.menuApiPath || loadCachedMenuApiPath(systemOutput) || "",
  });
  return cachePath;
}

function pathnameLooksLikeMenuApi(pathname) {
  return MENU_API_PATH_HINTS.some((hint) => hint.test(String(pathname || "")));
}

async function discoverMenuApiPathFromPage(page, log = () => {}, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 25000;

  const waitForMenuResponse = async () =>
    page.waitForResponse(
      (response) => {
        if (response.request().method() !== "GET") return false;
        try {
          return pathnameLooksLikeMenuApi(new URL(response.url()).pathname);
        } catch {
          return false;
        }
      },
      { timeout: timeoutMs },
    );

  try {
    let response = await waitForMenuResponse().catch(() => null);
    if (!response) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      response = await waitForMenuResponse().catch(() => null);
    }
    if (!response) return "";

    const rawText = await response.text().catch(() => "");
    if (!menuApiPayloadHasMenus(rawText)) return "";

    const menuApiPath = new URL(response.url()).pathname;
    log("menu-api-discover", menuApiPath, "success", {
      url: response.url(),
      source: "network-sniff",
    });
    return menuApiPath;
  } catch (error) {
    log("menu-api-discover", page.url(), "failed", { reason: error.message });
    return "";
  }
}

/** 菜单 API 路径由程序发现/缓存；Excel 清单不必填写。 */
async function probeMenuApiPath(context, system, log = () => {}, options = {}) {
  const referer = options.referer || system.url;
  for (const probePath of MENU_API_PROBE_PATHS) {
    const endpoint = new URL(probePath, system.url).toString();
    try {
      const response = await context.request.get(endpoint, {
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Referer: referer,
        },
        timeout: 15000,
      });
      if (!response.ok()) continue;
      const rawText = await response.text().catch(() => "");
      if (!menuApiPayloadHasMenus(rawText)) continue;
      log("menu-api-probe", probePath, "success", {
        url: endpoint,
        menuCount: parseMenuApiResponse(rawText).menuCount,
      });
      return probePath;
    } catch (error) {
      log("menu-api-probe", probePath, "failed", { reason: error.message });
    }
  }
  return "";
}

async function resolveMenuApiPath(system, systemOutput, page, log = () => {}, options = {}) {
  if (system?.menuApiPath) {
    return system.menuApiPath;
  }

  const cached = loadCachedMenuApiPath(systemOutput);
  if (cached) {
    log("menu-api-path", cached, "reuse", { source: "cache" });
    return cached;
  }

  if (!page) return "";

  const discovered = await discoverMenuApiPathFromPage(page, log);
  if (discovered) {
    if (systemOutput) saveMenuApiPathHint(systemOutput, discovered);
    return discovered;
  }

  const context = options.context || page.context();
  const probed = await probeMenuApiPath(context, system, log, { referer: page.url() });
  if (probed && systemOutput) {
    saveMenuApiPathHint(systemOutput, probed);
  }
  return probed;
}

async function expandSidebarMenus(page) {
  for (let round = 0; round < 10; round += 1) {
    const clicked = await page.evaluate(() => {
      let count = 0;
      document
        .querySelectorAll(".ant-menu-submenu:not(.ant-menu-submenu-open) .ant-menu-submenu-title")
        .forEach((node) => {
          node.click();
          count += 1;
        });
      return count;
    });
    if (!clicked) break;
    await page.waitForTimeout(350);
  }
}

async function captureMenuListRawText(page, context, system, log = () => {}, options = {}) {
  const menuApiPath = system.menuApiPath || options.menuApiPath || "";
  if (!menuApiPath) return "";

  const endpoint = new URL(menuApiPath, system.url).toString();
  const menuPath = menuApiPath;
  const attempts = [
    {
      name: "page-request",
      run: async () => {
        const response = await page.request.get(endpoint, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Referer: page.url(),
          },
          timeout: 30000,
        });
        return response.text();
      },
    },
    {
      name: "page-fetch",
      run: async () =>
        page.evaluate(async (apiUrl) => {
          const response = await fetch(apiUrl, {
            credentials: "include",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
          });
          return response.text();
        }, endpoint),
    },
    {
      name: "page-reload-response",
      run: async () => {
        const responsePromise = page.waitForResponse(
          (res) => res.url().includes(menuPath) && res.request().method() === "GET",
          { timeout: 45000 },
        );
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        const response = await responsePromise;
        return response.text();
      },
    },
    {
      name: "context-request",
      run: async () => {
        const response = await context.request.get(endpoint, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            Referer: page.url(),
          },
          timeout: 30000,
        });
        return response.text();
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const rawText = await attempt.run();
      if (menuApiPayloadHasMenus(rawText)) {
        log("menu-list-capture", endpoint, "success", {
          transport: attempt.name,
          menuCount: parseMenuApiResponse(rawText).menuCount,
        });
        return rawText;
      }
      log("menu-list-capture", endpoint, "skipped", {
        transport: attempt.name,
        reason: "empty-or-unauthorized-payload",
        rawBytes: String(rawText || "").length,
      });
    } catch (error) {
      log("menu-list-capture", endpoint, "failed", {
        transport: attempt.name,
        reason: error.message,
      });
    }
  }

  await expandSidebarMenus(page);
  await page.waitForTimeout(800);
  for (let waitRound = 0; waitRound < 8; waitRound += 1) {
    try {
      const response = await page.waitForResponse(
        (res) => res.url().includes(menuPath) && res.request().method() === "GET",
        { timeout: 8000 },
      );
      const rawText = await response.text();
      if (menuApiPayloadHasMenus(rawText)) {
        log("menu-list-capture", endpoint, "success", {
          transport: "wait-after-expand",
          menuCount: parseMenuApiResponse(rawText).menuCount,
        });
        return rawText;
      }
    } catch {
      await page.waitForTimeout(1000);
    }
  }

  return "";
}

module.exports = {
  MENU_API_PATH_FILE,
  MENU_LIST_CACHE_FILE,
  MENU_API_PROBE_PATHS,
  captureMenuListRawText,
  discoverMenuApiPathFromPage,
  expandSidebarMenus,
  loadCachedMenuApiPath,
  loadMenuListCacheRawText,
  probeMenuApiPath,
  resolveMenuApiPath,
  resolveMenuListCachePath,
  saveMenuApiPathHint,
  saveMenuListCache,
};
