const fs = require("node:fs");
const dns = require("node:dns").promises;
const path = require("node:path");

const DEFAULT_THRESHOLDS = {
  menuCoverage: 0.99,
  corePageScreenshotCoverage: 0.99,
  coreFunctionClassificationCoverage: 0.99,
  writeOperationSafetyCompliance: 1,
  unverifiedContentLabeling: 1,
  coreConclusionTraceability: 1,
};

function safeScreenshotName(moduleName, functionName, stepName, timestamp) {
  return [moduleName, functionName, stepName, timestamp]
    .map((part) =>
      String(part || "")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, ""),
    )
    .filter(Boolean)
    .join("_")
    .concat(".png");
}

function safeFileToken(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** 白皮书文件名日期段：YYYYMMDD（优先 evidence.systemInfo.collectedAt）。 */
function formatWhitepaperDate(source) {
  const date = source ? new Date(source) : new Date();
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  }
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 系统名称_系统功能白皮书_YYYYMMDD.md */
function resolveWhitepaperFileName(evidence, options = {}) {
  const systemName = safeFileToken(evidence?.systemInfo?.name || options.systemName || "系统");
  const date = formatWhitepaperDate(options.date || evidence?.systemInfo?.collectedAt);
  return `${systemName}_系统功能白皮书_${date}.md`;
}

/** 系统名称_系统功能白皮书_YYYYMMDD_待审.md */
function resolveWhitepaperPendingReviewFileName(evidence, options = {}) {
  return resolveWhitepaperFileName(evidence, options).replace(/\.md$/i, "_待审.md");
}

function loadEvidenceSummaryForNaming(systemOutput) {
  const summaryPath = path.join(systemOutput, "evidence-summary.json");
  if (!fs.existsSync(summaryPath)) {
    return { systemInfo: { name: "", collectedAt: "" } };
  }
  const summary = readOptionalJsonObject(summaryPath, {});
  const system = summary.system || summary.systemInfo || {};
  return {
    systemInfo: {
      name: system.name || summary.systemName || "",
      collectedAt: system.collectedAt || summary.collectedAt || summary.generatedAt || "",
    },
  };
}

const PENDING_REVIEW_TITLE_SUFFIX =
  /(?:（待审核）|（待审）|\(待审核\)|\(待审\)|_待审)(?=\s*$)/;

/** 终稿标题去掉待审标记，保留系统功能白皮书主标题。 */
function finalizeWhitepaperMarkdown(markdown, options = {}) {
  let content = String(markdown || "");
  content = content.replace(/^#\s+(.+)\s*$/m, (line, title) => {
    const cleanTitle = String(title).replace(PENDING_REVIEW_TITLE_SUFFIX, "").trim();
    if (!cleanTitle) {
      const systemName = String(options.systemName || "").trim();
      return systemName ? `# ${systemName}功能白皮书` : line;
    }
    return `# ${cleanTitle}`;
  });
  return content;
}

function promotePendingReviewToFinal(pendingPath, finalPath, options = {}) {
  const markdown = fs.readFileSync(pendingPath, "utf8");
  const finalized = finalizeWhitepaperMarkdown(markdown, options);
  fs.writeFileSync(finalPath, finalized, "utf8");
  return finalized;
}

/** 将内部稳定文件名同步为对外约定文件名（待审带 _待审 后缀）。 */
function syncWhitepaperNamedArtifacts(options = {}) {
  const systemOutput = path.resolve(String(options.systemOutput || options.outputDir || "."));
  const evidence = options.evidence || loadEvidenceSummaryForNaming(systemOutput);
  if (options.systemName) {
    evidence.systemInfo = { ...(evidence.systemInfo || {}), name: options.systemName };
  }
  const nameOptions = { date: options.date };
  const result = { pendingReview: "", final: "" };
  const pendingInternal = path.join(systemOutput, "whitepaper.pending-review.md");
  const finalInternal = path.join(systemOutput, "whitepaper.final.md");
  if (fs.existsSync(pendingInternal)) {
    const pendingName = resolveWhitepaperPendingReviewFileName(evidence, nameOptions);
    fs.copyFileSync(pendingInternal, path.join(systemOutput, pendingName));
    result.pendingReview = pendingName;
  }
  if (fs.existsSync(finalInternal)) {
    const finalName = resolveWhitepaperFileName(evidence, nameOptions);
    const finalized = finalizeWhitepaperMarkdown(fs.readFileSync(finalInternal, "utf8"), {
      systemName: evidence.systemInfo?.name || options.systemName,
    });
    fs.writeFileSync(finalInternal, finalized, "utf8");
    fs.writeFileSync(path.join(systemOutput, finalName), finalized, "utf8");
    result.final = finalName;
  }
  return result;
}

function resolveWhitepaperOutputPath(inputPath, evidence, explicitOutput) {
  if (explicitOutput) return path.resolve(String(explicitOutput));
  const dir = inputPath ? path.dirname(path.resolve(String(inputPath))) : process.cwd();
  return path.join(dir, resolveWhitepaperFileName(evidence));
}

function resolveDraftOutputPath(inputPath, explicitOutput) {
  if (explicitOutput) return path.resolve(String(explicitOutput));
  const dir = inputPath ? path.dirname(path.resolve(String(inputPath))) : process.cwd();
  return path.join(dir, "whitepaper.draft.md");
}

function isTechnicalFieldLabel(value) {
  const text = normalizeUiText(value);
  if (!text) return true;
  if (/[\u4e00-\u9fff]/.test(text)) return false;
  if (/^new-[a-z0-9][a-z0-9-]*$/i.test(text)) return true;
  if (/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/i.test(text)) return true;
  if (/^[a-z]+Id$/i.test(text) && text.length <= 32) return true;
  return false;
}

function isGenericFieldLabel(value) {
  const text = normalizeUiText(value);
  if (!text) return true;
  if (/^全部[（(].+[)）]$/.test(text)) return false;
  if (/^(请选择|请输入|请填写|请搜索)$/.test(text)) return true;
  if (/^请输入需求描述$/.test(text)) return true;
  return false;
}

function selectFieldLabel(metadata) {
  const ignored = new Set(["div", "span", "input", "select", "textarea"]);
  const candidates = [
    metadata && metadata.ariaLabel,
    metadata && metadata.explicitLabel,
    metadata && metadata.wrapperLabel,
    metadata && metadata.ariaLabelledText,
    metadata && metadata.siblingLabel,
    metadata && metadata.placeholder,
    metadata && metadata.text,
    metadata && metadata.name,
    metadata && metadata.id,
    metadata && metadata.tagName,
  ];

  for (const candidate of candidates) {
    const value = normalizeUiText(candidate).replace(/[:：]\s*$/, "");
    if (!value) continue;
    if (ignored.has(value.toLowerCase())) continue;
    if (isTechnicalFieldLabel(value)) continue;
    if (isGenericFieldLabel(value)) continue;
    return value;
  }

  return "";
}

function normalizeUiText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .trim();
}

function assertSafeWriteTarget(targetName, ledger) {
  if (!String(targetName || "").includes("AI_AUTO_TEST_")) {
    throw new Error("Write target must include AI_AUTO_TEST_ prefix.");
  }

  const matched = (ledger || []).some((item) => item.name === targetName);
  if (!matched) {
    throw new Error("Write target must exist in test-data-ledger.");
  }

  return true;
}

function buildAuthCookies(auth, token) {
  if (!auth || !auth.cookieName || !token) return [];

  return [
    {
      name: auth.cookieName,
      value: token,
      domain: auth.cookieDomain || ".hzins.com",
      path: auth.cookiePath || "/",
      secure: auth.cookieSecure !== false,
      httpOnly: auth.cookieHttpOnly === true,
      sameSite: auth.cookieSameSite || "Lax",
    },
  ];
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(/[;\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      const name = separator === -1 ? part : part.slice(0, separator).trim();
      let value = separator === -1 ? "" : part.slice(separator + 1).trim();
      value = value.replace(/^['"]|['"]$/g, "");
      return { name, value };
    })
    .filter((cookie) => cookie.name);
}

function buildCookiesFromHeader(auth, cookieHeader) {
  return parseCookieHeader(cookieHeader).map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: auth.cookieDomain || ".hzins.com",
    path: auth.cookiePath || "/",
    secure: auth.cookieSecure !== false,
    httpOnly: auth.cookieHttpOnly === true,
    sameSite: auth.cookieSameSite || "Lax",
  }));
}

const DEFAULT_HUNTIAN_AUTH_COOKIE_NAMES = ["JSESSIONID", "HUNTIANSID", "token"];

function isPlaceholderSecret(value) {
  const trimmed = String(value || "").trim();
  return !trimmed || /^REPLACE_WITH_/i.test(trimmed);
}

function formatCookieHeader(cookies) {
  return cookies
    .filter((cookie) => cookie?.name)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function selectAuthCookiesFromList(cookies, names = DEFAULT_HUNTIAN_AUTH_COOKIE_NAMES) {
  const byName = new Map();
  for (const cookie of cookies || []) {
    if (!cookie?.name) continue;
    const key = cookie.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, { name: cookie.name, value: cookie.value || "" });
    }
  }

  return names
    .map((name) => byName.get(String(name).toLowerCase()))
    .filter(Boolean);
}

function resolveConfigBaseDir(configDir) {
  const resolved = path.resolve(String(configDir || "."));
  const name = path.basename(resolved).toLowerCase();
  return name === "config" || name === "examples" ? path.dirname(resolved) : resolved;
}

function resolveConfigRelativePath(configDir, value) {
  if (!value) return "";
  const text = String(value);
  if (/^\.\.(?:[\\/]|$)/.test(text)) return path.resolve(configDir, text);
  return path.isAbsolute(text) ? text : path.resolve(resolveConfigBaseDir(configDir), text);
}

function normalizeAuthPaths(config, configDir) {
  if (!config?.auth) return;
  if (config.auth.tokenFile && !path.isAbsolute(config.auth.tokenFile)) {
    config.auth.tokenFile = resolveConfigRelativePath(configDir, config.auth.tokenFile);
  }
  if (config.auth.cookieHeaderFile && !path.isAbsolute(config.auth.cookieHeaderFile)) {
    config.auth.cookieHeaderFile = resolveConfigRelativePath(
      configDir,
      config.auth.cookieHeaderFile,
    );
  }
}

/** 企微快捷登录页必须点的链接文案（红字提示同句，勿与「继续在浏览器中访问」混淆）。 */
const HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL = "继续在浏览器中登录访问";
const HUNTIAN_BROWSER_CONTINUE_LABELS = [HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL];
/** 仅作兜底，默认不优先使用（易与快捷页其它入口混淆）。 */
const HUNTIAN_BROWSER_CONTINUE_FALLBACK_LABELS = ["继续在浏览器中访问"];
const HUNTIAN_BROWSER_CONTINUE_PATTERN = /继续在浏览器中登录访问/;
/** 企微快捷登录页真实入口：href 为 javascript:;，需触发点击事件而非导航 href。 */
const HUNTIAN_BROWSER_CONTINUE_SELECTOR = "a.wwLogin_quick_open_wecom";
const DEFAULT_CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HUNTIAN_LOCAL_NETWORK_ACCESS_ORIGINS = [
  "https://huntian.hzins.com",
  "https://venus-fincenter.hzins.com",
];
const DEFAULT_HUNTIAN_BROWSER_CONTINUE_WAIT_MS = 120000;
/** 浑天快捷登录：等待入口出现在 DOM / 解析链接，单项最多 10 秒。 */
const HUNTIAN_QUICK_LOGIN_WAIT_CAP_MS = 10000;
/** 流水线 session 节点浏览器回退：总预算约 12 秒，企微已登录时通常 3–8 秒完成。 */
const HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS = 12000;
const HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS = 6000;

