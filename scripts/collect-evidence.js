#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  applyConfiguredPageZoom,
  buildAuthCookies,
  buildChromiumLaunchArgs,
  buildCookiesFromHeader,
  buildQualityReport,
  computeEvidenceMetrics,
  completeHuntianQuickLogin,
  continueHuntianBrowserLogin,
  isHuntianLoginUrl,
  waitForApplicationReady,
  clearPageStructuredEvidence,
  createInitialEvidence,
  findMenuPageEvidence,
  isCollectibleMenu,
  isEnvironmentSwitcherMenu,
  isWelcomeMisCapture,
  listWelcomeRedirectRetries,
  markVisitedMenus,
  menuHasCollectedScreenshot,
  menuMatchesPage,
  menuPageHasContainerEvidence,
  pruneResolvedFailedPages,
  selectMenusForEvidenceRefresh,
  normalizeAuthPaths,
  normalizePageUrl,
  readOptionalJsonObject,
  registerPageZoomInitScript,
  resolveCollectProfileOptions,
  resolveEvidenceScrollOptions,
  selectMenusForCollection,
  extractMenuItems,
  findInstalledBrowser,
  isSafeInspectionClick,
  isSafeExplorationClick,
  mergeContainerSnapshotIntoEvidence,
  mergeFrameSnapshots,
  mergeMenuMapEntries,
  mergePageSnapshotIntoEvidence,
  menuApiPayloadHasMenus,
  normalizeUrl,
  parseArgs,
  parseMenuApiResponse,
  parseSystemsConfig,
  safeScreenshotName,
  selectFieldLabel,
  shouldVisitUrl,
  validateExpectedHostResolution,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  createRefreshBrowserSession,
  closeRefreshBrowserSession,
  refreshHuntianCookie,
  shouldAutoRefreshCookie,
} = require("./refresh-huntian-cookie");
const { loadMenuListCacheRawText, resolveMenuApiPath } = require("./menu-list-capture");
const { buildQualitySourceArtifacts } = require("./check-quality");

function shouldUsePersistentProfile(config, args = {}) {
  if (args["persistent-profile"] === false) return false;
  if (args["persistent-profile"] === true) return true;
  return config.runtime?.persistentProfile === true;
}

function resolveBrowserHeadless(config, args = {}) {
  if (args.headed) return false;
  return config.runtime?.headless !== false;
}

let activeCollectOptions = null;

function getCollectOptions() {
  return activeCollectOptions;
}

function readJsonObjectStrict(filePath, label, recoveryHint) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `${label} is malformed: ${filePath}. ${recoveryHint} ${error.message}`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${label} must be a JSON object: ${filePath}. ${recoveryHint}`,
    );
  }
  return value;
}

function readExistingEvidence(evidencePath) {
  return readJsonObjectStrict(
    evidencePath,
    "Existing evidence.json",
    "Remove it or run without --resume/--inspect-only/--evidence-only to start fresh.",
  );
}

function loadEvidenceForCollection({ evidencePath, reuseExisting, system }) {
  if (reuseExisting && fs.existsSync(evidencePath)) {
    return readExistingEvidence(evidencePath);
  }
  return createInitialEvidence(system);
}

function readExistingTestDataLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Existing test-data-ledger.json is malformed: ${ledgerPath}. Repair or remove it before write validation. ${error.message}`,
    );
  }
  if (!Array.isArray(ledger)) {
    throw new Error(
      `Existing test-data-ledger.json must be a JSON array: ${ledgerPath}. Repair or remove it before write validation.`,
    );
  }
  return ledger;
}

function loadWriteValidationInputs({ evidencePath, ledgerPath }) {
  if (!fs.existsSync(evidencePath)) {
    return { error: `Evidence not found: ${evidencePath}` };
  }
  try {
    return {
      evidence: readJsonObjectStrict(
        evidencePath,
        "Evidence evidence.json",
        "Repair it or rerun evidence collection before write validation.",
      ),
      ledger: readExistingTestDataLedger(ledgerPath),
    };
  } catch (error) {
    return { error: error.message };
  }
}

function resolveRefreshOptions(config, args = {}) {
  return {
    headless: resolveBrowserHeadless(config, args),
    persistentProfile: shouldUsePersistentProfile(config, args),
    persistentProfileDir: args["persistent-profile-dir"],
    chromeUserDataDir: args["chrome-user-data-dir"],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config;
  const configDir = path.dirname(path.resolve(configPath || "."));
  const systemCode = args.system;
  const inspectOnly = Boolean(args["inspect-only"]);
  const evidenceOnly = Boolean(args["evidence-only"]);
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  normalizeAuthPaths(config, configDir);
  const system = config.systems.find((item) => item.code === systemCode);
  if (!system) {
    throw new Error(`System not found in config: ${systemCode}`);
  }
  const profile = resolveCollectProfileOptions(config, system, {
    fastCollect: args["fast-collect"],
  });
  const maxPages = Number(
    args["max-pages"] || profile.maxPages || (inspectOnly ? 50 : evidenceOnly ? 30 : 10),
  );
  const resume = Boolean(args.resume);

  if (!configPath || !systemCode) {
    throw new Error(
      "Usage: node scripts/collect-evidence.js --config examples/systems.example.yaml --system contract [--output outputs] [--resume] [--inspect-only] [--evidence-only] [--refresh-cookie] [--headed] [--persistent-profile-dir PATH] [--max-pages 120]",
    );
  }

  const outputDir = path.resolve(
    configDir,
    args.output || config.runtime.outputDir || "outputs",
  );

  const systemOutput = path.join(outputDir, system.code);
  fs.mkdirSync(path.join(systemOutput, "screenshots"), { recursive: true });

  const evidencePath = path.join(systemOutput, "evidence.json");
  const ledgerPath = path.join(systemOutput, "test-data-ledger.json");
  const evidence = loadEvidenceForCollection({
    evidencePath,
    reuseExisting: resume || inspectOnly || evidenceOnly,
    system,
  });
  const logPath = path.join(systemOutput, "operation-log.jsonl");
  const log = createJsonlLogger(logPath, resume || inspectOnly || evidenceOnly);

  writeJson(evidencePath, evidence);
  if (!resume || !fs.existsSync(ledgerPath)) {
    writeJson(ledgerPath, []);
  }

  log("initialize-evidence", system.url, "success");

  const environmentCheck = await validateExpectedHostResolution(system);
  writeJson(path.join(systemOutput, "environment-check.json"), {
    ...environmentCheck,
    checkedAt: new Date().toISOString(),
    systemUrl: system.url,
  });
  log(
    "environment-check",
    environmentCheck.hostname || system.url,
    environmentCheck.allowed ? "success" : "blocked",
    {
      resolvedIps: environmentCheck.resolvedIps,
      allowedIps: environmentCheck.allowedIps,
      reason: environmentCheck.reason,
    },
  );

  if (!environmentCheck.allowed) {
    evidence.blockedItems = [
      {
        severity: "P0",
        reason: `环境门禁未通过：${environmentCheck.reason}`,
        suggestedAction: "确认 SwitchHosts 已切到测试环境，并检查 expectedHost.allowedIps 配置",
        resolved: false,
      },
    ];
    writeJson(path.join(systemOutput, "evidence.json"), evidence);
    console.error(`Environment check failed: ${environmentCheck.reason}`);
    process.exitCode = 2;
    return;
  }

  if (args["init-only"]) {
    console.log(`Initial evidence package written: ${systemOutput}`);
    return;
  }

  const cookieHeader = readOptionalFile(config.auth?.cookieHeaderFile);
  if (
    shouldAutoRefreshCookie(cookieHeader, Boolean(args["refresh-cookie"])) &&
    config.auth?.cookieHeaderFile
  ) {
    const refreshLog = createJsonlLogger(logPath, resume || inspectOnly);
    refreshLog("refresh-cookie", config.auth.cookieHeaderFile, "start", {
      reason: args["refresh-cookie"] ? "forced" : "missing-or-placeholder",
    });
    const refreshResult = await refreshHuntianCookie({
      config,
      system,
      log: refreshLog,
      systemOutput,
      ...resolveRefreshOptions(config, args),
    });
    refreshLog(
      "refresh-cookie",
      config.auth.cookieHeaderFile,
      refreshResult.success ? "success" : "failed",
      refreshResult.success
        ? { cookieNames: refreshResult.cookieNames }
        : { reason: refreshResult.error },
    );
    if (!refreshResult.success) {
      console.error(`Cookie refresh failed: ${refreshResult.error}`);
      process.exitCode = 2;
      return;
    }
    console.log(
      `Huntian cookie refreshed (${refreshResult.cookieNames.join(", ")}) before collection.`,
    );
  }

  const result = await collectBrowserEvidence({
    args,
    config,
    evidence,
    evidenceOnly,
    inspectOnly,
    log,
    maxPages,
    resume,
    system,
    systemOutput,
  });

  const prunedFailed = pruneResolvedFailedPages(result.evidence);
  if (prunedFailed.removed > 0) {
    log("prune-failed-pages", system.url, "success", prunedFailed);
  }

  markVisitedMenus(result.evidence);
  const metrics = computeEvidenceMetrics(result.evidence);
  const qualityReport = buildQualityReport({
    ...metrics,
    blockedItems: result.evidence.blockedItems || [],
  });
  writeJson(evidencePath, result.evidence);
  writeJson(path.join(systemOutput, "quality-report.json"), {
    ...qualityReport,
    counts: metrics.counts,
    sourceArtifacts: buildQualitySourceArtifacts({
      evidencePath,
      operationGuideGatePath: path.join(systemOutput, "operation-guide-gate.json"),
    }),
  });
  console.log(`Evidence package written: ${systemOutput}`);
  console.log(
    `Quality preview: menus ${metrics.counts.visitedMenus}/${metrics.counts.coreMenus}, pages ${metrics.counts.pages}, canFinalize=${qualityReport.canFinalize}`,
  );

  if (result.blocked) {
    console.error(result.message);
    process.exitCode = 2;
  }
}

function normalizeConfigPaths(config, configDir) {
  if (config.auth && config.auth.tokenFile && !path.isAbsolute(config.auth.tokenFile)) {
    config.auth.tokenFile = path.resolve(configDir, config.auth.tokenFile);
  }
  if (
    config.auth &&
    config.auth.cookieHeaderFile &&
    !path.isAbsolute(config.auth.cookieHeaderFile)
  ) {
    config.auth.cookieHeaderFile = path.resolve(configDir, config.auth.cookieHeaderFile);
  }
}

function normalizeConfigPaths(config, configDir) {
  normalizeAuthPaths(config, configDir);
}

async function collectBrowserEvidence({
  args = {},
  config,
  evidence,
  evidenceOnly = false,
  inspectOnly = false,
  log,
  maxPages,
  resume,
  system,
  systemOutput,
}) {
  let authRefreshAttempted = false;

  while (true) {
    const sessionResult = await collectBrowserEvidenceOnce({
      args,
      authRefreshAttempted,
      config,
      evidence,
      evidenceOnly,
      inspectOnly,
      log,
      maxPages,
      resume,
      system,
      systemOutput,
    });

    if (
      !sessionResult.needsAuthRefresh ||
      authRefreshAttempted ||
      process.env.REFRESH_COOKIE === "skip" ||
      !config.auth?.cookieHeaderFile
    ) {
      return sessionResult;
    }

    authRefreshAttempted = true;
    log("refresh-cookie", config.auth.cookieHeaderFile, "start", {
      reason: sessionResult.refreshReason || "session-invalid",
    });
    const refreshResult = await refreshHuntianCookie({
      config,
      system,
      log,
      systemOutput,
      ...resolveRefreshOptions(config, args),
    });
    log(
      "refresh-cookie",
      config.auth.cookieHeaderFile,
      refreshResult.success ? "success" : "failed",
      refreshResult.success
        ? { cookieNames: refreshResult.cookieNames }
        : { reason: refreshResult.error },
    );
    if (!refreshResult.success) {
      return {
        blocked: true,
        evidence,
        message: refreshResult.error || "Cookie refresh failed after session validation.",
      };
    }
  }
}

async function collectBrowserEvidenceOnce({
  args = {},
  authRefreshAttempted,
  config,
  evidence,
  evidenceOnly = false,
  inspectOnly = false,
  log,
  maxPages,
  resume,
  system,
  systemOutput,
}) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    evidence.blockedItems = [
      {
        severity: "P0",
        reason: "未安装 Playwright，无法执行浏览器探索",
        suggestedAction: "在 Skill 目录安装 playwright 后重试：npm install playwright",
        resolved: false,
      },
    ];
    log("load-playwright", "playwright", "blocked", {
      reason: "dependency-not-installed",
    });
    return {
      blocked: true,
      evidence,
      message: "Playwright is not installed. Run `npm install playwright` in the skill directory.",
    };
  }

  const installedBrowser = findInstalledBrowser();
  const headless = resolveBrowserHeadless(config, args);
  const launchOptions = {
    headless,
    args: buildChromiumLaunchArgs(config),
  };
  if (installedBrowser) {
    launchOptions.executablePath = installedBrowser;
    log("browser-executable", installedBrowser, "success", {
      source: "system-browser",
    });
  } else {
    log("browser-executable", "playwright-managed-chromium", "fallback");
  }

  const usePersistentProfile = shouldUsePersistentProfile(config, args);
  let browser;
  let browserSession;
  try {
    if (usePersistentProfile) {
      browserSession = await createRefreshBrowserSession(chromium, config, {
        headless,
        persistentProfile: true,
        persistentProfileDir: args["persistent-profile-dir"],
        chromeUserDataDir: args["chrome-user-data-dir"],
      });
      browser = browserSession.browser;
      log("browser-mode", browserSession.persistentProfileDir || "persistent", "success", {
        persistentProfile: true,
      });
    } else {
      browser = await chromium.launch(launchOptions);
    }
  } catch (error) {
    evidence.blockedItems = [
      {
        severity: "P0",
        reason: `无法启动浏览器：${error.message}`,
        suggestedAction:
          "安装本机 Chrome/Edge，或运行 npx playwright install chromium 后重试",
        resolved: false,
      },
    ];
    return {
      blocked: true,
      evidence,
      message: `Browser launch failed: ${error.message}`,
    };
  }

  let needsAuthRefresh = false;
  let refreshReason = "";

  activeCollectOptions = resolveCollectProfileOptions(config, system, {
    fastCollect: args["fast-collect"],
  });
  log("collect-profile", system.code, "start", {
    profile: activeCollectOptions.profileName,
    maxPages,
    skipSeparateInspect: activeCollectOptions.skipSeparateInspect,
    fastNavigation: activeCollectOptions.fastNavigation,
  });

  let networkRecorder = null;

  try {
    const context = browserSession
      ? browserSession.context
      : await browser.newContext({
          userAgent:
            config.auth.userAgent || "Mozilla/5.0 AI-Data-Loop-Platform/1.0",
          extraHTTPHeaders: buildExtraHeaders(config.auth),
        });

    const { createNetworkRecorder } = require("./operation-spec/network-recorder");
    networkRecorder = createNetworkRecorder({
      systemOutput,
      systemCode: system.code,
      allowedHosts: [new URL(system.url).hostname],
    });
    networkRecorder.attachContext(context);

    await registerPageZoomInitScript(context, config);

    const token = readToken(config.auth.tokenFile);
    if (!usePersistentProfile) {
      await injectAuthCookies(context, config.auth, token, log);
    } else {
      log("inject-auth-cookie", config.auth.cookieDomain || ".hzins.com", "skipped", {
        reason: "using-persistent-profile",
      });
    }
    const huntianValid = await verifyHuntianSession(context, config.auth, log, token);
    if (!huntianValid) {
      log("verify-login", "huntian", "warning", {
        reason: "huntian-verify-failed-or-skipped",
      });
    }

    const page = context.pages()[0] || (await context.newPage());
    const appHost = new URL(system.url).hostname;
    log("preflight-session", system.url, "start");
    try {
      await page.goto(system.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page
        .waitForURL(
          (url) =>
            isHuntianLoginUrl(url) || (String(url).includes(appHost) && !isHuntianLoginUrl(url)),
          { timeout: 60000 },
        )
        .catch(() => {});
      await waitForPageStable(page);
      log("preflight-session", page.url(), "navigated", {
        onHuntianLogin: isHuntianLoginUrl(page.url()),
      });
      if (isHuntianLoginUrl(page.url())) {
        await completeHuntianQuickLogin(page, log, {
          timeoutMs: 120000,
          appHost,
        });
      }
      await waitForApplicationReady(page, system, log, 60000);
      await waitForPageStable(page);
      await expandSafeDynamicMenus(page, log);
      await applyConfiguredPageZoom(page, config);
    } catch (error) {
      log("preflight-session", system.url, "failed", { reason: error.message });
    }

    const resolvedMenuApiPath = await resolveMenuApiPath(system, systemOutput, page, log, {
      context,
    });
    if (resolvedMenuApiPath) {
      system.menuApiPath = resolvedMenuApiPath;
    }

    await waitForSidebarMenuReady(page);

    let menuApiResult = { menuCount: 0, added: 0 };
    const menuEndpoint = system.menuApiPath
      ? new URL(system.menuApiPath, system.url).toString()
      : "";
    const cachedMenuRaw = loadMenuListCacheRawText(systemOutput);
    if (cachedMenuRaw && menuApiPayloadHasMenus(cachedMenuRaw)) {
      menuApiResult = applyMenuApiResponseToEvidence(
        evidence,
        cachedMenuRaw,
        system,
        log,
        menuEndpoint,
        { phase: "file-cache", transport: "menu-list-cache" },
      );
    }
    if (!menuApiResult.menuCount) {
      menuApiResult = await collectMenuApiEvidence(context, evidence, log, system, {
        referer: page.url(),
        phase: "post-login",
      });
    }
    if (!menuApiResult.menuCount) {
      menuApiResult = await collectMenuApiEvidenceViaPageRequest(page, evidence, log, system);
    }
    if (!menuApiResult.menuCount) {
      menuApiResult = await collectMenuApiEvidenceViaPage(page, evidence, log, system);
    }
    if (!menuApiResult.menuCount) {
      menuApiResult = await collectMenuApiEvidenceFromPageNavigation(page, evidence, log, system);
    }
    if (!menuApiResult.menuCount) {
      menuApiResult = await waitForPopulatedMenuApiResponse(page, evidence, system, log);
    }
    if (!menuApiResult.menuCount) {
      await expandSidebarMenus(page);
      menuApiResult = await collectMenuApiEvidenceFromSidebarDom(
        page,
        evidence,
        log,
        system,
        systemOutput,
      );
    }
    if (!menuApiResult.menuCount) {
      const sidebarRetry = await refreshSidebarMenuMapWithRetry(page, evidence, log, system, {
        systemOutput,
      });
      if (sidebarRetry.menuCount) {
        menuApiResult = sidebarRetry;
      }
    }
    if (menuApiResult.menuCount) {
      preferApiMenusOverDom(evidence, menuApiResult.menuCount);
      await refreshSidebarMenuMap(page, evidence, log, system);
    }
    if (resume) {
      markVisitedMenus(evidence);
    }

    const menuApiValid = menuApiResult.menuCount > 0;
    const blocked = await detectSessionBlock(page);
    if (blocked && !menuApiValid) {
      needsAuthRefresh = true;
      refreshReason = "welcome-redirect-or-login-page";
    } else if (blocked && menuApiValid) {
      log("preflight-session", system.url, "warning", {
        reason: "page-looks-like-login-but-menu-api-valid",
        url: page.url(),
      });
    } else {
      log("preflight-session", system.url, menuApiValid ? "success" : "warning", {
        menuCount: menuApiResult.menuCount,
        url: page.url(),
      });
    }

    if (needsAuthRefresh && !authRefreshAttempted) {
    await closeRefreshBrowserSession(browserSession || { browser, context });
    return {
      blocked: false,
      evidence,
      message: "",
      needsAuthRefresh: true,
      refreshReason,
    };
  }

    if (needsAuthRefresh && authRefreshAttempted) {
      await closeRefreshBrowserSession(browserSession || { browser, context });
      return {
        blocked: true,
        evidence,
        message: "Session still invalid after automatic cookie refresh.",
      };
    }

    const sessionBlocked = inspectOnly
        ? await collectContainerInspectionOnly({
          config,
          evidence,
          evidencePath: path.join(systemOutput, "evidence.json"),
          log,
          maxPages,
          page,
          system,
          systemOutput,
        })
      : evidenceOnly
        ? await collectEvidenceOnlyMenus({
            config,
            evidence,
            evidencePath: path.join(systemOutput, "evidence.json"),
            log,
            maxPages,
            page,
            system,
            systemOutput,
          })
      : resume
        ? await collectUnvisitedMenusOnly({
            config,
            evidence,
            log,
            maxPages,
            page,
            system,
            systemOutput,
          })
        : await crawlPages({
          evidence,
          evidencePath: path.join(systemOutput, "evidence.json"),
          config,
          log,
          maxPages,
          page,
          startUrl: system.url,
          system,
          systemOutput,
        });

    if (networkRecorder) {
      networkRecorder.save();
    }

    await closeRefreshBrowserSession(browserSession || { browser, context });
    return {
      blocked: sessionBlocked,
      evidence,
      message: sessionBlocked ? "Session appears expired or unauthenticated." : "",
    };
  } finally {
    activeCollectOptions = null;
    if (browserSession) {
      await closeRefreshBrowserSession(browserSession).catch(() => {});
    } else if (browser) {
      await browser.close();
    }
  }
}

