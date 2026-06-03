#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  applyConfiguredPageZoom,
  buildChromiumContextLaunchOptions,
  completeHuntianQuickLogin,
  HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS,
  waitForApplicationReady,
  DEFAULT_HUNTIAN_AUTH_COOKIE_NAMES,
  formatCookieHeader,
  grantHuntianLocalNetworkAccess,
  isPlaceholderSecret,
  normalizeAuthPaths,
  parseArgs,
  parseCookieHeader,
  parseSystemsConfig,
  registerPageZoomInitScript,
  resolveBrowserUserAgent,
  resolveChromeUserDataDir,
  selectAuthCookiesFromList,
  menuApiPayloadHasMenus,
  parseMenuApiResponse,
} = require("./system-whitepaper-lib");
const {
  captureMenuListRawText,
  resolveMenuApiPath,
  saveMenuListCache,
} = require("./menu-list-capture");

const DEFAULT_LOGIN_TIMEOUT_MS = 180000;
const SKILL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PERSISTENT_PROFILE_DIR = path.join(SKILL_ROOT, "secrets", "playwright-huntian-profile");

function createConsoleLogger() {
  return function log(action, target, result, extra = {}) {
    const suffix = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[${action}] ${target} -> ${result}${suffix}`);
  };
}

function resolveCookieNames(auth) {
  if (Array.isArray(auth?.cookieNames) && auth.cookieNames.length) {
    return auth.cookieNames;
  }
  const names = [...DEFAULT_HUNTIAN_AUTH_COOKIE_NAMES];
  if (auth?.cookieName) {
    const cookieName = String(auth.cookieName);
    if (!names.some((name) => name.toLowerCase() === cookieName.toLowerCase())) {
      names.push(cookieName);
    }
  }
  return names;
}

function extractTokenCandidates(browserCookies, pageUrl) {
  const candidates = [];
  try {
    const url = new URL(pageUrl);
    for (const key of ["token", "access_token", "huntian_token"]) {
      const value = url.searchParams.get(key);
      if (value) {
        candidates.push({ name: "token", value });
        break;
      }
    }
  } catch {
    // ignore malformed URLs
  }

  for (const cookie of browserCookies || []) {
    if (!cookie?.name || !cookie.value) continue;
    if (/token/i.test(cookie.name)) {
      candidates.push({
        name: cookie.name.toLowerCase() === "token" ? "token" : cookie.name,
        value: cookie.value,
      });
    }
  }

  return candidates;
}

function mergeAuthCookies(selectedCookies, tokenCandidates) {
  const merged = [...selectedCookies];
  const hasToken = merged.some((cookie) => cookie.name.toLowerCase() === "token");
  if (!hasToken) {
    const token = tokenCandidates.find((cookie) => cookie.name.toLowerCase() === "token");
    if (token) merged.push(token);
  }
  return merged;
}

function resolveSystem(config, systemCode) {
  if (systemCode) {
    const system = config.systems.find((item) => item.code === systemCode);
    if (!system) {
      throw new Error(`System not found in config: ${systemCode}`);
    }
    return system;
  }
  if (!config.systems?.length) {
    throw new Error("No systems defined in config");
  }
  return config.systems[0];
}

function writeSecretFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${value.trim()}\n`, "utf8");
}

function resolvePersistentProfileDir(config, options = {}) {
  const chromeUserData = resolveChromeUserDataDir(config, options);
  if (chromeUserData) return chromeUserData;
  if (!options.persistentProfile) return "";
  const raw = options.persistentProfileDir || config?.runtime?.persistentProfileDir || "";
  if (raw) return path.resolve(String(raw));
  return DEFAULT_PERSISTENT_PROFILE_DIR;
}

async function createRefreshBrowserSession(chromium, config, options = {}) {
  const log = options.log || (() => {});
  const { launchOptions, installedBrowser, headless } = buildChromiumContextLaunchOptions(
    config,
    options,
  );
  const profileDir = resolvePersistentProfileDir(config, options);
  const userAgent = resolveBrowserUserAgent(config);

  if (profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });
    const contextOptions = {
      ...launchOptions,
      userAgent,
    };
    const context = await chromium.launchPersistentContext(profileDir, contextOptions);
    await grantHuntianLocalNetworkAccess(context, log);
    await registerPageZoomInitScript(context, config);
    return {
      browser: null,
      context,
      installedBrowser,
      persistentProfileDir: profileDir,
      userAgent,
    };
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ userAgent });
  await grantHuntianLocalNetworkAccess(context, log);
  await registerPageZoomInitScript(context, config);
  return {
    browser,
    context,
    installedBrowser,
    persistentProfileDir: "",
    userAgent,
  };
}