function shouldPreferChromeUserAgent(config) {
  const runtime = config?.runtime || {};
  if (runtime.useChromeUserAgent === true) return true;
  if (runtime.useChromeUserAgent === false) return false;
  const authUa = String(config?.auth?.userAgent || "");
  return process.platform === "win32" && /AI-Data-Loop/i.test(authUa);
}

function resolveBrowserUserAgent(config) {
  if (shouldPreferChromeUserAgent(config)) {
    return DEFAULT_CHROME_USER_AGENT;
  }
  return config?.auth?.userAgent || DEFAULT_CHROME_USER_AGENT;
}

function resolveChromeUserDataDir(config, options = {}) {
  const raw = options.chromeUserDataDir || config?.runtime?.chromeUserDataDir || "";
  return raw ? path.resolve(String(raw)) : "";
}

async function grantHuntianLocalNetworkAccess(context, log = () => {}) {
  if (!context?.grantPermissions) return;
  for (const origin of HUNTIAN_LOCAL_NETWORK_ACCESS_ORIGINS) {
    try {
      await context.grantPermissions(["local-network-access"], { origin });
      log("grant-local-network-access", origin, "success");
    } catch (error) {
      log("grant-local-network-access", origin, "skipped", {
        reason: error.message,
      });
    }
  }
}

async function collectHuntianQuickLoginLinkDebug(page) {
  const rows = [];
  for (const frame of listHuntianQuickLoginSearchFrames(page)) {
    const anchors = await frame
      .evaluate(() =>
        Array.from(document.querySelectorAll("a.wwLogin_quick_open_wecom")).map((el, index) => {
          const rect = el.getBoundingClientRect();
          return {
            index,
            text: (el.textContent || "").trim(),
            href: el.getAttribute("href"),
            hasLayoutParent: el.offsetParent !== null,
            width: rect.width,
            height: rect.height,
          };
        }),
      )
      .catch(() => []);
    for (const anchor of anchors) {
      rows.push({ frameUrl: frame.url(), ...anchor });
    }
  }
  return rows;
}

/** 在浑天 / 企微 SSO 帧内查找快捷入口（须 class + 文案双匹配，避免误点其它链接）。 */
async function findHuntianQuickLoginLink(page) {
  for (const frame of listHuntianQuickLoginSearchFrames(page)) {
    const candidates = frame.locator(HUNTIAN_BROWSER_CONTINUE_SELECTOR);
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = candidates.nth(index);
      const text = normalizeUiText(await item.innerText().catch(() => ""));
      if (text !== HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL) continue;
      return { item, frame };
    }

    for (const label of HUNTIAN_BROWSER_CONTINUE_LABELS) {
      const anchors = frame.locator("a");
      const anchorCount = await anchors.count().catch(() => 0);
      for (let index = 0; index < anchorCount; index += 1) {
        const item = anchors.nth(index);
        const text = normalizeUiText(await item.innerText().catch(() => ""));
        if (text === label) return { item, frame };
      }
    }
  }
  return null;
}

async function resolveHuntianQuickLoginLink(page, log = () => {}, options = {}) {
  const deadline = Date.now() + (Number(options.waitMs) || DEFAULT_HUNTIAN_BROWSER_CONTINUE_WAIT_MS);

  while (Date.now() < deadline) {
    const match = await findHuntianQuickLoginLink(page);
    if (match) {
      log("huntian-quick-login", match.frame.url() || page.url(), "found", {
        playwrightVisible: await match.item.isVisible().catch(() => false),
      });
      return match.item;
    }

    await page.waitForTimeout(200);
  }

  const debug = await collectHuntianQuickLoginLinkDebug(page).catch(() => []);
  log("huntian-quick-login", page.url(), "debug", {
    reason: "not-found-in-login-frames",
    anchors: debug,
    frameUrls: page.frames().map((frame) => frame.url()),
  });
  return null;
}

async function isHuntianQuickLoginLinkVisible(page) {
  return Boolean(await findHuntianQuickLoginLink(page));
}

async function detectHuntianLoginPageState(page) {
  if (!(await isHuntianQuickLoginLinkVisible(page))) {
    const qrHints = [
      page.locator('img[alt*="二维码"], img[alt*="扫码"]'),
      page.locator('[class*="qrcode" i], [id*="qrcode" i]'),
      page.getByText(/企业微信.*扫码|请.*扫码|二维码/),
    ];
    for (const locator of qrHints) {
      if ((await locator.count().catch(() => 0)) > 0) {
        return "qr-only";
      }
    }
    return "unknown";
  }
  return "continue-available";
}

function isHuntianLoginUrl(url) {
  return /huntian\.hzins\.com\/login/i.test(String(url || ""));
}

function isHuntianLoginFrameUrl(frameUrl) {
  return isHuntianLoginUrl(frameUrl);
}

/** 企微嵌入 SSO 面板：快捷入口 a.wwLogin_quick_open_wecom 实际渲染在此帧。 */
function isWecomSsoLoginFrameUrl(frameUrl) {
  return /login\.work\.weixin\.qq\.com\/wwlogin/i.test(String(frameUrl || ""));
}

function listHuntianLoginFrames(page) {
  const huntianFrames = page.frames().filter((frame) => isHuntianLoginFrameUrl(frame.url()));
  return huntianFrames.length ? huntianFrames : [page.mainFrame()];
}

/** 浑天 login 帧优先，其次企微 wwlogin 帧（仅用于 wwLogin_quick_open_wecom 精确匹配）。 */
function listHuntianQuickLoginSearchFrames(page) {
  const frames = page.frames();
  const huntian = frames.filter((frame) => isHuntianLoginFrameUrl(frame.url()));
  const wecom = frames.filter((frame) => isWecomSsoLoginFrameUrl(frame.url()));
  const ordered = [...huntian, ...wecom];
  return ordered.length ? ordered : [page.mainFrame()];
}

function isJavascriptHref(href) {
  const value = String(href || "").trim();
  return !value || value === "#" || /^javascript:/i.test(value);
}

/** 只匹配可点击的 <a>（按文案精确匹配），不要求 Playwright isVisible。 */
async function findHuntianContinueButton(page, options = {}) {
  const quick = await findHuntianQuickLoginLink(page);
  if (quick) return quick.item;

  for (const frame of listHuntianLoginFrames(page)) {
    const candidates = frame.locator(HUNTIAN_BROWSER_CONTINUE_SELECTOR);
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = candidates.nth(index);
      const text = normalizeUiText(await item.innerText().catch(() => ""));
      if (text === HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL) return item;
    }
  }

  const allowFallback = options.allowAlternateContinueLabel === true;
  const labels = allowFallback
    ? [...HUNTIAN_BROWSER_CONTINUE_LABELS, ...HUNTIAN_BROWSER_CONTINUE_FALLBACK_LABELS]
    : HUNTIAN_BROWSER_CONTINUE_LABELS;

  for (const label of labels) {
    const roleLink = page.getByRole("link", { name: label, exact: true });
    if (await roleLink.count().catch(() => 0)) {
      return roleLink.first();
    }

    const anchorCount = await page.locator("a").count().catch(() => 0);
    for (let index = 0; index < anchorCount; index += 1) {
      const link = page.locator("a").nth(index);
      const text = normalizeUiText(await link.innerText().catch(() => ""));
      if (text === label) return link;
    }
  }

  return null;
}

async function clickHuntianContinueAndLeaveLogin(page, locator, log, startUrl, options = {}) {
  const fastMode = Boolean(options.fastMode);
  const navTimeoutMs = fastMode ? 8000 : 45000;
  const domTimeoutMs = fastMode ? 3000 : 10000;
  if (!fastMode) {
    await page.waitForLoadState("domcontentloaded", { timeout: domTimeoutMs }).catch(() => {});
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  const href = await locator.getAttribute("href").catch(() => null);
  const attempts = [
    async () => {
      await locator.evaluate((el) => {
        el.click();
      });
    },
    async () => {
      const box = await locator.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    },
    async () => {
      await locator.click({ timeout: 5000, force: true });
    },
    async () => {
      await locator.dispatchEvent("click");
    },
    async () => {
      await locator.click({ timeout: 5000 });
    },
  ];
  if (!isJavascriptHref(href)) {
    attempts.push(async () => {
      await page.goto(new URL(href, page.url()).toString(), {
        waitUntil: fastMode ? "commit" : "domcontentloaded",
        timeout: navTimeoutMs,
      });
    });
  }

  for (let index = 0; index < attempts.length; index += 1) {
    try {
      await attempts[index]();
      const navigated = await page
        .waitForURL((candidate) => !isHuntianLoginUrl(candidate), { timeout: navTimeoutMs })
        .then(() => true)
        .catch(() => false);
      if (!fastMode) {
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      }
      if (navigated || !isHuntianLoginUrl(page.url())) {
        log("huntian-browser-continue", startUrl, "success", {
          label: HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL,
          attempt: index + 1,
          finalUrl: page.url(),
        });
        return true;
      }
      log("huntian-browser-continue", startUrl, "retry", {
        reason: "click-without-navigation",
        attempt: index + 1,
        finalUrl: page.url(),
      });
    } catch (error) {
      log("huntian-browser-continue", startUrl, "retry", {
        reason: error.message,
        attempt: index + 1,
      });
    }
  }

  log("huntian-browser-continue", startUrl, "failed", {
    reason: "all-click-attempts-stayed-on-login",
    finalUrl: page.url(),
  });
  return false;
}

/**
 * 浑天企微快捷登录：等待 a.wwLogin_quick_open_wecom 出现后点击一次，
 * 由浑天根据 redirectUrl 自动跳回业务系统（不再手动 goto 业务地址）。
 */
async function completeHuntianQuickLogin(page, log = () => {}, options = {}) {
  const startUrl = page.url();
  if (!isHuntianLoginUrl(startUrl)) return true;

  const fastMode = Boolean(options.fastMode);
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_HUNTIAN_BROWSER_CONTINUE_WAIT_MS;
  const appHost = options.appHost || "";
  const deadline = Date.now() + timeoutMs;
  const quickLoginWaitCap = fastMode
    ? HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS
    : HUNTIAN_QUICK_LOGIN_WAIT_CAP_MS;

  log("huntian-quick-login", startUrl, "start", {
    selector: HUNTIAN_BROWSER_CONTINUE_SELECTOR,
    fastMode,
    hint: "等待 a.wwLogin_quick_open_wecom 进入 DOM 后点击一次，由浑天 SSO 自动跳转",
  });

  const findBudgetMs = Math.min(quickLoginWaitCap, Math.max(1000, deadline - Date.now()));
  await Promise.all(
    listHuntianQuickLoginSearchFrames(page).map((frame) =>
      frame
        .waitForSelector(HUNTIAN_BROWSER_CONTINUE_SELECTOR, {
          state: "attached",
          timeout: findBudgetMs,
        })
        .catch(() => {}),
    ),
  );

  const link = await resolveHuntianQuickLoginLink(page, log, {
    waitMs: findBudgetMs,
  });

  if (!link) {
    const loginState = await detectHuntianLoginPageState(page);
    log("huntian-browser-continue", startUrl, "skipped", {
      reason:
        loginState === "qr-only"
          ? "qr-only-wecom-quick-login-unavailable"
          : "continue-button-not-found",
      loginState,
      hint:
        loginState === "qr-only"
          ? "仅显示扫码：确认企微桌面端已登录；无头失败时可 refresh --headed --persistent-profile 扫码一次。"
          : "未出现 a.wwLogin_quick_open_wecom：快捷页可能仍在加载；先无头 refresh --persistent-profile，仍失败再加 --headed。",
    });
    return false;
  }

  if (await clickHuntianContinueAndLeaveLogin(page, link, log, startUrl, { fastMode })) {
    return true;
  }

  const remainingMs = Math.max(fastMode ? 2000 : 5000, deadline - Date.now());
  try {
    await page.waitForURL(
      (candidate) =>
        !isHuntianLoginUrl(candidate) && (!appHost || String(candidate).includes(appHost)),
      { timeout: remainingMs },
    );
  } catch {
    // fall through
  }

  if (!isHuntianLoginUrl(page.url())) {
    log("huntian-quick-login", startUrl, "success", {
      finalUrl: page.url(),
      via: "sso-auto-redirect",
    });
    return true;
  }

  log("huntian-quick-login", startUrl, "failed", {
    reason: "click-without-leaving-login",
    finalUrl: page.url(),
  });
  return false;
}

async function continueHuntianBrowserLogin(page, log = () => {}, options = {}) {
  if (!isHuntianLoginUrl(page.url())) return false;
  return completeHuntianQuickLogin(page, log, options);
}

/** 等待进入目标业务系统；在浑天登录页只点快捷入口，不二次 goto 业务 URL。 */
async function waitForApplicationReady(page, system, log = () => {}, timeoutMs = 90000, options = {}) {
  const fastMode = Boolean(options.fastMode);
  const appHost = new URL(system.url).hostname;
  const deadline = Date.now() + timeoutMs;
  let quickLoginAttempts = 0;
  const pollMs = fastMode ? 400 : 800;

  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes(appHost) && !isHuntianLoginUrl(url)) {
      log("session-ready", appHost, "success", { url });
      return true;
    }
    if (isHuntianLoginUrl(url)) {
      if (quickLoginAttempts < (fastMode ? 1 : 2)) {
        quickLoginAttempts += 1;
        await completeHuntianQuickLogin(page, log, {
          timeoutMs: Math.min(
            fastMode ? HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS : HUNTIAN_QUICK_LOGIN_WAIT_CAP_MS + 5000,
            Math.max(2000, deadline - Date.now()),
          ),
          appHost,
          fastMode,
        });
      } else {
        await page.waitForTimeout(pollMs);
      }
    } else {
      await page.waitForTimeout(pollMs);
    }
    if (!fastMode) {
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    } else {
      await page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
    }
  }

  log("session-ready", appHost, "timeout", { url: page.url() });
  return false;
}