async function crawlPages({
  config,
  evidence,
  evidencePath,
  log,
  maxPages,
  page,
  startUrl,
  system,
  systemOutput,
}) {
  const queue = buildInitialUrlQueue(startUrl, evidence, maxPages);
  const visited = new Set();
  let sessionBlocked = false;

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    log("navigate", url, "start");
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await waitForPageStable(page);
      await continueHuntianBrowserLogin(page, log);
      await waitForPageStable(page);
      await expandSafeDynamicMenus(page, log);
      await waitForPageStable(page);
      await applyConfiguredPageZoom(page, config);
    } catch (error) {
      evidence.failedPages.push({
        path: url,
        reason: error.message,
        severity: visited.size === 1 ? "P0" : "P2",
        action: "复跑或人工确认网络/页面状态",
      });
      log("navigate", url, "failed", { reason: error.message });
      continue;
    }

    const blocked = await detectSessionBlock(page);
    sessionBlocked = sessionBlocked || blocked;

    const snapshot = await collectPageSnapshot(page, config);
    await resetPageScrollForScreenshot(page);
    const pageIndex = visited.size;
    const timestamp = timestampForFile();
    const screenshotFile = path.join(
      "screenshots",
      safeScreenshotName(
        system.name,
        snapshot.title || `页面${pageIndex}`,
        "页面截图",
        timestamp,
      ),
    ).replace(/\\/g, "/");

    await page.screenshot({
      path: path.join(systemOutput, screenshotFile),
      fullPage: true,
    });

    mergePageSnapshotIntoEvidence(evidence, {
      ...snapshot,
      id: `page-${pageIndex}`,
      menuPath: pageIndex === 1 ? "首页" : snapshot.title || snapshot.url,
      type: pageIndex === 1 ? "home" : "page",
      screenshot: {
        id: `shot-${pageIndex}`,
        file: screenshotFile,
        module: pageIndex === 1 ? "首页" : snapshot.title || "页面",
        function: pageIndex === 1 ? "系统入口" : "页面访问",
        step: "页面截图",
        caption: `${snapshot.title || snapshot.url} 页面截图。`,
        includeInWhitepaper: pageIndex === 1,
      },
    });

    await inspectSafeContainers({
      evidence,
      log,
      page,
      pageId: `page-${pageIndex}`,
      system,
      systemOutput,
      timestamp,
    });

    if (pageIndex === 1) {
      if (countCollectibleMenus(evidence) <= 1) {
        await refreshSidebarMenuMapWithRetry(page, evidence, log, system, { systemOutput });
        seedMenusFromKnownSources(evidence, system, systemOutput, log);
      }
    }
    if (pageIndex === 1 && countCollectibleMenus(evidence) > 0) {
      writeJson(evidencePath, evidence);
      await collectMenuPagesByClick({
        evidence,
        evidencePath,
        config,
        log,
        maxPages: maxPages - 1,
        page,
        system,
        systemOutput,
      });
      writeJson(evidencePath, evidence);
      break;
    }

    for (const link of snapshot.links) {
      if (!shouldVisitUrl(link.href, startUrl)) continue;
      const normalized = normalizeUrl(link.href, startUrl);
      if (!visited.has(normalized) && !queue.includes(normalized)) {
        queue.push(normalized);
      }
    }

    log("collect-page", snapshot.url, blocked ? "blocked" : "success", {
      title: snapshot.title,
      linkCount: snapshot.links.length,
      buttonCount: snapshot.buttons.length,
    });
    writeJson(evidencePath, evidence);

    if (blocked) break;
  }

  evidence.systemInfo.collectedAt = new Date().toISOString();
  evidence.blockedItems = sessionBlocked
    ? [
        {
          severity: "P0",
          reason: "页面疑似登录态失效或跳转登录页",
          suggestedAction: "替换浑天临时 token 后从证据包断点继续",
          resolved: false,
        },
      ]
    : [];

  return sessionBlocked;
}

function pruneWelcomeMisCaptureEvidence(evidence) {
  const menuPaths = new Set();
  for (const page of evidence.pageInventory || []) {
    if (page.type === "menu-page" && page.menuPath && isWelcomeMisCapture(page)) {
      menuPaths.add(page.menuPath);
    }
  }
  for (const menuPath of menuPaths) {
    removeMenuPageEvidence(evidence, menuPath);
    const menuRecord = (evidence.menuMap || []).find(
      (item) => (item.menuPath || item.title) === menuPath,
    );
    if (menuRecord) menuRecord.status = "observed";
  }
  return menuPaths.size;
}