async function closeRefreshBrowserSession(session) {
  if (session?.context) await session.context.close();
  if (session?.browser) await session.browser.close();
}

async function waitForLoggedInState(page, system, log, timeoutMs) {
  const systemHostname = new URL(system.url).hostname;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = page.url();
    if (/huntian\.hzins\.com\/login/i.test(url)) {
      await continueHuntianBrowserLogin(page, log);
      await page.waitForTimeout(1000);
      continue;
    }

    try {
      const hostname = new URL(url).hostname;
      if (hostname === systemHostname && !/\/login/i.test(url)) {
        return true;
      }
    } catch {
      // ignore malformed URLs during redirects
    }

    await page.waitForTimeout(1000);
  }

  return false;
}

async function waitForMenuApi(page, system, log, timeoutMs) {
  if (!system.menuApiPath) return true;

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  try {
    const response = await page.waitForResponse(
      (candidate) =>
        candidate.url().includes(system.menuApiPath) &&
        candidate.request().method() === "GET",
      { timeout: timeoutMs },
    );
    const ok = response.ok();
    log("menu-api", endpoint, ok ? "success" : "blocked", {
      status: response.status(),
    });
    return ok;
  } catch (error) {
    log("menu-api", endpoint, "timeout", { reason: error.message });
    return false;
  }
}

async function collectBrowserAuthCookies(context, auth) {
  const cookieDomain = auth.cookieDomain || ".hzins.com";
  const domainSuffix = cookieDomain.replace(/^\./, "");
  const allCookies = await context.cookies();
  return allCookies.filter((cookie) => {
    const domain = String(cookie.domain || "");
    return domain === domainSuffix || domain.endsWith(`.${domainSuffix}`);
  });
}

/**
 * Launch browser, complete Huntian login, and persist auth cookies.
 */