function isLeafMenu(menu, menus) {
  const menuPath = String(menu.menuPath || menu.title || "").trim();
  if (!menuPath) return false;
  const prefix = `${menuPath} >`;
  return !menus.some((other) => {
    const otherPath = String(other.menuPath || other.title || "").trim();
    return otherPath.startsWith(prefix);
  });
}

function isEnvironmentSwitcherMenu(menu) {
  const title = String(menu?.title || menu?.menuPath || menu?.path || "").trim();
  const url = String(menu?.url || "").trim();
  if (!title) return false;
  if (/^(本地|uat|生产|dev|test|staging|预发|正式).*(环境)?$/i.test(title)) return true;
  if (/环境$/i.test(title) && /(本地|uat|生产|dev|test|预发|正式)/i.test(title)) return true;
  if ((url.endsWith("#") || url.endsWith("/#")) && /(本地|uat|生产|dev|test|预发|正式)/i.test(title)) {
    return true;
  }
  return false;
}

function isNoiseMenuItem(menu) {
  const title = String(menu.title || "").trim();
  if (isEnvironmentSwitcherMenu(menu)) return true;
  if (/^\d+$/.test(title)) return true;
  if (menu.openStrategy === "text-click") return false;
  return !String(menu.url || "").trim();
}

function isSystemShellMenu(menu) {
  const menuPath = String(menu.menuPath || menu.title || "").trim();
  if (menuPath.includes(">")) return false;
  if (/欢迎|首页|welcome/i.test(menuPath)) return true;
  try {
    const pathname = new URL(menu.url).pathname.replace(/\/$/, "") || "/";
    return pathname === "/" || /\/welcome$/i.test(pathname);
  } catch {
    return false;
  }
}

function isCollectibleMenu(menu, menus) {
  if (!menu?.title) return false;
  if (!menu.url && menu.openStrategy !== "text-click") return false;
  if (isNoiseMenuItem(menu) || isSystemShellMenu(menu)) return false;
  if (/删除|提交|审批|发布|覆盖|发送/.test(menu.title) && !/管理|列表|查询|记录|中心/.test(menu.title)) {
    return false;
  }
  if (/结算/.test(menu.title) && !/结算表|结算单/.test(menu.title)) return false;
  return isLeafMenu(menu, menus);
}

function listWelcomeRedirectRetries(evidence) {
  const retries = new Set();
  for (const page of evidence.pageInventory || []) {
    if (page.type !== "menu-page" || !page.menuPath) continue;
    if (isWelcomeMisCapture(page)) {
      retries.add(page.menuPath);
    }
  }
  return retries;
}

function isWelcomeMisCapture(page) {
  if (!page) return false;
  if (!/\/welcome/i.test(page.url || "")) return false;
  const menuPath = String(page.menuPath || "");
  if (/首页|欢迎/.test(menuPath)) return false;
  return true;
}

function findMenuPageEvidence(evidence, menu) {
  return (evidence.pageInventory || []).find(
    (page) =>
      page.type !== "container" &&
      (page.type === "menu-page" || !page.type) &&
      menuMatchesPage(menu, page),
  );
}

function menuHasCollectedScreenshot(evidence, menu) {
  const page = findMenuPageEvidence(evidence, menu);
  if (!page || isWelcomeMisCapture(page)) return false;
  return Boolean(String(page.screenshot || "").trim());
}

function shouldCollectMenu(menu, menus, options = {}) {
  if (!isCollectibleMenu(menu, menus)) return false;
  if (options.onlyUnvisited !== true) return true;

  const retryMenuPaths = options.retryMenuPaths || new Set();
  const menuKey = menu.menuPath || menu.title;
  if (
    options.evidence &&
    menuHasCollectedScreenshot(options.evidence, menu) &&
    !retryMenuPaths.has(menuKey)
  ) {
    return false;
  }
  if (menu.status !== "visited") return true;
  return retryMenuPaths.has(menuKey);
}

function selectMenusForCollection(menuMap, limit, options = {}) {
  const menus = menuMap || [];
  const onlyUnvisited = options.onlyUnvisited === true;
  const retryMenuPaths = options.retryMenuPaths || new Set();
  const evidence = options.evidence || null;

  return menus
    .filter((item) =>
      shouldCollectMenu(item, menus, { onlyUnvisited, retryMenuPaths, evidence }),
    )
    .filter(
      (item, index, arr) =>
        arr.findIndex(
          (candidate) =>
            (candidate.url
              ? normalizePageUrl(candidate.url) === normalizePageUrl(item.url)
              : String(candidate.menuPath || candidate.title) === String(item.menuPath || item.title)),
        ) === index,
    )
    .sort((left, right) => {
      const leftVisited = left.status === "visited" ? 1 : 0;
      const rightVisited = right.status === "visited" ? 1 : 0;
      return leftVisited - rightVisited;
    })
    .slice(0, Math.max(0, limit));
}

function normalizePageUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

function menuMatchesPage(menu, page) {
  const menuPath = String(menu.menuPath || menu.title || "").trim();
  const pagePath = String(page.menuPath || "").trim();
  if (menuPath && pagePath && menuPath === pagePath) return true;
  if (menu.url && page.url && normalizePageUrl(menu.url) === normalizePageUrl(page.url)) {
    return true;
  }
  if (menuPath && pagePath) {
    const menuLeaf = menuPath.split(">").pop().trim();
    const pageLeaf = pagePath.split(">").pop().trim();
    if (menuLeaf && menuLeaf === pageLeaf) return true;
  }
  return false;
}

function mergeMenuMapEntries(menuMap) {
  const byUrl = new Map();
  for (const menu of menuMap || []) {
    const key = menu.url
      ? `url:${normalizePageUrl(menu.url)}`
      : `text:${String(menu.menuPath || menu.title || "").trim()}`;
    if (!key || key === "text:") continue;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, { ...menu });
      continue;
    }
    const existingPath = String(existing.menuPath || existing.title || "");
    const candidatePath = String(menu.menuPath || menu.title || "");
    const merged =
      candidatePath.length > existingPath.length
        ? { ...existing, ...menu, menuPath: menu.menuPath || candidatePath }
        : { ...menu, ...existing };
    if (existing.status === "visited" || menu.status === "visited") {
      merged.status = "visited";
    }
    byUrl.set(key, merged);
  }
  return Array.from(byUrl.values());
}

function markVisitedMenus(evidence) {
  for (const menu of evidence.menuMap || []) {
    if (menuHasCollectedScreenshot(evidence, menu)) {
      menu.status = "visited";
    }
  }

  return evidence;
}

function computeEvidenceMetrics(evidence) {
  markVisitedMenus(evidence);

  const menus = evidence.menuMap || [];
  const coreMenus = menus.filter(
    (item) =>
      item.coreCoverage !== false &&
      (item.url || item.openStrategy === "text-click") &&
      !isNoiseMenuItem(item) &&
      !isSystemShellMenu(item) &&
      isLeafMenu(item, menus),
  );
  const visitedCoreMenus = coreMenus.filter((item) => item.status === "visited");

  const pages = evidence.pageInventory || [];
  const corePages = pages.filter((item) => item.type !== "container");
  const pagesWithScreenshots = corePages.filter((item) => item.screenshot);

  const actions = evidence.actionInventory || [];
  const classifiedActions = actions.filter(
    (item) => item.function || item.flow || item.pendingItem || item.validated || item.type,
  );

  const writeActions = actions.filter((item) =>
    ["create", "edit", "submit", "approve", "delete", "publish", "overwrite"].includes(
      item.type,
    ),
  );
  const executedWrites = writeActions.filter((item) => item.executed === true);
  const safeWriteActions = executedWrites.filter(
    (item) => item.validationScope === "only-ai-test-data",
  );

  return {
    menuCoverage: ratioMetric(visitedCoreMenus.length, coreMenus.length),
    corePageScreenshotCoverage: ratioMetric(pagesWithScreenshots.length, corePages.length),
    coreFunctionClassificationCoverage: ratioMetric(
      classifiedActions.length,
      actions.length,
    ),
    writeOperationSafetyCompliance:
      executedWrites.length === 0
        ? 1
        : ratioMetric(safeWriteActions.length, executedWrites.length),
    unverifiedContentLabeling: evidence.unverifiedContentLabeling ?? 1,
    coreConclusionTraceability: evidence.coreConclusionTraceability ?? 1,
    counts: {
      menus: menus.length,
      coreMenus: coreMenus.length,
      visitedMenus: visitedCoreMenus.length,
      pages: pages.length,
      actions: actions.length,
      tables: (evidence.tableInventory || []).length,
    },
  };
}

function ratioMetric(numerator, denominator) {
  if (!denominator) return 1;
  return numerator / denominator;
}

function buildQualityReport(input) {
  const metrics = {
    menuCoverage: Number(input.menuCoverage ?? 0),
    corePageScreenshotCoverage: Number(input.corePageScreenshotCoverage ?? 0),
    coreFunctionClassificationCoverage: Number(
      input.coreFunctionClassificationCoverage ?? 0,
    ),
    writeOperationSafetyCompliance: Number(
      input.writeOperationSafetyCompliance ?? 0,
    ),
    unverifiedContentLabeling: Number(input.unverifiedContentLabeling ?? 0),
    coreConclusionTraceability: Number(input.coreConclusionTraceability ?? 0),
  };

  const failures = [];

  for (const [key, threshold] of Object.entries(DEFAULT_THRESHOLDS)) {
    if (metrics[key] < threshold) {
      failures.push(`${key} ${metrics[key]} is below ${threshold}`);
    }
  }

  const p0Items = (input.blockedItems || []).filter(
    (item) => item.severity === "P0",
  );
  for (const item of p0Items) {
    failures.push(`P0 blocker: ${item.reason || item.function || "unknown"}`);
  }

  return {
    ...metrics,
    failures,
    blockingIssues: p0Items,
    canFinalize: failures.length === 0,
  };
}