async function collectEvidenceOnlyMenus({
  config,
  evidence,
  evidencePath,
  log,
  maxPages,
  page,
  system,
  systemOutput,
}) {
  await page.goto(system.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForPageStable(page);
  await continueHuntianBrowserLogin(page, log);
  await waitForApplicationReady(page, system, log, 60000);
  await expandSafeDynamicMenus(page, log);
  await applyConfiguredPageZoom(page, config);

  const targets = selectMenusForEvidenceRefresh(evidence.menuMap, maxPages, evidence);
  let refreshed = 0;

  for (const menu of targets) {
    const existing = findMenuPageEvidence(evidence, menu);
    if (!existing) continue;

    try {
      const openedBy = await openMenuPage(page, menu, log, config);
      if (!openedBy) {
        log("evidence-only", menu.menuPath || menu.title, "skipped", {
          reason: "menu-open-failed",
        });
        continue;
      }
      await waitForNavigationSettle(page, menu, log);
      await applyConfiguredPageZoom(page, config);
      if (isUnexpectedWelcomeLanding(menu, page.url()) || (await detectSessionBlock(page))) {
        log("evidence-only", menu.menuPath || menu.title, "skipped", {
          reason: "redirected-to-welcome-or-login",
        });
        continue;
      }

      const snapshot = await collectPageSnapshot(page, config);
      clearPageStructuredEvidence(evidence, existing.id);
      mergePageSnapshotIntoEvidence(evidence, {
        ...snapshot,
        id: existing.id,
        menuPath: menu.menuPath || menu.title,
        type: "menu-page",
      });
      writeJson(evidencePath, evidence);
      refreshed += 1;
      log("evidence-only", menu.menuPath || menu.title, "success", {
        url: page.url(),
        actions: (snapshot.buttons || []).length,
        forms: (snapshot.forms || []).length,
        tables: (snapshot.tables || []).length,
      });
    } catch (error) {
      log("evidence-only", menu.menuPath || menu.title, "failed", {
        reason: String(error.message || error).slice(0, 240),
      });
    }
  }

  log("evidence-only-summary", system.url, "success", {
    refreshed,
    pending: selectMenusForEvidenceRefresh(evidence.menuMap, 9999, evidence).length,
  });
  return false;
}

async function collectUnvisitedMenusOnly({
  config,
  evidence,
  log,
  maxPages,
  page,
  system,
  systemOutput,
}) {
  const pruned = pruneWelcomeMisCaptureEvidence(evidence);
  if (pruned) {
    log("prune-evidence", "welcome-mis-capture", "success", { removedPages: pruned });
  }

  await page.goto(system.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await waitForPageStable(page);
  await continueHuntianBrowserLogin(page, log);
  await waitForPageStable(page);
  await expandSafeDynamicMenus(page, log);
  await waitForPageStable(page);
  await applyConfiguredPageZoom(page, config);

  if (countCollectibleMenus(evidence) <= 1) {
    await refreshSidebarMenuMapWithRetry(page, evidence, log, system, { systemOutput });
    seedMenusFromKnownSources(evidence, system, systemOutput, log);
  }

  const collected = await collectMenuPagesByClick({
    evidence,
    config,
    log,
    maxPages,
    onlyUnvisited: true,
    page,
    system,
    systemOutput,
  });

  log("resume-menu-collection", system.url, "success", { collected });
  return false;
}

function findMenuForPage(evidence, menuPage) {
  const menus = evidence.menuMap || [];
  return (
    menus.find((menu) => menuMatchesPage(menu, menuPage)) || {
      title: String(menuPage.menuPath || "").split(">").pop().trim() || menuPage.title,
      menuPath: menuPage.menuPath,
      url: menuPage.url,
    }
  );
}

function containerInspectionPassCount(page) {
  if (Number(page.containerInspectionPasses) > 0) {
    return Number(page.containerInspectionPasses);
  }
  return page.containerInspectionAttempted ? 1 : 0;
}

/** 尚无 container 证据，且未超过重试上限（每页最多 3 轮 inspect）。 */
function shouldInspectMenuPageForContainers(evidence, page) {
  if (page.type !== "menu-page" || !page.screenshot || !page.menuPath) return false;
  if (isWelcomeMisCapture(page)) return false;
  if (menuPageHasContainerEvidence(evidence, page.id)) return false;
  return containerInspectionPassCount(page) < 3;
}

function listMenuPagesForContainerInspection(evidence) {
  return (evidence.pageInventory || []).filter((page) =>
    shouldInspectMenuPageForContainers(evidence, page),
  );
}

function recordContainerInspectionPass(evidence, pageId, captured) {
  const record = (evidence.pageInventory || []).find((page) => page.id === pageId);
  if (!record) return;
  const passes = containerInspectionPassCount(record) + 1;
  record.containerInspectionPasses = passes;
  if (captured > 0 || passes >= 3) {
    record.containerInspectionAttempted = true;
  } else {
    record.containerInspectionAttempted = false;
  }
}

async function getActiveContentFrame(page) {
  let bestFrame = page.mainFrame();
  let bestScore = 0;
  for (const frame of page.frames()) {
    if (!(await isFrameVisible(frame).catch(() => false))) continue;
    const score = await frame
      .locator("button,.ant-btn,[role='button']")
      .count()
      .catch(() => 0);
    if (score > bestScore) {
      bestScore = score;
      bestFrame = frame;
    }
  }
  return bestFrame;
}

async function collectContainerInspectionOnly({
  config,
  evidence,
  evidencePath,
  log,
  maxPages,
  page,
  system,
  systemOutput,
}) {
  await page.goto(system.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForPageStable(page);
  await continueHuntianBrowserLogin(page, log);
  await waitForApplicationReady(page, system, log, 60000);
  await expandSafeDynamicMenus(page, log);
  await applyConfiguredPageZoom(page, config);

  const pendingAll = listMenuPagesForContainerInspection(evidence);
  const targets = pendingAll.slice(0, maxPages);
  let inspectedPages = 0;
  let containersCaptured = 0;

  log("inspect-only-batch", system.url, "start", {
    pendingPages: pendingAll.length,
    batchSize: targets.length,
    maxPages,
  });

  for (const menuPage of targets) {
    if (await detectSessionBlock(page)) {
      log("inspect-only", menuPage.menuPath, "skipped", {
        reason: "session-expired",
      });
      continue;
    }

    const menu = findMenuForPage(evidence, menuPage);
    try {
      let openedBy = null;
      if (menuPage.url) {
        await page.goto(menuPage.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await waitForPageStable(page);
        await continueHuntianBrowserLogin(page, log);
        await applyConfiguredPageZoom(page, config);
        openedBy = "direct-url";
      }
      if (!openedBy || (await detectSessionBlock(page))) {
        openedBy = await openMenuPage(page, menu, log, config);
      }
      if (!openedBy) {
        log("inspect-only", menuPage.menuPath, "skipped", {
          reason: "menu-open-failed",
        });
        continue;
      }

      await waitForNavigationSettle(page, menu, log);
      await applyConfiguredPageZoom(page, config);
      if (isUnexpectedWelcomeLanding(menu, page.url()) || (await detectSessionBlock(page))) {
        log("inspect-only", menuPage.menuPath, "skipped", {
          reason: "redirected-to-welcome-or-login",
        });
        continue;
      }

      const captured = await inspectSafeContainers({
        evidence,
        log,
        page,
        pageId: menuPage.id,
        system,
        systemOutput,
        timestamp: timestampForFile(),
      });
      recordContainerInspectionPass(evidence, menuPage.id, captured);
      containersCaptured += captured;
      inspectedPages += 1;
      writeJson(evidencePath, evidence);
      log("inspect-only", menuPage.menuPath, captured > 0 ? "success" : "partial", {
        containersCaptured: captured,
        inspectionPasses: containerInspectionPassCount(
          (evidence.pageInventory || []).find((item) => item.id === menuPage.id) || {},
        ),
        openedBy,
      });
    } catch (error) {
      log("inspect-only", menuPage.menuPath, "failed", {
        reason: String(error.message || error).slice(0, 240),
      });
    }
  }

  const pendingAfter = listMenuPagesForContainerInspection(evidence).length;
  log("inspect-only-summary", system.url, "success", {
    inspectedPages,
    containersCaptured,
    pendingPages: pendingAfter,
    hint:
      pendingAfter > 0
        ? "仍有待探测页：未采到弹窗的页会保留在队列（每页最多重试 3 轮）；可加 --max-pages 或多次运行"
        : "全部菜单页弹窗探测已完成或已达重试上限",
  });
  return false;
}

function nextMenuPageId(evidence) {
  const numbers = (evidence.pageInventory || [])
    .map((page) => page.id)
    .filter((id) => /^menu-page-\d+$/.test(id))
    .map((id) => Number(id.replace("menu-page-", "")));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `menu-page-${next}`;
}

async function expandMenuAncestors(page, menuPath) {
  const parts = String(menuPath || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = 0; index < parts.length - 1; index += 1) {
    const label = parts[index];
    const submenuTitle = page.locator(".ant-menu-submenu-title").filter({ hasText: label }).first();
    if (await submenuTitle.count().catch(() => 0)) {
      await submenuTitle.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    const locator = page.getByText(label, { exact: true }).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    await locator.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

function isUnexpectedWelcomeLanding(menu, currentUrl) {
  const url = currentUrl || "";
  if (!menu?.url) return /\/welcome/i.test(url);
  if (/\/welcome/i.test(menu.url)) return /\/welcome/i.test(url);
  if (normalizePageUrl(menu.url) === normalizePageUrl(url)) return false;
  if (menu.url && url.includes(new URL(menu.url).pathname.replace(/\/$/, ""))) return false;
  return /\/welcome/i.test(url);
}

async function waitForNavigationSettle(page, menu, log) {
  const fast = getCollectOptions()?.fastNavigation;
  const maxAttempts = fast ? 6 : 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await continueHuntianBrowserLogin(page, log).catch(() => false);
    const currentUrl = page.url();
    if (!isUnexpectedWelcomeLanding(menu, currentUrl)) return true;
    await page.waitForTimeout(fast ? 250 : 500);
    await page
      .waitForLoadState(fast ? "domcontentloaded" : "networkidle", {
        timeout: fast ? 2500 : 4000,
      })
      .catch(() => {});
    await waitForPageStable(page);
  }
  return !isUnexpectedWelcomeLanding(menu, page.url());
}

function menuPathname(menu) {
  try {
    return new URL(menu.url).pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function clickMenuSidebarLink(page, menu, log) {
  const pathname = menuPathname(menu);
  if (!pathname) return false;

  const link = page
    .locator(`a[href="${pathname}"], a[href="${pathname}/"], a[href*="${pathname}"]`)
    .first();
  const count = await link.count().catch(() => 0);
  if (!count) return false;

  try {
    await link.scrollIntoViewIfNeeded().catch(() => {});
    await link.click({ timeout: 5000 });
    await waitForPageStable(page);
    if (await waitForNavigationSettle(page, menu, log)) {
      log("click-menu-page", menu.menuPath || menu.title, "sidebar-href", {
        pathname,
      });
      return true;
    }
  } catch (error) {
    log("click-menu-page", menu.menuPath || menu.title, "sidebar-href-failed", {
      pathname,
      reason: String(error.message || error).slice(0, 240),
    });
  }
  return false;
}

async function navigateMenuByUrl(page, menu, log) {
  if (!menu.url) return false;

  const fast = getCollectOptions()?.fastNavigation;
  await page.goto(menu.url, {
    waitUntil: fast ? "domcontentloaded" : "networkidle",
    timeout: fast ? 20000 : 45000,
  });
  await waitForPageStable(page);
  await continueHuntianBrowserLogin(page, log);
  await waitForPageStable(page);
  if (await waitForNavigationSettle(page, menu, log)) return true;

  if (await clickMenuSidebarLink(page, menu, log)) return true;

  await expandMenuAncestors(page, menu.menuPath || menu.title);
  return clickMenuSidebarLink(page, menu, log);
}

async function openMenuPage(page, menu, log, config) {
  await expandSafeDynamicMenus(page, log);
  await expandMenuAncestors(page, menu.menuPath || menu.title);

  if (await clickMenuSidebarLink(page, menu, log)) {
    await applyConfiguredPageZoom(page, config);
    return "sidebar";
  }

  const locator = page.getByText(menu.title, { exact: true }).first();
  const count = await locator.count().catch(() => 0);
  if (count) {
    try {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click({ timeout: 8000, force: true });
      await waitForPageStable(page);
      if (await waitForNavigationSettle(page, menu, log)) {
        await applyConfiguredPageZoom(page, config);
        return "click";
      }
    } catch (error) {
      log("click-menu-page", menu.menuPath || menu.title, "click-failed", {
        reason: String(error.message || error).slice(0, 240),
      });
      if (await navigateMenuByUrl(page, menu, log)) {
        await applyConfiguredPageZoom(page, config);
        return "url-fallback";
      }
      throw error;
    }
  }

  if (await navigateMenuByUrl(page, menu, log)) {
    await applyConfiguredPageZoom(page, config);
    return "url";
  }
  return null;
}

function removeMenuPageEvidence(evidence, menuPath) {
  const removedPages = (evidence.pageInventory || []).filter((page) => page.menuPath === menuPath);
  const removedIds = new Set(removedPages.map((page) => page.id));
  evidence.pageInventory = (evidence.pageInventory || []).filter(
    (page) => page.menuPath !== menuPath,
  );
  evidence.actionInventory = (evidence.actionInventory || []).filter(
    (item) => !removedIds.has(item.pageId),
  );
  evidence.formInventory = (evidence.formInventory || []).filter(
    (item) => !removedIds.has(item.pageId),
  );
  evidence.tableInventory = (evidence.tableInventory || []).filter(
    (item) => !removedIds.has(item.pageId),
  );
  evidence.screenshotIndex = (evidence.screenshotIndex || []).filter(
    (shot) => !removedPages.some((page) => page.screenshot === shot.file),
  );
}

async function collectMenuPagesByClick({
  config,
  evidence,
  evidencePath,
  log,
  maxPages,
  onlyUnvisited = false,
  page,
  system,
  systemOutput,
}) {
  await refreshSidebarMenuMapWithRetry(page, evidence, log, system, { systemOutput });
  if (countCollectibleMenus(evidence) <= 1) {
    seedMenusFromKnownSources(evidence, system, systemOutput, log);
  }
  if (evidencePath) writeJson(evidencePath, evidence);
  const retryMenuPaths = onlyUnvisited ? listWelcomeRedirectRetries(evidence) : new Set();
  const menus = selectMenusForCollection(evidence.menuMap, maxPages, {
    onlyUnvisited,
    retryMenuPaths,
    evidence,
  });
  let collected = 0;

  for (const menu of menus) {
    if (collected >= maxPages) break;

    const menuPath = menu.menuPath || menu.title;
    const isRetry = retryMenuPaths.has(menuPath);
    if (onlyUnvisited && !isRetry && menuHasCollectedScreenshot(evidence, menu)) {
      log("click-menu-page", menuPath, "skipped", {
        reason: "menu-already-screenshot",
      });
      continue;
    }

    try {
      const openedBy = await openMenuPage(page, menu, log, config);
      if (!openedBy) {
        log("click-menu-page", menu.menuPath || menu.title, "skipped", {
          reason: "menu-text-not-visible-and-no-url",
        });
        continue;
      }
      if (isRetry) {
        removeMenuPageEvidence(evidence, menuPath);
        const menuRecord = (evidence.menuMap || []).find(
          (item) => (item.menuPath || item.title) === menuPath,
        );
        if (menuRecord) menuRecord.status = "observed";
      }

      await waitForNavigationSettle(page, menu, log);
      await applyConfiguredPageZoom(page, config);
      await waitForTableReady(page);
      if (isUnexpectedWelcomeLanding(menu, page.url())) {
        evidence.failedPages.push({
          path: menuPath,
          reason: "导航后落在欢迎页，可能路由未稳定、失效或无权限",
          severity: "P1",
          action: "确认菜单 URL 或登录权限后复跑",
        });
        log("click-menu-page", menuPath, "blocked", {
          reason: "redirected-to-welcome",
          targetUrl: menu.url,
          currentUrl: page.url(),
        });
        continue;
      }

      const snapshot = await collectPageSnapshot(page, config);
      await resetPageScrollForScreenshot(page);

      const timestamp = timestampForFile();
      const pageId = nextMenuPageId(evidence);
      const screenshotFile = path
        .join(
          "screenshots",
          safeScreenshotName(
            system.name,
            snapshot.title || menu.title,
            "菜单页面",
            timestamp,
          ),
        )
        .replace(/\\/g, "/");

      await page.screenshot({
        path: path.join(systemOutput, screenshotFile),
        fullPage: !getCollectOptions()?.viewportScreenshot,
      });

      mergePageSnapshotIntoEvidence(evidence, {
        ...snapshot,
        id: pageId,
        menuPath: menu.menuPath || menu.title,
        type: "menu-page",
        screenshot: {
          id: `shot-${pageId}`,
          file: screenshotFile,
          module: String(menu.menuPath || menu.title).split(" > ")[0].trim() || menu.title,
          function: menu.title,
          step: "菜单点击后页面",
          caption: `${menu.menuPath || menu.title} 菜单页面截图。`,
          includeInWhitepaper: collected < 5,
        },
      });

      await inspectSafeContainers({
        evidence,
        log,
        page,
        pageId,
        system,
        systemOutput,
        timestamp,
      });

      const menuRecord = (evidence.menuMap || []).find(
        (item) =>
          item.title === menu.title ||
          item.menuPath === menu.menuPath ||
          normalizePageUrl(item.url) === normalizePageUrl(page.url()),
      );
      if (menuRecord) {
        menuRecord.status = "visited";
      }

      log("click-menu-page", menu.menuPath || menu.title, "success", {
        url: page.url(),
        title: snapshot.title,
        openedBy,
      });
      if (evidencePath) writeJson(evidencePath, evidence);
      collected += 1;
    } catch (error) {
      evidence.failedPages.push({
        path: menu.menuPath || menu.title,
        reason: error.message,
        severity: "P2",
        action: "后续定向复跑该菜单",
      });
      log("click-menu-page", menu.title, "failed", {
        reason: error.message,
      });
      if (evidencePath) writeJson(evidencePath, evidence);
    }
  }

  return collected;
}

function buildInitialUrlQueue(startUrl, evidence, maxPages) {
  const queue = [normalizeUrl(startUrl, startUrl)];
  for (const item of evidence.menuMap || []) {
    if (!item.url || !shouldVisitUrl(item.url, startUrl)) continue;
    const normalized = normalizeUrl(item.url, startUrl);
    if (!queue.includes(normalized)) queue.push(normalized);
    if (queue.length >= maxPages) break;
  }
  return queue;
}

function preferApiMenusOverDom(evidence, apiMenuCount) {
  if (!apiMenuCount) return;
  evidence.menuMap = (evidence.menuMap || []).filter((menu) => {
    if (isEnvironmentSwitcherMenu(menu)) return false;
    const url = String(menu.url || "").trim();
    if (url.endsWith("#") || url.endsWith("/#")) return false;
    return true;
  });
  evidence.menuMap = mergeMenuMapEntries(evidence.menuMap);
}

function applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, options = {}) {
  const { payload, menus, menuCount } = parseMenuApiResponse(rawText);
  let added = 0;
  const filteredMenus = menus.filter((menu) => !isEnvironmentSwitcherMenu(menu));
  for (const menu of filteredMenus) {
    const url = menu.path ? new URL(menu.path, system.url).toString() : "";
    const menuPath = menu.menuPath || menu.title;
    const exists = evidence.menuMap.some(
      (item) => (item.menuPath || item.path) === menuPath && item.url === url,
    );
    if (!exists) {
      evidence.menuMap.push({
        path: menuPath,
        title: menu.title,
        menuPath,
        url,
        status: url ? "observed" : "group",
        coreCoverage: Boolean(url),
        excludeReason: url ? null : "菜单分组，无直接页面 URL",
        openStrategy: url ? "url-or-text-click" : "text-click",
      });
      added += 1;
    }
  }
  if (filteredMenus.length) {
    preferApiMenusOverDom(evidence, filteredMenus.length);
  } else {
    evidence.menuMap = mergeMenuMapEntries(evidence.menuMap);
  }
  const parseMeta = {
    menuCount: filteredMenus.length,
    added,
    mergedMenus: evidence.menuMap.length,
    phase: options.phase || "default",
    transport: options.transport || "context-request",
  };
  if (!filteredMenus.length) {
    parseMeta.payloadShape = Array.isArray(payload)
      ? `array(length=${payload.length})`
      : payload && typeof payload === "object"
        ? `object(keys=${Object.keys(payload).slice(0, 8).join(",")})`
        : typeof payload;
    parseMeta.rawBytes = String(rawText || "").length;
  }
  log("menu-api-parse", endpoint, filteredMenus.length ? "success" : "warning", parseMeta);
  return { menuCount: filteredMenus.length, added };
}

async function collectMenuApiEvidence(context, evidence, log, system, options = {}) {
  if (!system.menuApiPath) return { menuCount: 0, added: 0 };

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  const referer = options.referer || system.url;
  try {
    const response = await context.request.get(endpoint, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: referer,
      },
      timeout: 30000,
    });
    log("menu-api", endpoint, response.ok() ? "success" : "blocked", {
      status: response.status(),
      phase: options.phase || "default",
    });
    if (!response.ok()) return { menuCount: 0, added: 0 };

    const rawText = await response.text().catch(() => "");
    return applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, options);
  } catch (error) {
    log("menu-api", endpoint, "failed", {
      reason: error.message,
      phase: options.phase || "default",
    });
    return { menuCount: 0, added: 0 };
  }
}

async function collectMenuApiEvidenceViaPageRequest(page, evidence, log, system) {
  if (!system.menuApiPath) return { menuCount: 0, added: 0 };

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  try {
    const response = await page.request.get(endpoint, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: page.url(),
      },
      timeout: 30000,
    });
    log("menu-api", endpoint, response.ok() ? "success" : "blocked", {
      phase: "post-login-page-request",
      transport: "page-request",
      status: response.status(),
    });
    if (!response.ok()) return { menuCount: 0, added: 0 };
    const rawText = await response.text().catch(() => "");
    return applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, {
      phase: "post-login-page-request",
      transport: "page-request",
    });
  } catch (error) {
    log("menu-api", endpoint, "failed", {
      reason: error.message,
      phase: "post-login-page-request",
    });
    return { menuCount: 0, added: 0 };
  }
}

async function collectMenuApiEvidenceFromPageNavigation(page, evidence, log, system) {
  if (!system.menuApiPath) return { menuCount: 0, added: 0 };

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  const menuPath = system.menuApiPath;
  try {
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes(menuPath) && res.request().method() === "GET",
      { timeout: 45000 },
    );
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    const response = await responsePromise;
    const rawText = await response.text();
    log("menu-api", endpoint, "success", {
      phase: "post-login-page-reload",
      transport: "page-wait-response",
      status: response.status(),
    });
    return applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, {
      phase: "post-login-page-reload",
      transport: "page-wait-response",
    });
  } catch (error) {
    log("menu-api", endpoint, "failed", {
      reason: error.message,
      phase: "post-login-page-reload",
    });
    return { menuCount: 0, added: 0 };
  }
}