async function refreshHuntianCookie(options = {}) {
  const {
    config,
    system,
    log = createConsoleLogger(),
    headless,
    timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
    cookieNames = resolveCookieNames(config.auth),
    persistentProfile = false,
    persistentProfileDir,
    chromeUserDataDir,
    systemOutput = "",
    skipBrowserIfValid = false,
    forceRefresh = false,
    sessionOnly = false,
  } = options;

  const effectiveTimeoutMs = sessionOnly
    ? Math.min(timeoutMs, HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS)
    : timeoutMs;
  const effectivePersistentProfile = sessionOnly
    ? persistentProfile || config.runtime?.persistentProfile !== false
    : persistentProfile;
  const effectiveSystemOutput = sessionOnly ? "" : systemOutput;
  const loginDeadline = Date.now() + effectiveTimeoutMs;
  const remainingLoginMs = () => Math.max(1500, loginDeadline - Date.now());

  if (!config?.auth?.cookieHeaderFile) {
    return {
      success: false,
      error: "auth.cookieHeaderFile is not configured",
    };
  }

  if (skipBrowserIfValid && !forceRefresh) {
    const quick = await verifyExistingHuntianSession(config, log);
    if (quick.valid) {
      return {
        success: true,
        quick: true,
        cookieHeader: quick.cookieHeader,
        cookieNames: resolveCookieNames(config.auth),
        headless: true,
        persistentProfile: false,
      };
    }
    log("quick-session", "huntian", "fallback-browser", { reason: quick.reason });
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    return {
      success: false,
      error: "Playwright is not installed. Run `npm install playwright` in the skill directory.",
    };
  }

  const resolvedHeadless =
    headless !== undefined ? headless : config.runtime?.headless !== false;
  const profileDir = resolvePersistentProfileDir(config, {
    persistentProfile: effectivePersistentProfile,
    persistentProfileDir,
    chromeUserDataDir,
  });
  log("browser-mode", profileDir || "ephemeral-context", "start", {
    headless: resolvedHeadless,
    persistentProfile: effectivePersistentProfile,
    sessionOnly,
    chromeUserDataDir: Boolean(resolveChromeUserDataDir(config, { chromeUserDataDir })),
    userAgent: resolveBrowserUserAgent(config),
    browserChannel: config.runtime?.browserChannel || "",
  });

  let session;
  try {
    session = await createRefreshBrowserSession(chromium, config, {
      headless: resolvedHeadless,
      persistentProfile: effectivePersistentProfile,
      persistentProfileDir,
      chromeUserDataDir,
      log,
    });
  } catch (error) {
    return {
      success: false,
      error: `Browser launch failed: ${error.message}`,
    };
  }

  log(
    "browser-executable",
    session.installedBrowser || "playwright-managed-chromium",
    "success",
  );

  try {
    const { context } = session;
    const page = context.pages()[0] || (await context.newPage());

    log("navigate", system.url, "start", { sessionOnly, waitUntil: sessionOnly ? "commit" : "domcontentloaded" });
    await page.goto(system.url, {
      waitUntil: sessionOnly ? "commit" : "domcontentloaded",
      timeout: sessionOnly ? Math.min(10000, remainingLoginMs()) : 60000,
    });
    const appHost = new URL(system.url).hostname;
    const loggedIn = await completeHuntianQuickLogin(page, log, {
      timeoutMs: remainingLoginMs(),
      appHost,
      fastMode: sessionOnly,
    });
    if (!loggedIn) {
      await waitForApplicationReady(page, system, log, remainingLoginMs(), {
        fastMode: sessionOnly,
      });
    }
    const sessionOk =
      loggedIn ||
      (page.url().includes(appHost) && !/huntian\.hzins\.com\/login/i.test(page.url()));
    if (!sessionOk) {
      return {
        success: false,
        error:
          "Timed out waiting to enter the target system. On the Huntian quick-login page click a.wwLogin_quick_open_wecom once; do not navigate to the app URL manually.",
        headless: resolvedHeadless,
        persistentProfile,
        finalUrl: page.url(),
      };
    }

    if (!sessionOnly) {
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await applyConfiguredPageZoom(page, config);
      await page.waitForTimeout(2000);
    }
    if (effectiveSystemOutput) {
      const resolvedMenuApiPath = await resolveMenuApiPath(system, effectiveSystemOutput, page, log);
      if (resolvedMenuApiPath) {
        system.menuApiPath = resolvedMenuApiPath;
      }
      const menuRawText = await captureMenuListRawText(page, context, system, log);
      if (menuApiPayloadHasMenus(menuRawText)) {
        const cachePath = saveMenuListCache(effectiveSystemOutput, menuRawText, {
          menuApiPath: system.menuApiPath || resolvedMenuApiPath,
        });
        log("write-menu-cache", cachePath, "success", {
          menuCount: parseMenuApiResponse(menuRawText).menuCount,
        });
      } else {
        log("write-menu-cache", effectiveSystemOutput, "skipped", {
          reason: "menu-list-not-captured-in-browser-session",
        });
      }
    }
    if (!sessionOnly) {
      await waitForMenuApi(page, system, log, Math.min(effectiveTimeoutMs, 30000)).catch(() => false);
    }

    const browserCookies = await collectBrowserAuthCookies(context, config.auth);
    const tokenCandidates = extractTokenCandidates(browserCookies, page.url());
    let authCookies = mergeAuthCookies(
      selectAuthCookiesFromList(browserCookies, cookieNames),
      tokenCandidates,
    );
    if (!authCookies.length) {
      return {
        success: false,
        error: `No auth cookies found (${cookieNames.join(", ")}) for ${config.auth.cookieDomain || ".hzins.com"}`,
        finalUrl: page.url(),
      };
    }

    const cookieHeader = formatCookieHeader(authCookies);
    writeSecretFile(config.auth.cookieHeaderFile, cookieHeader);

    const tokenCookie = authCookies.find((cookie) => cookie.name.toLowerCase() === "token");
    if (tokenCookie?.value && config.auth.tokenFile) {
      writeSecretFile(config.auth.tokenFile, tokenCookie.value);
      log("write-token-file", config.auth.tokenFile, "success");
    }

    log("write-cookie-header", config.auth.cookieHeaderFile, "success", {
      cookieNames: authCookies.map((cookie) => cookie.name),
    });

    return {
      success: true,
      cookieHeader,
      cookieNames: authCookies.map((cookie) => cookie.name),
      headless: resolvedHeadless,
      persistentProfile,
      finalUrl: page.url(),
    };
  } finally {
    await closeRefreshBrowserSession(session);
  }
}

function shouldAutoRefreshCookie(cookieHeader, forceRefresh) {
  if (process.env.REFRESH_COOKIE === "skip") return false;
  if (forceRefresh) return true;
  return isPlaceholderSecret(cookieHeader);
}