function parseSystemsConfig(text) {
  const lines = String(text || "").split(/\r?\n/);
  const config = {
    auth: {},
    runtime: {},
    systems: [],
  };

  let section = null;
  let currentSystem = null;
  let nestedKey = null;
  let runtimeNestedKey = null;
  let arrayKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const indent = rawLine.match(/^\s*/)[0].length;

    const sectionMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      currentSystem = null;
      nestedKey = null;
      runtimeNestedKey = null;
      arrayKey = null;
      continue;
    }

    const systemMatch = line.match(/^\s*-\s+code:\s*(.+)\s*$/);
    if (section === "systems" && systemMatch) {
      currentSystem = { code: parseYamlScalar(systemMatch[1]) };
      config.systems.push(currentSystem);
      nestedKey = null;
      arrayKey = null;
      continue;
    }

    const arrayItemMatch = line.match(/^\s*-\s+(.+)\s*$/);
    if (section === "systems" && currentSystem && arrayItemMatch && arrayKey) {
      const target = nestedKey ? currentSystem[nestedKey] : currentSystem;
      if (!Array.isArray(target[arrayKey])) target[arrayKey] = [];
      target[arrayKey].push(parseYamlScalar(arrayItemMatch[1]));
      continue;
    }

    const keyValueMatch = line.match(/^\s+([\u4e00-\u9fffA-Za-z0-9_-]+):\s*(.*)\s*$/);
    if (!keyValueMatch) continue;

    const key = keyValueMatch[1];
    const rawValue = keyValueMatch[2];
    const value = parseYamlScalar(rawValue);

    if (section === "auth") {
      config.auth[key] = value;
    } else if (section === "runtime") {
      if (!rawValue.trim()) {
        config.runtime[key] = {};
        runtimeNestedKey = key;
        arrayKey = null;
      } else if (runtimeNestedKey && indent > 2) {
        config.runtime[runtimeNestedKey][key] = value;
        arrayKey = null;
      } else {
        config.runtime[key] = value;
        runtimeNestedKey = null;
        arrayKey = null;
      }
    } else if (section === "systems" && currentSystem) {
      if (!rawValue.trim()) {
        if (indent <= 4) {
          if (["allowedWriteActions", "forbiddenActions"].includes(key)) {
            currentSystem[key] = [];
            nestedKey = null;
            arrayKey = key;
          } else {
            currentSystem[key] = {};
            nestedKey = key;
            arrayKey = null;
          }
        } else if (nestedKey) {
          currentSystem[nestedKey][key] = [];
          arrayKey = key;
        } else {
          currentSystem[key] = [];
          arrayKey = key;
        }
      } else if (nestedKey && indent > 4) {
        currentSystem[nestedKey][key] = value;
        arrayKey = null;
      } else {
        currentSystem[key] = value;
        nestedKey = null;
        arrayKey = null;
      }
    }
  }

  return config;
}

function parseYamlScalar(value) {
  const trimmed = String(value || "").trim().replace(/^["']|["']$/g, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function createInitialEvidence(system) {
  return {
    systemInfo: {
      code: system.code,
      name: system.name,
      testUrl: system.url,
      loginRole: "全权限测试账号",
      collectedAt: new Date().toISOString(),
      environment: "hosts 指向测试环境",
      businessPositioning: "",
      users: "",
      capabilities: [],
    },
    menuMap: [],
    pageInventory: [],
    actionInventory: [],
    formInventory: [],
    tableInventory: [],
    flowResults: [],
    modules: [],
    functions: [],
    screenshotIndex: [],
    testDataLedger: [],
    blockedItems: [
      {
        severity: "P0",
        reason: "尚未执行 Playwright 页面探索",
        suggestedAction: "实现或运行浏览器采集后复查",
        resolved: false,
      },
    ],
    failedPages: [],
  };
}

function findInstalledBrowser(options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const candidates =
    options.candidates ||
    [
      process.env.CHROME_PATH,
      process.env.EDGE_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || "";
}

/** 财务中台 getMenuList 等接口：根级数组或 { data: [...] }，节点字段 name / url / children。 */
function normalizeMenuApiPayload(payload) {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current == null) return null;
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return null;
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return null;
      }
    }
    if (Array.isArray(current)) return current;
    if (typeof current !== "object") return current;

    let found = false;
    for (const key of ["data", "result", "body", "menuList", "menus", "list", "rows"]) {
      const candidate = current[key];
      if (Array.isArray(candidate)) {
        current = candidate;
        found = true;
        break;
      }
      if (candidate && typeof candidate === "object" && Array.isArray(candidate.list)) {
        current = candidate.list;
        found = true;
        break;
      }
    }
    if (!found) return current;
  }
  return current;
}

function extractMenuItems(payload) {
  const result = [];
  const seen = new Set();
  const root = normalizeMenuApiPayload(payload);

  function visit(value, ancestors = []) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, ancestors);
      return;
    }
    if (typeof value !== "object") return;

    const title = String(
      value.menuName ||
        value.name ||
        value.title ||
        value.label ||
        value.text ||
        value.menuTitle ||
        "",
    ).trim();
    const path = String(
      value.path ||
        value.url ||
        value.route ||
        value.routePath ||
        value.menuUrl ||
        value.href ||
        "",
    ).trim();

    const menuPath = [...ancestors, title].filter(Boolean).join(" > ");

    if (title) {
      const key = `${menuPath}|${path}`;
      if (!seen.has(key)) {
        result.push({ title, path, menuPath });
        seen.add(key);
      }
    }

    const childAncestors = title ? [...ancestors, title] : ancestors;
    for (const key of ["children", "childList", "menus", "menuList", "list", "rows"]) {
      if (value[key]) visit(value[key], childAncestors);
    }
  }

  visit(root);
  return result;
}

function parseMenuApiResponse(rawText) {
  let payload = null;
  const text = String(rawText || "").trim();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (payload && typeof payload === "object" && typeof payload.data === "string") {
    try {
      const inner = JSON.parse(payload.data);
      payload = { ...payload, data: inner };
    } catch {
      // keep original payload
    }
  }
  const menus = extractMenuItems(payload);
  return { payload, menus, menuCount: menus.length };
}

function menuApiPayloadHasMenus(payloadOrRawText) {
  if (typeof payloadOrRawText === "string") {
    return parseMenuApiResponse(payloadOrRawText).menuCount > 0;
  }
  return extractMenuItems(payloadOrRawText).length > 0;
}

async function validateExpectedHostResolution(system, resolver = resolveHostIps) {
  const expectedHost = system.expectedHost || {};
  const hostname = expectedHost.hostname || hostnameFromUrl(system.url);
  const allowedIps = expectedHost.allowedIps || [];

  if (!hostname || !allowedIps.length) {
    return {
      allowed: false,
      hostname,
      resolvedIps: [],
      allowedIps,
      reason: "未配置测试环境 IP 白名单，禁止自动采集",
    };
  }

  const resolvedIps = await resolver(hostname);
  const matched = resolvedIps.some((ip) => allowedIps.includes(ip));

  return {
    allowed: matched,
    hostname,
    resolvedIps,
    allowedIps,
    reason: matched
      ? "域名解析命中测试环境 IP 白名单"
      : `当前解析 IP 不在测试环境 IP 白名单：${resolvedIps.join(", ") || "无解析结果"}`,
  };
}

async function resolveHostIps(hostname) {
  const results = await dns.lookup(hostname, { all: true });
  return Array.from(new Set(results.map((item) => item.address)));
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function shouldVisitUrl(candidateUrl, baseUrl) {
  if (!candidateUrl) return false;
  if (/^(javascript|mailto|tel|data):/i.test(candidateUrl)) return false;

  try {
    const base = new URL(baseUrl);
    const candidate = new URL(candidateUrl, base);
    if (!/^https?:$/.test(candidate.protocol)) return false;
    if (candidate.origin !== base.origin) return false;
    return true;
  } catch {
    return false;
  }
}

function isSafeExplorationClick(candidate) {
  const text = String(candidate.text || "").trim();
  const role = String(candidate.role || "").toLowerCase();
  const ariaExpanded = candidate.ariaExpanded;
  const highImpact = /删除|移除|提交|审批|通过|驳回|发布|启用|禁用|覆盖|结算|发送|确认|保存|导入|导出|清空|重置/.test(
    text,
  );

  if (!text && !ariaExpanded) return false;
  if (highImpact) return false;

  const expandable = ariaExpanded === "false" || ariaExpanded === false;
  const menuLike = /menu|tree|tab|navigation/.test(role);
  const explicitExpand = /展开|更多|菜单|目录/.test(text);

  return Boolean(expandable && (menuLike || explicitExpand || role === "button"));
}

function isSafeInspectionClick(candidate) {
  const text = String(candidate.text || "").trim();
  const highImpact = /删除|移除|提交|审批|通过|驳回|发布|启用|禁用|覆盖|结算|发送|确认删除|保存|清空|重置/.test(
    text,
  );
  const inspection = /新增|新建|创建|查看|详情|高级查询|筛选|过滤|更多/.test(text);

  return Boolean(text && inspection && !highImpact);
}

function normalizeUrl(candidateUrl, baseUrl) {
  const url = new URL(candidateUrl, baseUrl);
  url.hash = "";
  return url.toString();
}

const DEFAULT_EVIDENCE_SCROLL = {
  enabled: true,
  maxVerticalSteps: 5,
  maxHorizontalSteps: 4,
  nestedDepth: 2,
  maxTotalSteps: 30,
  stepDelayMs: 120,
};

const FAST_EVIDENCE_SCROLL = {
  enabled: true,
  maxVerticalSteps: 2,
  maxHorizontalSteps: 2,
  nestedDepth: 1,
  maxTotalSteps: 12,
  stepDelayMs: 60,
};

function resolveCollectProfileOptions(config, system = {}, cli = {}) {
  const profileName =
    system.collectProfile ||
    config?.runtime?.evidenceProfile ||
    (cli.fastCollect ? "fast" : "standard");
  const fast =
    profileName === "fast" ||
    config?.runtime?.fastCollect === true ||
    cli.fastCollect === true;
  const numberOr = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const maxPages = numberOr(
    system.collectMaxPages || config?.runtime?.collectMaxPages,
    fast ? 15 : 30,
  );
  return {
    profileName: fast ? "fast" : "standard",
    fastCollect: fast,
    maxPages,
    skipSeparateInspect:
      fast && config?.runtime?.skipSeparateInspect !== false,
    maxContainerInspections: fast ? 3 : 6,
    fastNavigation: fast,
    viewportScreenshot: Boolean(config?.runtime?.viewportScreenshot),
    scrollOverrides: fast ? FAST_EVIDENCE_SCROLL : null,
  };
}

function resolveEvidenceScrollOptions(config, collectProfile = null) {
  const raw = config?.runtime?.evidenceScroll || {};
  const profileScroll = collectProfile?.scrollOverrides || {};
  const merged = { ...DEFAULT_EVIDENCE_SCROLL, ...profileScroll, ...raw };
  const enabled =
    merged.enabled === undefined || merged.enabled === ""
      ? DEFAULT_EVIDENCE_SCROLL.enabled
      : merged.enabled === true || merged.enabled === "true";
  const numberOr = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    enabled,
    maxVerticalSteps: numberOr(merged.maxVerticalSteps, DEFAULT_EVIDENCE_SCROLL.maxVerticalSteps),
    maxHorizontalSteps: numberOr(
      merged.maxHorizontalSteps,
      DEFAULT_EVIDENCE_SCROLL.maxHorizontalSteps,
    ),
    nestedDepth: numberOr(merged.nestedDepth, DEFAULT_EVIDENCE_SCROLL.nestedDepth),
    maxTotalSteps: numberOr(merged.maxTotalSteps, DEFAULT_EVIDENCE_SCROLL.maxTotalSteps),
    stepDelayMs: numberOr(merged.stepDelayMs, DEFAULT_EVIDENCE_SCROLL.stepDelayMs),
  };
}