async function waitForSidebarMenuReady(page, timeoutMs = 20000) {
  const selectors = [
    ".ant-menu-item",
    ".ant-menu-root",
    ".ant-layout-sider .ant-menu",
    "[class*='SideMenu']",
    "[class*='side-menu']",
    "[class*='sidebar']",
    "micro-app",
    "#micro-app",
    "[class*='Menu']",
    ".pro-menu",
    "aside nav a",
    "aside [role='menu']",
    "nav [data-menu-id]",
    ".ant-menu-inline",
  ];
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, {
        state: "visible",
        timeout: Math.min(timeoutMs, 6000),
      });
      return true;
    } catch {
      // try next selector
    }
  }
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
  return false;
}

async function dumpSidebarDomDebug(page, systemOutput) {
  const debug = { capturedAt: new Date().toISOString(), frames: [] };
  for (const frame of page.frames()) {
    const snapshot = await frame
      .evaluate(() => {
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };
        const selectors = [
          ".ant-menu-item",
          ".ant-menu-title-content",
          ".ant-layout-sider a",
          ".ant-layout-sider li",
          "[class*='SideMenu'] a",
          "[class*='side-menu'] a",
          "micro-app .ant-menu-item",
          "#micro-app .ant-menu-item",
          "[class*='Menu'] a",
          ".pro-menu a",
          "router-link",
          "[data-menu-id]",
          "aside li",
          "nav li",
        ];
        const items = [];
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((node) => {
            const title = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
            const href =
              node.getAttribute?.("href") ||
              node.querySelector?.("a[href]")?.getAttribute("href") ||
              "";
            items.push({
              selector,
              title,
              href,
              visible: isVisible(node),
              tag: node.tagName,
              className: String(node.className || "").slice(0, 120),
            });
          });
        }
        return { url: location.href, itemCount: items.length, items: items.slice(0, 200) };
      })
      .catch((error) => ({ url: frame.url(), error: error.message, itemCount: 0, items: [] }));
    debug.frames.push(snapshot);
  }
  writeJson(path.join(systemOutput, "debug-sidebar-dom.json"), debug);
}

async function expandSidebarMenus(page) {
  for (let round = 0; round < 12; round += 1) {
    const clicked = await page.evaluate(() => {
      let count = 0;
      const clickNodes = (selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          node.click();
          count += 1;
        });
      };
      clickNodes(
        ".ant-menu-submenu:not(.ant-menu-submenu-open) > .ant-menu-submenu-title",
      );
      clickNodes(".el-sub-menu:not(.is-opened) > .el-sub-menu__title");
      clickNodes("[role='treeitem'][aria-expanded='false']");
      return count;
    });
    if (!clicked) break;
    await page.waitForTimeout(350);
  }
}