function readSecretTrimmed(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8").trim();
}

function resolveTokenForVerify(config) {
  const tokenFromFile = readSecretTrimmed(config.auth?.tokenFile);
  if (tokenFromFile && !isPlaceholderSecret(tokenFromFile)) return tokenFromFile;
  const cookieHeader = readSecretTrimmed(config.auth?.cookieHeaderFile);
  if (!cookieHeader || isPlaceholderSecret(cookieHeader)) return "";
  const cookies = parseCookieHeader(cookieHeader);
  const tokenCookie = cookies.find((cookie) => cookie.name?.toLowerCase() === "token");
  return tokenCookie?.value || "";
}

/**
 * HTTP 校验现有浑天会话，避免每次流水线都启动浏览器（通常数秒内完成）。
 */
async function verifyExistingHuntianSession(config, log = () => {}) {
  if (!config?.auth?.loginInfoEndpoint) {
    return { valid: false, reason: "missing-login-endpoint" };
  }
  const cookieHeader = readSecretTrimmed(config.auth.cookieHeaderFile);
  if (!cookieHeader || isPlaceholderSecret(cookieHeader)) {
    return { valid: false, reason: "missing-cookie-header" };
  }
  const token = resolveTokenForVerify(config);
  if (!token) {
    return { valid: false, reason: "missing-token" };
  }
  const endpoint = config.auth.loginInfoEndpoint.replace("${TOKEN}", encodeURIComponent(token));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Cookie: cookieHeader,
        Referer: config.auth.referer || "https://huntian.hzins.com/",
      },
      signal: controller.signal,
    });
    log("verify-login", "huntian", response.ok ? "success" : "blocked", {
      status: response.status,
      mode: "quick-http",
    });
    return {
      valid: response.ok,
      reason: response.ok ? "ok" : `http-${response.status}`,
      cookieHeader,
      token,
    };
  } catch (error) {
    log("verify-login", "huntian", "failed", {
      mode: "quick-http",
      reason: error.message,
    });
    return { valid: false, reason: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config;
  const systemCode = args.system;

  if (!configPath) {
    throw new Error(
      "Usage: node scripts/refresh-huntian-cookie.js --config config/systems.local.yaml [--system pilot] [--headed] [--persistent-profile] [--persistent-profile-dir PATH] [--chrome-user-data-dir PATH]",
    );
  }

  const configDir = path.dirname(path.resolve(configPath));
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  normalizeAuthPaths(config, configDir);
  const system = resolveSystem(config, systemCode);
  const log = createConsoleLogger();
  const persistentProfile = Boolean(args["persistent-profile"]);
  const outputDir = path.resolve(configDir, config.runtime?.outputDir || "../outputs");
  const systemOutput = path.join(outputDir, system.code);

  const result = await refreshHuntianCookie({
    config,
    system,
    log,
    headless: args.headed ? false : config.runtime?.headless !== false,
    timeoutMs: Number(args.timeout || DEFAULT_LOGIN_TIMEOUT_MS),
    persistentProfile,
    persistentProfileDir: args["persistent-profile-dir"],
    chromeUserDataDir: args["chrome-user-data-dir"],
    systemOutput,
    skipBrowserIfValid: Boolean(args["skip-browser-if-valid"]),
    forceRefresh: Boolean(args["force-refresh"]),
    sessionOnly: Boolean(args["session-only"]),
  });

  if (!result.success) {
    console.error(result.error);
    if (result.finalUrl) {
      console.error(`Final URL: ${result.finalUrl}`);
    }
    process.exitCode = 2;
    return;
  }

  console.log(
    `Huntian cookie refreshed: ${result.cookieNames.join(", ")} -> ${config.auth.cookieHeaderFile}`,
  );
  if (result.quick) {
    console.log("Huntian session still valid (quick HTTP verify, browser skipped).");
  } else if (result.headless !== undefined) {
    console.log(`Mode: headless=${result.headless}, persistentProfile=${Boolean(result.persistentProfile)}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  refreshHuntianCookie,
  verifyExistingHuntianSession,
  shouldAutoRefreshCookie,
  waitForLoggedInState,
  collectBrowserAuthCookies,
  extractTokenCandidates,
  mergeAuthCookies,
  createRefreshBrowserSession,
  closeRefreshBrowserSession,
  resolvePersistentProfileDir,
  DEFAULT_PERSISTENT_PROFILE_DIR,
};