function fieldDedupeKey(field) {
  const label = String(field?.label || "").trim();
  const type = String(field?.type || "").trim();
  return `${label}|${type}`;
}

function tableDedupeKey(table) {
  return String(table?.tableName || "").trim() || "table";
}

function mergeTableRecords(existing, incoming) {
  const left = existing || { tableName: "", columns: [], rowCount: 0 };
  const right = incoming || { tableName: "", columns: [], rowCount: 0 };
  const columns = [];
  const seen = new Set();
  for (const value of [...(left.columns || []), ...(right.columns || [])]) {
    const column = String(value || "").replace(/\s+/g, " ").trim();
    if (!column || seen.has(column)) continue;
    seen.add(column);
    columns.push(column);
  }
  return {
    tableName: left.tableName || right.tableName || "table",
    columns: columns.slice(0, 80),
    rowCount: Math.max(Number(left.rowCount) || 0, Number(right.rowCount) || 0),
  };
}

function mergeFormRecords(existing, incoming) {
  const left = existing || { pageId: "", formName: "", fields: [] };
  const right = incoming || { pageId: "", formName: "", fields: [] };
  const fields = [];
  const seen = new Set();
  for (const field of [...(left.fields || []), ...(right.fields || [])]) {
    const key = fieldDedupeKey(field);
    if (!key || key === "|" || seen.has(key)) continue;
    seen.add(key);
    fields.push(field);
  }
  return {
    pageId: left.pageId || right.pageId || "page-home",
    formName: left.formName || right.formName || "form",
    fields,
  };
}

function mergeFrameSnapshots(snapshots) {
  const items = (snapshots || []).filter(Boolean);
  if (!items.length) {
    return {
      title: "",
      url: "",
      links: [],
      buttons: [],
      forms: [],
      tables: [],
      landmarks: [],
    };
  }

  const uniqueBy = (values, keyFn) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const key = keyFn(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  };

  const formsByName = new Map();
  for (const snapshot of items) {
    for (const form of snapshot.forms || []) {
      const formName = String(form.formName || "form").trim() || "form";
      const existing = formsByName.get(formName);
      formsByName.set(
        formName,
        existing
          ? mergeFormRecords(existing, { ...form, formName })
          : { ...form, formName, fields: [...(form.fields || [])] },
      );
    }
  }

  const tablesByKey = new Map();
  for (const snapshot of items) {
    for (const table of snapshot.tables || []) {
      const key = tableDedupeKey(table);
      const existing = tablesByKey.get(key);
      tablesByKey.set(key, existing ? mergeTableRecords(existing, table) : { ...table });
    }
  }

  const first = items[0];
  return {
    title: items.map((item) => item.title).find(Boolean) || first.title || "",
    url: items.map((item) => item.url).find(Boolean) || first.url || "",
    links: uniqueBy(
      items.flatMap((item) => item.links || []),
      (item) => `${item.text}|${item.href}`,
    ).slice(0, 500),
    buttons: Array.from(new Set(items.flatMap((item) => item.buttons || []))).slice(0, 400),
    forms: Array.from(formsByName.values())
      .filter((form) => (form.fields || []).length)
      .slice(0, 80),
    tables: Array.from(tablesByKey.values())
      .filter((table) => table.columns.length > 1 || table.rowCount)
      .filter((table) => table.columns.join("|") !== "操作")
      .slice(0, 40),
    landmarks: Array.from(new Set(items.flatMap((item) => item.landmarks || []))).slice(0, 80),
  };
}

function clearPageStructuredEvidence(evidence, pageId) {
  evidence.actionInventory = (evidence.actionInventory || []).filter(
    (item) => item.pageId !== pageId,
  );
  evidence.formInventory = (evidence.formInventory || []).filter(
    (item) => item.pageId !== pageId,
  );
  evidence.tableInventory = (evidence.tableInventory || []).filter(
    (item) => item.pageId !== pageId,
  );
}

function pruneResolvedFailedPages(evidence) {
  const failed = evidence.failedPages || [];
  const kept = failed.filter((item) => {
    const pathKey = String(item.path || item.title || "").trim();
    if (!pathKey) return true;
    const menu = { menuPath: pathKey, title: pathKey };
    return !menuHasCollectedScreenshot(evidence, menu);
  });
  const removed = failed.length - kept.length;
  evidence.failedPages = kept;
  return { removed, remaining: kept.length };
}

function selectMenusForEvidenceRefresh(menuMap, limit, evidence) {
  const menus = menuMap || [];
  return menus
    .filter((item) => isCollectibleMenu(item, menus))
    .filter((item) => menuHasCollectedScreenshot(evidence, item))
    .filter(
      (item, index, arr) =>
        arr.findIndex(
          (candidate) => normalizePageUrl(candidate.url) === normalizePageUrl(item.url),
        ) === index,
    )
    .slice(0, Math.max(0, limit));
}

function mergePageSnapshotIntoEvidence(evidence, snapshot) {
  const pageId = snapshot.id || `page-${evidence.pageInventory.length + 1}`;
  const pageRecord = (evidence.pageInventory || []).find((page) => page.id === pageId);
  const knownPage = Boolean(pageRecord);

  if (!knownPage) {
    evidence.pageInventory.push({
      id: pageId,
      menuPath: snapshot.menuPath || snapshot.title || snapshot.url,
      type: snapshot.type || "page",
      title: snapshot.title || "",
      url: snapshot.url || "",
      mainAreas: snapshot.landmarks || [],
      screenshot: snapshot.screenshot ? snapshot.screenshot.file : "",
      evidenceRefs: snapshot.screenshot ? [snapshot.screenshot.id] : [],
    });
  } else if (pageRecord) {
    pageRecord.title = snapshot.title || pageRecord.title;
    pageRecord.url = snapshot.url || pageRecord.url;
    pageRecord.menuPath = snapshot.menuPath || pageRecord.menuPath;
    pageRecord.mainAreas = snapshot.landmarks || pageRecord.mainAreas;
    if (snapshot.screenshot?.file) {
      pageRecord.screenshot = snapshot.screenshot.file;
      pageRecord.evidenceRefs = snapshot.screenshot.id
        ? [snapshot.screenshot.id]
        : pageRecord.evidenceRefs;
    }
  }

  for (const link of snapshot.links || []) {
    if (!link.text && !link.href) continue;
    const exists = evidence.menuMap.some(
      (item) => item.path === link.text && item.url === link.href,
    );
    if (!exists) {
      evidence.menuMap.push({
        path: link.text || link.href,
        title: link.text || link.href,
        url: link.href || "",
        status: "observed",
        coreCoverage: true,
        excludeReason: null,
      });
    }
  }

  for (const [index, button] of (snapshot.buttons || []).entries()) {
    const name = typeof button === "string" ? button : button.name;
    if (!name) continue;
    const exists = evidence.actionInventory.some(
      (item) => item.pageId === pageId && item.name === name,
    );
    if (exists) continue;
    evidence.actionInventory.push({
      pageId,
      name,
      type: classifyActionName(name),
      risk: classifyActionRisk(name),
      validated: false,
      pendingItem: true,
      evidenceRefs: [`${pageId}-action-${index + 1}`],
    });
  }

  for (const form of snapshot.forms || []) {
    const fieldKey = (form.fields || []).map((field) => field.label).join("|");
    const exists = evidence.formInventory.some(
      (item) =>
        item.pageId === pageId &&
        item.formName === (form.formName || `${pageId}-form`) &&
        (item.fields || []).map((field) => field.label).join("|") === fieldKey,
    );
    if (exists) continue;
    evidence.formInventory.push({
      pageId,
      formName: form.formName || `${pageId}-form`,
      fields: form.fields || [],
    });
  }

  for (const table of snapshot.tables || []) {
    const columns = table.columns || [];
    const exists = evidence.tableInventory.some(
      (item) =>
        item.pageId === pageId &&
        (item.columns || []).join("|") === columns.join("|"),
    );
    if (exists) continue;
    evidence.tableInventory.push({
      pageId,
      tableName: table.tableName || `${pageId}-table`,
      columns,
      rowCount: table.rowCount || 0,
    });
  }

  if (snapshot.screenshot) {
    const exists = evidence.screenshotIndex.some(
      (shot) => shot.id === snapshot.screenshot.id,
    );
    if (!exists) {
      evidence.screenshotIndex.push({
        id: snapshot.screenshot.id,
        file: snapshot.screenshot.file,
        module: snapshot.screenshot.module || snapshot.menuPath || "未归类",
        function: snapshot.screenshot.function || snapshot.title || "页面",
        step: snapshot.screenshot.step || "页面截图",
        caption: snapshot.screenshot.caption || `${snapshot.title || "页面"}截图。`,
        includeInWhitepaper: snapshot.screenshot.includeInWhitepaper !== false,
      });
    }
  }

  return evidence;
}

function mergeContainerSnapshotIntoEvidence(evidence, snapshot) {
  const containerId =
    snapshot.id || `container-${evidence.pageInventory.length + 1}`;

  evidence.pageInventory.push({
    id: containerId,
    menuPath: snapshot.title || snapshot.sourcePageId || "弹窗/抽屉",
    type: snapshot.type || "container",
    title: snapshot.title || "",
    url: snapshot.url || "",
    mainAreas: [snapshot.type || "container"],
    screenshot: snapshot.screenshot ? snapshot.screenshot.file : "",
    evidenceRefs: snapshot.screenshot ? [snapshot.screenshot.id] : [],
    sourcePageId: snapshot.sourcePageId || "",
  });

  for (const [index, button] of (snapshot.buttons || []).entries()) {
    const name = typeof button === "string" ? button : button.name;
    if (!name) continue;
    evidence.actionInventory.push({
      pageId: containerId,
      name,
      type: classifyActionName(name),
      risk: classifyActionRisk(name),
      validated: false,
      pendingItem: true,
      evidenceRefs: [`${containerId}-action-${index + 1}`],
    });
  }

  for (const form of snapshot.forms || []) {
    evidence.formInventory.push({
      pageId: containerId,
      formName: form.formName || `${containerId}-form`,
      fields: form.fields || [],
    });
  }

  for (const table of snapshot.tables || []) {
    evidence.tableInventory.push({
      pageId: containerId,
      tableName: table.tableName || `${containerId}-table`,
      columns: table.columns || [],
      rowCount: table.rowCount || 0,
    });
  }

  if (snapshot.screenshot) {
    evidence.screenshotIndex.push({
      id: snapshot.screenshot.id,
      file: snapshot.screenshot.file,
      module: snapshot.screenshot.module || "未归类",
      function: snapshot.screenshot.function || snapshot.title || "弹窗/抽屉",
      step: snapshot.screenshot.step || "容器截图",
      caption: snapshot.screenshot.caption || `${snapshot.title || "弹窗/抽屉"}截图。`,
      includeInWhitepaper: snapshot.screenshot.includeInWhitepaper !== false,
    });
  }

  return evidence;
}