async function extractNestedSidebarMenusFromPage(page) {
  const items = [];
  const seen = new Set();
  for (const frame of page.frames()) {
    const frameItems = await frame
      .evaluate(() => {
        const results = [];
        const localSeen = new Set();
        const isVisible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };
        const readTitle = (node) =>
          (node?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const readHref = (node) => {
          const link = node?.querySelector?.("a[href]") || (node?.matches?.("a[href]") ? node : null);
          return link?.getAttribute("href") || "";
        };
        const pushItem = (title, menuPath, href) => {
          if (!title || title.length > 80) return;
          if (/^(退出|登出|注销|个人中心|修改密码)$/i.test(title)) return;
          if (/^(本地|uat|生产|dev|test|staging|预发|正式).*(环境)?$/i.test(title)) return;
          if (/环境$/i.test(title) && /(本地|uat|生产|dev|test|预发|正式)/i.test(title)) return;
          const path =
            href && !href.startsWith("javascript:")
              ? href.startsWith("#") || href === "#"
                ? ""
                : href
              : "";
          const key = `${menuPath}|${path}`;
          if (localSeen.has(key)) return;
          localSeen.add(key);
          results.push({ title, menuPath, path });
        };
        const walkAntMenu = (container, prefix) => {
          if (!container) return;
          for (const child of Array.from(container.children || [])) {
            if (child.classList.contains("ant-menu-item")) {
              const title = readTitle(
                child.querySelector(".ant-menu-title-content") || child.querySelector("a") || child,
              );
              const href = readHref(child);
              if (!title || !isVisible(child)) continue;
              pushItem(title, prefix ? `${prefix} > ${title}` : title, href);
              continue;
            }
            if (child.classList.contains("ant-menu-submenu")) {
              const title = readTitle(child.querySelector(":scope > .ant-menu-submenu-title"));
              if (!title || !isVisible(child)) continue;
              const nextPrefix = prefix ? `${prefix} > ${title}` : title;
              walkAntMenu(child.querySelector(":scope > ul.ant-menu"), nextPrefix);
            }
          }
        };
        document
          .querySelectorAll(
            ".ant-menu-root, aside .ant-menu, nav .ant-menu, .pro-menu, .ant-layout-sider .ant-menu, [class*='SideMenu'] .ant-menu",
          )
          .forEach((root) => {
            if (!isVisible(root)) return;
            walkAntMenu(root, "");
          });
        document
          .querySelectorAll(
            "[class*='Menu'] a, router-link, [data-menu-id], .ant-layout-sider a[href], micro-app a[href], #micro-app a[href]",
          )
          .forEach((node) => {
          if (!isVisible(node)) return;
          const title = readTitle(node);
          const href = readHref(node) || node.getAttribute("href") || "";
          if (!title) return;
          pushItem(title, title, href);
        });
        document.querySelectorAll("aside li, nav li").forEach((node) => {
          if (!isVisible(node)) return;
          const style = window.getComputedStyle(node);
          if (style.cursor !== "pointer" && !node.querySelector("a,button")) return;
          const title = readTitle(node);
          const href = readHref(node);
          if (!title) return;
          pushItem(title, title, href);
        });
        document.querySelectorAll("body *").forEach((node) => {
          if (!isVisible(node)) return;
          const rect = node.getBoundingClientRect();
          const leftRailLimit = Math.min(320, window.innerWidth * 0.35);
          if (rect.left < 0 || rect.left > leftRailLimit || rect.width > 360) return;
          const title = readTitle(node);
          if (!title || title.length > 40) return;
          if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(title)) return;
          const childTitles = Array.from(node.children || [])
            .map((child) => readTitle(child))
            .filter((item) => item && item !== title);
          if (childTitles.length > 1) return;
          const style = window.getComputedStyle(node);
          const className = String(node.className || "");
          const role = node.getAttribute("role") || "";
          const looksLikeMenu =
            style.cursor === "pointer" ||
            /menu|side|sider|nav|item/i.test(className) ||
            /menuitem|treeitem|tab|button|link/i.test(role) ||
            Boolean(node.closest("[class*='menu'],[class*='Menu'],[class*='side'],[class*='Side'],[class*='sider'],[class*='Sider']"));
          if (!looksLikeMenu) return;
          pushItem(title, title, readHref(node));
        });
        const walkTree = (node, prefix) => {
          if (!node || !isVisible(node)) return;
          const role = node.getAttribute("role") || "";
          const label = readTitle(node);
          if (role === "treeitem" && label) {
            const href = readHref(node);
            pushItem(label, prefix ? `${prefix} > ${label}` : label, href);
          }
          for (const child of Array.from(node.children || [])) {
            if (child.getAttribute("role") === "group") {
              walkTree(child, prefix ? `${prefix} > ${label}` : label);
            } else {
              walkTree(child, prefix);
            }
          }
        };
        document.querySelectorAll("aside [role='tree'], nav [role='tree']").forEach((root) => {
          walkTree(root, "");
        });
        return results;
      })
      .catch(() => []);
    for (const item of frameItems) {
      const key = `${item.menuPath}|${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

function countCollectibleMenus(evidence) {
  const menus = evidence.menuMap || [];
  return menus.filter((item) => isCollectibleMenu(item, menus)).length;
}

async function refreshSidebarMenuMap(page, evidence, log, system) {
  await expandSidebarMenus(page);
  await page.waitForTimeout(300);
  const nested = await extractNestedSidebarMenusFromPage(page);
  if (!nested.length) return { menuCount: 0, added: 0 };
  const menus = nested.map((item) => ({
    title: item.title,
    path: item.path || "",
    menuPath: item.menuPath || item.title,
  }));
  const result = applyVisibleDomMenuCandidatesToEvidence(evidence, menus, system);
  log("menu-map-refresh", system.url, result.added ? "success" : "skipped", {
    nestedCount: nested.length,
    added: result.added,
    totalMenus: evidence.menuMap.length,
  });
  return { menuCount: nested.length, added: result.added };
}

function seedMenusFromKnownSources(evidence, system, systemOutput, log) {
  const menuPaths = new Set();
  const planPath = path.join(systemOutput, "write-validation-plan.json");
  if (fs.existsSync(planPath)) {
    try {
      const plan = readOptionalJsonObject(planPath, {});
      const scenarios = Array.isArray(plan.scenarios) ? plan.scenarios : [];
      for (const scenario of scenarios) {
        if (scenario.menuPath) menuPaths.add(String(scenario.menuPath).trim());
      }
    } catch {
      // ignore malformed plan
    }
  }
  const resultPath = path.join(systemOutput, "write-validation-result.json");
  if (fs.existsSync(resultPath)) {
    try {
      const result = readOptionalJsonObject(resultPath, {});
      const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
      for (const scenario of scenarios) {
        if (scenario.menuPath) menuPaths.add(String(scenario.menuPath).trim());
      }
    } catch {
      // ignore malformed result
    }
  }

  let added = 0;
  for (const menuPath of menuPaths) {
    if (!menuPath || isEnvironmentSwitcherMenu({ title: menuPath, menuPath })) continue;
    const exists = evidence.menuMap.some(
      (item) => (item.menuPath || item.title) === menuPath,
    );
    if (exists) continue;
    evidence.menuMap.push({
      path: menuPath,
      title: menuPath.split(" > ").pop().trim() || menuPath,
      menuPath,
      url: "",
      status: "observed",
      coreCoverage: true,
      excludeReason: null,
      openStrategy: "text-click",
    });
    added += 1;
  }
  if (added) {
    evidence.menuMap = mergeMenuMapEntries(evidence.menuMap);
    log("seed-menus", system.url, "success", {
      added,
      totalMenus: evidence.menuMap.length,
      source: "write-validation-plan",
    });
  }
  return added;
}

async function refreshSidebarMenuMapWithRetry(page, evidence, log, system, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 3);
  const delayMs = Number(options.delayMs || 2000);
  const systemOutput = options.systemOutput || "";
  let lastResult = { menuCount: 0, added: 0 };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForSidebarMenuReady(page, attempt === 1 ? 20000 : 8000);
    await expandSafeDynamicMenus(page, log);
    await expandSidebarMenus(page);
    await page.waitForTimeout(attempt === 1 ? 500 : delayMs);
    lastResult = await refreshSidebarMenuMap(page, evidence, log, system);
    if (lastResult.menuCount > 0) {
      if (attempt > 1) {
        log("menu-map-refresh", system.url, "success", {
          phase: "retry",
          attempt,
          menuCount: lastResult.menuCount,
          added: lastResult.added,
        });
      }
      return lastResult;
    }
    if (attempt < maxAttempts) {
      log("menu-map-refresh", system.url, "warning", {
        phase: "retry",
        attempt,
        reason: "sidebar-empty",
      });
    }
  }
  if (systemOutput) {
    const seeded = seedMenusFromKnownSources(evidence, system, systemOutput, log);
    if (seeded) {
      return { menuCount: seeded, added: seeded, source: "seed" };
    }
    await dumpSidebarDomDebug(page, systemOutput);
    log("menu-map-refresh", system.url, "warning", {
      phase: "sidebar-dom-empty",
      reason: "no sidebar items after retries; see debug-sidebar-dom.json",
      frameCount: page.frames().length,
      pageUrl: page.url(),
    });
  }
  return lastResult;
}

async function waitForTableReady(page, timeoutMs = 12000) {
  const headerSelectors = [
    ".ant-table-thead .ant-table-cell",
    ".ant-table-column-title",
    "table thead th",
    ".el-table__header th",
    ".ivu-table-header th",
  ];
  const deadline = Date.now() + timeoutMs;
  for (const frame of page.frames()) {
    for (const selector of headerSelectors) {
      const remaining = Math.max(500, deadline - Date.now());
      try {
        await frame.waitForSelector(selector, {
          state: "visible",
          timeout: Math.min(remaining, 4000),
        });
        await frame
          .waitForSelector(".ant-spin-spinning", { state: "hidden", timeout: 3000 })
          .catch(() => {});
        return true;
      } catch {
        // try next selector / frame
      }
    }
  }
  return false;
}

async function waitForPopulatedMenuApiResponse(page, evidence, system, log, timeoutMs = 60000) {
  if (!system.menuApiPath) return { menuCount: 0, added: 0 };

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  const menuPath = system.menuApiPath;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await page.waitForResponse(
        (res) => res.url().includes(menuPath) && res.request().method() === "GET",
        { timeout: Math.min(15000, deadline - Date.now()) },
      );
      const rawText = await response.text();
      const { menuCount } = parseMenuApiResponse(rawText);
      if (menuCount > 0) {
        log("menu-api", endpoint, "success", {
          phase: "post-login-wait-populated",
          transport: "page-wait-populated",
          status: response.status(),
        });
        return applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, {
          phase: "post-login-wait-populated",
          transport: "page-wait-populated",
        });
      }
    } catch {
      // try next window
    }
    await page.waitForTimeout(1500);
  }

  log("menu-api", endpoint, "failed", {
    phase: "post-login-wait-populated",
    reason: "no-populated-menu-response",
  });
  return { menuCount: 0, added: 0 };
}

async function collectMenuApiEvidenceFromSidebarDom(page, evidence, log, system, systemOutput = "") {
  const endpoint = new URL(system.menuApiPath || "/menu", system.url).toString();
  try {
    await waitForSidebarMenuReady(page);
    await expandSidebarMenus(page);
    await page.waitForTimeout(500);
    const nested = await extractNestedSidebarMenusFromPage(page);
    const items = nested.length
      ? nested
      : await (async () => {
          const fallback = [];
          const seen = new Set();
          for (const frame of page.frames()) {
            const frameItems = await frame.evaluate(() => {
              const results = [];
              const localSeen = new Set();
              const selectors = [
                ".ant-menu-item a[href]",
                "aside a[href]",
                "[class*='sidebar'] a[href]",
                "[class*='Menu'] a",
                ".pro-menu a",
                "router-link",
                "[data-menu-id]",
                ".ant-menu-item",
                ".ant-menu-title-content",
                "aside li",
                "nav li",
              ];
              const isVisible = (element) => {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.visibility !== "hidden" &&
                  style.display !== "none"
                );
              };
              const readTitle = (node) => (node.textContent || "").replace(/\s+/g, " ").trim();
              for (const selector of selectors) {
                document.querySelectorAll(selector).forEach((node) => {
                  const title = readTitle(node).slice(0, 80);
                  const href =
                    node.getAttribute?.("href") ||
                    node.querySelector?.("a[href]")?.getAttribute("href") ||
                    "";
                  if (!title || title.length > 80 || !isVisible(node)) return;
                  if (/^(本地|uat|生产|dev|test|staging|预发|正式).*(环境)?$/i.test(title)) return;
                  if (/环境$/i.test(title) && /(本地|uat|生产|dev|test|预发|正式)/i.test(title)) {
                    return;
                  }
                  const path =
                    href && !href.startsWith("javascript:")
                      ? href.startsWith("#") || href === "#"
                        ? ""
                        : href
                      : "";
                  const key = `${title}|${path}`;
                  if (localSeen.has(key)) return;
                  localSeen.add(key);
                  results.push({ title, path, menuPath: title });
                });
              }
              return results;
            });
            for (const item of frameItems) {
              const key = `${item.title}|${item.path}`;
              if (seen.has(key)) continue;
              seen.add(key);
              fallback.push(item);
            }
          }
          return fallback.map((item) => ({
            title: item.title,
            menuPath: item.menuPath || item.title,
            path: item.path || "",
          }));
        })();
    const menus = items.map((item) => ({
      title: item.title,
      path: item.path || "",
      menuPath: item.menuPath || item.title,
    }));
    const rawText = JSON.stringify({ data: items, source: "sidebar-dom" });
    log("menu-api", endpoint, menus.length ? "success" : "warning", {
      phase: "post-login-sidebar-dom",
      transport: "sidebar-dom",
      itemCount: menus.length,
    });
    if (!menus.length) {
      if (systemOutput) {
        await dumpSidebarDomDebug(page, systemOutput);
      }
      return { menuCount: 0, added: 0 };
    }
    const result = applyVisibleDomMenuCandidatesToEvidence(evidence, menus, system);
    log("menu-api-parse", endpoint, menus.length ? "success" : "warning", {
      menuCount: menus.length,
      added: result.added,
      mergedMenus: evidence.menuMap.length,
      phase: "post-login-sidebar-dom",
      transport: "sidebar-dom",
    });
    return result;
  } catch (error) {
    log("menu-api", endpoint, "failed", {
      reason: error.message,
      phase: "post-login-sidebar-dom",
    });
    if (systemOutput) {
      await dumpSidebarDomDebug(page, systemOutput).catch(() => {});
    }
    return { menuCount: 0, added: 0 };
  }
}

function applyVisibleDomMenuCandidatesToEvidence(evidence, menus, system) {
  let added = 0;
  const normalizedSystemName = String(system.name || "").replace(/\s+/g, "");
  for (const menu of menus) {
    if (isEnvironmentSwitcherMenu(menu)) continue;
    const pathValue = String(menu.path || "").trim();
    const url = pathValue ? (pathValue.startsWith("http") ? pathValue : new URL(pathValue, system.url).toString()) : "";
    const menuPath = menu.menuPath || menu.title;
    if (String(menu.title || "").replace(/\s+/g, "") === normalizedSystemName) continue;
    const exists = evidence.menuMap.some(
      (item) => (item.menuPath || item.path) === menuPath && (item.url || "") === url,
    );
    if (!exists) {
      evidence.menuMap.push({
        path: menuPath,
        title: menu.title,
        menuPath,
        url,
        status: "observed",
        coreCoverage: true,
        excludeReason: null,
        openStrategy: url ? "url-or-text-click" : "text-click",
      });
      added += 1;
    }
  }
  evidence.menuMap = mergeMenuMapEntries(evidence.menuMap);
  return { menuCount: menus.length, added };
}

async function collectMenuApiEvidenceViaPage(page, evidence, log, system) {
  if (!system.menuApiPath) return { menuCount: 0, added: 0 };

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  try {
    const rawText = await page.evaluate(async (apiUrl) => {
      const response = await fetch(apiUrl, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      return response.text();
    }, endpoint);
    log("menu-api", endpoint, "success", {
      phase: "post-login-page-fetch",
      transport: "page-fetch",
    });
    return applyMenuApiResponseToEvidence(evidence, rawText, system, log, endpoint, {
      phase: "post-login-page-fetch",
      transport: "page-fetch",
    });
  } catch (error) {
    log("menu-api", endpoint, "failed", {
      reason: error.message,
      phase: "post-login-page-fetch",
    });
    return { menuCount: 0, added: 0 };
  }
}

async function inspectSafeContainers({
  evidence,
  log,
  page,
  pageId,
  system,
  systemOutput,
  timestamp,
}) {
  const frame = await getActiveContentFrame(page);
  const candidates = await collectInspectionCandidates(frame);
  let inspected = 0;
  const attemptedTexts = new Set();

  const maxInspections = getCollectOptions()?.maxContainerInspections || 6;
  for (const candidate of candidates) {
    if (inspected >= maxInspections) break;
    if (!isSafeInspectionClick(candidate)) continue;
    const candidateText = String(candidate.text || "").trim();
    if (attemptedTexts.has(candidateText)) continue;
    attemptedTexts.add(candidateText);

    try {
      const beforeCount = await visibleContainerCount(frame);
      const clicked = await clickInspectionCandidate(frame, candidate);
      if (!clicked) {
        log("inspect-container", candidate.text, "skipped", {
          reason: "candidate-not-clickable",
        });
        continue;
      }
      await waitForVisibleContainer(frame, getCollectOptions()?.fastNavigation ? 2500 : 5000);
      await page.waitForTimeout(getCollectOptions()?.fastNavigation ? 200 : 400);
      await waitForPageStable(page);
      const afterCount = await visibleContainerCount(frame);

      if (afterCount <= beforeCount) {
        log("inspect-container", candidate.text, "skipped", {
          reason: "no-new-visible-container",
        });
        await closeTopContainer(page);
        continue;
      }

      const container = await collectVisibleContainerSnapshot(frame);
      if (!container) {
        log("inspect-container", candidate.text, "skipped", {
          reason: "container-not-detected",
        });
        continue;
      }

      const screenshotFile = path
        .join(
          "screenshots",
          safeScreenshotName(
            system.name,
            candidate.text,
            container.type || "容器",
            timestamp,
          ),
        )
        .replace(/\\/g, "/");
      await page.screenshot({
        path: path.join(systemOutput, screenshotFile),
        fullPage: true,
      });

      mergeContainerSnapshotIntoEvidence(evidence, {
        ...container,
        id: `${pageId}-container-${inspected + 1}`,
        sourcePageId: pageId,
        screenshot: {
          id: `shot-${pageId}-container-${inspected + 1}`,
          file: screenshotFile,
          module: container.title || candidate.text,
          function: candidate.text,
          step: container.type || "容器",
          caption: `${candidate.text} ${container.type || "弹窗/抽屉"}截图。`,
          includeInWhitepaper: true,
        },
      });

      log("inspect-container", candidate.text, "success", {
        type: container.type,
        title: container.title,
      });
      inspected += 1;
      await closeTopContainer(page);
    } catch (error) {
      log("inspect-container", candidate.text, "skipped", {
        reason: error.message,
      });
      await closeTopContainer(page).catch(() => {});
    }
  }

  return inspected;
}

function createJsonlLogger(logPath, append = false) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  let sequence = 1;
  if (append && fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).filter(Boolean);
    sequence = lines.length + 1;
  } else {
    fs.writeFileSync(logPath, "", "utf8");
  }
  return function log(action, target, result, extra = {}) {
    fs.appendFileSync(
      logPath,
      JSON.stringify({
        id: `log-${String(sequence).padStart(3, "0")}`,
        time: new Date().toISOString(),
        action,
        target,
        result,
        ...extra,
      }) + "\n",
      "utf8",
    );
    sequence += 1;
  };
}

function buildExtraHeaders(auth) {
  const headers = {};
  if (auth.referer) headers.Referer = auth.referer;
  return headers;
}

async function injectAuthCookies(context, auth, token, log) {
  const cookieHeader = readOptionalFile(auth.cookieHeaderFile);
  const cookies = cookieHeader
    ? buildCookiesFromHeader(auth, cookieHeader)
    : buildAuthCookies(auth, token);
  if (!cookies.length) {
    log("inject-auth-cookie", auth.cookieDomain || ".hzins.com", "skipped", {
      reason: "missing-cookieHeader-or-cookieName-or-token",
    });
    return;
  }

  await context.addCookies(cookies);
  log("inject-auth-cookie", auth.cookieDomain || ".hzins.com", "success", {
    cookieNames: cookies.map((cookie) => cookie.name),
  });
}

async function verifyHuntianSession(context, auth, log, token = readToken(auth.tokenFile)) {
  if (!token || !auth.loginInfoEndpoint) {
    log("verify-login", "huntian", "skipped", {
      reason: "missing-token-or-endpoint",
    });
    return true;
  }

  const endpoint = auth.loginInfoEndpoint.replace("${TOKEN}", encodeURIComponent(token));
  const response = await context.request.get(endpoint, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: auth.referer || "https://huntian.hzins.com/",
    },
    timeout: 30000,
  });
  log("verify-login", "huntian", response.ok() ? "success" : "blocked", {
    status: response.status(),
  });
  return response.ok();
}

async function verifyMenuApiSession(context, system, log, options = {}) {
  if (!system.menuApiPath) return true;

  const endpoint = new URL(system.menuApiPath, system.url).toString();
  try {
    const response = await context.request.get(endpoint, {
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: options.referer || system.url,
      },
      timeout: 30000,
    });
    const rawText = await response.text().catch(() => "");
    const valid = response.ok() && menuApiPayloadHasMenus(rawText);
    log("verify-menu-api", endpoint, valid ? "success" : "blocked", {
      status: response.status(),
      menuCount: parseMenuApiResponse(rawText).menuCount,
    });
    return valid;
  } catch (error) {
    log("verify-menu-api", endpoint, "failed", { reason: error.message });
    return false;
  }
}

function readToken(tokenFile) {
  if (!tokenFile || !fs.existsSync(tokenFile)) return "";
  const value = fs.readFileSync(tokenFile, "utf8").trim();
  if (!value || /^REPLACE_WITH_/i.test(value)) return "";
  return value;
}

function readOptionalFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!value || /^REPLACE_WITH_/i.test(value)) return "";
  return value;
}

async function waitForPageStable(page) {
  const fast = getCollectOptions()?.fastNavigation;
  if (fast) {
    await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    return;
  }
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const HORIZONTAL_TABLE_SCROLL_SELECTORS = [
  ".ant-table-body",
  ".ant-table-content",
  ".el-table__body-wrapper",
  ".ivu-table-overflowX",
  ".ivu-table-body",
].join(",");

const NESTED_VERTICAL_SCROLL_SELECTORS = [
  "main",
  ".ant-layout-content",
  ".el-main",
  "[class*='content']",
  "[class*='scroll']",
].join(",");

async function resetScrollInFrame(frame) {
  await frame
    .evaluate(
      ({ tableSelectors }) => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.querySelectorAll(tableSelectors).forEach((element) => {
          element.scrollLeft = 0;
        });
        document.querySelectorAll("[data-sw-scroll-id]").forEach((element) => {
          element.removeAttribute("data-sw-scroll-id");
          element.scrollTop = 0;
          element.scrollLeft = 0;
        });
      },
      { tableSelectors: HORIZONTAL_TABLE_SCROLL_SELECTORS },
    )
    .catch(() => {});
}

async function resetPageScrollForScreenshot(page) {
  for (const frame of page.frames()) {
    await resetScrollInFrame(frame);
  }
}

async function getVerticalScrollTops(frame, maxSteps) {
  return frame
    .evaluate(
      ({ maxSteps: limit }) => {
        const doc = document.documentElement;
        const body = document.body;
        const scrollHeight = Math.max(doc.scrollHeight, body.scrollHeight, 0);
        const clientHeight = window.innerHeight || doc.clientHeight || 0;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        if (maxScroll < 40) return [0];
        const steps = Math.min(limit, Math.max(2, Math.ceil(maxScroll / Math.max(clientHeight * 0.85, 200)) + 1));
        const positions = [];
        for (let index = 0; index < steps; index += 1) {
          const ratio = steps === 1 ? 0 : index / (steps - 1);
          positions.push(Math.round(maxScroll * ratio));
        }
        return Array.from(new Set(positions));
      },
      { maxSteps },
    )
    .catch(() => [0]);
}

async function getNestedVerticalScrollTargets(frame, nestedDepth, maxSteps) {
  return frame
    .evaluate(
      ({ nestedDepth: depthLimit, maxSteps: stepLimit, selectors }) => {
        const isScrollableY = (element) => {
          const style = window.getComputedStyle(element);
          const overflowY = style.overflowY;
          if (!/(auto|scroll|overlay)/.test(overflowY)) return false;
          return element.scrollHeight > element.clientHeight + 8;
        };
        const targets = [];
        let nextId = 0;
        const visit = (root, depth) => {
          if (depth > depthLimit || targets.length >= 6) return;
          const nodes = Array.from(root.querySelectorAll(selectors)).filter(isScrollableY);
          for (const element of nodes) {
            if (targets.length >= 6) break;
            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll < 40) continue;
            const steps = Math.min(stepLimit, Math.max(2, Math.ceil(maxScroll / Math.max(element.clientHeight * 0.85, 120)) + 1));
            const positions = [];
            for (let index = 0; index < steps; index += 1) {
              const ratio = steps === 1 ? 0 : index / (steps - 1);
              positions.push(Math.round(maxScroll * ratio));
            }
            const id = `v-${nextId}`;
            nextId += 1;
            element.setAttribute("data-sw-scroll-id", id);
            targets.push({ id, positions: Array.from(new Set(positions)) });
          }
          if (depth < depthLimit) {
            for (const element of nodes) visit(element, depth + 1);
          }
        };
        visit(document, 1);
        return targets;
      },
      {
        nestedDepth,
        maxSteps,
        selectors: NESTED_VERTICAL_SCROLL_SELECTORS,
      },
    )
    .catch(() => []);
}

async function getHorizontalScrollTargets(frame, maxHorizontalSteps) {
  return frame
    .evaluate(
      ({ maxHorizontalSteps: limit, tableSelectors }) => {
        const targets = [];
        let nextId = 0;
        document.querySelectorAll(tableSelectors).forEach((element) => {
          if (element.scrollWidth <= element.clientWidth + 4) return;
          const maxLeft = element.scrollWidth - element.clientWidth;
          const steps = Math.min(
            limit,
            Math.max(2, Math.ceil(maxLeft / Math.max(element.clientWidth * 0.75, 120)) + 1),
          );
          const positions = [];
          for (let index = 0; index < steps; index += 1) {
            const ratio = steps === 1 ? 0 : index / (steps - 1);
            positions.push(Math.round(maxLeft * ratio));
          }
          const id = String(nextId);
          nextId += 1;
          element.setAttribute("data-sw-scroll-id", `h-${id}`);
          targets.push({ id: `h-${id}`, positions: Array.from(new Set(positions)) });
        });
        return targets;
      },
      { maxHorizontalSteps, tableSelectors: HORIZONTAL_TABLE_SCROLL_SELECTORS },
    )
    .catch(() => []);
}

async function scrollFrameVertical(frame, scrollTop) {
  await frame.evaluate((top) => {
    window.scrollTo(0, top);
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  }, scrollTop);
}

async function scrollTarget(frame, targetId, values) {
  await frame.evaluate(
    ({ id, scrollTop, scrollLeft }) => {
      const element = document.querySelector(`[data-sw-scroll-id="${id}"]`);
      if (!element) return;
      if (typeof scrollTop === "number") element.scrollTop = scrollTop;
      if (typeof scrollLeft === "number") element.scrollLeft = scrollLeft;
    },
    { id: targetId, ...values },
  );
}

async function expandScrollableContentBeforeSnapshot(page, frame, options) {
  const snapshots = [];
  let stepCount = 0;
  const maxTotal = options.maxTotalSteps;

  const collect = async () => {
    if (stepCount >= maxTotal) return false;
    stepCount += 1;
    const snapshot = await collectFrameSnapshot(frame).catch(() => null);
    if (snapshot) snapshots.push(snapshot);
    return true;
  };

  const pause = async () => {
    await frame.waitForTimeout(options.stepDelayMs).catch(() => {});
  };

  await resetScrollInFrame(frame);
  await pause();
  await collect();

  const verticalTops = await getVerticalScrollTops(frame, options.maxVerticalSteps);
  for (const scrollTop of verticalTops) {
    if (stepCount >= maxTotal) break;
    if (scrollTop > 0) {
      await scrollFrameVertical(frame, scrollTop);
      await pause();
      await collect();
    }

    const horizontalTargets = await getHorizontalScrollTargets(frame, options.maxHorizontalSteps);
    for (const target of horizontalTargets) {
      for (const scrollLeft of target.positions || []) {
        if (stepCount >= maxTotal) break;
        await scrollTarget(frame, target.id, { scrollLeft });
        await pause();
        await collect();
      }
      await scrollTarget(frame, target.id, { scrollLeft: 0 });
    }
    if (stepCount >= maxTotal) break;
  }

  if (options.nestedDepth > 0 && stepCount < maxTotal) {
    await resetScrollInFrame(frame);
    await pause();
    const nestedTargets = await getNestedVerticalScrollTargets(
      frame,
      options.nestedDepth,
      Math.min(options.maxVerticalSteps, 3),
    );
    for (const target of nestedTargets) {
      for (const scrollTop of target.positions || []) {
        if (stepCount >= maxTotal) break;
        await scrollTarget(frame, target.id, { scrollTop });
        await pause();
        await collect();
      }
      await scrollTarget(frame, target.id, { scrollTop: 0 });
    }
  }

  await resetScrollInFrame(frame);
  return mergeFrameSnapshots(snapshots);
}

async function collectPageSnapshot(page, config) {
  const scrollOpts = resolveEvidenceScrollOptions(config || {}, getCollectOptions());
  const snapshots = [];
  for (const frame of page.frames()) {
    if (!(await isFrameVisible(frame).catch(() => false))) continue;
    let snapshot;
    if (scrollOpts.enabled) {
      snapshot = await expandScrollableContentBeforeSnapshot(page, frame, scrollOpts).catch(
        () => null,
      );
    } else {
      snapshot = await collectFrameSnapshot(frame).catch(() => null);
    }
    if (snapshot) snapshots.push(snapshot);
  }

  const merged = mergeFrameSnapshots(snapshots);
  return {
    ...merged,
    title: merged.title || (await page.title().catch(() => "")),
    url: page.url(),
  };
}

async function isFrameVisible(frame) {
  if (!frame.parentFrame()) return true;
  const element = await frame.frameElement();
  return element.evaluate((frameElement) => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || "1") !== 0 &&
        rect.width > 1 &&
        rect.height > 1
      );
    };
    let current = frameElement;
    while (current) {
      if (!isVisible(current)) return false;
      current = current.parentElement;
    }
    return true;
  });
}

async function collectFrameSnapshot(frame) {
  const snapshot = await frame.evaluate(() => {
    const textOf = (element) => (element.innerText || element.textContent || "").trim();
    const unique = (values) => Array.from(new Set(values.filter(Boolean)));
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || "1") !== 0 &&
        rect.width > 1 &&
        rect.height > 1
      );
    };
    const links = Array.from(document.querySelectorAll("a"))
      .map((element) => ({
        text: textOf(element).slice(0, 120),
        href: element.href || element.getAttribute("href") || "",
      }))
      .filter((item) => item.text || item.href)
      .slice(0, 300);
    const labelMetadataForField = (field) => {
      const id = field.id;
      const explicitLabel = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
        : null;
      const wrapper = field.closest(
        ".ant-form-item,.el-form-item,.ivu-form-item,.form-item,[class*='form-item'],.ant-row",
      );
      const wrapperLabelNode = wrapper
        ? wrapper.querySelector(
            ".ant-form-item-label label,.ant-form-item-label,.el-form-item__label,.ivu-form-item-label,label,[class*='form-item-label'],[class*='FormItemLabel']",
          )
        : null;
      const antSelect = field.closest(".ant-select");
      const selectPlaceholder = antSelect
        ? (antSelect.querySelector(".ant-select-selection-placeholder")?.textContent || "").trim()
        : "";
      const labelledById = field.getAttribute("aria-labelledby");
      const ariaLabelledNode = labelledById ? document.getElementById(labelledById) : null;
      const siblingLabel =
        wrapper && wrapper.previousElementSibling ? textOf(wrapper.previousElementSibling) : "";
      const titleAttr = field.getAttribute("title") || "";
      return {
        ariaLabel: field.getAttribute("aria-label") || "",
        explicitLabel: explicitLabel ? textOf(explicitLabel) : "",
        wrapperLabel: wrapperLabelNode ? textOf(wrapperLabelNode) : "",
        siblingLabel,
        placeholder: field.getAttribute("placeholder") || selectPlaceholder || titleAttr,
        name: field.getAttribute("name") || "",
        id: field.id || "",
        text: textOf(field).slice(0, 120),
        tagName: field.tagName.toLowerCase(),
        ariaLabelledText: ariaLabelledNode ? textOf(ariaLabelledNode) : "",
      };
    };
    const fieldOf = (field) => {
      const labelMetadata = labelMetadataForField(field);
      return {
        label: labelMetadata.placeholder || labelMetadata.wrapperLabel || labelMetadata.tagName,
        labelMetadata,
        required: Boolean(
          field.required ||
            field.getAttribute("aria-required") === "true" ||
            field.closest(".ant-form-item-required,.is-required"),
        ),
        type:
          field.getAttribute("type") ||
          field.getAttribute("role") ||
          field.tagName.toLowerCase(),
        blocked: false,
      };
    };
    const buttons = unique(
      Array.from(
        document.querySelectorAll(
          "button,[role='button'],.ant-btn,.el-button,.ivu-btn,[class*='button'],[class*='btn']",
        ),
      )
        .filter(isVisible)
        .map(textOf)
        .map((value) => value.slice(0, 80)),
    ).slice(0, 300);
    const forms = Array.from(document.querySelectorAll("form")).map((form, index) => ({
      pageId: "page-home",
      formName: form.getAttribute("name") || `form-${index + 1}`,
      fields: Array.from(
        form.querySelectorAll(
          "input,select,textarea,[contenteditable='true'],[role='combobox'],[role='textbox']",
        ),
      )
        .filter(isVisible)
        .map(fieldOf),
    })).filter((form) => form.fields.length);
    if (!forms.length) {
      const fields = Array.from(
        document.querySelectorAll(
          "input,select,textarea,[contenteditable='true'],[role='combobox'],[role='textbox']",
        ),
      )
        .filter(isVisible)
        .filter((field) => {
          const type = (field.getAttribute("type") || "").toLowerCase();
          return type !== "hidden";
        })
        .map(fieldOf)
        .filter((field) => field.label);
      if (fields.length) {
        forms.push({ pageId: "page-home", formName: "页面查询/录入字段", fields });
      }
    }
    const tables = Array.from(
      document.querySelectorAll("table,.ant-table,.el-table,.ivu-table,[role='table']"),
    )
      .filter(isVisible)
      .map((table, index) => {
        const textOfCell = (element) =>
          (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        const headerSelectors = [
          "thead th",
          "thead .ant-table-cell",
          ".ant-table-thead .ant-table-cell",
          ".ant-table-thead th",
          ".ant-table-column-title",
          ".el-table__header th",
          ".el-table__header .cell",
          ".ivu-table-header th",
          "[role='columnheader']",
        ];
        let columns = [];
        for (const selector of headerSelectors) {
          const candidate = unique(
            Array.from(table.querySelectorAll(selector))
              .map(textOfCell)
              .filter(Boolean),
          );
          if (candidate.length > 1 || (candidate.length === 1 && candidate[0] !== "操作")) {
            columns = candidate;
            break;
          }
        }
        if (!columns.length) {
          columns = unique(
            Array.from(table.querySelectorAll("th"))
              .map(textOfCell)
              .filter(Boolean),
          );
        }
        if (!columns.length) {
          const firstRow = table.querySelector("tr");
          if (firstRow) {
            columns = unique(
              Array.from(firstRow.querySelectorAll("th,td,.ant-table-cell"))
                .map(textOfCell)
                .filter(Boolean),
            );
          }
        }
        columns = columns.slice(0, 80);
        const rowCount = table.querySelectorAll(
          "tbody tr,.ant-table-row,.el-table__row,.ivu-table-row",
        ).length;
        return {
          tableName: table.getAttribute("aria-label") || `table-${index + 1}`,
          columns,
          rowCount,
        };
      })
      .filter((table) => table.columns.length > 1 || table.rowCount)
      .filter((table) => table.columns.join("|") !== "操作")
      .slice(0, 20);
    const landmarks = unique(
      Array.from(document.querySelectorAll("main,nav,header,aside,section,[role]")).map(
        (element) =>
          element.getAttribute("role") ||
          element.getAttribute("aria-label") ||
          element.tagName.toLowerCase(),
      ),
    ).slice(0, 30);
    return {
      title: document.title || "",
      url: location.href,
      links,
      buttons,
      forms,
      tables,
      landmarks,
    };
  });

  return {
    ...snapshot,
    forms: (snapshot.forms || [])
      .map((form) => ({
        ...form,
        fields: (form.fields || [])
          .map((field) => {
            const label = selectFieldLabel(field.labelMetadata || { placeholder: field.label });
            return {
              label,
              required: field.required,
              type: field.type,
              blocked: field.blocked,
            };
          })
          .filter((field) => field.label),
      }))
      .filter((form) => form.fields.length),
  };
}

async function collectInspectionCandidates(target) {
  return target
    .evaluate(() => {
      const textOf = (element) =>
        (element.innerText || element.textContent || "").trim().slice(0, 80);
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 1 &&
          rect.height > 1
        );
      };
      const items = Array.from(
        document.querySelectorAll(
          "button,[role='button'],.ant-btn,.el-button,a.ant-btn",
        ),
      )
        .filter(isVisible)
        .map((element) => ({
          text: textOf(element),
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
        }))
        .filter((item) => item.text);
      const priority = (text) => {
        if (/^新增|^新建|^创建/.test(text)) return 0;
        if (/查看|详情|高级查询/.test(text)) return 1;
        return 2;
      };
      return items
        .sort((left, right) => priority(left.text) - priority(right.text))
        .slice(0, 40);
    })
    .catch(() => []);
}

async function clickInspectionCandidate(target, candidate) {
  const text = String(candidate.text || "").trim();
  if (!text) return false;

  const locators = [
    target.getByRole("button", { name: text, exact: true }).first(),
    target.locator(".ant-btn,button,[role='button']").filter({ hasText: text }).first(),
    target.getByText(text, { exact: true }).first(),
  ];

  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    try {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click({ timeout: 4000, force: true });
      return true;
    } catch {
      try {
        await locator.evaluate((el) => {
          el.click();
        });
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

async function waitForVisibleContainer(target, timeoutMs = 4000) {
  const selectors = [
    ".ant-modal-root .ant-modal",
    ".ant-modal-wrap .ant-modal",
    ".ant-drawer-open .ant-drawer-content",
    "[role='dialog']",
    ".el-dialog__wrapper .el-dialog",
  ];
  for (const selector of selectors) {
    const visible = await target
      .waitForSelector(selector, { state: "visible", timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
    if (visible) return true;
  }
  return false;
}

async function visibleContainerCount(target) {
  return target
    .evaluate(() => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0.05 &&
          rect.width > 20 &&
          rect.height > 20
        );
      };
      const selectors = [
        ".ant-modal-root .ant-modal",
        ".ant-modal-wrap .ant-modal",
        ".ant-drawer-open .ant-drawer-content",
        ".ant-drawer-content-wrapper",
        "[role='dialog']",
        ".el-dialog__wrapper .el-dialog",
      ];
      const nodes = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector)),
      );
      return nodes.filter(isVisible).length;
    })
    .catch(() => 0);
}

async function collectVisibleContainerSnapshot(target) {
  return target
    .evaluate(() => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 20 &&
          rect.height > 20
        );
      };
      const containers = Array.from(
        document.querySelectorAll(
          "[role='dialog'],.modal,.ant-modal,.ant-modal-wrap,.ant-modal-root .ant-modal-wrap,.el-dialog,.drawer,.ant-drawer,.ant-drawer-open,.el-drawer,[class*='modal'],[class*='drawer']",
        ),
      ).filter(isVisible);
      const container = containers[containers.length - 1];
      if (!container) return null;

      const textOf = (element) =>
        (element.innerText || element.textContent || "").trim();
      const titleElement = container.querySelector(
        "[class*='title'],[class*='header'],h1,h2,h3,[role='heading']",
      );
      const type =
        container.getAttribute("role") === "dialog"
          ? "modal"
          : /drawer/i.test(container.className || "")
            ? "drawer"
            : "container";
      const buttons = Array.from(container.querySelectorAll("button,[role='button']"))
        .map((element) => textOf(element).slice(0, 80))
        .filter(Boolean);
      const forms = Array.from(container.querySelectorAll("form")).map(
        (form, index) => ({
          formName: form.getAttribute("name") || `container-form-${index + 1}`,
          fields: Array.from(form.querySelectorAll("input,select,textarea")).map(
            (field) => ({
              label:
                field.getAttribute("aria-label") ||
                field.getAttribute("placeholder") ||
                field.getAttribute("name") ||
                field.id ||
                field.tagName.toLowerCase(),
              required: Boolean(
                field.required || field.getAttribute("aria-required") === "true",
              ),
              type: field.getAttribute("type") || field.tagName.toLowerCase(),
              blocked: false,
            }),
          ),
        }),
      );

      if (!forms.length) {
        const fields = Array.from(
          container.querySelectorAll("input,select,textarea"),
        ).map((field) => ({
          label:
            field.getAttribute("aria-label") ||
            field.getAttribute("placeholder") ||
            field.getAttribute("name") ||
            field.id ||
            field.tagName.toLowerCase(),
          required: Boolean(
            field.required || field.getAttribute("aria-required") === "true",
          ),
          type: field.getAttribute("type") || field.tagName.toLowerCase(),
          blocked: false,
        }));
        if (fields.length) {
          forms.push({ formName: "container-fields", fields });
        }
      }

      return {
        type,
        title: titleElement ? textOf(titleElement).slice(0, 120) : textOf(container).slice(0, 80),
        buttons,
        forms,
      };
    })
    .catch(() => null);
}

async function closeTopContainer(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
}

async function expandSafeDynamicMenus(page, log) {
  const candidates = await page
    .evaluate(() => {
      const textOf = (element) =>
        (element.innerText || element.textContent || "").trim().slice(0, 80);
      return Array.from(
        document.querySelectorAll(
          "[aria-expanded='false'],[role='menuitem'],[role='treeitem'],[role='button']",
        ),
      )
        .map((element, index) => ({
          index,
          text: textOf(element),
          role: element.getAttribute("role") || "",
          ariaExpanded: element.getAttribute("aria-expanded"),
          tagName: element.tagName.toLowerCase(),
        }))
        .slice(0, 80);
    })
    .catch(() => []);

  let expanded = 0;
  for (const candidate of candidates) {
    if (expanded >= 30) break;
    if (!isSafeExplorationClick(candidate)) continue;

    try {
      const locator = page
        .locator(
          "[aria-expanded='false'],[role='menuitem'],[role='treeitem'],[role='button']",
        )
        .nth(candidate.index);
      await locator.click({ timeout: 1500, trial: false });
      expanded += 1;
      log("expand-dynamic-menu", candidate.text || candidate.role, "success");
      await page.waitForTimeout(200);
    } catch (error) {
      log("expand-dynamic-menu", candidate.text || candidate.role, "skipped", {
        reason: error.message,
      });
    }
  }

  return expanded;
}

async function detectSessionBlock(page) {
  const url = page.url().toLowerCase();
  if (/huntian\.hzins\.com\/login/i.test(url)) return true;

  const title = (await page.title()).toLowerCase();
  const bodyText = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""))
    .toLowerCase()
    .slice(0, 2000);

  if (/venus-fincenter\.hzins\.com/i.test(url)) {
    return (
      bodyText.includes("请登录") ||
      bodyText.includes("重新登录") ||
      bodyText.includes("未登录")
    );
  }

  return (
    url.includes("login") ||
    title.includes("login") ||
    title.includes("登录") ||
    bodyText.includes("请登录") ||
    bodyText.includes("重新登录") ||
    bodyText.includes("未登录")
  );
}

async function fillVisibleFormWithTestName(frame, targetName) {
  return frame
    .evaluate((name) => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 1 &&
          rect.height > 1
        );
      };
      const setNativeValue = (field, value) => {
        const prototype =
          field instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (setter) setter.call(field, value);
        else field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const inputs = Array.from(document.querySelectorAll("input, textarea")).filter(isVisible);
      const editable = inputs.filter(
        (field) =>
          !field.readOnly &&
          field.type !== "hidden" &&
          field.type !== "checkbox" &&
          field.type !== "radio",
      );
      if (!editable.length) return { ok: false, reason: "no-editable-inputs" };
      const field = editable[0];
      field.focus();
      setNativeValue(field, name);
      return { ok: true, fieldCount: editable.length, value: field.value };
    }, targetName)
    .catch((error) => ({ ok: false, reason: error.message }));
}

async function formContainsTestPrefix(frame) {
  return frame
    .evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, textarea"));
      return inputs.some((field) => String(field.value || "").includes("AI_AUTO_TEST_"));
    })
    .catch(() => false);
}

async function tryClickCreateSubmit(frame, page) {
  const submitLabels = [
    "保存",
    "确定",
    "提交",
    "创建",
    "确认提交",
    "完成",
    "新增",
    "OK",
    "确认",
  ];
  const advanceLabels = ["下一步", "继续", "Next"];
  const footerSelectors = [".ant-modal-footer", ".ant-drawer-footer", ".el-dialog__footer"];

  const clickLabelInContainer = async (labels) => {
    for (const footerSelector of footerSelectors) {
      const footer = frame.locator(footerSelector).first();
      const footerCount = await footer.count().catch(() => 0);
      if (!footerCount) continue;
      await footer.scrollIntoViewIfNeeded().catch(() => {});
      for (const label of labels) {
        const locators = [
          footer.getByRole("button", { name: label, exact: true }).first(),
          footer.locator("button, span.ant-btn, a.ant-btn").filter({ hasText: label }).first(),
        ];
        for (const locator of locators) {
          const count = await locator.count().catch(() => 0);
          if (!count) continue;
          try {
            await locator.click({ timeout: 4000, force: true });
            await waitForPageStable(page);
            return { ok: true, button: label, source: footerSelector };
          } catch {
            continue;
          }
        }
      }
    }

    for (const label of labels) {
      const locators = [
        frame.getByRole("button", { name: label, exact: true }).first(),
        frame
          .locator(".ant-btn-primary,button[type='submit'],span.ant-btn,a.ant-btn")
          .filter({ hasText: label })
          .first(),
        frame
          .locator(".ant-modal-footer,.ant-drawer-footer,.el-dialog__footer")
          .locator("button,span.ant-btn,a.ant-btn")
          .filter({ hasText: label })
          .first(),
      ];
      for (const locator of locators) {
        const count = await locator.count().catch(() => 0);
        if (!count) continue;
        try {
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await locator.click({ timeout: 4000, force: true });
          await waitForPageStable(page);
          return { ok: true, button: label };
        } catch {
          continue;
        }
      }
    }
    return { ok: false };
  };

  for (let step = 0; step < 4; step += 1) {
    const submitted = await clickLabelInContainer(submitLabels);
    if (submitted.ok) return submitted;

    const advanced = await clickLabelInContainer(advanceLabels);
    if (!advanced.ok) break;
    await waitForPageStable(page);
    await page.waitForTimeout(400);
  }

  const evaluated = await frame
    .evaluate((labels) => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0.05 &&
          rect.width > 8 &&
          rect.height > 8
        );
      };
      const textOf = (element) => (element.innerText || element.textContent || "").trim();
      const roots = Array.from(
        document.querySelectorAll(
          ".ant-modal-wrap:not([style*='display: none']) .ant-modal, .ant-drawer-open, .el-dialog__wrapper:not([style*='display: none']) .el-dialog, [role='dialog']",
        ),
      ).filter(isVisible);
      const scope = roots.length ? roots[roots.length - 1] : document.body;
      const buttons = Array.from(
        scope.querySelectorAll("button,.ant-btn,[role='button'],span.ant-btn,a.ant-btn"),
      ).filter(isVisible);
      for (const label of labels) {
        const match = buttons.find((button) => textOf(button) === label);
        if (match) {
          match.click();
          return { ok: true, button: label, source: "evaluate-fallback" };
        }
      }
      const primary = buttons.find(
        (button) =>
          button.classList.contains("ant-btn-primary") ||
          button.getAttribute("type") === "submit",
      );
      if (primary) {
        const label = textOf(primary);
        primary.click();
        return { ok: true, button: label || "primary", source: "evaluate-primary" };
      }
      return { ok: false };
    }, [...submitLabels, ...advanceLabels])
    .catch(() => ({ ok: false }));

  if (evaluated.ok) {
    await waitForPageStable(page);
    return evaluated;
  }

  return { ok: false, reason: "submit-button-not-found" };
}

function markWriteActionValidated(evidence, scenario) {
  for (const action of evidence.actionInventory || []) {
    if (scenario.pageId && action.pageId !== scenario.pageId) continue;
    if (action.type !== "create") continue;
    if (
      scenario.buttonText &&
      action.name !== scenario.buttonText &&
      !String(action.name || "").includes(scenario.buttonText)
    ) {
      continue;
    }
    action.validated = true;
    action.pendingItem = false;
  }
}

async function executeWriteValidationBrowser(options = {}) {
  const {
    config,
    system,
    systemOutput,
    scenarios = [],
    maxScenarios =
      Number(system?.writeValidationMaxScenarios) ||
      Number(config?.runtime?.writeValidationMaxScenarios) ||
      3,
    args = {},
  } = options;

  const evidencePath = path.join(systemOutput, "evidence.json");
  const ledgerPath = path.join(systemOutput, "test-data-ledger.json");
  const logPath = path.join(systemOutput, "operation-log.jsonl");
  const inputs = loadWriteValidationInputs({ evidencePath, ledgerPath });
  if (inputs.error) {
    return {
      status: "blocked",
      reason: inputs.error,
      scenarios: [],
    };
  }
  const { evidence } = inputs;
  let { ledger } = inputs;

  const log = createJsonlLogger(logPath, true);
  activeCollectOptions = resolveCollectProfileOptions(config, system, { fastCollect: true });

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    return {
      status: "blocked",
      reason: `Playwright not installed: ${error.message}`,
      scenarios: [],
    };
  }

  const installedBrowser = findInstalledBrowser();
  const headless = resolveBrowserHeadless(config, args);
  const launchOptions = {
    headless,
    args: buildChromiumLaunchArgs(config),
  };
  if (installedBrowser) launchOptions.executablePath = installedBrowser;

  const usePersistentProfile = shouldUsePersistentProfile(config, args);
  let browser;
  let browserSession;
  try {
    if (usePersistentProfile) {
      browserSession = await createRefreshBrowserSession(chromium, config, {
        headless,
        persistentProfile: true,
        persistentProfileDir: args["persistent-profile-dir"],
        chromeUserDataDir: args["chrome-user-data-dir"],
      });
      browser = browserSession.browser;
    } else {
      browser = await chromium.launch(launchOptions);
    }
  } catch (error) {
    return {
      status: "blocked",
      reason: `Browser launch failed: ${error.message}`,
      scenarios: [],
    };
  }

  const scenarioResults = [];
  let networkRecorder = null;
  try {
    const context = browserSession
      ? browserSession.context
      : await browser.newContext({
          userAgent: config.auth.userAgent || "Mozilla/5.0 AI-Data-Loop-Platform/1.0",
          extraHTTPHeaders: buildExtraHeaders(config.auth),
        });

    const { createNetworkRecorder } = require("./operation-spec/network-recorder");
    networkRecorder = createNetworkRecorder({
      systemOutput,
      systemCode: system.code,
      allowedHosts: [new URL(system.url).hostname],
    });
    networkRecorder.attachContext(context);

    await registerPageZoomInitScript(context, config);
    const token = readToken(config.auth.tokenFile);
    if (!usePersistentProfile) {
      await injectAuthCookies(context, config.auth, token, log);
    }

    const page = context.pages()[0] || (await context.newPage());
    const appHost = new URL(system.url).hostname;
    log("write-validation", system.url, "start", { scenarioCount: scenarios.length });

    await page.goto(system.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await waitForPageStable(page);
    if (isHuntianLoginUrl(page.url())) {
      await completeHuntianQuickLogin(page, log, { timeoutMs: 90000, appHost });
    }
    await waitForApplicationReady(page, system, log, 60000);
    await expandSafeDynamicMenus(page, log);
    await applyConfiguredPageZoom(page, config);

    if (await detectSessionBlock(page)) {
      return {
        status: "blocked",
        reason: "Session expired before write validation.",
        scenarios: [],
      };
    }

    for (const scenario of scenarios.slice(0, maxScenarios)) {
      const baseResult = {
        id: scenario.id || "",
        action: scenario.action || "",
        targetName: scenario.targetName || "",
        menuPath: scenario.menuPath || "",
      };

      if (scenario.action !== "create") {
        scenarioResults.push({
          ...baseResult,
          status: "blocked",
          reason: "Only create scenarios are executable in this version.",
        });
        continue;
      }

      try {
        const menu =
          (evidence.menuMap || []).find((item) => item.menuPath === scenario.menuPath) || {
            title: scenario.menuPath,
            menuPath: scenario.menuPath,
          };
        const opened = await openMenuPage(page, menu, log, config);
        if (!opened) {
          scenarioResults.push({
            ...baseResult,
            status: "blocked",
            reason: "menu-not-opened",
          });
          continue;
        }

        if (await detectSessionBlock(page)) {
          scenarioResults.push({
            ...baseResult,
            status: "blocked",
            reason: "session-expired",
          });
          break;
        }

        const frame = await getActiveContentFrame(page);
        let clicked = false;
        let usedButtonText = scenario.buttonText || "";
        if (scenario.buttonText) {
          clicked = await clickInspectionCandidate(frame, { text: scenario.buttonText });
        }
        if (!clicked) {
          const candidates = await collectInspectionCandidates(frame);
          const createCandidate = candidates.find(
            (candidate) =>
              isSafeInspectionClick(candidate) && /新增|新建|创建/.test(String(candidate.text || "")),
          );
          if (createCandidate) {
            usedButtonText = String(createCandidate.text || "").split("\n")[0].trim();
            clicked = await clickInspectionCandidate(frame, createCandidate);
          }
        }
        if (!clicked) {
          scenarioResults.push({
            ...baseResult,
            status: "blocked",
            reason: "create-entry-not-found",
            buttonText: usedButtonText,
          });
          continue;
        }

        await waitForVisibleContainer(frame, 3000);
        await waitForPageStable(page);
        const filled = await fillVisibleFormWithTestName(frame, scenario.targetName);
        let validationScreenshot = "";
        try {
          const timestamp = timestampForFile();
          validationScreenshot = path
            .join(
              "screenshots",
              safeScreenshotName(
                system.name,
                scenario.menuPath || scenario.id,
                "验写表单",
                timestamp,
              ),
            )
            .replace(/\\/g, "/");
          await page.screenshot({
            path: path.join(systemOutput, validationScreenshot),
            fullPage: true,
          });
        } catch {
          validationScreenshot = "";
        }
        if (!filled.ok) {
          await closeTopContainer(page).catch(() => {});
          scenarioResults.push({
            ...baseResult,
            status: "partial",
            reason: filled.reason || "form-fill-failed",
            buttonText: usedButtonText,
            filledFieldCount: filled.fieldCount || 0,
            filledValue: filled.value || "",
            screenshotPath: validationScreenshot,
          });
          continue;
        }

        const safeToSubmit = await formContainsTestPrefix(frame);
        if (!safeToSubmit) {
          await closeTopContainer(page).catch(() => {});
          scenarioResults.push({
            ...baseResult,
            status: "blocked",
            reason: "test-prefix-guard-failed",
            buttonText: usedButtonText,
            filledFieldCount: filled.fieldCount || 0,
            filledValue: filled.value || "",
            screenshotPath: validationScreenshot,
          });
          continue;
        }

        const submitted = await tryClickCreateSubmit(frame, page);
        await closeTopContainer(page).catch(() => {});

        if (submitted.ok) {
          const ledgerEntry = {
            id: `td-${Date.now()}-${scenarioResults.length + 1}`,
            name: scenario.targetName,
            type: "create",
            purpose: `验写 ${scenario.menuPath}`,
            createdAt: new Date().toISOString(),
            sourcePage: scenario.menuPath,
            usedBy: [scenario.buttonText || "create"],
            cleanupStatus: "active",
          };
          ledger = ledger.concat(ledgerEntry);
          evidence.testDataLedger = ledger;
          markWriteActionValidated(evidence, scenario);
          log("write-validation", scenario.menuPath, "success", {
            targetName: scenario.targetName,
            button: submitted.button,
          });
          scenarioResults.push({
            ...baseResult,
            status: "success",
            submitButton: submitted.button,
            buttonText: usedButtonText,
            filledFieldCount: filled.fieldCount || 0,
            filledValue: filled.value || "",
            screenshotPath: validationScreenshot,
          });
        } else {
          log("write-validation", scenario.menuPath, "partial", {
            targetName: scenario.targetName,
            reason: submitted.reason,
          });
          scenarioResults.push({
            ...baseResult,
            status: "partial",
            reason: submitted.reason || "form-opened-not-submitted",
            buttonText: usedButtonText,
            filledFieldCount: filled.fieldCount || 0,
            filledValue: filled.value || "",
            screenshotPath: validationScreenshot,
          });
        }
      } catch (error) {
        await closeTopContainer(page).catch(() => {});
        scenarioResults.push({
          ...baseResult,
          status: "failed",
          reason: String(error.message || error).slice(0, 240),
        });
      }
    }
  } finally {
    if (networkRecorder) {
      networkRecorder.save();
    }
    await closeRefreshBrowserSession(browserSession || { browser }).catch(() => {});
  }

  writeJson(ledgerPath, ledger);
  writeJson(evidencePath, evidence);

  const successCount = scenarioResults.filter((item) => item.status === "success").length;
  const partialCount = scenarioResults.filter((item) => item.status === "partial").length;
  const failedCount = scenarioResults.filter((item) => item.status === "failed").length;
  let status = "blocked";
  if (successCount > 0) status = "completed";
  else if (partialCount > 0) status = "partial";
  else if (failedCount > 0) status = "failed";

  return {
    status,
    systemCode: system.code,
    reason:
      successCount > 0
        ? `Validated ${successCount} create scenario(s).`
        : partialCount > 0
          ? "Opened create forms but did not confirm all submissions."
          : "No write scenarios could be executed.",
    scenarios: scenarioResults,
    counts: {
      planned: scenarios.length,
      executed: scenarioResults.length,
      success: successCount,
      partial: partialCount,
      failed: failedCount,
      blocked: scenarioResults.filter((item) => item.status === "blocked").length,
    },
    finishedAt: new Date().toISOString(),
  };
}

function timestampForFile() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  module.exports = {
    applyVisibleDomMenuCandidatesToEvidence,
    collectBrowserEvidence,
    executeWriteValidationBrowser,
    loadEvidenceForCollection,
    loadWriteValidationInputs,
    preferApiMenusOverDom,
    readExistingEvidence,
    readExistingTestDataLedger,
    seedMenusFromKnownSources,
  };
}