function classifyActionName(text) {
  if (/删除/.test(text)) return "delete";
  if (/新增|创建|新建/.test(text)) return "create";
  if (/编辑|修改/.test(text)) return "edit";
  if (/提交/.test(text)) return "submit";
  if (/审批|通过|驳回/.test(text)) return "approve";
  if (/导入/.test(text)) return "import";
  if (/导出/.test(text)) return "export";
  return "action";
}

function classifyActionRisk(text) {
  return /删除|提交|审批|通过|驳回|发布|覆盖|结算|发送/.test(text)
    ? "high"
    : "normal";
}

const EVIDENCE_DERIVED_DISCLAIMER =
  "（依据菜单与页面采集归纳，非官方口径）";

const MODULE_ONE_LINERS = {
  基础管理: "维护币种、COA、账套、公司、期间及业务线/营收映射等财务主数据。",
  系统管理: "维护快码、LOV、数据权限、对账异常与制单人等系统参数。",
  JOB管理: "配置与查看定时任务（JOB）及执行记录。",
  会计引擎配置: "配置会计事件、映射/比较/筛选规则与会计规则组。",
  凭证管理: "查询明细/汇总凭证，并提供创建账务入口。",
  签单数据: "查询签单、续年签单及加保/续保保费等业务签单台账。",
  预收数据: "查询收款、代收代扣及异常单等预收相关台账。",
  保费結算: "查询保费结算表与保费付款表。",
  手续费结算: "查询手续费结算、收款及拆分台账。",
  服务费: "查询服务费明细、复盘、调整与付款台账。",
  活动费: "查询活动费明细与结算台账。",
  数据工作台: "执行数据检查与数据补偿（文件选择）操作。",
  报表平台: "维护报表组/报表配置，并按条件运行与下载报表。",
  其它数据: "查询定制方案收入与通用表等其它入账数据。",
};

const DATA_LEDGER_MODULES = new Set([
  "签单数据",
  "预收数据",
  "保费結算",
  "手续费结算",
  "服务费",
  "活动费",
  "其它数据",
]);

function truncateFieldList(values, maxItems = 8) {
  const list = uniqueStrings(values);
  if (!list.length) return "";
  if (list.length <= maxItems) return list.join("、");
  return `${list.slice(0, maxItems).join("、")}等（共 ${list.length} 项）`;
}

function isContainerPage(page) {
  return page?.type === "container";
}

function isCollectiblePageForWhitepaper(page) {
  if (!page || page.type === "home" || isContainerPage(page)) return false;
  const menuPath = String(page.menuPath || page.title || "");
  if (!menuPath.includes(">")) return false;
  if (/^(取\s*消|保\s*存|提\s*交)/.test(menuPath.replace(/\s/g, ""))) return false;
  return true;
}

function describeFunctionPage(moduleName, functionName, actions) {
  const opSummary = actions.length ? actions.join("、") : "以页面可见操作为准";
  if (DATA_LEDGER_MODULES.has(moduleName)) {
    return `${functionName}用于按公司与时间等条件查询${moduleName}业务台账，支持${opSummary}；本轮为只读采证，未执行写入或作废。`;
  }
  if (moduleName === "报表平台" && functionName === "报表生成") {
    return `按报表组/名称与时间筛选报表运行记录，支持${opSummary}；本轮仅记录操作入口。`;
  }
  if (moduleName === "基础管理" || moduleName === "系统管理" || moduleName === "会计引擎配置") {
    return `维护或查询${functionName}相关配置/主数据，页面可见操作包括${opSummary}；本轮为只读采证。`;
  }
  if (moduleName === "凭证管理") {
    return `查询或处理${functionName}相关凭证信息，页面可见操作包括${opSummary}；涉及创建账务等写操作仅记录弹窗入口。`;
  }
  if (moduleName === "JOB管理") {
    return `${functionName}用于维护后台任务或查看执行记录，页面可见操作包括${opSummary}。`;
  }
  if (moduleName === "数据工作台") {
    return `${functionName}用于数据质量检查或补偿处理，页面可见操作包括${opSummary}。`;
  }
  return `${functionName}页面提供${opSummary}等能力；本轮为只读采证。`;
}

function inferSystemOverviewFromEvidence(evidence) {
  const modules = deriveModulesFromMenuMap(evidence);
  const moduleNames = modules.map((item) => item.name).filter(Boolean);

  return {
    businessPositioning: `财务中台（测试环境 ${evidence.systemInfo?.testUrl || ""}）承载保险/金服业务财务核算相关能力：从主数据与会计引擎配置，到凭证与签单/预收/结算/服务费/活动费等业务台账，并辅以数据工作台质量检查及报表平台输出。${EVIDENCE_DERIVED_DISCLAIMER}`,
    users: `财务运营与核算人员、业务数据核对人员、报表使用人员，以及负责主数据/引擎/系统参数配置的管理员。${EVIDENCE_DERIVED_DISCLAIMER}`,
    capabilities: moduleNames.map(
      (name) => `${name}：${MODULE_ONE_LINERS[name] || "见 §2/§3 菜单页说明。"}`,
    ),
  };
}

function findPageByMenuPath(evidence, menuPath) {
  return (evidence.pageInventory || []).find(
    (page) => page.menuPath === menuPath && isCollectiblePageForWhitepaper(page),
  );
}

function resolveFlowScreenshot(evidence, page) {
  if (!page) return null;
  const screenshotMap = new Map(
    (evidence.screenshotIndex || []).map((shot) => [shot.id, shot]),
  );
  for (const ref of page.evidenceRefs || []) {
    const shot = screenshotMap.get(ref);
    if (shot?.file) {
      return { file: shot.file, caption: shot.caption || page.menuPath };
    }
  }
  if (page.screenshot) {
    return {
      file: page.screenshot,
      caption: `${page.menuPath || page.title || "页面"} 菜单页面截图。`,
    };
  }
  return null;
}

function inferTypicalFlowsFromEvidence(evidence) {
  const flows = [
    {
      name: "主数据映射查询与导出",
      menuPath: "基础管理 > 业务线映射表",
      purpose: "核对平台/业务线等映射关系并导出备查。",
      steps: [
        "进入「基础管理 > 业务线映射表」。",
        "在查询区选择平台、映射类型，填写映射源 ID 或业务线等条件。",
        "点击「查询」刷新列表，必要时「重置」清空条件。",
        "确认结果后使用「导出」下载（本轮未实际点击导出）。",
      ],
    },
    {
      name: "签单业务台账查询与导出",
      menuPath: "签单数据 > 签单表",
      purpose: "按公司与时间范围查询签单入账数据并导出。",
      steps: [
        "进入「签单数据 > 签单表」。",
        "设置所属公司、开始/结束时间等查询条件。",
        "点击「查询」查看签单列表，可「展开」查看更多筛选。",
        "使用「导出」或「批量导出」获取数据（本轮仅记录按钮入口）。",
      ],
    },
    {
      name: "报表运行记录查询与下载",
      menuPath: "报表平台 > 报表生成",
      purpose: "查看报表任务执行状态并下载已生成报表。",
      steps: [
        "进入「报表平台 > 报表生成」。",
        "按报表组、报表名称、时间范围、提交人等条件「查询」。",
        "在列表中查看生成模式、状态与执行摘要。",
        "对已完成任务使用「下载报表」（「运行报表」入口已采集，本轮未触发运行）。",
      ],
    },
  ];

  return flows
    .map((flow) => {
      const page = findPageByMenuPath(evidence, flow.menuPath);
      if (!page) return null;
      const actions = uniqueStrings(
        (evidence.actionInventory || [])
          .filter((action) => action.pageId === page.id)
          .map((action) => action.name),
      );
      if (!actions.some((name) => /查询/.test(name))) return null;
      const screenshot = resolveFlowScreenshot(evidence, page);
      return {
        name: flow.name,
        purpose: flow.purpose,
        scope: `只读验证：${flow.menuPath}（可见操作：${actions.join("、")}）`,
        steps: flow.steps,
        screenshotFile: screenshot?.file || "",
        screenshotCaption: screenshot?.caption || "",
        validationNote:
          "流程由菜单页与按钮采证归纳，未执行新增/运行/作废等写操作；涉及导出/下载仅记录入口。",
      };
    })
    .filter(Boolean);
}

function renderWhitepaper(evidence) {
  const inferredOverview = inferSystemOverviewFromEvidence(evidence);
  const systemInfo = {
    ...(evidence.systemInfo || {}),
    businessPositioning:
      evidence.systemInfo?.businessPositioning || inferredOverview.businessPositioning,
    users: evidence.systemInfo?.users || inferredOverview.users,
    capabilities: (evidence.systemInfo?.capabilities || []).length
      ? evidence.systemInfo.capabilities
      : inferredOverview.capabilities,
  };
  const derivedModules = deriveModulesFromMenuMap(evidence);
  const modules = (evidence.modules || []).length
    ? evidence.modules
    : derivedModules.length
      ? derivedModules
      : deriveModulesFromPageInventory(evidence);
  const functions = (evidence.functions || []).length
    ? evidence.functions
    : deriveFunctionsFromEvidence(evidence);
  const screenshotMap = new Map(
    (evidence.screenshotIndex || []).map((shot) => [shot.id, shot]),
  );

  const lines = [];

  lines.push(`# ${systemInfo.name || "[系统名称]"} 系统功能白皮书`);
  lines.push("");
  lines.push("## 1. 系统概览");
  lines.push("");
  lines.push(`**系统名称**：${systemInfo.name || ""}  `);
  lines.push(`**测试环境地址**：${systemInfo.testUrl || ""}  `);
  lines.push(`**采集时间**：${systemInfo.collectedAt || ""}  `);
  lines.push(`**登录视角**：${systemInfo.loginRole || ""}  `);
  lines.push("");
  lines.push(`**业务定位**：${systemInfo.businessPositioning || "待补充"}`);
  lines.push("");
  lines.push(`**主要使用对象**：${systemInfo.users || "待确认"}`);
  lines.push("");
  lines.push("**核心能力摘要**");
  lines.push("");
  for (const capability of systemInfo.capabilities || []) {
    lines.push(`- ${capability}`);
  }
  if (!(systemInfo.capabilities || []).length) {
    lines.push(`- 待根据证据包补充 ${EVIDENCE_DERIVED_DISCLAIMER}`);
  }

  lines.push("");
  lines.push("## 2. 功能模块概览");
  lines.push("");
  lines.push("| 模块 | 入口 | 一句话说明 |");
  lines.push("| --- | --- | --- |");
  for (const moduleItem of modules) {
    lines.push(
      `| ${moduleItem.name || ""} | ${moduleItem.entry || ""} | ${moduleItem.summary || ""} |`,
    );
  }

  lines.push("");
  lines.push("## 3. 核心功能说明");
  lines.push("");
  const functionsByModule = groupBy(functions, "module");
  const moduleScreenshotShown = new Set();
  for (const [moduleName, functions] of functionsByModule.entries()) {
    lines.push(`### ${moduleName}`);
    lines.push("");
    for (const fn of functions) {
      lines.push(`#### ${fn.name}`);
      lines.push("");
      lines.push(`**页面入口**：${fn.entry || ""}  `);
      lines.push(`**功能说明**：${fn.description || ""}  `);
      lines.push(`**主要操作**：${fn.operations || ""}  `);
      if (fn.keyFields) {
        lines.push(`**核心字段**：${fn.keyFields}  `);
      }
      if (fn.commonQueries) {
        lines.push(`**常见查询**：${fn.commonQueries}  `);
      }
      lines.push("");

      const pageRecord = (evidence.pageInventory || []).find(
        (page) =>
          splitMenuPath(page.menuPath || "")[0] === fn.module &&
          splitMenuPath(page.menuPath || "").slice(-1)[0] === fn.name,
      );
      const shots = (fn.screenshotRefs || [])
        .map((id) => screenshotMap.get(id))
        .filter(Boolean)
        .filter((shot) => shot.includeInWhitepaper !== false)
        .slice(0, 1);
      const fallbackShot = resolveFlowScreenshot(evidence, pageRecord);
      const showModuleScreenshot = !moduleScreenshotShown.has(moduleName);
      if (showModuleScreenshot && (shots.length || fallbackShot?.file)) {
        moduleScreenshotShown.add(moduleName);
        lines.push("**关键截图**  ");
        if (shots.length) {
          for (const shot of shots) {
            lines.push(`![${shot.caption || shot.file}](${shot.file})`);
          }
        } else if (fallbackShot?.file) {
          lines.push(`![${fallbackShot.caption}](${fallbackShot.file})`);
        }
        lines.push("");
      }
      if (fn.validationNote) {
        lines.push(`**验证说明**：${fn.validationNote}`);
        lines.push("");
      }
      if (fn.pendingItem) {
        lines.push(`**待确认项**：${fn.pendingItem}`);
        lines.push("");
      }
    }
  }

  lines.push("## 4. 典型业务流程");
  lines.push("");
  const flows =
    (evidence.flows || []).length > 0
      ? evidence.flows
      : (evidence.flowResults || []).length > 0
        ? evidence.flowResults
        : inferTypicalFlowsFromEvidence(evidence);
  for (const flow of flows) {
    lines.push(`### ${flow.name}`);
    lines.push("");
    if (flow.purpose) lines.push(`**核心用途**：${flow.purpose}  `);
    if (flow.scope) lines.push(`**验证范围**：${flow.scope}  `);
    lines.push("");
    for (const [index, step] of (flow.steps || []).entries()) {
      lines.push(`${index + 1}. ${step}`);
    }
    const flowScreenshotFile = flow.screenshotFile || "";
    const flowScreenshotCaption = flow.screenshotCaption || flowScreenshotFile;
    const flowShots = (flow.screenshotRefs || [])
      .map((id) => screenshotMap.get(id))
      .filter(Boolean)
      .filter((shot) => shot.includeInWhitepaper !== false);
    if (flowScreenshotFile || flowShots.length) {
      lines.push("");
      lines.push("**流程截图**  ");
      if (flowScreenshotFile) {
        lines.push(`![${flowScreenshotCaption}](${flowScreenshotFile})`);
      }
      for (const shot of flowShots) {
        if (shot.file === flowScreenshotFile) continue;
        lines.push(`![${shot.caption || shot.file}](${shot.file})`);
      }
    }
    if (flow.validationNote) {
      lines.push("");
      lines.push(`**验证说明**：${flow.validationNote}`);
    }
    lines.push("");
  }

  lines.push("## 5. 角色与权限简述");
  lines.push("");
  lines.push(`**当前登录角色**：${systemInfo.loginRole || "待确认"}  `);
  lines.push(`**可见模块**：${modules.map((item) => item.name).filter(Boolean).join("、")}  `);
  lines.push(`**关键权限**：${evidence.permissionSummary || "基于当前登录视角观察，待按证据包补充。"}  `);
  lines.push("");

  lines.push("## 6. 待确认事项");
  lines.push("");
  lines.push("| 类型 | 模块/功能 | 待确认内容 | 原因 | 建议处理 |");
  lines.push("| --- | --- | --- | --- | --- |");
  const pendingItems = [
    ...(evidence.pendingItems || []),
    ...derivePendingFromMenuGaps(evidence),
    ...(evidence.blockedItems || []).map((item) => ({
      type: item.severity || "阻断",
      module: "",
      function: "",
      content: item.reason || "",
      reason: item.reason || "",
      suggestedAction: item.suggestedAction || "",
    })),
  ];
  if (pendingItems.length) {
    for (const item of pendingItems) {
      lines.push(
        `| ${item.type || "待确认"} | ${item.module || ""}${item.function ? `/${item.function}` : ""} | ${item.content || item.reason || ""} | ${item.reason || ""} | ${item.suggestedAction || ""} |`,
      );
    }
  } else {
    lines.push("| — | — | 本轮采集无待确认项 | — | — |");
  }

  lines.push("");
  lines.push("## 7. 附录：采集证据索引");
  lines.push("");
  lines.push("### 7.1 代表性截图清单");
  lines.push("");
  lines.push("| 截图 | 对应模块/功能 | 说明 |");
  lines.push("| --- | --- | --- |");
  for (const shot of evidence.screenshotIndex || []) {
    lines.push(
      `| ${shot.file || ""} | ${[shot.module, shot.function].filter(Boolean).join("/")} | ${shot.caption || ""} |`,
    );
  }

  lines.push("");
  lines.push("### 7.2 自动化操作日志");
  lines.push("");
  lines.push(`- 日志位置：${evidence.operationLogPath || "operation-log.jsonl"}`);
  lines.push("");
  lines.push("### 7.3 测试数据清单");
  lines.push("");
  lines.push("| 数据名称 | 类型 | 用途 | 创建时间 | 清理状态 |");
  lines.push("| --- | --- | --- | --- | --- |");
  const ledger = evidence.testDataLedger || [];
  if (ledger.length) {
    for (const item of ledger) {
      lines.push(
        `| ${item.name || ""} | ${item.type || ""} | ${item.purpose || ""} | ${item.createdAt || ""} | ${item.cleanupStatus || ""} |`,
      );
    }
  } else {
    lines.push("| — | — | 本轮未创建 AI_AUTO_TEST_ 测试数据 | — | — |");
  }

  lines.push("");
  lines.push("### 7.4 未访问成功页面清单");
  lines.push("");
  lines.push("| 页面/菜单 | 失败原因 | 分级 | 处理结果 |");
  lines.push("| --- | --- | --- | --- |");
  const failedPages = evidence.failedPages || [];
  if (failedPages.length) {
    for (const page of failedPages) {
      lines.push(
        `| ${page.path || page.title || ""} | ${page.reason || ""} | ${page.severity || ""} | ${page.action || ""} |`,
      );
    }
  } else {
    lines.push("| — | — | 无失败页 | — | — |");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function menuPageHasContainerEvidence(evidence, pageId) {
  return (evidence.pageInventory || []).some(
    (page) =>
      page.type === "container" &&
      page.sourcePageId === pageId &&
      Boolean(String(page.screenshot || "").trim()),
  );
}

function derivePendingFromMenuGaps(evidence) {
  const menus = evidence.menuMap || [];
  return menus
    .filter(
      (menu) =>
        isCollectibleMenu(menu, menus) &&
        menu.coreCoverage !== false &&
        menu.status !== "visited",
    )
    .slice(0, 40)
    .map((menu) => {
      const parts = splitMenuPath(menu.menuPath || menu.title || "");
      return {
        type: "待采集",
        module: parts[0] || "",
        function: parts[parts.length - 1] || menu.title || "",
        content: `菜单「${menu.menuPath || menu.title}」尚未采集页面证据`,
        reason: menu.excludeReason || "未纳入本轮采集范围",
        suggestedAction: "扩大 --max-pages 后复跑该菜单",
      };
    });
}

function deriveModulesFromMenuMap(evidence) {
  const menus = evidence.menuMap || [];
  const moduleNames = new Set();

  for (const menu of menus) {
    const parts = splitMenuPath(menu.menuPath || menu.title || "");
    if (parts.length > 1) {
      moduleNames.add(parts[0]);
    }
  }

  return Array.from(moduleNames).map((moduleName) => {
    const childMenus = menus.filter((item) => {
      const itemParts = splitMenuPath(item.menuPath || item.title || "");
      return itemParts[0] === moduleName && isCollectibleMenu(item, menus);
    });
    const visitedCount = childMenus.filter((item) => item.status === "visited").length;

    return {
      name: moduleName,
      entry: moduleName,
      summary:
        MODULE_ONE_LINERS[moduleName] ||
        `共 ${childMenus.length} 个菜单页，已采集 ${visitedCount} 个。`,
    };
  });
}

function deriveModulesFromPageInventory(evidence) {
  const modules = new Map();
  for (const page of evidence.pageInventory || []) {
    const parts = splitMenuPath(page.menuPath || page.title || "未归类");
    const moduleName = parts[0] || page.title || "未归类";
    if (!modules.has(moduleName)) {
      modules.set(moduleName, {
        name: moduleName,
        entry: page.menuPath || page.url || "",
        summary: "基于自动化页面采集生成，待业务侧确认。",
      });
    }
  }
  return Array.from(modules.values());
}

function deriveFunctionsFromEvidence(evidence) {
  return (evidence.pageInventory || [])
    .filter((page) => isCollectiblePageForWhitepaper(page))
    .map((page) => {
      const parts = splitMenuPath(page.menuPath || page.title || "未归类");
      const moduleName = parts[0] || "未归类";
      const functionName = parts[parts.length - 1] || page.title || "页面功能";
      const actions = uniqueStrings(
        (evidence.actionInventory || [])
          .filter((action) => action.pageId === page.id)
          .map((action) => action.name),
      );
      const queryFields = uniqueStrings(
        (evidence.formInventory || [])
          .filter((form) => form.pageId === page.id)
          .flatMap((form) => (form.fields || []).map((field) => field.label))
          .filter((label) => !isTechnicalFieldLabel(label) && !isGenericFieldLabel(label)),
      );
      const tableColumns = uniqueStrings(
        (evidence.tableInventory || [])
          .filter((table) => table.pageId === page.id)
          .flatMap((table) => table.columns || []),
      );
      const containerNote = menuPageHasContainerEvidence(evidence, page.id)
        ? "；已采集关联弹窗/抽屉截图（见附录）。"
        : "";

      return {
        module: moduleName,
        name: functionName,
        entry: page.menuPath || page.url || "",
        description: describeFunctionPage(moduleName, functionName, actions),
        operations: actions.length ? actions.join("、") : "以页面可见操作为准",
        keyFields: truncateFieldList(tableColumns),
        commonQueries: truncateFieldList(queryFields, 6),
        screenshotRefs: (page.evidenceRefs || []).slice(0, 1),
        validationNote: `由自动化页面采集生成，涉及新增、编辑、删除等动作时仅记录入口，不直接操作系统已有数据${containerNote}`,
      };
    });
}

function buildEvidenceSummary(evidence) {
  const screenshotMap = new Map(
    (evidence.screenshotIndex || []).map((shot) => [shot.id, shot]),
  );
  const metrics = computeEvidenceMetrics(evidence);
  const modules = deriveModulesFromMenuMap(evidence);
  const functions = (evidence.pageInventory || [])
    .filter((page) => isCollectiblePageForWhitepaper(page))
    .map((page) => {
      const parts = splitMenuPath(page.menuPath || page.title || "未归类");
      const moduleName = parts[0] || "未归类";
      const functionName = parts[parts.length - 1] || page.title || "页面功能";
      const actions = uniqueStrings(
        (evidence.actionInventory || [])
          .filter((action) => action.pageId === page.id)
          .map((action) => action.name),
      );
      const queryFields = uniqueStrings(
        (evidence.formInventory || [])
          .filter((form) => form.pageId === page.id)
          .flatMap((form) => (form.fields || []).map((field) => field.label))
          .filter((label) => !isTechnicalFieldLabel(label) && !isGenericFieldLabel(label)),
      );
      const tableColumns = uniqueStrings(
        (evidence.tableInventory || [])
          .filter((table) => table.pageId === page.id)
          .flatMap((table) => table.columns || []),
      );
      const screenshots = (page.evidenceRefs || [])
        .map((id) => screenshotMap.get(id))
        .filter(Boolean)
        .map((shot) => ({
          id: shot.id,
          file: shot.file,
          caption: shot.caption || "",
        }));

      return {
        id: page.id,
        module: moduleName,
        name: functionName,
        menuPath: page.menuPath || "",
        title: page.title || functionName,
        url: page.url || "",
        actions,
        queryFields: queryFields.slice(0, 12),
        tableColumns: tableColumns.slice(0, 20),
        screenshots,
        hasContainerEvidence: menuPageHasContainerEvidence(evidence, page.id),
      };
    });

  const containers = (evidence.pageInventory || [])
    .filter((page) => isContainerPage(page))
    .map((page) => {
      const actions = uniqueStrings(
        (evidence.actionInventory || [])
          .filter((action) => action.pageId === page.id)
          .map((action) => action.name),
      );
      const fields = uniqueStrings(
        (evidence.formInventory || [])
          .filter((form) => form.pageId === page.id)
          .flatMap((form) => (form.fields || []).map((field) => field.label)),
      );
      return {
        id: page.id,
        sourcePageId: page.sourcePageId || "",
        title: page.title || "弹窗/抽屉",
        actions,
        fields: fields.slice(0, 20),
      };
    });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    guidance: "Use docs/narrative-guide.md. Treat whitepaper.draft.md as factual draft only.",
    system: {
      code: evidence.systemInfo?.code || "",
      name: evidence.systemInfo?.name || "",
      testUrl: evidence.systemInfo?.testUrl || "",
      loginRole: evidence.systemInfo?.loginRole || "",
      collectedAt: evidence.systemInfo?.collectedAt || "",
    },
    metrics,
    modules: modules.map((moduleItem) => ({
      name: moduleItem.name,
      entry: moduleItem.entry,
      summary: moduleItem.summary,
    })),
    functions,
    containers,
    pendingItems: evidence.pendingItems || [],
    failedPages: evidence.failedPages || [],
    screenshots: (evidence.screenshotIndex || []).map((shot) => ({
      id: shot.id,
      file: shot.file,
      module: shot.module || "",
      function: shot.function || "",
      caption: shot.caption || "",
    })),
  };
}

function splitMenuPath(value) {
  return String(value || "")
    .split(/>|\/|\\/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => normalizeUiText(value))
        .filter(Boolean),
    ),
  );
}

function groupBy(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = item[key] || "未归类";
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(item);
  }
  return result;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readOptionalJson(filePath, fallback = null) {
  if (!filePath) return fallback;
  return readJson(filePath, fallback);
}

function readOptionalJsonObject(filePath, fallback = null) {
  const value = readOptionalJson(filePath, fallback);
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function readExistingJson(filePath, fallback = null) {
  if (!filePath) return fallback;
  const resolved = path.resolve(String(filePath));
  if (!fs.existsSync(resolved)) return fallback;
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function readExistingJsonObject(filePath, fallback = null, options = {}) {
  if (!filePath) return fallback;
  const resolved = path.resolve(String(filePath));
  if (!fs.existsSync(resolved)) return fallback;
  const label = options.label || "JSON file";
  const value = readExistingJson(resolved, fallback);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object: ${resolved}`);
  }
  return value;
}

function readRequiredJson(filePath, options = {}) {
  const resolved = path.resolve(String(filePath || ""));
  const label = options.label || "JSON file";
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`${label} is malformed: ${resolved}. ${error.message}`);
  }
}

function readRequiredJsonObject(filePath, options = {}) {
  const resolved = path.resolve(String(filePath || ""));
  const label = options.label || "JSON file";
  const value = readRequiredJson(resolved, { label });
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object: ${resolved}`);
  }
  return value;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const DEFAULT_PAGE_ZOOM = 0.6;

function resolvePageZoom(config) {
  const runtime = config?.runtime || {};
  if (runtime.pageZoom !== undefined && runtime.pageZoom !== "") {
    const zoom = Number(runtime.pageZoom);
    if (!Number.isNaN(zoom) && zoom > 0) return zoom;
  }
  if (runtime.browserZoomPercent !== undefined && runtime.browserZoomPercent !== "") {
    const percent = Number(runtime.browserZoomPercent);
    if (!Number.isNaN(percent) && percent > 0) return percent / 100;
  }
  return null;
}

async function applyPageZoom(page, zoom = DEFAULT_PAGE_ZOOM) {
  const scale = Number(zoom);
  if (!page || Number.isNaN(scale) || scale <= 0) {
    return { method: "skipped", zoom: scale };
  }

  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    cdp = null;
  }

  if (cdp) {
    try {
      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
      return { method: "cdp-setPageScaleFactor", zoom: scale };
    } catch {
      // fall through to device metrics override
    }

    try {
      const viewport = page.viewportSize() || { width: 1280, height: 720 };
      await cdp.send("Page.setDeviceMetricsOverride", {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        deviceScaleFactor: scale,
        mobile: false,
      });
      return { method: "cdp-setDeviceMetricsOverride", zoom: scale };
    } catch {
      // fall through to CSS zoom
    }
  }

  await page.evaluate((factor) => {
    document.documentElement.style.zoom = `${factor * 100}%`;
  }, scale);
  return { method: "css-zoom", zoom: scale };
}

async function applyConfiguredPageZoom(page, config) {
  const zoom = resolvePageZoom(config);
  if (zoom == null) return null;
  return applyPageZoom(page, zoom);
}

async function registerPageZoomInitScript(context, config) {
  const zoom = resolvePageZoom(config);
  if (zoom == null || !context?.addInitScript) return false;
  const percent = `${zoom * 100}%`;
  await context.addInitScript((zoomPercent) => {
    const applyZoom = () => {
      if (document.documentElement) {
        document.documentElement.style.zoom = zoomPercent;
      }
    };
    applyZoom();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyZoom, { once: true });
    }
  }, percent);
  return true;
}

/** 与 Chrome `chrome://flags/#local-network-access-check` → Disabled 等效，供浑天企微快捷登录探测本机企微客户端。 */
const HUNTIAN_CHROMIUM_FEATURE_DISABLES = [
  "LocalNetworkAccessChecks",
  "LocalNetworkAccessPermissionPrompt",
];

function buildChromiumLaunchArgs(config = {}) {
  const disables = new Set(HUNTIAN_CHROMIUM_FEATURE_DISABLES);
  const extraDisable = config.runtime?.chromiumDisableFeatures;
  if (typeof extraDisable === "string" && extraDisable.trim()) {
    for (const part of extraDisable.split(",")) {
      if (part.trim()) disables.add(part.trim());
    }
  }
  const args = [`--disable-features=${[...disables].join(",")}`];
  const extra = config.runtime?.chromiumArgs;
  if (Array.isArray(extra)) {
    args.push(...extra.filter((item) => typeof item === "string" && item.trim()));
  }
  return args;
}

function buildChromiumContextLaunchOptions(config = {}, options = {}) {
  const headless =
    options.headless !== undefined ? options.headless : config.runtime?.headless !== false;
  const launchOptions = {
    headless,
    args: buildChromiumLaunchArgs(config),
    ignoreDefaultArgs: ["--no-sandbox"],
    chromiumSandbox: config.runtime?.chromiumSandbox !== false,
  };

  const channel = config.runtime?.browserChannel;
  if (channel) {
    launchOptions.channel = channel;
  }

  const installedBrowser = findInstalledBrowser();
  if (installedBrowser && !launchOptions.channel) {
    launchOptions.executablePath = installedBrowser;
  }

  return { launchOptions, installedBrowser, headless };
}

module.exports = {
  buildChromiumLaunchArgs,
  buildChromiumContextLaunchOptions,
  DEFAULT_CHROME_USER_AGENT,
  DEFAULT_HUNTIAN_BROWSER_CONTINUE_WAIT_MS,
  detectHuntianLoginPageState,
  grantHuntianLocalNetworkAccess,
  HUNTIAN_LOCAL_NETWORK_ACCESS_ORIGINS,
  resolveBrowserUserAgent,
  resolveChromeUserDataDir,
  shouldPreferChromeUserAgent,
  applyConfiguredPageZoom,
  applyPageZoom,
  assertSafeWriteTarget,
  buildQualityReport,
  computeEvidenceMetrics,
  isCollectibleMenu,
  isEnvironmentSwitcherMenu,
  isLeafMenu,
  isNoiseMenuItem,
  isSystemShellMenu,
  isWelcomeMisCapture,
  markVisitedMenus,
  menuHasCollectedScreenshot,
  menuPageHasContainerEvidence,
  menuMatchesPage,
  mergeMenuMapEntries,
  normalizePageUrl,
  normalizeUiText,
  listWelcomeRedirectRetries,
  selectMenusForCollection,
  shouldCollectMenu,
  buildAuthCookies,
  buildCookiesFromHeader,
  completeHuntianQuickLogin,
  continueHuntianBrowserLogin,
  waitForApplicationReady,
  createInitialEvidence,
  findMenuPageEvidence,
  DEFAULT_HUNTIAN_AUTH_COOKIE_NAMES,
  HUNTIAN_BROWSER_CONTINUE_LABELS,
  HUNTIAN_BROWSER_CONTINUE_FALLBACK_LABELS,
  HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL,
  HUNTIAN_BROWSER_CONTINUE_PATTERN,
  HUNTIAN_BROWSER_CONTINUE_SELECTOR,
  HUNTIAN_QUICK_LOGIN_WAIT_CAP_MS,
  HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS,
  HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS,
  isHuntianLoginUrl,
  isWecomSsoLoginFrameUrl,
  isJavascriptHref,
  extractMenuItems,
  menuApiPayloadHasMenus,
  normalizeMenuApiPayload,
  parseMenuApiResponse,
  findInstalledBrowser,
  formatCookieHeader,
  isPlaceholderSecret,
  normalizeAuthPaths,
  selectAuthCookiesFromList,
  isSafeInspectionClick,
  isSafeExplorationClick,
  DEFAULT_EVIDENCE_SCROLL,
  fieldDedupeKey,
  mergeContainerSnapshotIntoEvidence,
  mergeFormRecords,
  mergeFrameSnapshots,
  clearPageStructuredEvidence,
  mergePageSnapshotIntoEvidence,
  pruneResolvedFailedPages,
  selectMenusForEvidenceRefresh,
  mergeTableRecords,
  resolveCollectProfileOptions,
  resolveEvidenceScrollOptions,
  tableDedupeKey,
  parseCookieHeader,
  normalizeUrl,
  parseSystemsConfig,
  parseArgs,
  resolveConfigBaseDir,
  resolveConfigRelativePath,
  readJson,
  readExistingJson,
  readExistingJsonObject,
  readOptionalJson,
  readOptionalJsonObject,
  readRequiredJson,
  readRequiredJsonObject,
  registerPageZoomInitScript,
  formatWhitepaperDate,
  resolveWhitepaperFileName,
  resolveWhitepaperPendingReviewFileName,
  finalizeWhitepaperMarkdown,
  promotePendingReviewToFinal,
  loadEvidenceSummaryForNaming,
  syncWhitepaperNamedArtifacts,
  resolveWhitepaperOutputPath,
  resolveDraftOutputPath,
  buildEvidenceSummary,
  inferSystemOverviewFromEvidence,
  inferTypicalFlowsFromEvidence,
  renderWhitepaper,
  resolvePageZoom,
  safeScreenshotName,
  safeFileToken,
  selectFieldLabel,
  isTechnicalFieldLabel,
  isGenericFieldLabel,
  shouldVisitUrl,
  validateExpectedHostResolution,
  writeJson,
};
