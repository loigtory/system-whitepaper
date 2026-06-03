const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyPageZoom,
  assertSafeWriteTarget,
  buildChromiumLaunchArgs,
  buildChromiumContextLaunchOptions,
  buildEvidenceSummary,
  buildQualityReport,
  DEFAULT_CHROME_USER_AGENT,
  resolveBrowserUserAgent,
  resolveChromeUserDataDir,
  shouldPreferChromeUserAgent,
  computeEvidenceMetrics,
  markVisitedMenus,
  buildAuthCookies,
  createInitialEvidence,
  extractMenuItems,
  menuApiPayloadHasMenus,
  normalizeMenuApiPayload,
  parseMenuApiResponse,
  findInstalledBrowser,
  isSafeInspectionClick,
  isSafeExplorationClick,
  mergeContainerSnapshotIntoEvidence,
  mergeFormRecords,
  mergeFrameSnapshots,
  mergePageSnapshotIntoEvidence,
  mergeTableRecords,
  parseCookieHeader,
  parseSystemsConfig,
  resolveEvidenceScrollOptions,
  resolvePageZoom,
  readExistingJson,
  readExistingJsonObject,
  readOptionalJsonObject,
  readRequiredJsonObject,
  renderWhitepaper,
  resolveDraftOutputPath,
  safeScreenshotName,
  selectFieldLabel,
  isTechnicalFieldLabel,
  isGenericFieldLabel,
  selectMenusForCollection,
  validateExpectedHostResolution,
  shouldVisitUrl,
} = require("./system-whitepaper-lib");

function writePassingTruthReadinessReport(dir, overrides = {}) {
  const {
    buildReadinessSourceArtifacts,
    loadReadinessInputs,
  } = require("./check-truth-readiness");
  const report = {
    artifactType: "truth-readiness-report",
    version: 1,
    threshold: 0.95,
    score: 0.98,
    scorePercent: 98,
    canSubmitReview: true,
    canFinalize: true,
    gates: {
      evidence: { pass: true, scorePercent: 100 },
      claims: { pass: true, scorePercent: 100 },
      factCheck: { pass: true, scorePercent: 100 },
      narrative: { pass: true, scorePercent: 100 },
      database: { pass: true, available: false, scorePercent: 0 },
    },
    blockers: [],
    improvementActions: [],
    sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(dir)),
    generatedAt: "2026-05-20T00:00:00.000Z",
    ...overrides,
  };
  require("node:fs").writeFileSync(
    require("node:path").join(dir, "truth-readiness-report.json"),
    JSON.stringify(report),
    "utf8",
  );
  return report;
}

test("safeScreenshotName removes unsafe path characters while preserving meaning", () => {
  assert.equal(
    safeScreenshotName("合同管理", "合同删除", "确认弹窗", "20260518"),
    "合同管理_合同删除_确认弹窗_20260518.png",
  );
  assert.equal(
    safeScreenshotName("A/B", "C:D", "E*F", "1"),
    "A_B_C_D_E_F_1.png",
  );
});

test("selectFieldLabel prefers meaningful form labels over component tag fallbacks", () => {
  assert.equal(
    selectFieldLabel({
      wrapperLabel: "平台：",
      placeholder: "请选择平台",
      tagName: "div",
    }),
    "平台",
  );
  assert.equal(
    selectFieldLabel({
      wrapperLabel: "",
      placeholder: "请选择映射类型",
      tagName: "div",
    }),
    "请选择映射类型",
  );
  assert.equal(
    selectFieldLabel({
      wrapperLabel: "",
      placeholder: "",
      name: "",
      id: "",
      tagName: "div",
    }),
    "",
  );
});

test("isTechnicalFieldLabel and isGenericFieldLabel filter machine ids and generic placeholders", () => {
  assert.equal(isTechnicalFieldLabel("task-list-company-branch"), true);
  assert.equal(isTechnicalFieldLabel("task-type"), true);
  assert.equal(isTechnicalFieldLabel("demand-status"), true);
  assert.equal(isTechnicalFieldLabel("new-company-branch"), true);
  assert.equal(isTechnicalFieldLabel("保险公司"), false);
  assert.equal(isGenericFieldLabel("请选择"), true);
  assert.equal(isGenericFieldLabel("请输入需求描述"), true);
  assert.equal(isGenericFieldLabel("请选择映射类型"), false);
  assert.equal(isGenericFieldLabel("全部（输入关键字筛选）"), false);
  assert.equal(
    selectFieldLabel({
      wrapperLabel: "保险公司",
      placeholder: "task-list-company-branch",
      id: "task-list-company-branch",
    }),
    "保险公司",
  );
});

test("assertSafeWriteTarget only allows ledger-backed AI_AUTO_TEST_ data", () => {
  const ledger = [
    {
      id: "td-001",
      name: "AI_AUTO_TEST_合同_001",
      type: "contract",
    },
  ];

  assert.doesNotThrow(() =>
    assertSafeWriteTarget("AI_AUTO_TEST_合同_001", ledger),
  );

  assert.throws(
    () => assertSafeWriteTarget("系统已有合同", ledger),
    /AI_AUTO_TEST_/,
  );
  assert.throws(
    () => assertSafeWriteTarget("AI_AUTO_TEST_未登记合同", ledger),
    /test-data-ledger/,
  );
});

test("buildAuthCookies creates domain cookie without exposing token in metadata", () => {
  const cookies = buildAuthCookies(
    {
      cookieName: "HUNTIAN_TOKEN",
      cookieDomain: ".hzins.com",
      cookiePath: "/",
      cookieSecure: true,
      cookieSameSite: "Lax",
    },
    "jwt-value",
  );

  assert.deepEqual(cookies, [
    {
      name: "HUNTIAN_TOKEN",
      value: "jwt-value",
      domain: ".hzins.com",
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
  assert.deepEqual(buildAuthCookies({}, "jwt-value"), []);
});

test("parseCookieHeader extracts multiple cookies from cURL cookie header", () => {
  const cookies = parseCookieHeader(
    "JSESSIONID=abc\nHUNTIANSID=sid-1\ntoken=jwt.value; env=; fed-env='",
  );

  assert.deepEqual(cookies, [
    { name: "JSESSIONID", value: "abc" },
    { name: "HUNTIANSID", value: "sid-1" },
    { name: "token", value: "jwt.value" },
    { name: "env", value: "" },
    { name: "fed-env", value: "" },
  ]);
});

test("readRequiredJsonObject rejects missing malformed and non-object json", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "required-json-"));
  const missingPath = path.join(dir, "missing.json");
  const malformedPath = path.join(dir, "bad.json");
  const arrayPath = path.join(dir, "array.json");
  fs.writeFileSync(malformedPath, "{bad json", "utf8");
  fs.writeFileSync(arrayPath, "[]", "utf8");

  assert.throws(
    () => readRequiredJsonObject(missingPath, { label: "Evidence" }),
    /Evidence not found/,
  );
  assert.throws(
    () => readRequiredJsonObject(malformedPath, { label: "Evidence" }),
    /Evidence is malformed/,
  );
  assert.throws(
    () => readRequiredJsonObject(arrayPath, { label: "Evidence" }),
    /Evidence must be a JSON object/,
  );
});

test("readExistingJson only tolerates missing files", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "existing-json-"));
  const missingPath = path.join(dir, "missing.json");
  const malformedPath = path.join(dir, "bad.json");
  const validPath = path.join(dir, "valid.json");
  fs.writeFileSync(malformedPath, "{bad json", "utf8");
  fs.writeFileSync(validPath, JSON.stringify({ ok: true }), "utf8");

  assert.deepEqual(readExistingJson("", { fallback: true }), { fallback: true });
  assert.deepEqual(readExistingJson(missingPath, { fallback: true }), { fallback: true });
  assert.deepEqual(readExistingJson(validPath), { ok: true });
  assert.throws(() => readExistingJson(malformedPath), /JSON/);
});

test("readExistingJsonObject rejects existing non-object json", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "existing-json-object-"));
  const missingPath = path.join(dir, "missing.json");
  const arrayPath = path.join(dir, "array.json");
  const validPath = path.join(dir, "valid.json");
  fs.writeFileSync(arrayPath, "[]", "utf8");
  fs.writeFileSync(validPath, JSON.stringify({ ok: true }), "utf8");

  assert.deepEqual(readExistingJsonObject(missingPath, { fallback: true }), { fallback: true });
  assert.deepEqual(readExistingJsonObject(validPath, null, { label: "Evidence summary" }), {
    ok: true,
  });
  assert.throws(
    () => readExistingJsonObject(arrayPath, null, { label: "Evidence summary" }),
    /Evidence summary must be a JSON object/,
  );
});

test("readOptionalJsonObject tolerates missing malformed and non-object json", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "optional-json-object-"));
  const missingPath = path.join(dir, "missing.json");
  const malformedPath = path.join(dir, "bad.json");
  const arrayPath = path.join(dir, "array.json");
  const validPath = path.join(dir, "valid.json");
  const fallback = { fallback: true };
  fs.writeFileSync(malformedPath, "{bad json", "utf8");
  fs.writeFileSync(arrayPath, "[]", "utf8");
  fs.writeFileSync(validPath, JSON.stringify({ ok: true }), "utf8");

  assert.deepEqual(readOptionalJsonObject("", fallback), fallback);
  assert.deepEqual(readOptionalJsonObject(missingPath, fallback), fallback);
  assert.deepEqual(readOptionalJsonObject(malformedPath, fallback), fallback);
  assert.deepEqual(readOptionalJsonObject(arrayPath, fallback), fallback);
  assert.deepEqual(readOptionalJsonObject(validPath, fallback), { ok: true });
});

test("mergeTableRecords unions columns and keeps max rowCount", () => {
  const merged = mergeTableRecords(
    { tableName: "list", columns: ["流水号", "平台"], rowCount: 3 },
    { tableName: "list", columns: ["映射类型", "平台", "操作"], rowCount: 5 },
  );
  assert.deepEqual(merged.columns, ["流水号", "平台", "映射类型", "操作"]);
  assert.equal(merged.rowCount, 5);
});

test("mergeFormRecords dedupes fields by label and type", () => {
  const merged = mergeFormRecords(
    {
      formName: "查询",
      fields: [{ label: "平台", type: "text", required: false, blocked: false }],
    },
    {
      formName: "查询",
      fields: [
        { label: "平台", type: "text", required: false, blocked: false },
        { label: "映射源id", type: "text", required: true, blocked: false },
      ],
    },
  );
  assert.equal(merged.fields.length, 2);
  assert.equal(merged.fields[1].label, "映射源id");
  assert.equal(merged.fields[1].required, true);
});

test("mergeFrameSnapshots merges tables and forms across scroll positions", () => {
  const merged = mergeFrameSnapshots([
    {
      title: "A",
      url: "https://example.test/a",
      buttons: ["查询"],
      forms: [
        {
          formName: "查询",
          fields: [{ label: "平台", type: "text", required: false, blocked: false }],
        },
      ],
      tables: [{ tableName: "table-1", columns: ["流水号", "平台"], rowCount: 2 }],
      links: [],
      landmarks: [],
    },
    {
      title: "A",
      url: "https://example.test/a",
      buttons: ["新增"],
      forms: [
        {
          formName: "查询",
          fields: [{ label: "映射源id", type: "text", required: false, blocked: false }],
        },
      ],
      tables: [{ tableName: "table-1", columns: ["映射类型", "操作"], rowCount: 4 }],
      links: [],
      landmarks: [],
    },
  ]);

  assert.deepEqual(merged.buttons, ["查询", "新增"]);
  assert.equal(merged.forms[0].fields.length, 2);
  assert.deepEqual(merged.tables[0].columns, ["流水号", "平台", "映射类型", "操作"]);
  assert.equal(merged.tables[0].rowCount, 4);
});

test("resolveEvidenceScrollOptions reads runtime.evidenceScroll with defaults", () => {
  const defaults = resolveEvidenceScrollOptions({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.maxVerticalSteps, 5);

  const custom = resolveEvidenceScrollOptions({
    runtime: {
      evidenceScroll: {
        enabled: false,
        maxVerticalSteps: 3,
        maxHorizontalSteps: 2,
        nestedDepth: 1,
      },
    },
  });
  assert.equal(custom.enabled, false);
  assert.equal(custom.maxVerticalSteps, 3);
  assert.equal(custom.maxHorizontalSteps, 2);
  assert.equal(custom.nestedDepth, 1);
});

test("parseSystemsConfig parses nested runtime.evidenceScroll", () => {
  const config = parseSystemsConfig(`
runtime:
  pageZoom: 0.6
  evidenceScroll:
    enabled: true
    maxVerticalSteps: 5
    maxHorizontalSteps: 4
    nestedDepth: 2
systems:
  - code: pilot
    name: 试点
    url: https://example.test/
`);
  assert.equal(config.runtime.pageZoom, 0.6);
  assert.equal(config.runtime.evidenceScroll.enabled, true);
  assert.equal(config.runtime.evidenceScroll.maxVerticalSteps, 5);
  assert.equal(config.runtime.evidenceScroll.maxHorizontalSteps, 4);
  assert.equal(config.runtime.evidenceScroll.nestedDepth, 2);
});

test("parseSystemsConfig extracts auth, runtime, and systems from simple YAML", () => {
  const config = parseSystemsConfig(`
auth:
  tokenFile: ./secrets/token.txt
  loginInfoEndpoint: https://huntian.example/api?token=\${TOKEN}
runtime:
  outputDir: ./outputs
  headless: true
systems:
  - code: contract
    name: 合同管理系统
    url: https://contract.example.test/
    owner: 合同业务组
    expectedHost:
      hostname: contract.example.test
      allowedIps:
        - 172.21.1.172
    allowedWriteActions:
      - create
`);

  assert.equal(config.auth.tokenFile, "./secrets/token.txt");
  assert.equal(config.runtime.headless, true);
  assert.equal(config.systems[0].code, "contract");
  assert.equal(config.systems[0].name, "合同管理系统");
  assert.equal(config.systems[0].expectedHost.hostname, "contract.example.test");
  assert.deepEqual(config.systems[0].expectedHost.allowedIps, ["172.21.1.172"]);
  assert.deepEqual(config.systems[0].allowedWriteActions, ["create"]);
});

test("resolvePageZoom reads pageZoom or browserZoomPercent from runtime config", () => {
  assert.equal(resolvePageZoom({ runtime: { pageZoom: 0.6 } }), 0.6);
  assert.equal(resolvePageZoom({ runtime: { browserZoomPercent: 60 } }), 0.6);
  assert.equal(resolvePageZoom({ runtime: { pageZoom: 0.75 } }), 0.75);
  assert.equal(resolvePageZoom({ runtime: {} }), null);
  assert.equal(resolvePageZoom({ runtime: { pageZoom: 0, browserZoomPercent: 60 } }), 0.6);
});

test("menu list cache ignores non-object cache before reading and rewriting", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    loadCachedMenuApiPath,
    loadMenuListCacheRawText,
    resolveMenuListCachePath,
    saveMenuApiPathHint,
  } = require("./menu-list-capture");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "menu-cache-non-object-"));
  const cachePath = resolveMenuListCachePath(dir);
  fs.writeFileSync(
    cachePath,
    JSON.stringify([{ rawText: "stale", menuApiPath: "/stale/menu" }]),
    "utf8",
  );

  assert.equal(loadMenuListCacheRawText(dir), "");
  assert.equal(loadCachedMenuApiPath(dir), "");

  saveMenuApiPathHint(dir, "/api/menu/list");
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.deepEqual(Object.keys(cache).sort(), ["menuApiPath", "menuApiPathUpdatedAt"]);
  assert.equal(cache.menuApiPath, "/api/menu/list");
});

test("applyPageZoom falls back to CSS zoom when CDP is unavailable", async () => {
  let appliedFactor;
  const page = {
    viewportSize: () => ({ width: 1280, height: 720 }),
    context: () => ({
      newCDPSession: async () => {
        throw new Error("cdp-unavailable");
      },
    }),
    evaluate: async (_fn, factor) => {
      appliedFactor = factor;
    },
  };

  const result = await applyPageZoom(page, 0.6);
  assert.equal(result.method, "css-zoom");
  assert.equal(result.zoom, 0.6);
  assert.equal(appliedFactor, 0.6);
});

test("createInitialEvidence records P0 until browser exploration runs", () => {
  const evidence = createInitialEvidence({
    code: "contract",
    name: "合同管理系统",
    url: "https://contract.example.test/",
  });

  assert.equal(evidence.systemInfo.code, "contract");
  assert.equal(evidence.blockedItems[0].severity, "P0");
  assert.match(evidence.blockedItems[0].reason, /尚未执行/);
});

test("collect evidence reuse rejects malformed core evidence without overwriting it", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadEvidenceForCollection } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-bad-evidence-"));
  const evidencePath = path.join(dir, "evidence.json");
  fs.writeFileSync(evidencePath, "{bad json", "utf8");

  assert.throws(
    () =>
      loadEvidenceForCollection({
        evidencePath,
        reuseExisting: true,
        system: { code: "contract", name: "合同管理系统", url: "https://contract.example.test/" },
      }),
    /Existing evidence\.json is malformed/,
  );
  assert.equal(fs.readFileSync(evidencePath, "utf8"), "{bad json");
});

test("collect evidence fresh run ignores stale malformed evidence and reinitializes", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadEvidenceForCollection } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-fresh-evidence-"));
  const evidencePath = path.join(dir, "evidence.json");
  fs.writeFileSync(evidencePath, "{bad json", "utf8");

  const evidence = loadEvidenceForCollection({
    evidencePath,
    reuseExisting: false,
    system: { code: "contract", name: "合同管理系统", url: "https://contract.example.test/" },
  });

  assert.equal(evidence.systemInfo.code, "contract");
  assert.match(evidence.blockedItems[0].reason, /尚未执行/);
  assert.equal(fs.readFileSync(evidencePath, "utf8"), "{bad json");
});

test("formatCookieHeader writes semicolon-separated cookie pairs", () => {
  const { formatCookieHeader, selectAuthCookiesFromList } = require("./system-whitepaper-lib");
  const header = formatCookieHeader([
    { name: "JSESSIONID", value: "abc" },
    { name: "HUNTIANSID", value: "sid-1" },
    { name: "token", value: "jwt.value" },
  ]);
  assert.equal(header, "JSESSIONID=abc; HUNTIANSID=sid-1; token=jwt.value");

  const selected = selectAuthCookiesFromList(
    [
      { name: "env", value: "" },
      { name: "JSESSIONID", value: "abc" },
      { name: "HUNTIANSID", value: "sid-1" },
      { name: "token", value: "jwt.value" },
    ],
    ["JSESSIONID", "HUNTIANSID", "token"],
  );
  assert.deepEqual(selected, [
    { name: "JSESSIONID", value: "abc" },
    { name: "HUNTIANSID", value: "sid-1" },
    { name: "token", value: "jwt.value" },
  ]);
});

test("isPlaceholderSecret detects empty and template secrets", () => {
  const { isPlaceholderSecret } = require("./system-whitepaper-lib");
  assert.equal(isPlaceholderSecret(""), true);
  assert.equal(isPlaceholderSecret("REPLACE_WITH_COOKIE_HEADER_FROM_CURL_B_OPTION"), true);
  assert.equal(isPlaceholderSecret("JSESSIONID=abc"), false);
});

test("normalizeAuthPaths resolves config-local examples from project root", () => {
  const os = require("node:os");
  const path = require("node:path");
  const {
    normalizeAuthPaths,
    resolveConfigRelativePath,
  } = require("./system-whitepaper-lib");
  const projectRoot = path.join(os.tmpdir(), "system-whitepaper");
  const configDir = path.join(projectRoot, "config");
  const config = {
    auth: {
      tokenFile: "./secrets/huntian-token.txt",
      cookieHeaderFile: "./secrets/huntian-cookie-header.txt",
    },
  };

  normalizeAuthPaths(config, configDir);

  assert.equal(
    config.auth.tokenFile,
    path.resolve(projectRoot, "secrets", "huntian-token.txt"),
  );
  assert.equal(
    config.auth.cookieHeaderFile,
    path.resolve(projectRoot, "secrets", "huntian-cookie-header.txt"),
  );
  assert.equal(
    resolveConfigRelativePath(configDir, "./outputs"),
    path.resolve(projectRoot, "outputs"),
  );
});

test("HUNTIAN_BROWSER_CONTINUE_LABELS targets login-access link only", () => {
  const {
    HUNTIAN_BROWSER_CONTINUE_LABELS,
    HUNTIAN_BROWSER_CONTINUE_FALLBACK_LABELS,
    HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL,
    HUNTIAN_BROWSER_CONTINUE_PATTERN,
  } = require("./system-whitepaper-lib");
  assert.equal(HUNTIAN_BROWSER_CONTINUE_PRIMARY_LABEL, "继续在浏览器中登录访问");
  assert.deepEqual(HUNTIAN_BROWSER_CONTINUE_LABELS, ["继续在浏览器中登录访问"]);
  assert.ok(
    HUNTIAN_BROWSER_CONTINUE_FALLBACK_LABELS.includes("继续在浏览器中访问"),
    "fallback only when explicitly enabled",
  );
  assert.match("继续在浏览器中登录访问", HUNTIAN_BROWSER_CONTINUE_PATTERN);
  const { HUNTIAN_BROWSER_CONTINUE_SELECTOR, isJavascriptHref } = require("./system-whitepaper-lib");
  assert.equal(HUNTIAN_BROWSER_CONTINUE_SELECTOR, "a.wwLogin_quick_open_wecom");
  assert.equal(isJavascriptHref("javascript:;"), true);
  assert.equal(isJavascriptHref("https://venus-fincenter.hzins.com/welcome"), false);
});

test("isWecomSsoLoginFrameUrl matches wwlogin panel only", () => {
  const { isWecomSsoLoginFrameUrl } = require("./system-whitepaper-lib");
  assert.ok(
    isWecomSsoLoginFrameUrl(
      "https://login.work.weixin.qq.com/wwlogin/sso/login/?login_type=CorpApp",
    ),
  );
  assert.equal(isWecomSsoLoginFrameUrl("https://open.work.weixin.qq.com/wwopen/loginStorage"), false);
});

test("buildChromiumLaunchArgs disables LocalNetworkAccessChecks for WeCom quick login", () => {
  const args = buildChromiumLaunchArgs({});
  assert.ok(args.some((item) => item.includes("LocalNetworkAccessChecks")));
  assert.ok(args.some((item) => item.includes("LocalNetworkAccessPermissionPrompt")));
  const withExtra = buildChromiumLaunchArgs({
    runtime: { chromiumDisableFeatures: "SomeOtherFeature" },
  });
  assert.ok(withExtra[0].includes("LocalNetworkAccessChecks"));
  assert.ok(withExtra[0].includes("SomeOtherFeature"));
});

test("buildChromiumContextLaunchOptions enables sandbox and drops default no-sandbox", () => {
  const { launchOptions } = buildChromiumContextLaunchOptions({
    runtime: { browserChannel: "chrome" },
  });
  assert.deepEqual(launchOptions.ignoreDefaultArgs, ["--no-sandbox"]);
  assert.equal(launchOptions.chromiumSandbox, true);
  assert.equal(launchOptions.channel, "chrome");
});

test("resolveBrowserUserAgent prefers Chrome UA on Windows with AI-Data-Loop UA", () => {
  const config = {
    auth: { userAgent: "Mozilla/5.0 AI-Data-Loop-Platform/1.0" },
    runtime: {},
  };
  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    assert.equal(shouldPreferChromeUserAgent(config), true);
    assert.equal(resolveBrowserUserAgent(config), DEFAULT_CHROME_USER_AGENT);
    assert.match(resolveBrowserUserAgent(config), /Chrome\/\d+/);
  } finally {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  }

  assert.equal(
    resolveBrowserUserAgent({
      auth: { userAgent: "Mozilla/5.0 Custom/1.0" },
      runtime: { useChromeUserAgent: false },
    }),
    "Mozilla/5.0 Custom/1.0",
  );
});

test("resolveChromeUserDataDir resolves config and CLI paths", () => {
  const resolved = resolveChromeUserDataDir(
    { runtime: { chromeUserDataDir: "./profile-a" } },
    { chromeUserDataDir: "./profile-b" },
  );
  assert.ok(resolved.includes("profile-b"));
  assert.equal(resolveChromeUserDataDir({ runtime: {} }, {}), "");
});

test("resolvePersistentProfileDir prefers chromeUserDataDir over default profile", () => {
  const { resolvePersistentProfileDir } = require("./refresh-huntian-cookie");
  const dir = resolvePersistentProfileDir(
    { runtime: { chromeUserDataDir: "C:\\Chrome\\User Data" } },
    { persistentProfile: true },
  );
  assert.ok(dir.includes("Chrome"));
  assert.ok(dir.includes("User Data"));
});

test("DEFAULT_PERSISTENT_PROFILE_DIR lives under ignored secrets runtime state", () => {
  const path = require("node:path");
  const { DEFAULT_PERSISTENT_PROFILE_DIR, resolvePersistentProfileDir } = require("./refresh-huntian-cookie");
  assert.match(DEFAULT_PERSISTENT_PROFILE_DIR, /playwright-huntian-profile$/);
  assert.ok(
    DEFAULT_PERSISTENT_PROFILE_DIR.includes(path.join("system-whitepaper", "secrets", "playwright-huntian-profile")),
  );
  assert.equal(
    resolvePersistentProfileDir({}, { persistentProfile: true, persistentProfileDir: "./custom-profile" }),
    path.resolve("./custom-profile"),
  );
  assert.equal(
    resolvePersistentProfileDir(
      { runtime: { persistentProfileDir: "./runtime-profile" } },
      { persistentProfile: true },
    ),
    path.resolve("./runtime-profile"),
  );
});

test("extractTokenCandidates reads token from URL and cookie names", () => {
  const { extractTokenCandidates, mergeAuthCookies } = require("./refresh-huntian-cookie");
  const fromUrl = extractTokenCandidates([], "https://venus-fincenter.hzins.com/welcome?token=jwt.from.url");
  assert.deepEqual(fromUrl, [{ name: "token", value: "jwt.from.url" }]);

  const fromCookie = extractTokenCandidates(
    [{ name: "HUNTIAN_TOKEN", value: "jwt.from.cookie" }],
    "https://venus-fincenter.hzins.com/welcome",
  );
  assert.deepEqual(fromCookie, [{ name: "HUNTIAN_TOKEN", value: "jwt.from.cookie" }]);

  const merged = mergeAuthCookies(
    [
      { name: "JSESSIONID", value: "abc" },
      { name: "HUNTIANSID", value: "sid" },
    ],
    [{ name: "token", value: "jwt.value" }],
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[2].name, "token");
});

test("extractSdkUsageFromAgentResult reads nested token usage fields", () => {
  const { extractSdkUsageFromAgentResult } = require("./narrative/extract-sdk-usage");
  const usage = extractSdkUsageFromAgentResult({
    metrics: {
      usage: {
        input_tokens: 1200,
        output_tokens: 340,
      },
    },
  });
  assert.equal(usage.inputTokens, 1200);
  assert.equal(usage.outputTokens, 340);
  assert.equal(usage.totalTokens, 1540);
});

test("extractSdkUsageFromTurnEndedUsages sums turn-ended usage events", () => {
  const { extractSdkUsageFromTurnEndedUsages } = require("./narrative/extract-sdk-usage");
  const usage = extractSdkUsageFromTurnEndedUsages([
    { inputTokens: 900, outputTokens: 120, cacheReadTokens: 50 },
    { inputTokens: 100, outputTokens: 80 },
  ]);
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.outputTokens, 200);
  assert.equal(usage.totalTokens, 1200);
  assert.equal(usage.cacheReadTokens, 50);
  assert.equal(usage.source, "sdk");
});

test("resolvePhase3bUsage falls back to estimated tokens from char counts", () => {
  const { resolvePhase3bUsage } = require("./narrative/extract-sdk-usage");
  const resolved = resolvePhase3bUsage({
    turnEndedUsages: [],
    agentResult: { status: "finished", id: "run-1" },
    charCounts: {
      promptChars: 1800,
      inlineSummaryChars: 600,
      fragmentChars: 3600,
    },
  });
  assert.equal(resolved.usageSource, "estimated");
  assert.equal(resolved.usageEstimated, true);
  assert.ok(resolved.sdkUsage.totalTokens > 0);
});

test("resolvePhase3bUsage ignores invalid char counts when estimating tokens", () => {
  const { resolvePhase3bUsage } = require("./narrative/extract-sdk-usage");
  const resolved = resolvePhase3bUsage({
    turnEndedUsages: [],
    charCounts: {
      promptChars: "bad",
      inlineSummaryChars: -100,
      fragmentChars: 1800.9,
    },
  });

  assert.equal(resolved.usageSource, "estimated");
  assert.equal(resolved.usageEstimated, true);
  assert.equal(resolved.sdkUsage.inputTokens, 0);
  assert.equal(resolved.sdkUsage.outputTokens, 1000);
  assert.equal(resolved.sdkUsage.totalTokens, 1000);
});

test("resolvePhase3bUsage prefers sdk turn-ended usage over estimates", () => {
  const { resolvePhase3bUsage } = require("./narrative/extract-sdk-usage");
  const resolved = resolvePhase3bUsage({
    turnEndedUsages: [{ inputTokens: 321, outputTokens: 45 }],
    charCounts: { promptChars: 9999, fragmentChars: 9999 },
  });
  assert.equal(resolved.usageSource, "sdk");
  assert.equal(resolved.usageEstimated, false);
  assert.equal(resolved.sdkUsage.inputTokens, 321);
  assert.equal(resolved.sdkUsage.outputTokens, 45);
});

test("extractSdkUsageFromStreamDelta reads turn-ended usage updates", () => {
  const {
    extractSdkUsageFromStreamDelta,
    extractSdkUsageFromTurnEndedUsages,
  } = require("./narrative/extract-sdk-usage");
  const first = extractSdkUsageFromStreamDelta({
    type: "turn-ended",
    usage: { inputTokens: 8000, outputTokens: 1200, cacheReadTokens: 4000 },
  });
  const second = extractSdkUsageFromStreamDelta({
    type: "turn-ended",
    usage: { inputTokens: 2000, outputTokens: 300, cacheReadTokens: 1000 },
  });
  const usage = extractSdkUsageFromTurnEndedUsages([
    first && {
      inputTokens: first.inputTokens,
      outputTokens: first.outputTokens,
      cacheReadTokens: first.cacheReadTokens,
    },
    second && {
      inputTokens: second.inputTokens,
      outputTokens: second.outputTokens,
      cacheReadTokens: second.cacheReadTokens,
    },
  ].filter(Boolean));
  assert.equal(usage.inputTokens, 10000);
  assert.equal(usage.outputTokens, 1500);
  assert.equal(usage.totalTokens, 11500);
  assert.equal(usage.cacheReadTokens, 5000);
  assert.equal(usage.source, "sdk");
});

test("generateWriteValidationPlan creates AI_AUTO_TEST scenarios from evidence menus", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { generateWriteValidationPlan } = require("./generate-write-validation-plan");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-plan-"));
  const evidencePath = path.join(dir, "evidence.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({
      systemInfo: { code: "adp", name: "demo" },
      menuMap: [{ title: "合同列表", menuPath: "合同 > 列表" }],
    }),
    "utf8",
  );
  const result = generateWriteValidationPlan({ input: evidencePath, systemCode: "adp" });
  const plan = JSON.parse(fs.readFileSync(result.outputPath, "utf8"));
  assert.equal(plan.scenarios.length, 1);
  assert.match(plan.scenarios[0].targetName, /^AI_AUTO_TEST_/);
});

test("seedMenusFromKnownSources ignores non-object caches and reads valid scenario objects", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { seedMenusFromKnownSources } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-menus-known-sources-"));
  const planPath = path.join(dir, "write-validation-plan.json");
  const resultPath = path.join(dir, "write-validation-result.json");
  const system = { url: "https://example.test/" };
  const log = () => {};

  fs.writeFileSync(planPath, "[]", "utf8");
  fs.writeFileSync(resultPath, '"bad-shape"', "utf8");
  const evidence = { menuMap: [] };
  assert.equal(seedMenusFromKnownSources(evidence, system, dir, log), 0);
  assert.deepEqual(evidence.menuMap, []);

  fs.writeFileSync(
    planPath,
    JSON.stringify({ scenarios: [{ menuPath: "合同管理 > 合同列表" }] }),
    "utf8",
  );
  assert.equal(seedMenusFromKnownSources(evidence, system, dir, log), 1);
  assert.equal(evidence.menuMap[0].menuPath, "合同管理 > 合同列表");
});

test("generateWriteValidationPlan rejects malformed evidence without default plan", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { generateWriteValidationPlan } = require("./generate-write-validation-plan");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-plan-bad-evidence-"));
  const evidencePath = path.join(dir, "evidence.json");
  const outputPath = path.join(dir, "write-validation-plan.json");
  fs.writeFileSync(evidencePath, "{bad json", "utf8");

  assert.throws(
    () => generateWriteValidationPlan({ input: evidencePath, outputPath, systemCode: "adp" }),
    /Evidence is malformed/,
  );
  assert.equal(fs.existsSync(outputPath), false);
});

test("session-only browser login uses persistent profile when runtime enables it", () => {
  const {
    HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS,
    HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS,
  } = require("./system-whitepaper-lib");
  assert.equal(HUNTIAN_SESSION_BROWSER_LOGIN_BUDGET_MS, 12000);
  assert.equal(HUNTIAN_SESSION_FAST_LOGIN_WAIT_CAP_MS, 6000);
});

test("shouldAutoRefreshCookie respects force flag and REFRESH_COOKIE=skip", () => {
  const { shouldAutoRefreshCookie } = require("./refresh-huntian-cookie");
  assert.equal(shouldAutoRefreshCookie("JSESSIONID=abc", false), false);
  assert.equal(shouldAutoRefreshCookie("", false), true);
  assert.equal(shouldAutoRefreshCookie("JSESSIONID=abc", true), true);

  const previous = process.env.REFRESH_COOKIE;
  process.env.REFRESH_COOKIE = "skip";
  assert.equal(shouldAutoRefreshCookie("", true), false);
  if (previous === undefined) delete process.env.REFRESH_COOKIE;
  else process.env.REFRESH_COOKIE = previous;
});

test("findInstalledBrowser returns first existing browser path", () => {
  const found = findInstalledBrowser({
    existsSync: (candidate) => candidate === "C:\\Browser\\chrome.exe",
    candidates: ["C:\\Missing\\chrome.exe", "C:\\Browser\\chrome.exe"],
  });

  assert.equal(found, "C:\\Browser\\chrome.exe");
});

test("extractMenuItems recursively extracts menu titles and routes", () => {
  const menus = extractMenuItems({
    data: [
      {
        menuName: "基础管理",
        children: [
          { name: "币种", path: "/base/currency" },
          { title: "账套", url: "/base/ledger" },
        ],
      },
    ],
  });

  assert.deepEqual(menus, [
    { title: "基础管理", path: "", menuPath: "基础管理" },
    { title: "币种", path: "/base/currency", menuPath: "基础管理 > 币种" },
    { title: "账套", path: "/base/ledger", menuPath: "基础管理 > 账套" },
  ]);
});

test("parseMenuApiResponse treats empty wrapped data as no menus", () => {
  const wrapped = JSON.stringify({
    code: 401,
    msg: "未登录",
    data: null,
    success: false,
  });
  const parsed = parseMenuApiResponse(wrapped);
  assert.equal(parsed.menuCount, 0);
  assert.equal(menuApiPayloadHasMenus(wrapped), false);
});

test("parseMenuApiResponse reads venus menu tree from success wrapper data array", () => {
  const wrapped = JSON.stringify({
    code: 0,
    msg: "ok",
    success: true,
    data: [{ name: "基础管理", url: "/base", children: [{ name: "币种", url: "/base/currency", children: [] }] }],
  });
  const parsed = parseMenuApiResponse(wrapped);
  assert.ok(parsed.menuCount >= 2);
  assert.equal(menuApiPayloadHasMenus(wrapped), true);
});

test("extractMenuItems accepts visible DOM menu candidates without href", () => {
  const items = extractMenuItems({
    data: [
      { text: "AI 任务管理", source: "visible-dom-menu", clickable: true },
      { text: "AI 脚本管理", source: "visible-dom-menu", clickable: true },
    ],
  });

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.title),
    ["AI 任务管理", "AI 脚本管理"],
  );
  assert.equal(items[0].path, "");
});

test("extractMenuItems parses venus fincenter root array with name/url/children", () => {
  const payload = [
    {
      id: 8881,
      name: "基础管理",
      icon: "database",
      url: "/base",
      children: [
        { id: 8885, name: "币种", icon: null, url: "/base/currency", children: [] },
        {
          id: 8886,
          name: "COA维护",
          url: "/base/accounting-dimension",
          children: [
            { id: 8908, name: "会计结构", url: "/base/accounting-dimension/accounting", children: [] },
          ],
        },
      ],
    },
    {
      id: 15279,
      name: "活动费",
      url: "/activity-fee  ",
      children: [{ id: 15280, name: "活动费明细", url: "/activity-fee/detailed", children: [] }],
    },
  ];

  assert.ok(Array.isArray(normalizeMenuApiPayload(payload)));
  const menus = extractMenuItems(payload);
  assert.ok(menus.some((menu) => menu.title === "币种" && menu.path === "/base/currency"));
  assert.ok(
    menus.some(
      (menu) =>
        menu.title === "会计结构" &&
        menu.path === "/base/accounting-dimension/accounting" &&
        menu.menuPath === "基础管理 > COA维护 > 会计结构",
    ),
  );
  assert.ok(menus.some((menu) => menu.title === "活动费明细" && menu.path === "/activity-fee/detailed"));
  assert.ok(menus.length >= 6);
});

test("shouldVisitUrl keeps crawl inside the target origin and skips unsafe schemes", () => {
  assert.equal(
    shouldVisitUrl("https://contract.example.test/a", "https://contract.example.test/"),
    true,
  );
  assert.equal(
    shouldVisitUrl("https://other.example.test/a", "https://contract.example.test/"),
    false,
  );
  assert.equal(
    shouldVisitUrl("javascript:void(0)", "https://contract.example.test/"),
    false,
  );
});

test("isSafeExplorationClick does not click leaf navigation menu without expandable state", () => {
  assert.equal(
    isSafeExplorationClick({ text: "资金管理", role: "menuitem", ariaExpanded: null }),
    false,
  );
  assert.equal(
    isSafeExplorationClick({ text: "系统设置", role: "menuitem", ariaExpanded: null }),
    false,
  );
  assert.equal(
    isSafeExplorationClick({ text: "删除记录", role: "menuitem", ariaExpanded: null }),
    false,
  );
});

test("validateExpectedHostResolution blocks non-test IP addresses", async () => {
  const pass = await validateExpectedHostResolution(
    {
      expectedHost: {
        hostname: "contract.example.test",
        allowedIps: ["172.21.1.172"],
      },
    },
    async () => ["172.21.1.172"],
  );
  assert.equal(pass.allowed, true);

  const fail = await validateExpectedHostResolution(
    {
      expectedHost: {
        hostname: "contract.example.test",
        allowedIps: ["172.21.1.172"],
      },
    },
    async () => ["10.10.10.10"],
  );
  assert.equal(fail.allowed, false);
  assert.match(fail.reason, /不在测试环境 IP 白名单/);
});

test("isSafeExplorationClick allows menu expansion but blocks high-impact actions", () => {
  assert.equal(
    isSafeExplorationClick({ text: "合同管理", role: "menuitem", ariaExpanded: "false" }),
    true,
  );
  assert.equal(
    isSafeExplorationClick({ text: "展开", role: "button", ariaExpanded: "false" }),
    true,
  );
  assert.equal(
    isSafeExplorationClick({ text: "删除", role: "button", ariaExpanded: "false" }),
    false,
  );
  assert.equal(
    isSafeExplorationClick({ text: "提交审批", role: "button", ariaExpanded: "false" }),
    false,
  );
  assert.equal(
    isSafeExplorationClick({ text: "查询", role: "button", ariaExpanded: null }),
    false,
  );
});

test("isSafeInspectionClick opens read-only or form inspection entrypoints only", () => {
  assert.equal(isSafeInspectionClick({ text: "新增合同", role: "button" }), true);
  assert.equal(isSafeInspectionClick({ text: "查看详情", role: "button" }), true);
  assert.equal(isSafeInspectionClick({ text: "高级查询", role: "button" }), true);
  assert.equal(isSafeInspectionClick({ text: "保存", role: "button" }), false);
  assert.equal(isSafeInspectionClick({ text: "确认删除", role: "button" }), false);
  assert.equal(isSafeInspectionClick({ text: "提交审批", role: "button" }), false);
});

test("mergeContainerSnapshotIntoEvidence records modal or drawer as page evidence", () => {
  const evidence = createInitialEvidence({
    code: "contract",
    name: "合同管理系统",
    url: "https://contract.example.test/",
  });

  mergeContainerSnapshotIntoEvidence(evidence, {
    id: "container-1",
    sourcePageId: "page-home",
    type: "modal",
    title: "新增合同",
    buttons: ["保存", "取消"],
    forms: [{ formName: "新增合同表单", fields: [{ label: "合同名称" }] }],
    screenshot: {
      id: "shot-modal-1",
      file: "screenshots/modal.png",
      caption: "新增合同弹窗。",
      module: "合同管理",
      function: "合同新增",
    },
  });

  assert.equal(evidence.pageInventory[0].type, "modal");
  assert.equal(evidence.actionInventory.length, 2);
  assert.equal(evidence.formInventory[0].formName, "新增合同表单");
  assert.equal(evidence.screenshotIndex[0].caption, "新增合同弹窗。");
});

test("mergePageSnapshotIntoEvidence records pages, actions, forms, and screenshots", () => {
  const evidence = createInitialEvidence({
    code: "contract",
    name: "合同管理系统",
    url: "https://contract.example.test/",
  });

  mergePageSnapshotIntoEvidence(evidence, {
    id: "page-home",
    menuPath: "首页",
    type: "home",
    title: "合同首页",
    url: "https://contract.example.test/",
    links: [{ text: "合同列表", href: "https://contract.example.test/contracts" }],
    buttons: ["新增", "删除"],
    forms: [{ formName: "查询表单", fields: [] }],
    tables: [{ tableName: "合同列表", columns: ["合同编号", "合同名称"] }],
    landmarks: ["main"],
    screenshot: {
      id: "shot-home",
      file: "screenshots/home.png",
      caption: "首页截图。",
      module: "首页",
      function: "系统入口",
    },
  });

  assert.equal(evidence.menuMap.length, 1);
  assert.equal(evidence.pageInventory.length, 1);
  assert.equal(evidence.actionInventory.length, 2);
  assert.equal(evidence.formInventory.length, 1);
  assert.equal(evidence.tableInventory.length, 1);
  assert.deepEqual(evidence.tableInventory[0].columns, ["合同编号", "合同名称"]);
  assert.equal(evidence.screenshotIndex[0].file, "screenshots/home.png");
});

test("selectMenusForCollection skips parent menus that have child menu pages", () => {
  const menuMap = [
    {
      title: "COA维护",
      menuPath: "基础管理 > COA维护",
      url: "https://example.test/base/accounting-dimension",
      status: "observed",
    },
    {
      title: "会计核算维度",
      menuPath: "基础管理 > COA维护 > 会计核算维度",
      url: "https://example.test/base/accounting-dimension/value",
      status: "observed",
    },
  ];
  const selected = selectMenusForCollection(menuMap, 10);
  assert.equal(selected.some((item) => item.title === "COA维护"), false);
  assert.equal(selected.some((item) => item.title === "会计核算维度"), true);
});

test("isCollectibleMenu allows settlement list pages but blocks shell menus", () => {
  const { isCollectibleMenu, isSystemShellMenu } = require("./system-whitepaper-lib");
  const menus = [
    {
      title: "保费结算表",
      menuPath: "保费結算 > 保费结算表",
      url: "https://example.test/settlement/premium-settlement",
    },
    {
      title: "财务中台",
      menuPath: "财务中台",
      url: "https://example.test/",
    },
    {
      title: "1",
      menuPath: "1",
      url: "",
    },
  ];
  assert.equal(isCollectibleMenu(menus[0], menus), true);
  assert.equal(isSystemShellMenu(menus[1]), true);
  assert.equal(isCollectibleMenu(menus[1], menus), false);
  assert.equal(isCollectibleMenu(menus[2], menus), false);
});

test("selectMenusForCollection skips menus that already have screenshots on resume", () => {
  const evidence = {
    pageInventory: [
      {
        id: "menu-page-1",
        type: "menu-page",
        menuPath: "基础管理 > 币种",
        url: "https://example.test/base/currency",
        screenshot: "screenshots/currency.png",
      },
    ],
    menuMap: [
      {
        title: "币种",
        menuPath: "基础管理 > 币种",
        url: "https://example.test/base/currency",
        status: "visited",
      },
      {
        title: "产品分类",
        menuPath: "基础管理 > 产品分类",
        url: "https://example.test/base/product-category",
        status: "observed",
      },
    ],
  };

  const selected = selectMenusForCollection(evidence.menuMap, 10, {
    onlyUnvisited: true,
    evidence,
  });
  assert.equal(selected.some((item) => item.title === "币种"), false);
  assert.equal(selected.some((item) => item.title === "产品分类"), true);
});

test("selectMenusForCollection includes leaf menus without path separator", () => {
  const menuMap = [
    {
      title: "欢迎",
      menuPath: "欢迎",
      url: "https://example.test/welcome",
      status: "observed",
    },
    {
      title: "币种",
      menuPath: "基础管理 > 币种",
      url: "https://example.test/base/currency",
      status: "observed",
    },
    {
      title: "基础管理",
      menuPath: "基础管理",
      url: "https://example.test/base",
      status: "observed",
    },
  ];

  const selected = selectMenusForCollection(menuMap, 10);
  assert.equal(selected.some((item) => item.title === "币种"), true);
  assert.equal(selected.some((item) => item.title === "欢迎"), false);
  assert.equal(selected.some((item) => item.title === "基础管理"), false);
});

test("selectMenusForCollection includes visible text-click menus without url", () => {
  const menuMap = [
    { title: "AI任务管理", menuPath: "AI任务管理", url: "", openStrategy: "text-click" },
    { title: "AI发布管理", menuPath: "AI发布管理", url: "", openStrategy: "text-click" },
  ];

  const selected = selectMenusForCollection(menuMap, 10);

  assert.equal(selected.length, 2);
  assert.equal(selected[0].title, "AI任务管理");
});

test("computeEvidenceMetrics marks visited menus and ignores observed-only write buttons", () => {
  const evidence = {
    menuMap: [
      {
        title: "币种",
        menuPath: "基础管理 > 币种",
        url: "https://example.test/base/currency",
        coreCoverage: true,
        status: "observed",
      },
      {
        title: "账套",
        menuPath: "基础管理 > 账套",
        url: "https://example.test/base/ledger",
        coreCoverage: true,
        status: "observed",
      },
    ],
    pageInventory: [
      {
        id: "menu-page-1",
        url: "https://example.test/base/currency",
        type: "menu-page",
        screenshot: "screenshots/currency.png",
      },
    ],
    actionInventory: [
      { name: "删除", type: "delete", pendingItem: true },
    ],
    tableInventory: [],
  };

  const metrics = computeEvidenceMetrics(evidence);

  assert.equal(evidence.menuMap[0].status, "visited");
  assert.equal(evidence.menuMap[1].status, "observed");
  assert.equal(metrics.menuCoverage, 0.5);
  assert.equal(metrics.writeOperationSafetyCompliance, 1);
});

test("buildQualityReport blocks finalization when gates fail", () => {
  const report = buildQualityReport({
    menuCoverage: 0.98,
    corePageScreenshotCoverage: 1,
    coreFunctionClassificationCoverage: 1,
    writeOperationSafetyCompliance: 1,
    unverifiedContentLabeling: 1,
    coreConclusionTraceability: 1,
    blockedItems: [{ severity: "P0", reason: "首页无法进入" }],
  });

  assert.equal(report.canFinalize, false);
  assert.match(report.failures.join("\n"), /menuCoverage/);
  assert.match(report.failures.join("\n"), /P0/);
});

test("readOperationGuideGate skips missing gate but rejects malformed gate", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { readOperationGuideGate } = require("./check-quality");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-"));
  const missingPath = path.join(dir, "missing-operation-guide-gate.json");
  const malformedPath = path.join(dir, "operation-guide-gate.json");
  fs.writeFileSync(malformedPath, "{bad json", "utf8");

  assert.equal(readOperationGuideGate(missingPath), null);
  assert.throws(
    () => readOperationGuideGate(malformedPath),
    /Operation guide gate is malformed/,
  );
});

test("check-quality fails on malformed operation guide gate without writing report", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-bad-gate-"));
  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      systemInfo: { code: "adp", name: "demo" },
      menuMap: [{ title: "首页", menuPath: "首页", status: "visited", coreCoverage: true }],
      pageInventory: [{ id: "page-1", type: "menu-page", menuPath: "首页", screenshot: "a.png" }],
      actionInventory: [],
      blockedItems: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "operation-guide-gate.json"), "{bad json", "utf8");

  const result = spawnSync(process.execPath, ["scripts/check-quality.js", "--input", dir], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Operation guide gate is malformed/);
  assert.equal(fs.existsSync(path.join(dir, "quality-report.json")), false);
});

test("mergeRegistrySystemWithExisting keeps technical menuApiPath from yaml", () => {
  const { mergeRegistrySystemWithExisting } = require("./systems-registry");
  const merged = mergeRegistrySystemWithExisting(
    { code: "pilot", name: "财务中台系统", url: "https://venus-fincenter.hzins.com/welcome" },
    {
      code: "pilot",
      menuApiPath: "/api/venus/center/getMenuList",
      expectedHost: { hostname: "venus-fincenter.hzins.com", allowedIps: ["172.21.1.172"] },
    },
  );
  assert.equal(merged.menuApiPath, "/api/venus/center/getMenuList");
  assert.equal(merged.expectedHost.hostname, "venus-fincenter.hzins.com");
});

test("parseSystemsRegistryFile reads xlsx directly", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    exportSystemsToRegistryXlsx,
    parseSystemsRegistryFile,
  } = require("./systems-registry");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "systems-xlsx-"));
  const xlsxPath = path.join(dir, "systems-registry.xlsx");
  exportSystemsToRegistryXlsx(
    [
      {
        code: "pilot",
        name: "财务中台系统",
        url: "https://venus-fincenter.hzins.com/welcome",
        allowedWriteActions: ["create", "edit"],
      },
    ],
    xlsxPath,
  );

  const systems = parseSystemsRegistryFile(xlsxPath);
  assert.equal(systems.length, 1);
  assert.equal(systems[0].code, "pilot");
  assert.deepEqual(systems[0].allowedWriteActions, ["create", "edit"]);
});

test("parseSystemsRegistryCsv maps Excel-friendly rows to system objects", () => {
  const { parseSystemsRegistryCsv } = require("./systems-registry");
  const systems = parseSystemsRegistryCsv(
    "启用,简称code,系统名称,测试环境URL,负责部门,优先级,环境域名,环境IP,允许写操作,禁止操作,备注\n" +
      "Y,pilot,财务中台系统,https://venus-fincenter.hzins.com/welcome,财务部,pilot,venus-fincenter.hzins.com,172.21.1.172,create;edit,send-sms,备注\n" +
      "N,disabled,禁用系统,https://example.test/,,,,,,,,\n",
  );
  assert.equal(systems.length, 1);
  assert.equal(systems[0].code, "pilot");
  assert.equal(systems[0].name, "财务中台系统");
  assert.deepEqual(systems[0].allowedWriteActions, ["create", "edit"]);
  assert.deepEqual(systems[0].expectedHost.allowedIps, ["172.21.1.172"]);
});

test("syncSystemsRegistryToConfig replaces systems section", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { syncSystemsRegistryToConfig } = require("./systems-registry");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "systems-registry-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const registryPath = path.join(dir, "systems-registry.csv");
  fs.writeFileSync(
    configPath,
    "auth:\n  tokenFile: ./token.txt\n\nruntime:\n  headless: true\n\nsystems:\n  - code: old\n    name: old\n    url: https://old.test/\n",
    "utf8",
  );
  fs.writeFileSync(
    registryPath,
    "启用,简称code,系统名称,测试环境URL\nY,pilot,财务中台系统,https://venus-fincenter.hzins.com/welcome\n",
    "utf8",
  );

  const result = syncSystemsRegistryToConfig({ configPath, registryPath });
  assert.equal(result.systemsCount, 1);
  const next = fs.readFileSync(configPath, "utf8");
  assert.match(next, /auth:\n  tokenFile: \.\/token\.txt/);
  assert.match(next, /- code: pilot/);
  assert.doesNotMatch(next, /code: old/);
});

test("resolveWhitepaperFileName follows 系统名称_系统功能白皮书_YYYYMMDD pattern", () => {
  const { resolveWhitepaperFileName } = require("./system-whitepaper-lib");
  const name = resolveWhitepaperFileName(
    {
      systemInfo: {
        name: "财务中台系统",
        collectedAt: "2026-05-20T02:47:06.380Z",
      },
    },
    { date: "2026-05-20T02:47:06.380Z" },
  );
  assert.equal(name, "财务中台系统_系统功能白皮书_20260520.md");
});

test("resolveWhitepaperPendingReviewFileName adds _待审 suffix", () => {
  const { resolveWhitepaperPendingReviewFileName } = require("./system-whitepaper-lib");
  const name = resolveWhitepaperPendingReviewFileName({
    systemInfo: { name: "AI保单数据闭环平台", collectedAt: "2026-05-20T02:47:06.380Z" },
  });
  assert.equal(name, "AI保单数据闭环平台_系统功能白皮书_20260520_待审.md");
});

test("syncWhitepaperNamedArtifacts mirrors internal files to display names", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { syncWhitepaperNamedArtifacts } = require("./system-whitepaper-lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-sync-"));
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# pending", "utf8");
  fs.writeFileSync(path.join(dir, "whitepaper.final.md"), "# final", "utf8");
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({ system: { name: "试点系统", collectedAt: "2026-05-21T08:00:00.000Z" } }),
    "utf8",
  );
  const named = syncWhitepaperNamedArtifacts({ systemOutput: dir });
  assert.equal(named.pendingReview, "试点系统_系统功能白皮书_20260521_待审.md");
  assert.equal(named.final, "试点系统_系统功能白皮书_20260521.md");
  assert.ok(fs.existsSync(path.join(dir, named.pendingReview)));
  assert.ok(fs.existsSync(path.join(dir, named.final)));
});

test("syncWhitepaperNamedArtifacts tolerates malformed evidence summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { syncWhitepaperNamedArtifacts } = require("./system-whitepaper-lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-sync-bad-summary-"));
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# pending", "utf8");
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), "{bad json", "utf8");

  const named = syncWhitepaperNamedArtifacts({
    systemOutput: dir,
    systemName: "试点系统",
    date: "2026-05-21T08:00:00.000Z",
  });

  assert.equal(named.pendingReview, "试点系统_系统功能白皮书_20260521_待审.md");
  assert.ok(fs.existsSync(path.join(dir, named.pendingReview)));
});

test("syncWhitepaperNamedArtifacts ignores non-object evidence summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadEvidenceSummaryForNaming, syncWhitepaperNamedArtifacts } = require("./system-whitepaper-lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-sync-array-summary-"));
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# pending", "utf8");
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify([{ system: { name: "错误结构系统", collectedAt: "2026-05-20T08:00:00.000Z" } }]),
    "utf8",
  );

  assert.deepEqual(loadEvidenceSummaryForNaming(dir), { systemInfo: { name: "", collectedAt: "" } });

  const named = syncWhitepaperNamedArtifacts({
    systemOutput: dir,
    systemName: "试点系统",
    date: "2026-05-21T08:00:00.000Z",
  });

  assert.equal(named.pendingReview, "试点系统_系统功能白皮书_20260521_待审.md");
  assert.ok(fs.existsSync(path.join(dir, named.pendingReview)));
});

test("finalizeWhitepaperMarkdown removes pending-review suffix from heading", () => {
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");
  const markdown = finalizeWhitepaperMarkdown(
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n正文",
    { systemName: "AI保单数据闭环平台" },
  );
  assert.match(markdown, /^# AI保单数据闭环平台功能白皮书\n/);
  assert.doesNotMatch(markdown, /待审/);
});

test("promotePendingReviewToFinal writes final markdown without pending title", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { promotePendingReviewToFinal } = require("./system-whitepaper-lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-finalize-"));
  const pendingPath = path.join(dir, "whitepaper.pending-review.md");
  const finalPath = path.join(dir, "whitepaper.final.md");
  fs.writeFileSync(pendingPath, "# 试点系统功能白皮书（待审核）\n", "utf8");
  promotePendingReviewToFinal(pendingPath, finalPath, { systemName: "试点系统" });
  const finalMarkdown = fs.readFileSync(finalPath, "utf8");
  assert.match(finalMarkdown, /^# 试点系统功能白皮书/);
  assert.doesNotMatch(finalMarkdown, /待审/);
});

test("recomputePipelineState marks completed/end when review approved", () => {
  const { NODES, createPipelineState, recomputePipelineState, updateNodeStatus } = require("./pipeline-state");
  let state = createPipelineState({ code: "adp", name: "demo" });
  for (const nodeId of NODES.map((node) => node.id)) {
    state = updateNodeStatus(state, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  state.review.status = "approved";
  state = recomputePipelineState(state);
  assert.equal(state.overallStatus, "finalized");
  assert.equal(state.currentPhase, "completed");
  assert.equal(state.currentNode, "end");
});

test("resolveDraftOutputPath defaults to whitepaper.draft.md beside evidence", () => {
  const output = resolveDraftOutputPath("outputs/contract/evidence.json");
  assert.equal(output, require("node:path").resolve("outputs/contract/whitepaper.draft.md"));
  assert.equal(
    resolveDraftOutputPath("outputs/contract/evidence.json", "custom.md"),
    require("node:path").resolve("custom.md"),
  );
});

test("buildEvidenceSummary compresses pages for narrative writing", () => {
  const evidence = {
    systemInfo: {
      code: "contract",
      name: "合同管理系统",
      testUrl: "https://contract.example.test/",
      loginRole: "全权限测试账号",
      collectedAt: "2026-05-20T00:00:00Z",
    },
    menuMap: [
      {
        menuPath: "合同管理 > 合同列表",
        title: "合同列表",
        url: "/contract/list",
        status: "visited",
      },
    ],
    pageInventory: [
      {
        id: "page-1",
        type: "menu-page",
        menuPath: "合同管理 > 合同列表",
        title: "合同列表",
        url: "https://contract.example.test/contract/list",
        evidenceRefs: ["shot-1"],
      },
      {
        id: "container-1",
        type: "container",
        sourcePageId: "page-1",
        title: "新增合同",
      },
    ],
    actionInventory: [
      { pageId: "page-1", name: "查询", type: "action" },
      { pageId: "page-1", name: "新增", type: "create", pendingItem: true },
      { pageId: "container-1", name: "保存", type: "submit", pendingItem: true },
    ],
    formInventory: [
      {
        pageId: "page-1",
        formName: "查询条件",
        fields: [{ label: "合同名称" }, { label: "合同编号" }],
      },
    ],
    tableInventory: [
      {
        pageId: "page-1",
        tableName: "合同列表",
        columns: ["合同编号", "合同名称", "状态", "操作"],
        rowCount: 10,
      },
    ],
    screenshotIndex: [
      {
        id: "shot-1",
        file: "screenshots/合同列表.png",
        module: "合同管理",
        function: "合同列表",
        caption: "合同列表页面。",
      },
    ],
    failedPages: [],
    pendingItems: [{ function: "新增合同", reason: "未提交验证" }],
  };

  const summary = buildEvidenceSummary(evidence);
  assert.equal(summary.system.code, "contract");
  assert.equal(summary.modules[0].name, "合同管理");
  assert.equal(summary.functions[0].menuPath, "合同管理 > 合同列表");
  assert.deepEqual(summary.functions[0].actions, ["查询", "新增"]);
  assert.deepEqual(summary.functions[0].queryFields, ["合同名称", "合同编号"]);
  assert.deepEqual(summary.functions[0].tableColumns, ["合同编号", "合同名称", "状态", "操作"]);
  assert.equal(summary.containers[0].title, "新增合同");
  assert.equal(summary.pendingItems.length, 1);
  assert.ok(summary.guidance.includes("docs/narrative-guide.md"));
});

test("buildPhase3bPrompt uses low-token inline inputs without reading large repo files", () => {
  const { buildPhase3bPrompt } = require("./narrative/phase3b");
  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummary: {
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 1 } },
      modules: [{ name: "AI任务", summary: "用于跟踪保单数据闭环任务" }],
      functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
      pendingItems: [{ reason: "写操作未提交验证" }],
    },
    draftPath: "outputs/adp/whitepaper.draft.md",
    outputPath: "outputs/adp/whitepaper.pending-review.md",
    qualityReport: {
      failures: [],
      warnings: ["证据边界需说明"],
      counts: { evidencePages: 1 },
    },
    verifiedClaims: {
      claims: [
        {
          id: "function:ai-task:list",
          type: "function-presence",
          subject: "任务列表",
          module: "AI任务",
          writable: true,
          status: "confirmed",
          text: "AI任务模块提供任务列表。",
        },
      ],
      writableClaimIds: ["function:ai-task:list"],
      metrics: { writableClaimCount: 1 },
    },
    factCheckReport: {
      canFinalize: false,
      missingWritableClaimIds: ["function:ai-task:list"],
      metrics: {
        writableClaimCount: 1,
        coveredWritableClaimCount: 0,
        missingWritableClaimCount: 1,
        writableClaimCoverageRatio: 0,
        minWritableClaimCoverage: 0.8,
      },
    },
  });

  assert.match(prompt, /narrative-brief\.md/);
  assert.match(prompt, /AI任务/);
  assert.match(prompt, /证据边界需说明/);
  assert.match(prompt, /verified-claims/);
  assert.match(prompt, /writable=true/);
  assert.match(prompt, /function:ai-task:list/);
  assert.match(prompt, /writable-claim-coverage-gap/);
  assert.match(prompt, /missingWritableClaims/);
  assert.doesNotMatch(prompt, /SKILL\.md/);
  assert.doesNotMatch(prompt, /docs\/narrative-guide\.md/);
  assert.doesNotMatch(prompt, /whitepaper\.draft\.md/);
  assert.doesNotMatch(prompt, /fin-center/);
  assert.match(prompt, /不要读取.*secrets\//);
  assert.match(prompt, /不要读取.*\.playwright-\*/);
});

test("phase3b prompt rejects non-object evidence summary file", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-summary-array-"));
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), "[]", "utf8");

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReport: {},
      }),
    /Evidence summary must be a JSON object/,
  );
});

test("phase3b prompt rejects non-object quality report file", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-quality-array-"));
  fs.writeFileSync(path.join(dir, "quality-report.json"), "[]", "utf8");

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReportPath: path.join(dir, "quality-report.json"),
      }),
    /Quality report must be a JSON object/,
  );
});

test("phase3b prompt rejects non-object verified claims file", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-claims-array-"));
  fs.writeFileSync(path.join(dir, "verified-claims.json"), "[]", "utf8");

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReport: {},
      }),
    /Verified claims must be a JSON object/,
  );
});

test("narrative brief and assembly keep business sections while appendix is script generated", () => {
  const {
    assemblePendingReviewMarkdown,
    buildNarrativeBrief,
    buildWhitepaperSkeleton,
  } = require("./narrative/phase3b");
  const summary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    metrics: { counts: { pages: 1 } },
    modules: [{ name: "AI任务", entry: "AI任务", summary: "用于闭环跟踪" }],
    functions: [
      {
        module: "AI任务",
        name: "任务列表",
        menuPath: "AI任务 > 任务列表",
        actions: ["查询"],
        tableColumns: ["保单号", "状态"],
        screenshots: [{ id: "shot-1", file: "screenshots/task.png" }],
      },
    ],
    pendingItems: [{ function: "任务列表", reason: "写操作未提交验证" }],
    failedPages: [],
  };
  const fragments = [
    "## 1. 系统概览",
    "AI保单数据闭环平台用于围绕保单数据处理任务建立跟踪、核对和留痕闭环。",
    "## 4. 典型业务流程",
    "业务人员可从任务列表识别待处理保单数据并跟进状态。",
  ].join("\n\n");

  const brief = buildNarrativeBrief({ systemName: "AI保单数据闭环平台", evidenceSummary: summary });
  const skeleton = buildWhitepaperSkeleton({ systemName: "AI保单数据闭环平台", evidenceSummary: summary });
  const markdown = assemblePendingReviewMarkdown({ evidenceSummary: summary, fragments });

  assert.match(brief, /不要读取 evidence\.json/);
  assert.match(brief, /不要读取.*secrets\//);
  assert.match(brief, /不要读取.*\.playwright-\*/);
  assert.match(skeleton, /本骨架由脚本基于 evidence-summary 生成/);
  assert.match(skeleton, /\[待升华：业务定位/);
  assert.match(skeleton, /#### 任务列表/);
  assert.match(markdown, /## 1\. 系统概览/);
  assert.match(markdown, /## 4\. 典型业务流程/);
  assert.match(markdown, /## 7\. 附录：证据索引/);
  assert.match(markdown, /screenshots\/task\.png/);
});

test("phase3b split prompts scope overview and module writing separately", () => {
  const {
    buildNarrativeParts,
    buildPhase3bPartPrompt,
    compactModuleSummary,
    compactOverviewSummary,
    selectNarrativeParts,
  } = require("./narrative/phase3b");
  const summary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务", entry: "AI任务", summary: "任务闭环" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
      { module: "发布管理", name: "发布列表", menuPath: "发布管理 > 发布列表" },
    ],
    pendingItems: [],
  };

  const overview = compactOverviewSummary(summary);
  const moduleSummary = compactModuleSummary(summary, "AI任务");
  const parts = buildNarrativeParts({ outputPath: "outputs/adp/whitepaper.pending-review.md" }, summary);
  const overviewPrompt = buildPhase3bPartPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: "outputs/adp/whitepaper.pending-review.md",
    part: parts[0],
    qualityReport: {},
  });
  const modulePrompt = buildPhase3bPartPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: "outputs/adp/whitepaper.pending-review.md",
    part: parts.find((item) => item.moduleName === "AI任务"),
    qualityReport: {},
  });

  assert.equal(overview.functions, undefined);
  assert.equal(moduleSummary.functions.length, 1);
  assert.equal(moduleSummary.functions[0].name, "任务列表");
  assert.equal(parts.length, 3);
  assert.deepEqual(selectNarrativeParts(parts, "overview-flow").map((item) => item.id), ["overview-flow"]);
  assert.equal(selectNarrativeParts(parts, "function-sections").length, 2);
  assert.deepEqual(selectNarrativeParts(parts, "AI任务").map((item) => item.moduleName), ["AI任务"]);
  assert.deepEqual(
    selectNarrativeParts(parts, "AI任务，发布管理").map((item) => item.moduleName),
    ["AI任务", "发布管理"],
  );
  assert.match(overviewPrompt, /不要写 ## 3 核心功能说明/);
  assert.match(overviewPrompt, /不要读取.*secrets\//);
  assert.match(overviewPrompt, /不要读取.*\.playwright-\*/);
  assert.match(modulePrompt, /只写模块「AI任务」/);
  assert.match(modulePrompt, /## 2 功能模块概览中的该模块条目/);
  assert.match(modulePrompt, /不要写系统概览、典型流程/);
});

test("phase3b part prompt filters writable claim gap to selected module", () => {
  const { buildNarrativeParts, buildPhase3bPartPrompt } = require("./narrative/phase3b");
  const summary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务" }, { name: "发布管理" }],
    functions: [
      { module: "AI任务", name: "任务列表" },
      { module: "发布管理", name: "发布列表" },
    ],
  };
  const claims = {
    claims: [
      {
        id: "function:ai-task:list",
        type: "function-presence",
        subject: "任务列表",
        module: "AI任务",
        writable: true,
        status: "confirmed",
      },
      {
        id: "function:publish:list",
        type: "function-presence",
        subject: "发布列表",
        module: "发布管理",
        writable: true,
        status: "confirmed",
      },
    ],
    writableClaimIds: ["function:ai-task:list", "function:publish:list"],
  };
  const parts = buildNarrativeParts({ outputPath: "outputs/adp/whitepaper.pending-review.md" }, summary);
  const prompt = buildPhase3bPartPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: "outputs/adp/whitepaper.pending-review.md",
    part: parts.find((item) => item.moduleName === "AI任务"),
    qualityReport: {},
    verifiedClaims: claims,
    factCheckReport: {
      missingWritableClaimIds: ["function:ai-task:list", "function:publish:list"],
      metrics: { writableClaimCoverageRatio: 0.5, minWritableClaimCoverage: 0.8 },
    },
  });

  assert.match(prompt, /function:ai-task:list/);
  assert.doesNotMatch(prompt, /function:publish:list/);
});

test("phase3b module part paths avoid slug collisions", () => {
  const { buildNarrativeParts } = require("./narrative/phase3b");
  const parts = buildNarrativeParts(
    { outputPath: "outputs/adp/whitepaper.pending-review.md" },
    {
      functions: [
        { module: "AI/任务", name: "任务列表" },
        { module: "AI:任务", name: "任务看板" },
      ],
    },
  ).filter((item) => item.type === "module");

  assert.equal(parts.length, 2);
  assert.equal(new Set(parts.map((item) => item.id)).size, 2);
  assert.equal(new Set(parts.map((item) => item.promptPath)).size, 2);
  assert.equal(new Set(parts.map((item) => item.outputPath)).size, 2);
  assert.ok(parts.some((item) => item.id === "module-AI-任务"));
});

test("phase3b builds module parts from module inventory without functions", () => {
  const { buildNarrativeParts, compactModuleSummary, selectNarrativeParts } = require("./narrative/phase3b");
  const summary = {
    modules: [{ name: "数据监控", entry: "数据监控", summary: "监控数据闭环" }],
    functions: [],
  };

  const parts = buildNarrativeParts({ outputPath: "outputs/adp/whitepaper.pending-review.md" }, summary);
  const moduleSummary = compactModuleSummary(summary, "数据监控");

  assert.deepEqual(parts.filter((item) => item.type === "module").map((item) => item.moduleName), ["数据监控"]);
  assert.deepEqual(selectNarrativeParts(parts, "function-sections").map((item) => item.moduleName), ["数据监控"]);
  assert.deepEqual(selectNarrativeParts(parts, "数据监控").map((item) => item.moduleName), ["数据监控"]);
  assert.equal(moduleSummary.module.summary, "监控数据闭环");
  assert.deepEqual(moduleSummary.functions, []);
});

test("manual phase3b provider writes prompt without fabricating pending review", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-adp-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 1 } },
      modules: [],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify({ failures: [], warnings: [], counts: { evidencePages: 1 } }),
    "utf8",
  );
  const result = await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    draftPath: path.join(dir, "whitepaper.draft.md"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  });

  assert.equal(result.status, "manual-required");
  assert.ok(fs.existsSync(path.join(dir, "phase3b-prompt.md")));
  assert.ok(fs.existsSync(path.join(dir, "narrative-brief.md")));
  assert.ok(fs.existsSync(path.join(dir, "whitepaper.skeleton.md")));
  assert.ok(fs.existsSync(path.join(dir, "phase3b-prompts", "overview-flow-prompt.md")));
  assert.ok(fs.existsSync(path.join(dir, "phase3b-usage.json")));
  assert.match(fs.readFileSync(path.join(dir, "phase3b-prompt.md"), "utf8"), /narrative-fragments\.md/);
  assert.equal(result.partPrompts.length, 1);
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.pending-review.md")), false);
});

test("manual phase3b can expose only selected narrative part prompts", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-part-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");

  const result = await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    narrativePart: "overview-flow",
  });

  assert.equal(result.narrativePart, "overview-flow");
  assert.deepEqual(result.partPrompts.map((item) => item.id), ["overview-flow"]);
  assert.ok(fs.existsSync(path.join(dir, "phase3b-prompts", "module-AI任务-prompt.md")));
});

test("manual phase3b part rerun ignores stale review decision without review flag", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-part-stale-review-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }],
      functions: [{ module: "AI任务", name: "任务列表" }],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "旧审核意见不应污染普通局部分片重跑",
      rewriteScope: "overview-flow",
      targetSections: ["1", "4"],
      instructions: "只重写系统概览。",
    }),
    "utf8",
  );

  await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    narrativePart: "overview-flow",
  });

  const prompt = fs.readFileSync(path.join(dir, "phase3b-prompts", "overview-flow-prompt.md"), "utf8");
  assert.doesNotMatch(prompt, /审核驳回意见/);
  assert.doesNotMatch(prompt, /旧审核意见不应污染普通局部分片重跑/);
});

test("phase3b cursor-sdk part mode sends selected prompts and records actual prompt chars", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    resolveCursorSdkPrompts,
    writePreparationFiles,
    writeUsage,
  } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-sdk-part-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");

  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    narrativePart: "overview-flow",
    reviewRerun: true,
    reviewDecision: {
      status: "rejected",
      rewriteScope: "overview-flow",
      narrativePart: "overview-flow",
      targetSections: ["1", "4"],
      targetModules: [],
    },
  };
  const prepared = writePreparationFiles(context);
  const promptRuns = resolveCursorSdkPrompts(prepared, context);
  const sentPromptChars = promptRuns.reduce((sum, item) => sum + item.prompt.length, 0);
  const generatedPromptChars =
    fs.readFileSync(path.join(dir, "phase3b-prompt.md"), "utf8").length +
    fs
      .readdirSync(path.join(dir, "phase3b-prompts"))
      .map((name) => fs.readFileSync(path.join(dir, "phase3b-prompts", name), "utf8").length)
      .reduce((sum, value) => sum + value, 0);
  const generatedPromptPartCount = fs
    .readdirSync(path.join(dir, "phase3b-prompts"))
    .filter((name) => name.endsWith(".md")).length;

  writeUsage(context, {
    provider: "cursor-sdk",
    promptChars: sentPromptChars,
    mainPromptChars: 0,
    partPromptChars: sentPromptChars,
    sentPromptRuns: promptRuns.map((item) => ({
      id: item.id,
      type: item.type,
      moduleName: item.moduleName || "",
      promptPath: item.promptPath,
      outputPath: item.outputPath,
    })),
    inlineSummaryChars: 0,
    usageSource: "estimated",
    usageEstimated: true,
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.deepEqual(promptRuns.map((item) => item.id), ["overview-flow"]);
  assert.ok(sentPromptChars < generatedPromptChars);
  assert.equal(usage.narrativePart, "overview-flow");
  assert.equal(usage.reviewRerun, true);
  assert.equal(usage.reviewDecision.rewriteScope, "overview-flow");
  assert.equal(usage.promptChars, sentPromptChars);
  assert.equal(usage.mainPromptChars, 0);
  assert.equal(usage.partPromptChars, sentPromptChars);
  assert.equal(usage.generatedPromptChars, generatedPromptChars);
  assert.equal(usage.generatedPromptPartCount, generatedPromptPartCount);
  assert.equal(usage.sentPromptRunCount, 1);
  assert.equal(usage.sentPromptPartCount, 1);
  assert.deepEqual(usage.sentPromptRuns.map((item) => item.id), ["overview-flow"]);
  assert.deepEqual(usage.sentPromptRuns.map((item) => item.type), ["overview"]);
  assert.equal(usage.sentPromptRuns[0].promptPath, undefined);
  assert.equal(usage.sentPromptRuns[0].outputPath, undefined);
});

test("phase3b usage sanitizes malformed sent prompt run summaries", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-sanitize-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    sentPromptRuns: [
      null,
      "",
      "legacy-module",
      {
        id: " module-AI任务 ",
        type: " module ",
        moduleName: " AI任务 ",
        promptPath: "D:/secret/output/phase3b-prompts/module-AI任务-prompt.md",
        outputPath: "D:/secret/output/narrative-fragments/module-AI任务.md",
      },
      {},
    ],
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.sentPromptRunCount, 2);
  assert.equal(usage.sentPromptPartCount, 2);
  assert.deepEqual(usage.sentPromptRuns, [
    { id: "legacy-module", type: "", moduleName: "" },
    { id: "module-AI任务", type: "module", moduleName: "AI任务" },
  ]);
  assert.equal(usage.sentPromptRuns.some((item) => item.promptPath || item.outputPath), false);
});

test("phase3b usage normalizes invalid numeric metadata", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-numeric-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    promptChars: 10.9,
    mainPromptChars: -5,
    partPromptChars: Infinity,
    generatedPromptChars: 20.8,
    generatedPromptPartCount: 2.9,
    sentPromptRunCount: "bad",
    sentPromptPartCount: -10,
    sentPromptRuns: [{ id: "module-AI任务", type: "module", moduleName: "AI任务" }],
    pendingReviewChars: 3.9,
    inlineSummaryChars: 4.8,
    inputTokens: 5.7,
    outputTokens: 6.6,
    totalTokens: 11.9,
    cacheReadTokens: 1.5,
    cacheWriteTokens: 2.5,
    durationMs: 9.9,
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.promptChars, 10);
  assert.equal(usage.mainPromptChars, 0);
  assert.equal(usage.partPromptChars, 0);
  assert.equal(usage.generatedPromptChars, 20);
  assert.equal(usage.generatedPromptPartCount, 2);
  assert.equal(usage.sentPromptRunCount, 1);
  assert.equal(usage.sentPromptPartCount, 1);
  assert.equal(usage.pendingReviewChars, 3);
  assert.equal(usage.inlineSummaryChars, 4);
  assert.equal(usage.durationMs, 9);
  assert.equal(usage.inputTokens, 5);
  assert.equal(usage.outputTokens, 6);
  assert.equal(usage.totalTokens, 11);
  assert.equal(usage.cacheReadTokens, 1);
  assert.equal(usage.cacheWriteTokens, 2);
});

test("phase3b usage treats empty sent prompt counts as missing but keeps explicit zero", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-empty-count-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    sentPromptRunCount: "",
    sentPromptPartCount: null,
    sentPromptRuns: [{ id: "module-AI任务", type: "module", moduleName: "AI任务" }],
  });
  let usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.sentPromptRunCount, 1);
  assert.equal(usage.sentPromptPartCount, 1);

  writeUsage(context, {
    provider: "cursor-sdk",
    sentPromptRunCount: 0,
    sentPromptPartCount: "0",
    sentPromptRuns: [{ id: "module-AI任务", type: "module", moduleName: "AI任务" }],
  });
  usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.sentPromptRunCount, 0);
  assert.equal(usage.sentPromptPartCount, 0);
});

test("phase3b usage rebuilds malformed usage history cache", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-bad-history-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");
  fs.writeFileSync(path.join(dir, "phase3b-usage-history.json"), "{bad json", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    totalTokens: 123,
    usageSource: "sdk",
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  const history = JSON.parse(
    fs.readFileSync(path.join(dir, "phase3b-usage-history.json"), "utf8"),
  );
  assert.equal(usage.systemCode, "adp");
  assert.equal(history.length, 1);
  assert.equal(history[0].systemCode, "adp");
  assert.equal(history[0].totalTokens, 123);
});

test("phase3b usage keeps explicit review comment when decision cache is malformed", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-bad-review-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    reviewRerun: true,
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");
  fs.writeFileSync(path.join(dir, "review-decision.json"), "{bad json", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    reviewComment: "显式审核意见：只修订系统概览表达。",
    totalTokens: 123,
    usageSource: "sdk",
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.reviewRerun, true);
  assert.equal(usage.reviewComment, "显式审核意见：只修订系统概览表达。");
  assert.equal(usage.reviewDecision, null);
});

test("phase3b usage prefers explicit review decision over malformed decision cache", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeUsage } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-usage-explicit-review-"));
  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    reviewRerun: true,
  };
  fs.writeFileSync(context.promptOutputPath, "prompt", "utf8");
  fs.writeFileSync(path.join(dir, "review-decision.json"), "{bad json", "utf8");

  writeUsage(context, {
    provider: "cursor-sdk",
    reviewDecision: {
      status: "rejected",
      comment: "显式决策意见：只修订概览。",
      rewriteScope: "overview-flow",
      targetSections: ["1"],
      targetModules: [],
    },
    totalTokens: 123,
    usageSource: "sdk",
  });

  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));
  assert.equal(usage.reviewRerun, true);
  assert.equal(usage.reviewComment, "显式决策意见：只修订概览。");
  assert.equal(usage.reviewDecision.rewriteScope, "overview-flow");
  assert.deepEqual(usage.reviewDecision.targetSections, ["1"]);
});

test("phase3b cursor-sdk part mode supports multi-module selectors", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    resolveCursorSdkPrompts,
    writePreparationFiles,
  } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-sdk-multi-part-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }, { name: "发布管理" }, { name: "数据监控" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
        { module: "数据监控", name: "监控看板" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");

  const context = {
    provider: "cursor-sdk",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    narrativePart: "AI任务，发布管理",
  };
  const prepared = writePreparationFiles(context);
  const promptRuns = resolveCursorSdkPrompts(prepared, context);

  assert.deepEqual(promptRuns.map((item) => item.moduleName), ["AI任务", "发布管理"]);
  assert.deepEqual(promptRuns.map((item) => item.type), ["module", "module"]);
  assert.equal(promptRuns.some((item) => item.id === "full"), false);
  assert.deepEqual(prepared.selectedParts.map((item) => item.moduleName), ["AI任务", "发布管理"]);
});

test("phase3b rejects unknown narrative part selectors", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writePreparationFiles } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-bad-part-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }],
      functions: [{ module: "AI任务", name: "任务列表" }],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");

  assert.throws(
    () =>
      writePreparationFiles({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReportPath: path.join(dir, "quality-report.json"),
        promptOutputPath: path.join(dir, "phase3b-prompt.md"),
        narrativePart: "not-a-real-part",
      }),
    /No narrative parts matched selector/,
  );
});

test("manual phase3b assembles pending review from split fragments", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-split-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 2 } },
      modules: [{ name: "AI任务", entry: "AI任务" }],
      functions: [
        {
          module: "AI任务",
          name: "任务列表",
          menuPath: "AI任务 > 任务列表",
          screenshots: [{ file: "screenshots/task.png" }],
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");
  fs.mkdirSync(path.join(dir, "narrative-fragments"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "overview-flow.md"),
    [
      "## 1. 系统概览",
      "AI保单数据闭环平台用于支撑保单数据处理闭环。",
      "## 2. 功能模块概览",
      "- AI任务：用于任务跟踪。",
      "## 4. 典型业务流程",
      "业务人员查看任务并跟进状态。",
      "## 5. 使用角色与权限边界",
      "以测试账号可见范围为准。",
      "## 6. 待确认事项",
      "- 暂无。",
    ].join("\n\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "module-AI任务.md"),
    ["### AI任务", "", "#### 任务列表", "", "用于查看保单数据处理任务和状态。"].join("\n"),
    "utf8",
  );

  const result = await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  });

  const pending = fs.readFileSync(path.join(dir, "whitepaper.pending-review.md"), "utf8");
  assert.equal(result.outputPath, path.join(dir, "whitepaper.pending-review.md"));
  assert.match(pending, /## 3\. 核心功能说明/);
  assert.match(pending, /#### 任务列表/);
  assert.match(pending, /## 7\. 附录：证据索引/);
});

test("phase3b part assembly replaces selected fragments while preserving baseline sections", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-rewrite-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "narrative-fragments.md"),
    [
      "## 1. 系统概览",
      "旧概览。",
      "## 2. 功能模块概览",
      "- **AI任务**：旧AI任务概览。",
      "- **发布管理**：旧发布管理概览。",
      "## 3. 核心功能说明",
      "### AI任务",
      "旧AI任务说明。",
      "### 发布管理",
      "旧发布管理说明。",
      "## 4. 典型业务流程",
      "旧流程。",
      "## 5. 使用角色与权限边界",
      "旧权限。",
      "## 6. 待确认事项",
      "- 旧待确认。",
    ].join("\n\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "narrative-fragments"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "overview-flow.md"),
    [
      "## 1. 系统概览",
      "新概览。",
      "## 2. 功能模块概览",
      "新模块概览。",
      "## 4. 典型业务流程",
      "新流程。",
      "## 5. 使用角色与权限边界",
      "新权限。",
      "## 6. 待确认事项",
      "- 新待确认。",
    ].join("\n\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "module-AI任务.md"),
    [
      "## 2. 功能模块概览",
      "- **AI任务**：新AI任务概览。",
      "## 3. 核心功能说明",
      "### AI任务",
      "新AI任务说明。",
    ].join("\n\n"),
    "utf8",
  );

  await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    forceAssembleParts: true,
  });

  const fragments = fs.readFileSync(path.join(dir, "narrative-fragments.md"), "utf8");
  assert.match(fragments, /新概览/);
  assert.match(fragments, /新AI任务概览/);
  assert.match(fragments, /旧发布管理概览/);
  assert.match(fragments, /新AI任务说明/);
  assert.match(fragments, /旧发布管理说明/);
  assert.doesNotMatch(fragments, /旧AI任务概览/);
  assert.doesNotMatch(fragments, /旧AI任务说明/);
  assert.doesNotMatch(fragments, /旧概览/);
});

test("phase3b part assembly ignores stale unselected module fragments", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    assembleIfFragmentsExist,
    buildNarrativeParts,
    selectNarrativeParts,
  } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-stale-part-"));
  fs.writeFileSync(
    path.join(dir, "narrative-fragments.md"),
    [
      "## 2. 功能模块概览",
      "- **AI任务**：旧AI任务概览。",
      "- **发布管理**：基线发布管理概览。",
      "## 3. 核心功能说明",
      "### AI任务",
      "旧AI任务说明。",
      "### 发布管理",
      "基线发布管理说明。",
    ].join("\n\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "narrative-fragments"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "module-AI任务.md"),
    [
      "## 2. 功能模块概览",
      "- **AI任务**：新AI任务概览。",
      "## 3. 核心功能说明",
      "### AI任务",
      "新AI任务说明。",
    ].join("\n\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "module-发布管理.md"),
    [
      "## 2. 功能模块概览",
      "- **发布管理**：残留旧发布管理概览。",
      "## 3. 核心功能说明",
      "### 发布管理",
      "残留旧发布管理说明。",
    ].join("\n\n"),
    "utf8",
  );

  const parts = buildNarrativeParts(
    { outputPath: path.join(dir, "whitepaper.pending-review.md") },
    {
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    },
  );
  const selectedParts = selectNarrativeParts(parts, "AI任务");
  assembleIfFragmentsExist(
    {
      outputPath: path.join(dir, "whitepaper.pending-review.md"),
      systemName: "AI保单数据闭环平台",
      forceAssembleParts: true,
    },
    { system: { name: "AI保单数据闭环平台" }, functions: [] },
    parts,
    selectedParts,
  );

  const fragments = fs.readFileSync(path.join(dir, "narrative-fragments.md"), "utf8");
  assert.match(fragments, /新AI任务概览/);
  assert.match(fragments, /新AI任务说明/);
  assert.match(fragments, /基线发布管理概览/);
  assert.match(fragments, /基线发布管理说明/);
  assert.doesNotMatch(fragments, /残留旧发布管理/);
});

test("phase3b overview-only assembly replaces section 2 when no module fragments are selected", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    assembleIfFragmentsExist,
    buildNarrativeParts,
    selectNarrativeParts,
  } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-overview-section-"));
  fs.writeFileSync(
    path.join(dir, "narrative-fragments.md"),
    [
      "## 1. 系统概览",
      "旧概览。",
      "## 2. 功能模块概览",
      "旧模块概览。",
      "## 3. 核心功能说明",
      "### AI任务",
      "旧AI任务说明。",
    ].join("\n\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "narrative-fragments"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "narrative-fragments", "overview-flow.md"),
    [
      "## 1. 系统概览",
      "新概览。",
      "## 2. 功能模块概览",
      "新模块总体概览，不拆成条目。",
      "## 4. 典型业务流程",
      "新流程。",
    ].join("\n\n"),
    "utf8",
  );

  const parts = buildNarrativeParts(
    { outputPath: path.join(dir, "whitepaper.pending-review.md") },
    { functions: [{ module: "AI任务", name: "任务列表" }] },
  );
  const selectedParts = selectNarrativeParts(parts, "overview-flow");
  assembleIfFragmentsExist(
    {
      outputPath: path.join(dir, "whitepaper.pending-review.md"),
      systemName: "AI保单数据闭环平台",
      forceAssembleParts: true,
    },
    { system: { name: "AI保单数据闭环平台" }, functions: [] },
    parts,
    selectedParts,
  );

  const fragments = fs.readFileSync(path.join(dir, "narrative-fragments.md"), "utf8");
  assert.match(fragments, /新概览/);
  assert.match(fragments, /新模块总体概览/);
  assert.match(fragments, /旧AI任务说明/);
  assert.doesNotMatch(fragments, /旧模块概览/);
});

test("phase3b module overview matching preserves module names with spaces", () => {
  const {
    assembleFragmentsFromParts,
    buildNarrativeParts,
    selectNarrativeParts,
  } = require("./narrative/phase3b");
  const parts = buildNarrativeParts(
    { outputPath: "outputs/adp/whitepaper.pending-review.md" },
    {
      functions: [
        { module: "AI 任务管理", name: "任务列表" },
        { module: "AI 脚本管理", name: "脚本列表" },
      ],
    },
  );
  const selected = selectNarrativeParts(parts, "AI 任务管理");
  selected[0].content = [
    "## 2. 功能模块概览",
    "- **AI 任务管理**：新任务模块概览。",
    "## 3. 核心功能说明",
    "### AI 任务管理",
    "新任务模块说明。",
  ].join("\n\n");

  const fragments = assembleFragmentsFromParts(selected, {
    baselineFragments: [
      "## 2. 功能模块概览",
      "- **AI 任务管理**：旧任务模块概览。",
      "- **AI 脚本管理**：旧脚本模块概览。",
      "## 3. 核心功能说明",
      "### AI 任务管理",
      "旧任务模块说明。",
      "### AI 脚本管理",
      "旧脚本模块说明。",
    ].join("\n\n"),
  });

  assert.match(fragments, /新任务模块概览/);
  assert.match(fragments, /新任务模块说明/);
  assert.match(fragments, /旧脚本模块概览/);
  assert.match(fragments, /旧脚本模块说明/);
  assert.doesNotMatch(fragments, /旧任务模块概览/);
});

test("phase3b core function matching normalizes decorated module headings", () => {
  const {
    assembleFragmentsFromParts,
    buildNarrativeParts,
    selectNarrativeParts,
  } = require("./narrative/phase3b");
  const parts = buildNarrativeParts(
    { outputPath: "outputs/adp/whitepaper.pending-review.md" },
    {
      functions: [
        { module: "AI 任务管理", name: "任务列表" },
        { module: "AI 脚本管理", name: "脚本列表" },
      ],
    },
  );
  const selected = selectNarrativeParts(parts, "AI 任务管理");
  selected[0].content = [
    "## 3. 核心功能说明",
    "### AI 任务管理：修订版",
    "新任务模块说明。",
  ].join("\n\n");

  const fragments = assembleFragmentsFromParts(selected, {
    baselineFragments: [
      "## 3. 核心功能说明",
      "### **AI 任务管理**",
      "旧任务模块说明。",
      "### AI 脚本管理",
      "旧脚本模块说明。",
    ].join("\n\n"),
  });

  assert.match(fragments, /新任务模块说明/);
  assert.match(fragments, /旧脚本模块说明/);
  assert.doesNotMatch(fragments, /旧任务模块说明/);
});

test("ensure dispose symbols polyfill exposes Symbol.dispose on current node", () => {
  const { ensureDisposeSymbols } = require("./narrative/ensure-dispose-symbols");
  ensureDisposeSymbols();
  assert.equal(typeof Symbol.dispose, "symbol");
  assert.equal(typeof Symbol.asyncDispose, "symbol");
});

test("manual phase3b appends usage history for cost comparison", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-history-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 1 } },
      modules: [],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");

  const context = {
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  };
  await runPhase3b(context);
  await runPhase3b(context);

  const history = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage-history.json"), "utf8"));
  assert.equal(history.length, 2);
  assert.equal(history[0].provider, "manual");
  assert.equal(history[1].systemCode, "adp");
});

test("manual phase3b usage does not count stale pending review without fragments", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-stale-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 1 } },
      modules: [],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# stale", "utf8");

  const result = await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
  });
  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));

  assert.equal(result.outputPath, "");
  assert.equal(usage.pendingReviewChars, 0);
});

test("manual phase3b usage records review rerun metadata", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPhase3b } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-review-usage-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 1 } },
      modules: [],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "系统定位需要更业务化",
      rewriteScope: "overview-flow",
      targetSections: ["1", "4"],
      targetModules: [],
      narrativePart: "overview-flow",
    }),
    "utf8",
  );

  await runPhase3b({
    provider: "manual",
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    promptOutputPath: path.join(dir, "phase3b-prompt.md"),
    narrativePart: "overview-flow",
    reviewRerun: true,
  });
  const usage = JSON.parse(fs.readFileSync(path.join(dir, "phase3b-usage.json"), "utf8"));

  assert.equal(usage.reviewRerun, true);
  assert.equal(usage.narrativePart, "overview-flow");
  assert.equal(usage.reviewComment, "系统定位需要更业务化");
  assert.equal(usage.reviewDecision.rewriteScope, "overview-flow");
  assert.deepEqual(usage.reviewDecision.targetSections, ["1", "4"]);
});

test("phase3b prompt reads review decision for targeted narrative rewrite", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-review-"));
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "系统定位和典型业务流程还不够业务化",
      rewriteScope: "overview-flow",
      targetSections: ["1", "4"],
      instructions: "只重写系统概览和典型业务流程，保留证据边界。",
    }),
    "utf8",
  );

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
    reviewRerun: true,
  });

  assert.match(prompt, /审核驳回意见/);
  assert.match(prompt, /overview-flow/);
  assert.match(prompt, /只重写系统概览和典型业务流程/);
  assert.doesNotMatch(prompt, /重写整份/);
});

test("phase3b prompt describes evidence refresh as full narrative rerun", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-evidence-refresh-"));
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "任务列表页面截图遗漏，没有采集到。",
      rewriteScope: "evidence-refresh",
      targetSections: [],
      instructions: "先补充缺失页面、截图、弹窗或字段证据，再重新生成叙事片段并执行质量检查。",
    }),
    "utf8",
  );

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
    reviewRerun: true,
  });

  assert.match(prompt, /审核驳回意见/);
  assert.match(prompt, /证据刷新后全量成稿/);
  assert.match(prompt, /全量正文，按更新后的 evidence-summary 重写/);
  assert.match(prompt, /重新生成叙事片段/);
  assert.doesNotMatch(prompt, /局部重写范围：evidence-refresh/);
});

test("phase3b part prompt describes evidence refresh as scoped part rerun", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPartPrompt, buildNarrativeParts } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-part-evidence-refresh-"));
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "任务列表页面截图遗漏，没有采集到。",
      rewriteScope: "evidence-refresh",
      targetSections: [],
      instructions: "先补充缺失页面、截图、弹窗或字段证据，再重新生成叙事片段并执行质量检查。",
    }),
    "utf8",
  );
  const evidenceSummary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务" }],
    functions: [{ module: "AI任务", name: "任务列表" }],
  };
  const [part] = buildNarrativeParts(
    { outputPath: path.join(dir, "whitepaper.pending-review.md") },
    evidenceSummary,
  );

  const prompt = buildPhase3bPartPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    part,
    evidenceSummary,
    qualityReport: {},
    reviewRerun: true,
  });

  assert.match(prompt, /审核驳回意见/);
  assert.match(prompt, /证据刷新后分片成稿/);
  assert.match(prompt, /本分片范围，按更新后的分片 evidence-summary 重写/);
  assert.doesNotMatch(prompt, /证据刷新后全量成稿/);
  assert.doesNotMatch(prompt, /全量正文，按更新后的 evidence-summary 重写/);
});

test("phase3b prompt ignores stale review decision outside review reruns", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-stale-review-"));
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "旧审核意见不应污染普通全量生成",
      rewriteScope: "overview-flow",
      targetSections: ["1", "4"],
      instructions: "只重写系统概览。",
    }),
    "utf8",
  );

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
  });

  assert.doesNotMatch(prompt, /审核驳回意见/);
  assert.doesNotMatch(prompt, /旧审核意见不应污染普通全量生成/);
});

test("phase3b prompt keeps explicit review comment independent from stale decision file", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-comment-stale-review-"));
  fs.writeFileSync(
    path.join(dir, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "旧审核意见不应污染新的显式意见",
      rewriteScope: "evidence-refresh",
      targetSections: [],
      instructions: "旧指令要求补充截图证据。",
    }),
    "utf8",
  );

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
    reviewComment: "新的显式意见：只调整系统概览语气。",
  });

  assert.match(prompt, /新的显式意见/);
  assert.match(prompt, /局部重写范围：narrative/);
  assert.match(prompt, /按审核意见局部修订叙事片段/);
  assert.doesNotMatch(prompt, /旧审核意见不应污染新的显式意见/);
  assert.doesNotMatch(prompt, /旧指令要求补充截图证据/);
  assert.doesNotMatch(prompt, /证据刷新后全量成稿/);
});

test("phase3b prompt keeps explicit review comment when decision cache is malformed", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-comment-bad-review-"));
  fs.writeFileSync(path.join(dir, "review-decision.json"), "{bad json", "utf8");

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
    reviewRerun: true,
    reviewComment: "新的显式意见：只调整系统概览语气。",
  });

  assert.match(prompt, /新的显式意见/);
  assert.match(prompt, /局部重写范围：narrative/);
  assert.match(prompt, /按审核意见局部修订叙事片段/);
});

test("phase3b prompt keeps explicit review comment when decision cache is non-object", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-comment-review-array-"));
  fs.writeFileSync(path.join(dir, "review-decision.json"), "[]", "utf8");

  const prompt = buildPhase3bPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
    qualityReport: {},
    reviewRerun: true,
    reviewComment: "新的显式意见：只调整系统概览语气。",
  });

  assert.match(prompt, /新的显式意见/);
  assert.match(prompt, /局部重写范围：narrative/);
  assert.doesNotMatch(prompt, /Review decision must be a JSON object/);
});

test("phase3b prompt still rejects malformed review decision without explicit comment", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-bad-review-required-"));
  fs.writeFileSync(path.join(dir, "review-decision.json"), "{bad json", "utf8");

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        qualityReport: {},
        reviewRerun: true,
      }),
    /JSON/,
  );
});

test("phase3b prompt rejects non-object review decision without explicit comment", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-review-array-"));
  fs.writeFileSync(path.join(dir, "review-decision.json"), "[]", "utf8");

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        qualityReport: {},
        reviewRerun: true,
      }),
    /Review decision must be a JSON object/,
  );
});

test("resolveNarrativeProvider prefers cursor-sdk when api key file exists", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { resolveNarrativeProvider } = require("./narrative/resolve-provider");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "provider-"));
  const keyPath = path.join(dir, "secrets", "cursor-api-key.txt");
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, "cursor_test_key", "utf8");

  assert.equal(
    resolveNarrativeProvider({ config: { narrative: { defaultProvider: "auto" } }, projectRoot: dir }),
    "cursor-sdk",
  );
  assert.equal(
    resolveNarrativeProvider({ config: { narrative: { defaultProvider: "manual" } }, projectRoot: dir }),
    "manual",
  );
});

test("dashboard snapshot exposes default narrative provider", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-provider-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    ["runtime:", "  outputDir: outputs", "narrative:", "  defaultProvider: manual", "systems:", "  - code: adp", "    name: AI保单数据闭环平台", "    url: https://pre-adp.hzins.com/"].join(
      "\n",
    ),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.defaultNarrativeProvider, "manual");
  assert.equal(snapshot.cursorSdkConfigured, false);
});

test("resolveCursorApiKey reads env before secrets file without leaking value", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { resolveCursorApiKey } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-key-"));
  const keyPath = path.join(dir, "cursor-api-key.txt");
  fs.writeFileSync(keyPath, "cursor_file_secret\n", "utf8");

  assert.equal(resolveCursorApiKey({ cursorApiKeyFile: keyPath }), "cursor_file_secret");
  assert.equal(
    resolveCursorApiKey({ apiKey: "cursor_context_secret", cursorApiKeyFile: keyPath }),
    "cursor_context_secret",
  );
});

test("phase3b defaults Cursor SDK cwd to the system output directory", () => {
  const path = require("node:path");
  const { resolveSdkCwd } = require("./narrative/phase3b");

  const outputPath = path.join("outputs", "adp", "whitepaper.pending-review.md");
  assert.equal(resolveSdkCwd({ outputPath }), path.resolve("outputs", "adp"));
  assert.equal(
    resolveSdkCwd({ outputPath, sdkCwd: path.join("outputs", "custom") }),
    path.resolve("outputs", "custom"),
  );
});

test("run-phase3b CLI reports usage before provider resolution when system is missing", () => {
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const result = spawnSync(process.execPath, ["scripts/run-phase3b.js"], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: node scripts\/run-phase3b\.js --system adp/);
  assert.doesNotMatch(result.stderr, /Cannot access 'config' before initialization/);
});

test("run-phase3b CLI forwards narrative part and review rerun options", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-cli-part-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(output, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "系统概览需要更业务化",
      rewriteScope: "overview-flow",
      targetSections: ["1", "4"],
      instructions: "只重写系统概览和典型业务流程。",
    }),
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-phase3b.js",
      "--config",
      configPath,
      "--system",
      "adp",
      "--provider",
      "manual",
      "--narrative-part",
      "overview-flow",
      "--review-rerun",
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const usage = JSON.parse(fs.readFileSync(path.join(output, "phase3b-usage.json"), "utf8"));
  assert.equal(payload.narrativePart, "overview-flow");
  assert.deepEqual(payload.partPrompts.map((item) => item.id), ["overview-flow"]);
  assert.equal(usage.narrativePart, "overview-flow");
  assert.match(fs.readFileSync(path.join(output, "phase3b-prompt.md"), "utf8"), /系统概览需要更业务化/);
});

test("run-phase3b CLI tolerates malformed optional pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-cli-bad-state-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "quality-report.json"), "{}", "utf8");
  fs.writeFileSync(path.join(output, "pipeline-state.json"), "{bad json", "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/run-phase3b.js", "--config", configPath, "--system", "adp", "--provider", "manual"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "manual-required");
  assert.ok(fs.existsSync(path.join(output, "phase3b-usage.json")));
});

test("pipeline state initializes truth phase and guarded whitepaper nodes for adp", () => {
  const { createPipelineState } = require("./pipeline-state");
  const state = createPipelineState({
    code: "adp",
    name: "AI保单数据闭环平台",
  });

  assert.equal(state.code, "adp");
  assert.equal(state.currentPhase, "prepare");
  assert.equal(state.currentNode, "sync");
  assert.equal(state.phases.prepare.label, "准备");
  assert.equal(state.phases.evidence.label, "取证");
  assert.equal(state.phases.truth.label, "真相");
  assert.equal(state.phases.compose.label, "成稿");
  assert.equal(state.phases.approve.label, "审定");
  assert.equal(state.nodes.sync.label, "同步");
  assert.equal(state.nodes["validate-write"].label, "试业务操作");
  assert.equal(state.nodes["db-profile"].label, "库表画像");
  assert.equal(state.nodes["db-model"].label, "库表模型");
  assert.equal(state.nodes["truth-universe"].label, "功能宇宙");
  assert.equal(state.nodes["truth-claims"].label, "可信断言");
  assert.equal(state.nodes["build-spec"].label, "整理规格");
  assert.equal(state.nodes["compose-guide"].label, "操作指引");
  assert.equal(state.nodes.draft.label, "底稿");
  assert.equal(state.nodes.summary.label, "摘要");
  assert.equal(state.nodes["fact-check"].label, "事实核验");
  assert.equal(state.nodes["truth-readiness"].label, "真实度门禁");
  assert.equal(state.artifacts.truthReadiness, "truth-readiness-report.json");
  assert.equal(state.artifacts.dataDictionary, "data-dictionary.json");
  assert.equal(state.artifacts.entityModel, "entity-model.json");
  assert.equal(Object.keys(state.nodes).length, 18);
});

test("migratePipelineState backfills build-spec and compose-guide on legacy state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    createPipelineState,
    migratePipelineState,
    readPipelineState,
    updateNodeStatus,
    writePipelineState,
  } = require("./pipeline-state");

  let legacy = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  legacy = updateNodeStatus(legacy, "sync", "success");
  legacy = updateNodeStatus(legacy, "session", "success");
  legacy = updateNodeStatus(legacy, "collect", "success");
  delete legacy.nodes["db-profile"];
  delete legacy.nodes["db-model"];
  delete legacy.nodes["truth-universe"];
  delete legacy.nodes["truth-claims"];
  delete legacy.nodes["build-spec"];
  delete legacy.nodes["compose-guide"];
  delete legacy.nodes["fact-check"];
  delete legacy.nodes["truth-readiness"];
  delete legacy.phases.truth;
  delete legacy.phases.compose;

  const { state, changed } = migratePipelineState(legacy);
  assert.equal(changed, true);
  assert.equal(state.nodes["db-profile"].label, "库表画像");
  assert.equal(state.nodes["db-model"].label, "库表模型");
  assert.equal(state.nodes["truth-universe"].label, "功能宇宙");
  assert.equal(state.nodes["truth-claims"].label, "可信断言");
  assert.equal(state.nodes["build-spec"].label, "整理规格");
  assert.equal(state.nodes["compose-guide"].label, "操作指引");
  assert.equal(state.nodes["fact-check"].label, "事实核验");
  assert.equal(state.nodes["truth-readiness"].label, "真实度门禁");
  assert.equal(state.nodes["db-profile"].status, "pending");
  assert.equal(state.nodes["db-model"].status, "pending");
  assert.equal(state.nodes["build-spec"].status, "pending");
  assert.equal(state.phases.truth.label, "真相");
  assert.equal(state.phases.compose.label, "成稿");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-migrate-"));
  const statePath = path.join(dir, "pipeline-state.json");
  writePipelineState(statePath, legacy);
  const loaded = readPipelineState(statePath, { persist: true });
  assert.equal(loaded.nodes["build-spec"].label, "整理规格");
  assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).nodes["build-spec"].label, "整理规格");
});

test("readPipelineState rejects non-object pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { migratePipelineState, readPipelineState } = require("./pipeline-state");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-non-object-"));
  const statePath = path.join(dir, "pipeline-state.json");
  fs.writeFileSync(statePath, "[]", "utf8");

  assert.deepEqual(migratePipelineState([]), { state: [], changed: false });
  assert.throws(() => readPipelineState(statePath), /pipeline-state\.json must be a JSON object/);
});

test("pipeline node transitions roll up phase status", () => {
  const { createPipelineState, updateNodeStatus } = require("./pipeline-state");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });

  state = updateNodeStatus(state, "sync", "success");
  state = updateNodeStatus(state, "session", "success");
  assert.equal(state.phases.prepare.status, "success");
  assert.equal(state.currentNode, "collect");
  assert.equal(state.currentPhase, "evidence");

  state = updateNodeStatus(state, "collect", "failed", { lastError: "timeout" });
  assert.equal(state.nodes.collect.attempts, 1);
  assert.equal(state.phases.evidence.status, "failed");
  assert.equal(state.overallStatus, "failed");
});

test("reconcilePipelineStateFromArtifacts ignores non-object narrative usage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    createPipelineState,
    reconcilePipelineStateFromArtifacts,
    updateNodeStatus,
  } = require("./pipeline-state");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-artifacts-shape-"));
  fs.writeFileSync(path.join(dir, "narrative-fragments.md"), "fragment", "utf8");
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "pending", "utf8");
  fs.writeFileSync(path.join(dir, "phase3b-usage.json"), JSON.stringify([{ fragmentChars: 100 }]), "utf8");

  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "sync", "success");
  state = updateNodeStatus(state, "session", "success");
  state = updateNodeStatus(state, "collect", "success");
  state = updateNodeStatus(state, "inspect", "success");
  state = updateNodeStatus(state, "validate-write", "success");
  state = updateNodeStatus(state, "build-spec", "success");
  state = updateNodeStatus(state, "compose-guide", "success");
  state = updateNodeStatus(state, "draft", "success");
  state = updateNodeStatus(state, "summary", "success");
  state = updateNodeStatus(state, "narrative", "running");

  const reconciled = reconcilePipelineStateFromArtifacts(state, dir);
  assert.equal(reconciled.changed, false);
  assert.equal(reconciled.state.nodes.narrative.status, "running");
});

test("runNodeWithRetry retries three times before marking failed", async () => {
  const { createPipelineState, runNodeWithRetry } = require("./pipeline-state");
  let attempts = 0;
  const state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });

  const result = await runNodeWithRetry(state, "collect", async () => {
    attempts += 1;
    throw new Error("network timeout");
  });

  assert.equal(attempts, 3);
  assert.equal(result.state.nodes.collect.status, "failed");
  assert.equal(result.state.nodes.collect.attempts, 3);
  assert.match(result.state.nodes.collect.lastError, /network timeout/);
});

test("reconcilePipelineStateFromArtifacts clears stale narrative running when artifacts exist", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    createPipelineState,
    reconcilePipelineStateFromArtifacts,
    updateNodeStatus,
  } = require("./pipeline-state");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-reconcile-"));
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "fact-check",
    "quality",
  ]) {
    state = updateNodeStatus(state, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  state = updateNodeStatus(state, "narrative", "running");
  fs.writeFileSync(path.join(dir, "narrative-fragments.md"), "## 1. 系统概览\nok", "utf8");
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# draft\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "phase3b-usage.json"),
    JSON.stringify({ fragmentChars: 100, pendingReviewChars: 120 }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "fact-check-report.json"),
    JSON.stringify({ canFinalize: true }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "truth-readiness-report.json"),
    JSON.stringify({ canSubmitReview: true }),
    "utf8",
  );

  const reconciled = reconcilePipelineStateFromArtifacts(state, dir);

  assert.equal(reconciled.changed, true);
  assert.equal(reconciled.state.nodes.narrative.status, "success");
  assert.equal(reconciled.state.overallStatus, "review-pending");
});

test("runNodeWithRetry reports running state before long operation finishes", async () => {
  const { createPipelineState, runNodeWithRetry } = require("./pipeline-state");
  const observedStatuses = [];
  const state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });

  const result = await runNodeWithRetry(
    state,
    "inspect",
    async () => ({ ok: true }),
    {
      onStateChange: (next) => observedStatuses.push(next.nodes.inspect.status),
    },
  );

  assert.equal(result.state.nodes.inspect.status, "success");
  assert.deepEqual(observedStatuses.slice(0, 2), ["running", "success"]);
});

test("write validation skips safely when no plan exists for adp", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runWriteValidation } = require("./validate-write");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-write-adp-"));
  const result = await runWriteValidation({
    systemCode: "adp",
    systemOutput: dir,
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /No write validation plan/);
});

test("write validation rejects unsafe target names before execution", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runWriteValidation } = require("./validate-write");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-write-adp-"));
  const planPath = path.join(dir, "write-validation-plan.json");
  fs.writeFileSync(
    planPath,
    JSON.stringify({
      scenarios: [
        {
          id: "unsafe-edit",
          action: "edit",
          targetName: "真实业务数据",
        },
      ],
    }),
    "utf8",
  );

  await assert.rejects(
    () =>
      runWriteValidation({
        systemCode: "adp",
        systemOutput: dir,
        planPath,
      }),
    /AI_AUTO_TEST_/,
  );
});

test("write validation rejects malformed plan before execution", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runWriteValidation } = require("./validate-write");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-write-bad-plan-"));
  const planPath = path.join(dir, "write-validation-plan.json");
  fs.writeFileSync(planPath, "{bad json", "utf8");

  await assert.rejects(
    () =>
      runWriteValidation({
        systemCode: "adp",
        systemOutput: dir,
        planPath,
      }),
    /Write validation plan is malformed/,
  );
  assert.equal(fs.existsSync(path.join(dir, "write-validation-result.json")), false);
});

test("write validation rejects non-object plan before treating it as empty", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runWriteValidation } = require("./validate-write");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-write-array-plan-"));
  const planPath = path.join(dir, "write-validation-plan.json");
  fs.writeFileSync(planPath, "[]", "utf8");

  await assert.rejects(
    () =>
      runWriteValidation({
        systemCode: "adp",
        systemOutput: dir,
        planPath,
      }),
    /Write validation plan must be a JSON object/,
  );
  assert.equal(fs.existsSync(path.join(dir, "write-validation-result.json")), false);
});

test("write validation plan prefers create actions from evidence inventory", () => {
  const { buildScenariosFromEvidence } = require("./generate-write-validation-plan");
  const scenarios = buildScenariosFromEvidence({
    pageInventory: [{ id: "menu-page-1", menuPath: "AI任务管理" }],
    actionInventory: [
      { pageId: "menu-page-1", name: "新建AI任务", type: "create", risk: "normal" },
    ],
    menuMap: [{ title: "首页", menuPath: "首页" }],
  });
  assert.equal(scenarios[0].menuPath, "AI任务管理");
  assert.equal(scenarios[0].buttonText, "新建AI任务");
  assert.match(scenarios[0].targetName, /^AI_AUTO_TEST_/);
});

test("write validation dry-run keeps plan-only mode without browser", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runWriteValidation } = require("./validate-write");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-write-dry-"));
  fs.writeFileSync(
    path.join(dir, "write-validation-plan.json"),
    JSON.stringify({
      scenarios: [{ id: "safe-create", action: "create", targetName: "AI_AUTO_TEST_示例" }],
    }),
    "utf8",
  );

  const result = await runWriteValidation({
    systemCode: "adp",
    systemOutput: dir,
    execute: false,
  });
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /plan safety passed/);
  assert.equal(result.scenarios[0].status, "planned");
});

test("write validation inputs reject malformed core evidence", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadWriteValidationInputs } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-input-bad-evidence-"));
  const evidencePath = path.join(dir, "evidence.json");
  const ledgerPath = path.join(dir, "test-data-ledger.json");
  fs.writeFileSync(evidencePath, "{bad json", "utf8");
  fs.writeFileSync(ledgerPath, "[]", "utf8");

  const inputs = loadWriteValidationInputs({ evidencePath, ledgerPath });

  assert.match(inputs.error, /Evidence evidence\.json is malformed/);
  assert.equal(fs.readFileSync(evidencePath, "utf8"), "{bad json");
});

test("write validation inputs reject malformed test data ledger", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadWriteValidationInputs } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-input-bad-ledger-"));
  const evidencePath = path.join(dir, "evidence.json");
  const ledgerPath = path.join(dir, "test-data-ledger.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({ systemInfo: { code: "adp" }, menuMap: [] }),
    "utf8",
  );
  fs.writeFileSync(ledgerPath, "{bad json", "utf8");

  const inputs = loadWriteValidationInputs({ evidencePath, ledgerPath });

  assert.match(inputs.error, /Existing test-data-ledger\.json is malformed/);
  assert.equal(fs.readFileSync(ledgerPath, "utf8"), "{bad json");
});

test("write validation inputs require test data ledger array", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadWriteValidationInputs } = require("./collect-evidence");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-input-ledger-shape-"));
  const evidencePath = path.join(dir, "evidence.json");
  const ledgerPath = path.join(dir, "test-data-ledger.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({ systemInfo: { code: "adp" }, menuMap: [] }),
    "utf8",
  );
  fs.writeFileSync(ledgerPath, JSON.stringify({ items: [] }), "utf8");

  const inputs = loadWriteValidationInputs({ evidencePath, ledgerPath });

  assert.match(inputs.error, /test-data-ledger\.json must be a JSON array/);
});

test("narrative quality blocks drafts without business overview and flow", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    markdown: "## 页面清单\n系统包含查询按钮和新增按钮。",
    evidenceSummary: { pages: [{ title: "保单列表" }] },
  });

  assert.equal(report.canSubmitReview, false);
  assert.match(report.failures.join("\n"), /系统定位/);
  assert.match(report.failures.join("\n"), /典型业务流程/);
});

test("narrative quality counts pages from evidence summary metrics", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    markdown:
      "# AI保单数据闭环平台\n\n## 1. 系统定位\n" +
      "系统定位说明。".repeat(120) +
      "\n\n## 4. 典型业务流程\n业务流程说明。" +
      "证据来自首页截图。",
    evidenceSummary: { metrics: { counts: { pages: 1 } } },
    minChars: 100,
  });

  assert.equal(report.counts.evidencePages, 1);
});

test("check-narrative fails on malformed evidence summary without writing report", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "narrative-bad-summary-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台\n\n## 1. 系统定位\n" +
      "系统定位说明。".repeat(120) +
      "\n\n## 4. 典型业务流程\n业务流程说明。\n证据来自首页截图。",
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), "{bad json", "utf8");

  const result = spawnSync(process.execPath, ["scripts/check-narrative.js", "--input", dir], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Evidence summary is malformed/);
  assert.equal(fs.existsSync(path.join(dir, "narrative-quality-report.json")), false);
});

test("review decision requires rejection comments and maps comments to rerun nodes", () => {
  const { appendNarrativeGuardNodes, buildReviewDecision } = require("./run-review-decision");
  const evidenceRefreshNodes = [
    "collect",
    "inspect",
    "summary",
    "db-model",
    "truth-universe",
    "truth-claims",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ];

  assert.throws(
    () => buildReviewDecision({ status: "rejected", comment: "" }),
    /审核意见/,
  );

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "系统定位太弱，页面截图也有遗漏，请补充业务流程",
  });

  assert.equal(decision.status, "rejected");
  assert.deepEqual(decision.rerunNodes, evidenceRefreshNodes);
  assert.deepEqual(
    appendNarrativeGuardNodes(["summary", "truth-claims", "narrative", "fact-check", "quality"]),
    ["summary", "db-model", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
  );

  const legacyDecision = buildReviewDecision({
    decision: "rejected",
    comment: "系统定位需要更业务化",
  });
  assert.equal(legacyDecision.status, "rejected");

  const preferredStatus = buildReviewDecision({
    status: "approved",
    decision: "rejected",
  });
  assert.equal(preferredStatus.status, "approved");
});

test("review decision targets narrative sections without evidence rerun for wording feedback", () => {
  const { buildReviewDecision } = require("./run-review-decision");

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "系统定位不够升华，典型业务流程还是像点击步骤，业务看不懂",
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "overview-flow");
  assert.deepEqual(decision.targetSections, ["1", "4"]);
  assert.match(decision.instructions, /系统概览/);
});

test("review decision treats missing page business flow as narrative rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面业务流程缺失，角色权限边界说明不全",
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "overview-flow");
  assert.deepEqual(decision.targetSections, ["1", "4"]);
  assert.equal(decision.narrativePart, "overview-flow");
});

test("review decision keeps unclear business flow wording as overview rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "业务流程还是像点击步骤，业务表达看不懂",
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "overview-flow");
  assert.deepEqual(decision.targetSections, ["1", "4"]);
  assert.equal(decision.narrativePart, "overview-flow");
});

test("review decision narrows function rewrites to mentioned modules", () => {
  const { buildReviewDecision, inferTargetModules } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }, { name: "发布管理" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
      { module: "发布管理", name: "发布列表", menuPath: "发布管理 > 发布列表" },
    ],
  };

  assert.deepEqual(inferTargetModules("任务列表的功能描述错误", evidenceSummary), ["AI任务"]);

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "AI任务模块的任务列表功能描述错误",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.deepEqual(decision.targetModules, ["AI任务"]);
  assert.equal(decision.narrativePart, "AI任务");
  assert.match(decision.instructions, /AI任务/);
});

test("review decision keeps permission module wording as module rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "权限管理" }, { name: "AI任务" }],
    functions: [
      { module: "权限管理", name: "角色权限配置", menuPath: "权限管理 > 角色权限配置" },
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "权限管理模块说明缺失，需要补充权限边界描述",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.deepEqual(decision.targetModules, ["权限管理"]);
  assert.equal(decision.narrativePart, "权限管理");
});

test("review decision prefers longer module aliases when names overlap", () => {
  const { buildReviewDecision, inferTargetModules } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }, { name: "AI任务管理" }, { name: "发布管理" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
      { module: "AI任务管理", name: "任务管理列表", menuPath: "AI任务管理 > 任务管理列表" },
      { module: "发布管理", name: "发布列表", menuPath: "发布管理 > 发布列表" },
    ],
  };

  assert.deepEqual(inferTargetModules("AI任务管理模块描述错误", evidenceSummary), ["AI任务管理"]);
  assert.deepEqual(inferTargetModules("AI任务模块和AI任务管理模块都描述错误", evidenceSummary), [
    "AI任务",
    "AI任务管理",
  ]);

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "AI任务管理模块页面说明不准确",
    evidenceSummary,
  });

  assert.deepEqual(decision.targetModules, ["AI任务管理"]);
  assert.equal(decision.narrativePart, "AI任务管理");
});

test("review decision treats page wording feedback as function rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面说明不准确，功能描述像菜单堆砌",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.deepEqual(decision.targetSections, ["2", "3"]);
  assert.deepEqual(decision.targetModules, ["AI任务"]);
  assert.equal(decision.narrativePart, "AI任务");
});

test("review decision treats supplementing page wording as narrative rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面需要补充业务说明，不是补截图证据",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.equal(decision.narrativePart, "AI任务");
});

test("review decision treats supplementing business wording as narrative rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面需要补充业务说明和使用场景",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.equal(decision.narrativePart, "AI任务");
});

test("review decision still refreshes evidence for missing pages and screenshots", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "AI任务模块的任务列表页面截图遗漏，没有采集到",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, [
    "collect",
    "inspect",
    "summary",
    "db-model",
    "truth-universe",
    "truth-claims",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]);
  assert.equal(decision.rewriteScope, "evidence-refresh");
  assert.deepEqual(decision.targetSections, []);
  assert.deepEqual(decision.targetModules, ["AI任务"]);
  assert.equal(decision.narrativePart, "");
});

test("review decision refreshes evidence when supplement asks for screenshots", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面需要补充截图证据",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, [
    "collect",
    "inspect",
    "summary",
    "db-model",
    "truth-universe",
    "truth-claims",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]);
  assert.equal(decision.rewriteScope, "evidence-refresh");
  assert.equal(decision.narrativePart, "");
});

test("review decision treats missing field description as narrative rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面的字段业务含义说明缺失，需要补充字段说明",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.equal(decision.narrativePart, "AI任务");
});

test("review decision still refreshes evidence when field evidence is missing", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表页面字段证据缺失，表单字段没有采集到",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, [
    "collect",
    "inspect",
    "summary",
    "db-model",
    "truth-universe",
    "truth-claims",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]);
  assert.equal(decision.rewriteScope, "evidence-refresh");
  assert.equal(decision.narrativePart, "");
});

test("review decision treats missing modal description as narrative rewrite", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表删除确认弹窗说明缺失，需要补充弹窗业务含义",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.equal(decision.narrativePart, "AI任务");
});

test("review decision still refreshes evidence when modal screenshot is missing", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "任务列表删除确认弹窗截图缺失，没有采集到",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, [
    "collect",
    "inspect",
    "summary",
    "db-model",
    "truth-universe",
    "truth-claims",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]);
  assert.equal(decision.rewriteScope, "evidence-refresh");
  assert.equal(decision.narrativePart, "");
});

test("review decision supports multi-module function rewrites", () => {
  const { buildReviewDecision } = require("./run-review-decision");
  const evidenceSummary = {
    modules: [{ name: "AI任务" }, { name: "发布管理" }],
    functions: [
      { module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" },
      { module: "发布管理", name: "发布列表", menuPath: "发布管理 > 发布列表" },
    ],
  };

  const decision = buildReviewDecision({
    status: "rejected",
    comment: "AI任务和发布管理模块描述错误，需要分别修正",
    evidenceSummary,
  });

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "function-sections");
  assert.deepEqual(decision.targetModules, ["AI任务", "发布管理"]);
  assert.equal(decision.narrativePart, "AI任务,发布管理");
});

test("dashboard snapshot lists configured systems with pipeline phase labels", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-adp-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  pricing:",
      "    usdToCny: 7.25",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const systemOutput = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "sync", "success");
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);

  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.systems[0].code, "adp");
  assert.equal(snapshot.systems[0].phases.prepare.label, "准备");
  assert.equal(snapshot.systems[0].nodes.sync.status, "success");
});

test("dashboard snapshot exposes review decision details", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-decision-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const systemOutput = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "review", "failed", {
    lastError: "系统定位需要更业务化",
  });
  state = {
    ...state,
    review: {
      status: "rejected",
      comment: "系统定位需要更业务化",
      decision: {
        status: "rejected",
        comment: "系统定位需要更业务化",
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
        rewriteScope: "overview-flow",
        targetSections: ["1", "4"],
        targetModules: [],
        narrativePart: "overview-flow",
        instructions: "只重写系统概览和典型业务流程。",
        decidedAt: "2026-05-20T00:00:00.000Z",
      },
    },
  };
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);

  const snapshot = buildDashboardSnapshot({ configPath });
  const decision = snapshot.systems[0].review.decision;
  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(decision.rewriteScope, "overview-flow");
  assert.equal(decision.narrativePart, "overview-flow");
  assert.match(decision.instructions, /系统概览/);
});

test("dashboard snapshot summarizes all registered systems and artifact readiness", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-summary-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "  - code: claim",
      "    name: 理赔系统",
      "    url: https://claim.example.test/",
    ].join("\n"),
    "utf8",
  );

  const adpOutput = path.join(dir, "outputs", "adp");
  fs.mkdirSync(adpOutput, { recursive: true });
  let adpState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
    "review",
  ]) {
    adpState = updateNodeStatus(adpState, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  adpState.review.status = "approved";
  adpState = { ...adpState, overallStatus: "finalized" };
  writePipelineState(path.join(adpOutput, "pipeline-state.json"), adpState);
  fs.writeFileSync(path.join(adpOutput, "whitepaper.final.md"), "# final", "utf8");
  fs.writeFileSync(path.join(adpOutput, "AI保单数据闭环平台_系统功能白皮书_20260521.docx"), "docx", "utf8");
  fs.writeFileSync(path.join(adpOutput, "database-profile.json"), "{}", "utf8");
  fs.writeFileSync(path.join(adpOutput, "function-universe.json"), "{}", "utf8");
  fs.writeFileSync(path.join(adpOutput, "verified-claims.json"), "{}", "utf8");
  fs.writeFileSync(path.join(adpOutput, "fact-check-report.json"), "{}", "utf8");
  writePassingTruthReadinessReport(adpOutput, { score: 0.96, scorePercent: 96, gates: {} });

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.summary.total, 2);
  assert.equal(snapshot.summary.finalized, 1);
  assert.equal(snapshot.summary.pending, 1);
  assert.deepEqual(
    snapshot.systems.map((system) => system.code),
    ["adp", "claim"],
  );
  assert.equal(snapshot.systems[0].progress.completed, 18);
  assert.equal(snapshot.systems[0].artifacts.final.exists, true);
  assert.equal(snapshot.systems[0].artifacts.docx.exists, true);
  assert.equal(snapshot.systems[0].artifacts.databaseProfile.exists, true);
  assert.equal(snapshot.systems[0].artifacts.dataDictionary.exists, false);
  assert.equal(snapshot.systems[0].artifacts.entityModel.exists, false);
  assert.equal(snapshot.systems[0].artifacts.functionUniverse.exists, true);
  assert.equal(snapshot.systems[0].artifacts.verifiedClaims.exists, true);
  assert.equal(snapshot.systems[0].artifacts.factCheck.exists, true);
  assert.equal(snapshot.systems[0].artifacts.truthReadiness.exists, true);
  assert.equal(snapshot.systems[0].truthReadiness.scorePercent, 96);
  assert.equal(snapshot.systems[0].truthReadiness.canSubmitReview, true);
  assert.equal(snapshot.systems[0].currentPhase, "completed");
  assert.equal(snapshot.systems[0].currentNode, "end");
  assert.equal(snapshot.systems[1].overallStatus, "pending");
});

test("dashboard snapshot marks stale truth readiness report as not submittable", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-stale-truth-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://adp.example.test/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "truth-readiness", "success");
  writePipelineState(path.join(output, "pipeline-state.json"), state);
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), "# 待审\n\n原内容", "utf8");
  writePassingTruthReadinessReport(output);
  fs.appendFileSync(path.join(output, "whitepaper.pending-review.md"), "\n\n未经复核的新内容", "utf8");

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].truthReadiness.canSubmitReview, false);
  assert.equal(snapshot.systems[0].truthReadiness.stale, true);
  assert.ok(snapshot.systems[0].truthReadiness.staleSources.length > 0);
});

test("dashboard snapshot exposes writable claim coverage gaps", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-writable-gap-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://adp.example.test/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "truth-readiness", "success");
  writePipelineState(path.join(output, "pipeline-state.json"), state);
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), "# 待审\n\n任务列表", "utf8");
  fs.writeFileSync(path.join(output, "quality-report.json"), JSON.stringify({ canFinalize: true }), "utf8");
  fs.writeFileSync(path.join(output, "narrative-quality-report.json"), JSON.stringify({ canSubmitReview: true }), "utf8");
  fs.writeFileSync(path.join(output, "verified-claims.json"), JSON.stringify({ claims: [] }), "utf8");
  fs.writeFileSync(
    path.join(output, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: false,
      missingWritableClaimIds: ["function:保单任务:任务详情"],
      metrics: {
        writableClaimCount: 2,
        coveredWritableClaimCount: 1,
        missingWritableClaimCount: 1,
        writableClaimCoverageRatio: 0.5,
        minWritableClaimCoverage: 0.8,
      },
    }),
    "utf8",
  );
  writePassingTruthReadinessReport(output, {
    canSubmitReview: false,
    canFinalize: false,
    gates: {
      factCheck: {
        pass: false,
        scorePercent: 50,
        missingWritableClaimIds: ["function:保单任务:任务详情"],
        metrics: {
          writableClaimCount: 2,
          coveredWritableClaimCount: 1,
          missingWritableClaimCount: 1,
          writableClaimCoverageRatio: 0.5,
          minWritableClaimCoverage: 0.8,
        },
      },
    },
    blockers: [{ id: "fact-check.writable-coverage", message: "Missing writable claims." }],
  });

  const snapshot = buildDashboardSnapshot({ configPath });
  const coverage = snapshot.systems[0].truthReadiness.writableClaimCoverage;

  assert.equal(coverage.ratio, 0.5);
  assert.equal(coverage.minRatio, 0.8);
  assert.equal(coverage.missingWritableClaimCount, 1);
  assert.deepEqual(coverage.missingWritableClaimIds, ["function:保单任务:任务详情"]);
});

test("dashboard snapshot exposes coverage repair plan", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-coverage-repair-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://adp.example.test/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "fact-check", "success");
  writePipelineState(path.join(output, "pipeline-state.json"), state);
  fs.writeFileSync(
    path.join(output, "coverage-repair-plan.json"),
    JSON.stringify({
      status: "completed",
      reason: "missing-writable-claim-coverage",
      shouldRepair: true,
      narrativePart: "保单任务",
      targetModules: ["保单任务"],
      missingWritableClaimIds: ["function:保单任务:任务详情"],
      missingWritableClaims: [
        {
          id: "function:保单任务:任务详情",
          module: "保单任务",
          function: "任务详情",
          subject: "任务详情",
        },
      ],
      executedNodes: ["narrative", "fact-check"],
      fingerprint: "abc123",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:01:00.000Z",
    }),
    "utf8",
  );

  const system = buildDashboardSnapshot({ configPath }).systems[0];

  assert.equal(system.artifacts.coverageRepair.exists, true);
  assert.equal(system.coverageRepair.status, "completed");
  assert.equal(system.coverageRepair.narrativePart, "保单任务");
  assert.deepEqual(system.coverageRepair.targetModules, ["保单任务"]);
  assert.deepEqual(system.coverageRepair.executedNodes, ["narrative", "fact-check"]);
  assert.deepEqual(system.coverageRepair.missingWritableClaimIds, ["function:保单任务:任务详情"]);
  assert.equal(system.coverageRepair.missingWritableClaims[0].function, "任务详情");
});

test("dashboard snapshot regenerates missing docx for finalized system", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-docx-regen-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const adpOutput = path.join(dir, "outputs", "adp");
  fs.mkdirSync(adpOutput, { recursive: true });
  let adpState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
    "review",
  ]) {
    adpState = updateNodeStatus(adpState, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  adpState.review.status = "approved";
  adpState = { ...adpState, overallStatus: "finalized", currentPhase: "approve", currentNode: "review" };
  writePipelineState(path.join(adpOutput, "pipeline-state.json"), adpState);
  fs.writeFileSync(
    path.join(adpOutput, "whitepaper.final.md"),
    "# AI保单数据闭环平台功能白皮书\n\n## 1. 系统概览\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(adpOutput, "evidence-summary.json"),
    JSON.stringify({ system: { name: "AI保单数据闭环平台", collectedAt: "2026-05-21T08:00:00.000Z" } }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.systems[0].currentPhase, "completed");
  assert.equal(snapshot.systems[0].currentNode, "end");
  assert.equal(snapshot.systems[0].artifacts.docx.exists, true);
  assert.match(snapshot.systems[0].artifacts.docx.file || "", /\.docx$/i);
});

test("stopRunningPipelineState pauses running nodes and overall status", () => {
  const { createPipelineState, stopRunningPipelineState, updateNodeStatus } = require("./pipeline-state");
  let state = createPipelineState({ code: "adp", name: "demo" });
  state = updateNodeStatus(state, "session", "running");
  const result = stopRunningPipelineState(state, "用户手动停止");
  assert.equal(result.changed, true);
  assert.equal(result.state.nodes.session.status, "paused");
  assert.equal(result.state.overallStatus, "paused");
});

test("stopPipeline clears stale running state without tracked child", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { stopPipeline } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-stop-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    ["runtime:", "  outputDir: outputs", "systems:", "  - code: adp", "    name: demo", "    url: https://x/"].join(
      "\n",
    ),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "demo" });
  state = updateNodeStatus(state, "session", "running");
  writePipelineState(path.join(output, "pipeline-state.json"), state);

  const result = stopPipeline({ configPath, system: "adp" });
  assert.equal(result.status, "stopped");
  assert.ok(result.pausedSystems.includes("adp"));
  const next = JSON.parse(fs.readFileSync(path.join(output, "pipeline-state.json"), "utf8"));
  assert.equal(next.nodes.session.status, "paused");
  assert.equal(next.overallStatus, "paused");
});

test("resetPipelineStateOnDisk restores fresh pending state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { resetPipelineStateOnDisk } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-reset-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    ["runtime:", "  outputDir: outputs", "systems:", "  - code: adp", "    name: demo", "    url: https://x/"].join(
      "\n",
    ),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "demo" });
  state = updateNodeStatus(state, "session", "running");
  writePipelineState(path.join(output, "pipeline-state.json"), state);

  const fresh = resetPipelineStateOnDisk("adp", configPath);
  assert.equal(fresh.overallStatus, "pending");
  assert.equal(fresh.currentNode, "sync");
  const onDisk = JSON.parse(fs.readFileSync(path.join(output, "pipeline-state.json"), "utf8"));
  assert.equal(onDisk.overallStatus, "pending");
  assert.equal(onDisk.nodes.session.status, "pending");
});

test("dashboard snapshot exposes active run node-level link", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-active-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const output = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  state = updateNodeStatus(state, "sync", "success");
  state = updateNodeStatus(state, "session", "success");
  state = updateNodeStatus(state, "collect", "running");
  writePipelineState(path.join(output, "pipeline-state.json"), state);

  const snapshot = buildDashboardSnapshot({
    configPath,
    activeRun: {
      system: "adp",
      pid: 1234,
      provider: "manual",
      startedAt: "2026-05-21T01:00:00.000Z",
    },
  });

  assert.equal(snapshot.running, true);
  assert.equal(snapshot.activeRun.systemCode, "adp");
  assert.equal(snapshot.activeRun.currentNode, "collect");
  assert.equal(snapshot.activeRun.currentPhase, "evidence");
  assert.equal(snapshot.activeRun.nextNode, "inspect");
  assert.equal(snapshot.activeRun.pid, 1234);
});

test("dashboard snapshot marks manual review node as ready before approval", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-ready-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const output = path.join(dir, "outputs", "adp");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]) {
    state = updateNodeStatus(
      state,
      nodeId,
      ["validate-write", "draft", "summary", "narrative", "truth-readiness"].includes(nodeId)
        ? "skipped"
        : "success",
    );
  }
  writePipelineState(path.join(output, "pipeline-state.json"), state);

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].overallStatus, "review-pending");
  assert.equal(snapshot.systems[0].nodes.review.displayStatus, "ready");
});

test("dashboard snapshot exposes phase3b usage summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-usage-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      narrativePart: "AI任务",
      promptChars: 1470,
      mainPromptChars: 0,
      partPromptChars: 1470,
      generatedPromptChars: 8200,
      generatedPromptPartCount: 13,
      sentPromptRuns: [
        null,
        "",
        "legacy-module",
        ...Array.from({ length: 13 }, (_, index) => ({
          id: `module-AI任务-${index + 1}`,
          type: "module",
          moduleName: `AI任务${index + 1}`,
          promptPath: `D:/secret/output/phase3b-prompts/module-AI任务-${index + 1}-prompt.md`,
          outputPath: `D:/secret/output/narrative-fragments/module-AI任务-${index + 1}.md`,
        })),
      ],
      inlineSummaryChars: 563,
      fragmentChars: 3500,
      inputTokens: 1180,
      outputTokens: 1944,
      totalTokens: 3124,
      usageSource: "estimated",
      usageEstimated: true,
      usageUnavailable: false,
      reviewRerun: true,
      reviewComment: "AI任务模块说明不准确，需要补充任务流转价值",
      reviewDecision: {
        status: "rejected",
        rewriteScope: "function-sections",
        narrativePart: "AI任务",
        targetSections: ["2", "3"],
        targetModules: ["AI任务"],
      },
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage.provider, "cursor-sdk");
  assert.equal(snapshot.systems[0].phase3bUsage.runKind, "review-rerun");
  assert.equal(snapshot.systems[0].phase3bUsage.narrativePart, "AI任务");
  assert.equal(snapshot.systems[0].phase3bUsage.promptChars, 1470);
  assert.equal(snapshot.systems[0].phase3bUsage.mainPromptChars, 0);
  assert.equal(snapshot.systems[0].phase3bUsage.partPromptChars, 1470);
  assert.equal(snapshot.systems[0].phase3bUsage.generatedPromptChars, 8200);
  assert.equal(snapshot.systems[0].phase3bUsage.generatedPromptPartCount, 13);
  assert.equal(snapshot.systems[0].phase3bUsage.sentPromptRunCount, 14);
  assert.equal(snapshot.systems[0].phase3bUsage.sentPromptPartCount, 14);
  assert.equal(snapshot.systems[0].phase3bUsage.sentPromptRuns.length, 12);
  assert.deepEqual(snapshot.systems[0].phase3bUsage.sentPromptRuns[0], {
    id: "legacy-module",
    type: "",
    moduleName: "",
  });
  assert.deepEqual(snapshot.systems[0].phase3bUsage.sentPromptRuns[1], {
    id: "module-AI任务-1",
    type: "module",
    moduleName: "AI任务1",
  });
  assert.deepEqual(snapshot.systems[0].phase3bUsage.sentPromptRuns[11], {
    id: "module-AI任务-11",
    type: "module",
    moduleName: "AI任务11",
  });
  assert.equal(snapshot.systems[0].phase3bUsage.promptSavingsPercent, 82);
  assert.equal(snapshot.systems[0].phase3bUsage.promptSavedChars, 6730);
  assert.equal(snapshot.systems[0].phase3bUsage.usageEstimated, true);
  assert.equal(snapshot.systems[0].phase3bUsage.totalTokens, 3124);
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.comment, "AI任务模块说明不准确，需要补充任务流转价值");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.rewriteScope, "function-sections");
  assert.deepEqual(snapshot.systems[0].phase3bUsage.reviewRerun.targetModules, ["AI任务"]);
});

test("dashboard snapshot normalizes invalid phase3b usage numbers", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-usage-numeric-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      promptChars: "bad",
      mainPromptChars: -1,
      partPromptChars: "bad",
      generatedPromptChars: "bad",
      generatedPromptPartCount: -2,
      sentPromptRunCount: "",
      sentPromptPartCount: null,
      sentPromptRuns: [{ id: "module-AI任务", type: "module", moduleName: "AI任务" }],
      inlineSummaryChars: -10,
      fragmentChars: 1800,
      pendingReviewChars: "bad",
      durationMs: -100,
      inputTokens: "bad",
      outputTokens: -1,
      totalTokens: "bad",
      cacheReadTokens: -5,
      cacheWriteTokens: "bad",
      costUsd: 0.1234,
      costCny: 0.89,
    }),
    "utf8",
  );

  const usage = buildDashboardSnapshot({ configPath }).systems[0].phase3bUsage;

  assert.equal(usage.promptChars, 0);
  assert.equal(usage.mainPromptChars, 0);
  assert.equal(usage.partPromptChars, 0);
  assert.equal(usage.generatedPromptChars, 0);
  assert.equal(usage.generatedPromptPartCount, 0);
  assert.equal(usage.sentPromptRunCount, 1);
  assert.equal(usage.sentPromptPartCount, 1);
  assert.equal(usage.inlineSummaryChars, 0);
  assert.equal(usage.fragmentChars, 1800);
  assert.equal(usage.pendingReviewChars, 0);
  assert.equal(usage.durationMs, 0);
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 1000);
  assert.equal(usage.totalTokens, 1000);
  assert.equal(usage.cacheReadTokens, 0);
  assert.equal(usage.cacheWriteTokens, 0);
  assert.equal(Number.isFinite(usage.costUsd), true);
  assert.equal(Number.isFinite(usage.costCny), true);
  assert.equal(usage.costUsd >= 0, true);
  assert.equal(usage.costCny >= 0, true);
});

test("dashboard snapshot ignores malformed optional json artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot, readJsonSafe } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-malformed-json-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  for (const file of [
    "phase3b-usage.json",
    "phase3b-usage-history.json",
    "review-decision.json",
    "write-validation-result.json",
    "evidence-summary.json",
    "evidence.json",
    "operation-guide-gate.json",
    "truth-readiness-report.json",
  ]) {
    fs.writeFileSync(path.join(output, file), "{bad json", "utf8");
  }

  const snapshot = buildDashboardSnapshot({ configPath });
  const system = snapshot.systems[0];

  assert.deepEqual(readJsonSafe(path.join(output, "phase3b-usage-history.json"), []), []);
  assert.equal(system.phase3bUsage, null);
  assert.deepEqual(system.phase3bUsageHistory, []);
  assert.equal(system.phase3bUsageHistorySummary.runCount, 0);
  assert.equal(system.writeValidation, null);
  assert.equal(system.evidence, null);
  assert.equal(system.operationGuideGate, null);
  assert.equal(system.truthReadiness, null);
});

test("dashboard snapshot ignores non-object optional json artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-non-object-json-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const outputRoot = path.join(dir, "outputs");
  const output = path.join(outputRoot, "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(path.join(outputRoot, "_batch"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "_batch", "run-state.json"), "[]", "utf8");
  fs.writeFileSync(path.join(output, "phase3b-usage.json"), "[]", "utf8");
  fs.writeFileSync(path.join(output, "phase3b-usage-history.json"), "{}", "utf8");
  fs.writeFileSync(path.join(output, "review-decision.json"), "\"invalid\"", "utf8");
  fs.writeFileSync(path.join(output, "write-validation-result.json"), "[]", "utf8");
  fs.writeFileSync(path.join(output, "evidence-summary.json"), "[]", "utf8");
  fs.writeFileSync(path.join(output, "evidence.json"), "\"invalid\"", "utf8");
  fs.writeFileSync(path.join(output, "operation-guide-gate.json"), "123", "utf8");
  fs.writeFileSync(path.join(output, "truth-readiness-report.json"), "[]", "utf8");

  const snapshot = buildDashboardSnapshot({ configPath });
  const system = snapshot.systems[0];

  assert.equal(snapshot.batch, null);
  assert.equal(system.phase3bUsage, null);
  assert.deepEqual(system.phase3bUsageHistory, []);
  assert.equal(system.phase3bUsageHistorySummary.runCount, 0);
  assert.equal(system.writeValidation, null);
  assert.equal(system.evidence, null);
  assert.equal(system.operationGuideGate, null);
  assert.equal(system.truthReadiness, null);
});

test("dashboard snapshot tolerates malformed pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot, readDashboardPipelineState } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-bad-pipeline-state-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  const statePath = path.join(output, "pipeline-state.json");
  fs.writeFileSync(statePath, "{bad json", "utf8");
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), "# pending", "utf8");

  const stateRead = readDashboardPipelineState(statePath);
  const snapshot = buildDashboardSnapshot({ configPath });
  const system = snapshot.systems[0];

  assert.equal(stateRead.state, null);
  assert.match(stateRead.error, /pipeline-state\.json 解析失败/);
  assert.equal(system.overallStatus, "pending");
  assert.match(system.lastError, /pipeline-state\.json 解析失败/);
  assert.equal(system.artifacts.pendingReview.exists, true);
  assert.equal(snapshot.summary.pending, 1);
});

test("dashboard snapshot tolerates non-object pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot, readDashboardPipelineState } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-non-object-pipeline-state-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  const statePath = path.join(output, "pipeline-state.json");
  fs.writeFileSync(statePath, "[]", "utf8");
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), "# pending", "utf8");

  const stateRead = readDashboardPipelineState(statePath);
  const snapshot = buildDashboardSnapshot({ configPath });
  const system = snapshot.systems[0];

  assert.equal(stateRead.state, null);
  assert.match(stateRead.error, /pipeline-state\.json must be a JSON object/);
  assert.equal(system.overallStatus, "pending");
  assert.match(system.lastError, /pipeline-state\.json must be a JSON object/);
  assert.equal(system.artifacts.pendingReview.exists, true);
  assert.equal(snapshot.summary.pending, 1);
});

test("dashboard snapshot infers legacy review rerun usage from nearby review decision", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-legacy-review-usage-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "AI任务模块描述错误，需要修正",
      rewriteScope: "function-sections",
      narrativePart: "AI任务",
      targetSections: ["2", "3"],
      targetModules: ["AI任务"],
      decidedAt: "2026-05-21T01:00:00.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      narrativePart: "AI任务",
      promptChars: 900,
      partPromptChars: 900,
      generatedPromptChars: 7000,
      finishedAt: "2026-05-21T02:00:00.000Z",
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage.runKind, "review-rerun");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.inferred, true);
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.comment, "AI任务模块描述错误，需要修正");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.rewriteScope, "function-sections");
});

test("dashboard snapshot does not infer stale legacy review decision as rerun usage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-stale-review-usage-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "旧审核意见不应污染后续普通分片",
      rewriteScope: "overview-flow",
      narrativePart: "overview-flow",
      targetSections: ["1", "4"],
      targetModules: [],
      decidedAt: "2026-05-20T01:00:00.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      narrativePart: "overview-flow",
      promptChars: 900,
      partPromptChars: 900,
      generatedPromptChars: 7000,
      finishedAt: "2026-05-22T02:00:00.000Z",
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage.runKind, "part-rerun");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun, null);
});

test("dashboard snapshot does not attach mismatched disk review decision to explicit rerun usage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-mismatch-review-usage-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "review-decision.json"),
    JSON.stringify({
      status: "rejected",
      comment: "AI任务模块描述错误，需要修正",
      rewriteScope: "function-sections",
      narrativePart: "AI任务",
      targetSections: ["2", "3"],
      targetModules: ["AI任务"],
      decidedAt: "2026-05-21T01:00:00.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      narrativePart: "overview-flow",
      reviewRerun: true,
      promptChars: 900,
      partPromptChars: 900,
      generatedPromptChars: 7000,
      finishedAt: "2026-05-21T02:00:00.000Z",
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage.runKind, "review-rerun");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.inferred, false);
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.rewriteScope, "");
  assert.equal(snapshot.systems[0].phase3bUsage.reviewRerun.comment, "");
  assert.deepEqual(snapshot.systems[0].phase3bUsage.reviewRerun.targetModules, []);
});

test("dashboard snapshot exposes recent phase3b usage history", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-usage-history-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage-history.json"),
    JSON.stringify([
      { provider: "manual", model: "composer-2.5", promptChars: 1000, finishedAt: "2026-05-21T01:00:00.000Z" },
      {
        provider: "cursor-sdk",
        model: "composer-2.5",
        narrativePart: "AI任务",
        promptChars: 900,
        partPromptChars: 900,
        generatedPromptChars: 7000,
        generatedPromptPartCount: 13,
        inlineSummaryChars: 360,
        fragmentChars: 1800,
        usageUnavailable: true,
        totalTokens: 0,
        sentPromptRuns: Array.from({ length: 13 }, (_, index) => ({
          id: `module-AI任务-${index + 1}`,
          type: "module",
          moduleName: `AI任务${index + 1}`,
          promptPath: `D:/secret/output/phase3b-prompts/module-AI任务-${index + 1}-prompt.md`,
          outputPath: `D:/secret/output/narrative-fragments/module-AI任务-${index + 1}.md`,
        })),
        reviewRerun: true,
        reviewComment: "AI任务模块描述错误，需要修正",
        reviewDecision: {
          status: "rejected",
          rewriteScope: "function-sections",
          narrativePart: "AI任务",
          targetSections: ["2", "3"],
          targetModules: ["AI任务"],
        },
        finishedAt: "2026-05-21T02:00:00.000Z",
      },
    ]),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsageHistory.length, 2);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.runCount, 2);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.estimatedRunCount, 1);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.reviewRerunCount, 1);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.promptChars, 1900);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.totalTokens, 1700);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.costUsd, 0.0029);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.costCny, 0.02);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].provider, "cursor-sdk");
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].runKind, "review-rerun");
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].narrativePart, "AI任务");
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].partPromptChars, 900);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].generatedPromptChars, 7000);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].generatedPromptPartCount, 13);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].usageEstimated, true);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].usageUnavailable, false);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].usageSource, "estimated");
  assert.equal(
    snapshot.systems[0].phase3bUsageHistory[1].usageCaptureMethod,
    "char-estimate-backfill",
  );
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].inputTokens, 700);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].outputTokens, 1000);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].totalTokens, 1700);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].costUsd, 0.0029);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].costCny, 0.02);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].costPricingSource, "cursor-api-pool");
  assert.match(snapshot.systems[0].phase3bUsageHistory[1].costLabel, /参考费用：/);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].sentPromptRunCount, 13);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].sentPromptPartCount, 13);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].sentPromptRuns.length, 12);
  assert.deepEqual(snapshot.systems[0].phase3bUsageHistory[1].sentPromptRuns[0], {
    id: "module-AI任务-1",
    type: "module",
    moduleName: "AI任务1",
  });
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].promptSavingsPercent, 87);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].reviewRerun.rewriteScope, "function-sections");
  assert.equal(snapshot.systems[0].phase3bUsageHistory[1].reviewRerun.comment, "AI任务模块描述错误，需要修正");
});

test("dashboard snapshot keeps usage history when current phase3b usage is missing", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-history-only-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage-history.json"),
    JSON.stringify([
      {
        provider: "cursor-sdk",
        model: "composer-2.5",
        promptChars: 900,
        inlineSummaryChars: 360,
        fragmentChars: 1800,
        usageUnavailable: true,
        totalTokens: 0,
        finishedAt: "2026-05-21T02:00:00.000Z",
      },
    ]),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage, null);
  assert.equal(snapshot.systems[0].phase3bUsageHistory.length, 1);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[0].usageEstimated, true);
  assert.equal(snapshot.systems[0].phase3bUsageHistory[0].totalTokens, 1700);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.runCount, 1);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.totalTokens, 1700);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.costUsd, 0.0029);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.costCny, 0.02);
});

test("dashboard snapshot filters invalid phase3b usage history records before limiting", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-history-filter-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage-history.json"),
    JSON.stringify([
      null,
      "bad",
      {},
      { unrelated: "ignored" },
      ...Array.from({ length: 12 }, (_, index) => ({
        provider: "manual",
        model: "composer-2.5",
        promptChars: index + 1,
        finishedAt: `2026-05-21T${String(index).padStart(2, "0")}:00:00.000Z`,
      })),
      [],
      { promptChars: -100, totalTokens: "bad" },
      { provider: "" },
    ]),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });
  const history = snapshot.systems[0].phase3bUsageHistory;

  assert.equal(history.length, 10);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.runCount, 10);
  assert.equal(history[0].promptChars, 3);
  assert.equal(history[9].promptChars, 12);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.promptChars, 75);
  assert.equal(snapshot.systems[0].phase3bUsageHistorySummary.totalTokens, 0);
});

test("dashboard frontend labels phase3b run kind in usage history", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "local-dashboard", "index.html"), "utf8");

  assert.match(html, /function phase3bRunKindLabel\(kind\)/);
  assert.match(html, /function renderReviewRerunUsageNote\(reviewRerun\)/);
  assert.match(html, /"review-rerun": "审核驳回重写"/);
  assert.match(html, /由旧 usage \+ review-decision 推断/);
  assert.match(html, /item\.reviewRerun\?\.inferred \? " · 推断" : ""/);
  assert.match(html, /生成分片 Prompt/);
  assert.match(html, /SDK 发送 Prompt/);
  assert.match(html, /SDK 发送目标/);
  assert.match(html, /SDK 发送分片/);
  assert.match(html, /function formatSentPromptRuns\(runs = \[\], totalCount = 0\)/);
  assert.match(html, /const total = Math\.max\(Number\(totalCount \|\| 0\), items\.length\)/);
  assert.match(html, /formatSentPromptRuns\(usage\.sentPromptRuns, usage\.sentPromptRunCount\)/);
  assert.match(html, /const sentTargetsLabel = formatSentPromptRuns\(item\.sentPromptRuns, item\.sentPromptRunCount\)/);
  assert.match(html, /function resolveUsageHistoryCostLabel\(usage\)/);
  assert.match(html, /function renderUsageGridItems\(items = \[\]\)/);
  assert.match(html, /function buildPhase3bHistorySummaryItems\(historySummary = \{\}\)/);
  assert.match(html, /function renderPhase3bUsageHistory\(history = \[\]\)/);
  assert.match(html, /const costShortLabel = resolveUsageHistoryCostLabel\(item\)/);
  assert.match(html, /costShortLabel \? ` · \$\{escapeHtml\(costShortLabel\)\}` : ""/);
  assert.match(html, /const historySummary = system\.phase3bUsageHistorySummary \|\| \{\}/);
  assert.match(html, /const historySummaryItems = buildPhase3bHistorySummaryItems\(historySummary\)/);
  assert.match(html, /暂无当前写稿消耗记录。以下为最近历史运行汇总。/);
  assert.match(html, /renderPhase3bUsageHistory\(history\)/);
  assert.match(html, /"最近合计 Token"/);
  assert.match(html, /"最近参考费用"/);
  assert.match(html, /"最近估算 \/ 重写"/);
  assert.match(html, /目标 \$\{escapeHtml\(sentTargetsLabel\)\}/);
  assert.match(html, /item\.sentPromptPartCount > 0 && item\.generatedPromptPartCount > 0/);
  assert.match(html, /phase3bRunKindLabel\(item\.runKind \|\| "full"\)/);
  assert.match(html, /reviewRewriteScopeLabel\(item\.reviewRerun\.rewriteScope\)/);
  assert.doesNotMatch(html, /escapeHtml\(item\.runKind \|\| "full"\)/);
});

function loadDashboardFrontendScript() {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "local-dashboard", "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

  assert.equal(scripts.length, 1);
  return scripts[0];
}

test("dashboard frontend inline script is valid JavaScript", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();

  assert.doesNotThrow(() => new vm.Script(script, { filename: "local-dashboard/index.html" }));
});

test("dashboard frontend renders truth pipeline phase and nodes", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();
  const context = createDashboardFrontendContext();

  vm.runInNewContext(script, context, { filename: "local-dashboard/index.html" });
  const html = context.renderPipeline({
    code: "adp",
    overallStatus: "pending",
    progress: { completed: 0, total: 18 },
    phaseOrder: [
      { id: "prepare", label: "准备" },
      { id: "evidence", label: "取证" },
      { id: "truth", label: "真相" },
      { id: "compose", label: "成稿" },
      { id: "approve", label: "审定" },
    ],
    nodeOrder: [
      { id: "sync", phase: "prepare" },
      { id: "session", phase: "prepare" },
      { id: "collect", phase: "evidence" },
      { id: "inspect", phase: "evidence" },
      { id: "validate-write", phase: "evidence" },
      { id: "db-profile", phase: "truth" },
      { id: "db-model", phase: "truth" },
      { id: "truth-universe", phase: "truth" },
      { id: "truth-claims", phase: "truth" },
      { id: "narrative", phase: "compose" },
      { id: "fact-check", phase: "compose" },
      { id: "quality", phase: "compose" },
      { id: "truth-readiness", phase: "compose" },
      { id: "review", phase: "approve" },
    ],
    nodes: {
      sync: { status: "pending" },
      session: { status: "pending" },
      collect: { status: "pending" },
      inspect: { status: "pending" },
      "validate-write": { status: "pending" },
      "db-profile": { status: "pending" },
      "db-model": { status: "pending" },
      "truth-universe": { status: "pending" },
      "truth-claims": { status: "pending" },
      narrative: { status: "pending" },
      "fact-check": { status: "pending" },
      quality: { status: "pending" },
      "truth-readiness": { status: "pending" },
      review: { status: "pending" },
    },
  });

  assert.match(html, /真相阶段/);
  assert.match(html, /库表画像/);
  assert.match(html, /库表模型/);
  assert.match(html, /功能宇宙/);
  assert.match(html, /可信断言/);
  assert.match(html, /事实核验/);
  assert.match(html, /真实度门禁/);
});

test("dashboard frontend renders truth readiness gate summary", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();
  const context = createDashboardFrontendContext();

  vm.runInNewContext(script, context, { filename: "local-dashboard/index.html" });
  const html = context.renderTruthReadiness({
    truthReadiness: {
      scorePercent: 96,
      thresholdPercent: 95,
      canSubmitReview: true,
      blockers: [],
      improvementActions: [],
      generatedAt: "2026-05-21T02:00:00.000Z",
      writableClaimCoverage: {
        ratio: 0.5,
        minRatio: 0.8,
        missingWritableClaimCount: 1,
        missingWritableClaimIds: ["function:保单任务:任务详情"],
      },
      gates: {
        evidence: { label: "Evidence", pass: true, scorePercent: 100 },
        claims: { label: "Claims", pass: true, scorePercent: 100 },
      },
    },
    coverageRepair: {
      status: "completed",
      narrativePart: "保单任务",
      targetModules: ["保单任务"],
      executedNodes: ["narrative", "fact-check"],
    },
  });

  assert.match(html, /真实度门禁/);
  assert.match(html, /96%/);
  assert.match(html, /95%/);
  assert.match(html, /可写声明覆盖/);
  assert.match(html, /50%/);
  assert.match(html, /缺失可写声明/);
  assert.match(html, /function:保单任务:任务详情/);
  assert.match(html, /自动补写/);
  assert.match(html, /已自动补写/);
  assert.match(html, /自动补写分片/);
  assert.match(html, /保单任务/);
  assert.match(html, /无阻塞项/);
});

test("dashboard frontend renders batch truth and repair summary", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();
  const context = createDashboardFrontendContext();

  const snapshotPayload = {
    activeRun: {
      mode: "batch",
      systemName: "Batch 1/2 running",
      concurrency: 4,
      currentNodeLabel: "1 running / 1 queued",
      truthReadyCount: 1,
      coverageRepairCount: 1,
      failureSummary: { recoverable: 1, quotaSensitive: 1 },
      diagnosis: {
        summary: { total: 2, ready: 1, blocked: 1, missingWritableClaims: 1 },
        artifacts: { diagnosisMarkdown: "diagnosis.md" },
      },
      repairQueue: {
        summary: { total: 1, autoRunnable: 0, blocked: 1, requiresAgentWriting: 1 },
        artifacts: { repairQueueMarkdown: "repair-queue.md" },
      },
      runningMs: 120000,
      progress: { total: 2, completed: 1, percent: 50 },
      systems: [
        {
          code: "adp",
          name: "AI保单数据闭环平台",
          status: "running",
          runStatus: "running",
          currentPhase: "compose",
          currentNode: "fact-check",
          truthReadiness: { scorePercent: 96, canSubmitReview: true },
          writableClaimCoverage: { missingWritableClaimCount: 0 },
          coverageRepair: { status: "completed", narrativePart: "保单任务" },
          failure: {
            category: "narrative-generation",
            label: "写稿生成问题",
            recoverable: true,
          },
          retryPlan: {
            canRetry: true,
            nodes: "narrative,fact-check,quality,truth-readiness",
            quotaImpact: "agent-writing",
          },
        },
      ],
    },
  };
  const html = vm.runInNewContext(
    `${script}\nsnapshot = ${JSON.stringify(snapshotPayload)};\nrenderActiveRun();`,
    context,
    { filename: "local-dashboard/index.html" },
  );

  assert.match(html, /Batch execution/);
  assert.match(html, /真实度可审 1/);
  assert.match(html, /自动补写 1/);
  assert.match(html, /真实度 96%/);
  assert.match(html, /可审 是/);
  assert.match(html, /可写声明缺失 0/);
  assert.match(html, /自动补写 completed/);
  assert.match(html, /保单任务/);
  assert.match(html, /可恢复失败 1/);
  assert.match(html, /写稿额度敏感 1/);
  assert.match(html, /失败归因/);
  assert.match(html, /写稿生成问题/);
  assert.match(html, /建议重试节点 narrative,fact-check,quality,truth-readiness/);
  assert.match(html, /额度影响 agent-writing/);
  assert.match(html, /批量诊断 Ready 1\/2/);
  assert.match(html, /Blocked 1/);
  assert.match(html, /缺失可写声明 1/);
  assert.match(html, /诊断文件 diagnosis\.md/);
  assert.match(html, /修复队列/);
  assert.match(html, /自动 0\/1/);
  assert.match(html, /写稿额度 1/);
  assert.match(html, /修复队列文件 repair-queue\.md/);
});

function createDashboardFrontendContext() {
  return {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    fetch: async () => ({
      ok: true,
      json: async () => ({ running: false, systems: [] }),
    }),
    location: { hash: "#/systems" },
    window: { addEventListener: () => {} },
    document: {
      querySelector: () => ({
        textContent: "",
        innerHTML: "",
        value: "",
        classList: { add: () => {}, remove: () => {} },
        setAttribute: () => {},
        removeAttribute: () => {},
      }),
      querySelectorAll: () => [],
    },
  };
}

test("dashboard frontend renders usage history when current usage is missing", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();
  const context = createDashboardFrontendContext();

  vm.runInNewContext(script, context, { filename: "local-dashboard/index.html" });
  const html = context.renderPhase3bUsage({
    phase3bUsage: null,
    phase3bUsageHistorySummary: {
      runCount: 1,
      estimatedRunCount: 1,
      reviewRerunCount: 1,
      totalTokens: 1700,
      costUsd: 0.0029,
      costCny: 0.02,
    },
    phase3bUsageHistory: [
      {
        provider: "cursor-sdk",
        model: "composer-2.5",
        runKind: "review-rerun",
        narrativePart: "AI任务",
        promptChars: 900,
        sentPromptRunCount: 1,
        sentPromptRuns: [{ id: "module-AI任务-1", type: "module", moduleName: "AI任务1" }],
        sentPromptPartCount: 1,
        generatedPromptPartCount: 13,
        promptSavingsPercent: 87,
        totalTokens: 1700,
        usageEstimated: true,
        costUsd: 0.0029,
        costCny: 0.02,
        updatedAt: "2026-05-21T02:00:00.000Z",
        reviewRerun: { rewriteScope: "function-sections", inferred: true },
      },
    ],
  });

  assert.match(html, /暂无当前写稿消耗记录。以下为最近历史运行汇总。/);
  assert.match(html, /最近运行/);
  assert.match(html, /1 次/);
  assert.match(html, /最近合计 Token/);
  assert.match(html, /1,700/);
  assert.match(html, /最近参考费用/);
  assert.match(html, /\$0\.0029 \/ ¥0\.02/);
  assert.match(html, /cursor-sdk/);
  assert.match(html, /审核驳回重写/);
  assert.match(html, /目标 AI任务1/);
  assert.match(html, /1,700 tok（估算）/);
});

test("dashboard frontend renders current usage with history summary", () => {
  const vm = require("node:vm");
  const script = loadDashboardFrontendScript();
  const context = createDashboardFrontendContext();

  vm.runInNewContext(script, context, { filename: "local-dashboard/index.html" });
  const html = context.renderPhase3bUsage({
    phase3bUsage: {
      provider: "cursor-sdk",
      model: "composer-2.5",
      runKind: "review-rerun",
      narrativePart: "AI任务",
      promptChars: 1470,
      partPromptChars: 1470,
      generatedPromptChars: 8200,
      generatedPromptPartCount: 13,
      sentPromptRunCount: 2,
      sentPromptPartCount: 1,
      sentPromptRuns: [
        { id: "module-AI任务-1", type: "module", moduleName: "AI任务1" },
        { id: "module-AI任务-2", type: "module", moduleName: "AI任务2" },
      ],
      promptSavingsPercent: 82,
      promptSavedChars: 6730,
      inlineSummaryChars: 560,
      fragmentChars: 3500,
      pendingReviewChars: 4100,
      durationMs: 65000,
      inputTokens: 65101,
      outputTokens: 3282,
      totalTokens: 68383,
      cacheReadTokens: 44192,
      usageEstimated: false,
      usageUnavailable: false,
      costUsd: 0.0275,
      costCny: 0.2,
      costPricingSource: "cursor-api-pool",
      costLabel: "参考费用：$0.028 / ¥0.20（按 Cursor API 单价估算，非账单）",
      updatedAt: "2026-05-21T03:00:00.000Z",
      reviewRerun: {
        rewriteScope: "function-sections",
        narrativePart: "AI任务",
        targetModules: ["AI任务"],
        targetSections: ["2", "3"],
        comment: "AI任务模块描述错误，需要修正",
      },
    },
    phase3bUsageHistorySummary: {
      runCount: 2,
      estimatedRunCount: 1,
      reviewRerunCount: 1,
      totalTokens: 70083,
      costUsd: 0.0304,
      costCny: 0.22,
    },
    phase3bUsageHistory: [
      {
        provider: "cursor-sdk",
        model: "composer-2.5",
        runKind: "part-rerun",
        narrativePart: "AI任务",
        promptChars: 900,
        totalTokens: 1700,
        usageEstimated: true,
        costUsd: 0.0029,
        costCny: 0.02,
        updatedAt: "2026-05-21T02:00:00.000Z",
      },
    ],
  });

  assert.match(html, /Provider/);
  assert.match(html, /cursor-sdk/);
  assert.match(html, /审核驳回重写/);
  assert.match(html, /SDK 发送目标/);
  assert.match(html, /AI任务1、AI任务2/);
  assert.match(html, /合计 Token/);
  assert.match(html, /68,383/);
  assert.match(html, /参考费用/);
  assert.match(html, /\$0\.028 \/ ¥0\.20/);
  assert.match(html, /审核重写依据/);
  assert.match(html, /驳回意见：AI任务模块描述错误，需要修正/);
  assert.match(html, /最近运行/);
  assert.match(html, /2 次/);
  assert.match(html, /最近合计 Token/);
  assert.match(html, /70,083/);
  assert.match(html, /最近参考费用/);
  assert.match(html, /\$0\.030 \/ ¥0\.22/);
  assert.match(html, /已记录 SDK token 明细/);
});

test("applyVisibleDomMenuCandidatesToEvidence keeps nested menuPath", () => {
  const { applyVisibleDomMenuCandidatesToEvidence } = require("./collect-evidence");
  const evidence = { menuMap: [] };
  const result = applyVisibleDomMenuCandidatesToEvidence(
    evidence,
    [{ title: "运行日志", path: "/log", menuPath: "数据与运行观测 > 运行日志" }],
    { name: "demo", url: "https://example.com/" },
  );
  assert.equal(result.added, 1);
  assert.equal(evidence.menuMap[0].menuPath, "数据与运行观测 > 运行日志");
  assert.equal(evidence.menuMap[0].openStrategy, "url-or-text-click");
});

test("enrichPhase3bUsageRecord backfills estimated tokens for legacy usage files", () => {
  const { enrichPhase3bUsageRecord } = require("./narrative/extract-sdk-usage");
  const enriched = enrichPhase3bUsageRecord({
    provider: "cursor-sdk",
    promptChars: 1556,
    inlineSummaryChars: 563,
    fragmentChars: 3500,
    usageUnavailable: true,
    totalTokens: 0,
  });
  assert.equal(enriched.usageEstimated, true);
  assert.equal(enriched.usageUnavailable, false);
  assert.equal(enriched.totalTokens, 3121);
  assert.ok(enriched.costUsd > 0);
  assert.ok(enriched.costCny > 0);
});

test("estimateUsageCost computes composer-2.5 API pool cost from adp sdk usage", () => {
  const { estimateUsageCost } = require("./narrative/usage-cost");
  const cost = estimateUsageCost(
    {
      model: "composer-2.5",
      inputTokens: 65101,
      outputTokens: 3282,
      cacheReadTokens: 44192,
      cacheWriteTokens: 0,
    },
    { usdToCny: 7.25 },
  );
  assert.equal(cost.costUsd, 0.0275);
  assert.equal(cost.costCny, 0.2);
  assert.equal(cost.costPricingModel, "composer-2.5");
  assert.equal(cost.costPricingSource, "cursor-api-pool");
  assert.equal(cost.costBreakdown.freshInputTokens, 20909);
  assert.equal(cost.costBreakdown.cacheReadTokens, 44192);
});

test("estimateUsageCost ignores invalid and negative token values", () => {
  const { estimateUsageCost } = require("./narrative/usage-cost");
  const cost = estimateUsageCost(
    {
      model: "composer-2.5",
      inputTokens: "bad",
      outputTokens: 1800,
      cacheReadTokens: -100,
      cacheWriteTokens: "bad",
    },
    { usdToCny: 7.25 },
  );

  assert.equal(cost.costBreakdown.freshInputTokens, 0);
  assert.equal(cost.costBreakdown.cacheReadTokens, 0);
  assert.equal(cost.costBreakdown.cacheWriteTokens, 0);
  assert.equal(cost.costBreakdown.outputTokens, 1800);
  assert.equal(Number.isFinite(cost.costUsd), true);
  assert.equal(Number.isFinite(cost.costCny), true);
});

test("attachUsageCost skips non cursor-sdk providers", () => {
  const { attachUsageCost } = require("./narrative/usage-cost");
  const usage = attachUsageCost({ provider: "manual", inputTokens: 1000, outputTokens: 200 });
  assert.equal(usage.costUsd, undefined);
});

test("resolveModelPricing honors composer-pool and model overrides", () => {
  const { resolveModelPricing } = require("./narrative/usage-cost");
  const pool = resolveModelPricing("composer-2.5", { pool: "composer-pool" });
  assert.equal(pool.inputPer1M, 1.25);
  assert.equal(pool.source, "cursor-composer-pool");

  const override = resolveModelPricing("composer-2.5", {
    models: { "composer-2.5": { inputPer1M: 0.9 } },
  });
  assert.equal(override.inputPer1M, 0.9);
  assert.equal(override.outputPer1M, 2.5);
});

test("enrichPhase3bUsageRecord attaches cost for sdk usage records", () => {
  const { enrichPhase3bUsageRecord } = require("./narrative/extract-sdk-usage");
  const enriched = enrichPhase3bUsageRecord({
    provider: "cursor-sdk",
    model: "composer-2.5",
    inputTokens: 65101,
    outputTokens: 3282,
    totalTokens: 68383,
    cacheReadTokens: 44192,
    usageSource: "sdk",
    usageEstimated: false,
  });
  assert.equal(enriched.costUsd, 0.0275);
  assert.equal(enriched.costCny, 0.2);
});

test("dashboard snapshot exposes phase3b usage cost summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-usage-cost-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "narrative:",
      "  pricing:",
      "    usdToCny: 7.25",
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "phase3b-usage.json"),
    JSON.stringify({
      provider: "cursor-sdk",
      model: "composer-2.5",
      inputTokens: 65101,
      outputTokens: 3282,
      totalTokens: 68383,
      cacheReadTokens: 44192,
      usageSource: "sdk",
      usageEstimated: false,
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].phase3bUsage.costUsd, 0.0275);
  assert.equal(snapshot.systems[0].phase3bUsage.costCny, 0.2);
  assert.equal(snapshot.systems[0].phase3bUsage.costPricingSource, "cursor-api-pool");
  assert.match(snapshot.systems[0].phase3bUsage.costLabel, /参考费用：\$0\.028 \/ ¥0\.20/);
});

test("dashboard snapshot exposes write validation summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-write-val-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "write-validation-result.json"),
    JSON.stringify({
      status: "partial",
      reason: "Opened create forms but did not confirm all submissions.",
      finishedAt: "2026-05-22T08:00:00.000Z",
      scenarios: [
        {
          id: "auto-ai-task",
          menuPath: "AI任务管理",
          status: "success",
          targetName: "AI_AUTO_TEST_AI任务管理",
        },
      ],
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.systems[0].writeValidation.status, "partial");
  assert.equal(snapshot.systems[0].writeValidation.successCount, 1);
  assert.equal(snapshot.systems[0].writeValidation.scenarios[0].menuPath, "AI任务管理");
});

test("dashboard pipeline command targets one system and selected nodes", () => {
  const { buildPipelineCommand, resolveRerunNarrativePart } = require("./local-dashboard/server");
  const command = buildPipelineCommand({
    configPath: "config/systems.local.yaml",
    system: "adp",
    nodes: ["narrative", "quality"],
    provider: "manual",
    narrativePart: "overview-flow",
    reviewRerun: true,
    reset: true,
  });

  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args.slice(0, 2), [
    "scripts/run-whitepaper-pipeline.js",
    "--config",
  ]);
  assert.ok(command.args.includes("adp"));
  assert.ok(command.args.includes("narrative,quality"));
  assert.ok(command.args.includes("--narrative-part"));
  assert.ok(command.args.includes("overview-flow"));
  assert.ok(command.args.includes("--review-rerun"));
  assert.ok(command.args.includes("--reset"));
  assert.equal(resolveRerunNarrativePart({ rewriteScope: "overview-flow" }), "overview-flow");
  assert.equal(resolveRerunNarrativePart({ rewriteScope: "function-sections" }), "function-sections");
  assert.equal(resolveRerunNarrativePart({ rewriteScope: "function-sections", narrativePart: "AI任务" }), "AI任务");
  assert.equal(resolveRerunNarrativePart({ rewriteScope: "evidence-refresh" }), "");
  assert.equal(resolveRerunNarrativePart({ rerunNodes: ["collect", "summary", "narrative", "quality"], rewriteScope: "evidence-refresh" }), "");
});

test("whitepaper batch runner selects systems and builds isolated child args", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildBatchChildArgs,
    buildBatchDiagnosis,
    buildBatchRepairQueue,
    buildRetryArgs,
    buildRetryNodes,
    classifyBatchFailure,
    createBatchState,
    renderBatchDiagnosisMarkdown,
    renderBatchRepairQueueMarkdown,
    resolveBatchConcurrency,
    resolveBatchRetries,
    selectBatchSystems,
    updateBatchSystem,
    writeBatchDiagnosis,
    writeBatchRepairQueue,
  } = require("./run-whitepaper-batch");
  const config = {
    runtime: {},
    systems: [
      { code: "adp", name: "AI保单数据闭环平台" },
      { code: "claim", name: "理赔系统" },
    ],
  };

  assert.deepEqual(
    selectBatchSystems(config, { systems: "claim,adp" }).map((system) => system.code),
    ["claim", "adp"],
  );
  assert.deepEqual(
    selectBatchSystems(config, { all: true }).map((system) => system.code),
    ["adp", "claim"],
  );
  assert.throws(
    () => selectBatchSystems(config, { systems: "adp,adp" }),
    /Duplicate system requested/,
  );
  assert.throws(
    () => selectBatchSystems(config, { systems: "missing" }),
    /System not found/,
  );
  assert.equal(resolveBatchConcurrency({}, config), 4);
  assert.equal(resolveBatchConcurrency({}, { runtime: { concurrency: 3 } }), 3);
  assert.throws(() => resolveBatchConcurrency({ concurrency: 0 }, config), /positive number/);
  assert.equal(resolveBatchRetries({}, config), 0);
  assert.equal(resolveBatchRetries({}, { runtime: { batchRetries: 2 } }), 2);
  assert.throws(() => resolveBatchRetries({ "batch-retries": -1 }, config), /non-negative number/);

  const childArgs = buildBatchChildArgs(
    {
      "with-whitepaper": true,
      reset: true,
      nodes: ["narrative", "fact-check", "quality"],
      provider: "manual",
      concurrency: 4,
    },
    "adp",
    "config/systems.local.yaml",
  );
  assert.deepEqual(childArgs.slice(0, 5), [
    "scripts/run-whitepaper-pipeline.js",
    "--config",
    "config/systems.local.yaml",
    "--system",
    "adp",
  ]);
  assert.ok(childArgs.includes("--no-batch-state"));
  assert.ok(childArgs.includes("--with-whitepaper"));
  assert.ok(childArgs.includes("--reset"));
  assert.ok(childArgs.includes("narrative,fact-check,quality"));
  assert.equal(childArgs.includes("--concurrency"), false);
  assert.equal(childArgs.includes("--batch-retries"), false);
  assert.equal(
    buildRetryNodes({ "with-whitepaper": true }, "fact-check"),
    "fact-check,quality,truth-readiness",
  );
  assert.equal(
    buildRetryNodes({ withWhitepaper: true }, "fact-check"),
    "fact-check,quality,truth-readiness",
  );
  const retryArgs = buildRetryArgs(
    { "with-whitepaper": true, reset: true, "batch-retries": 2, provider: "manual" },
    "narrative",
  );
  assert.equal(retryArgs.reset, undefined);
  assert.equal(retryArgs["batch-retries"], undefined);
  assert.equal(retryArgs.nodes, "narrative,fact-check,quality,truth-readiness");
  assert.deepEqual(
    buildBatchChildArgs(retryArgs, "adp", "config/systems.local.yaml").filter((item) =>
      ["--reset", "--batch-retries"].includes(item),
    ),
    [],
  );
  assert.equal(
    classifyBatchFailure(
      {
        currentPhase: "compose",
        currentNode: "truth-readiness",
        lastError: "truth readiness failed: low writable claim coverage",
      },
      null,
      { args: { "with-whitepaper": true } },
    ).category,
    "quality-gate",
  );
  const narrativeFailure = classifyBatchFailure(
    {
      currentPhase: "compose",
      currentNode: "narrative",
      lastError: "model stream aborted",
      exitCode: 2,
    },
    null,
    { args: { "with-whitepaper": true } },
  );
  assert.equal(narrativeFailure.recoverable, true);
  assert.equal(narrativeFailure.retryPlan.nodes, "narrative,fact-check,quality,truth-readiness");
  assert.equal(narrativeFailure.retryPlan.quotaImpact, "agent-writing");
  assert.equal(
    classifyBatchFailure({ currentNode: "session", lastError: "401 unauthorized" }).category,
    "auth-or-session",
  );

  const initial = createBatchState(config.systems, {
    concurrency: 4,
    startedAt: "2026-06-03T00:00:00.000Z",
    now: "2026-06-03T00:00:00.000Z",
  });
  assert.equal(initial.status, "running");
  assert.equal(initial.summary.queued, 2);
  const running = updateBatchSystem(
    initial,
    "adp",
    { status: "running", runStatus: "running", pid: 123 },
    { now: "2026-06-03T00:01:00.000Z" },
  );
  assert.equal(running.summary.running, 1);
  assert.equal(running.currentSystemCode, "adp");
  const completed = updateBatchSystem(
    running,
    "adp",
    { status: "review-pending", runStatus: "completed", pid: null },
    { now: "2026-06-03T00:02:00.000Z" },
  );
  assert.equal(completed.summary.completed, 1);
  assert.equal(completed.summary.reviewPending, 1);

  const diagnosisInput = {
    batchId: "batch-test",
    status: "failed",
    systems: [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        status: "review-pending",
        runStatus: "completed",
        truthReadiness: {
          scorePercent: 96,
          canSubmitReview: true,
          canFinalize: true,
          blockers: [],
          improvementActions: [],
        },
        writableClaimCoverage: { missingWritableClaimCount: 0 },
      },
      {
        code: "claim",
        name: "理赔系统",
        status: "failed",
        runStatus: "failed",
        currentPhase: "compose",
        currentNode: "truth-readiness",
        truthReadiness: {
          scorePercent: 91,
          canSubmitReview: false,
          canFinalize: false,
          blockers: [
            {
              id: "fact-check.writable-coverage",
              severity: "P0",
              message: "Missing writable claims.",
              rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
              missingWritableClaimIds: ["function:理赔:案件详情"],
            },
          ],
          improvementActions: [],
        },
        writableClaimCoverage: {
          missingWritableClaimCount: 1,
          missingWritableClaimIds: ["function:理赔:案件详情"],
        },
        failure: {
          category: "quality-gate",
          label: "质量或真实度门禁未过",
          recoverable: true,
          action: "查看 fact-check。",
          retryPlan: {
            canRetry: true,
            nodes: "narrative,fact-check,quality,truth-readiness",
            quotaImpact: "agent-writing",
          },
        },
        failureCategory: "quality-gate",
        recoverable: true,
        retryPlan: {
          canRetry: true,
          nodes: "narrative,fact-check,quality,truth-readiness",
          quotaImpact: "agent-writing",
        },
      },
    ],
  };
  const diagnosis = buildBatchDiagnosis(diagnosisInput);
  assert.equal(diagnosis.summary.total, 2);
  assert.equal(diagnosis.summary.ready, 1);
  assert.equal(diagnosis.summary.blocked, 1);
  assert.equal(diagnosis.summary.missingWritableClaims, 1);
  assert.equal(diagnosis.summary.quotaSensitive, 1);
  assert.equal(diagnosis.systems[1].ready, false);
  assert.ok(diagnosis.systems[1].gaps.some((gap) => gap.type === "writable-claim-coverage"));
  assert.ok(diagnosis.systems[1].actions.some((action) => action.id === "fact-check.writable-coverage"));
  const markdown = renderBatchDiagnosisMarkdown(diagnosis);
  assert.match(markdown, /Batch Diagnosis/);
  assert.match(markdown, /claim/);
  assert.match(markdown, /Missing writable claims/);
  const diagDir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-diagnosis-"));
  const writtenDiagnosis = writeBatchDiagnosis(diagDir, diagnosisInput);
  assert.equal(fs.existsSync(path.join(diagDir, "_batch", "diagnosis.json")), true);
  assert.equal(fs.existsSync(path.join(diagDir, "_batch", "diagnosis.md")), true);
  assert.equal(writtenDiagnosis.artifacts.diagnosisMarkdown, "diagnosis.md");

  const repairQueue = buildBatchRepairQueue(diagnosis, { allowAgentWriting: false });
  assert.equal(repairQueue.summary.total, 1);
  assert.equal(repairQueue.summary.autoRunnable, 0);
  assert.equal(repairQueue.summary.blocked, 1);
  assert.equal(repairQueue.summary.requiresAgentWriting, 1);
  assert.equal(repairQueue.items[0].systemCode, "claim");
  assert.equal(repairQueue.items[0].reset, false);
  assert.equal(repairQueue.items[0].reviewRerun, false);
  assert.equal(repairQueue.items[0].actionId, "narrative.cover-missing-writable-claims");
  assert.deepEqual(repairQueue.items[0].nodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.equal(repairQueue.items[0].canAutoRun, false);
  assert.match(repairQueue.items[0].blockedReason, /Agent-writing quota/);
  assert.deepEqual(repairQueue.items[0].missingWritableClaimIds, ["function:理赔:案件详情"]);
  assert.deepEqual(
    repairQueue.items[0].command.args,
    [
      "--systems",
      "claim",
      "--nodes",
      "narrative,fact-check,quality,truth-readiness",
      "--narrative-part",
      "function-sections",
    ],
  );
  const allowedRepairQueue = buildBatchRepairQueue(diagnosis, { allowAgentWriting: true });
  assert.equal(allowedRepairQueue.summary.autoRunnable, 1);
  assert.equal(allowedRepairQueue.items[0].canAutoRun, true);
  const repairMarkdown = renderBatchRepairQueueMarkdown(repairQueue);
  assert.match(repairMarkdown, /Batch Repair Queue/);
  assert.match(repairMarkdown, /claim/);
  assert.match(repairMarkdown, /agent-writing/);
  const writtenRepairQueue = writeBatchRepairQueue(diagDir, diagnosis, { allowAgentWriting: false });
  assert.equal(fs.existsSync(path.join(diagDir, "_batch", "repair-queue.json")), true);
  assert.equal(fs.existsSync(path.join(diagDir, "_batch", "repair-queue.md")), true);
  assert.equal(writtenRepairQueue.artifacts.repairQueueMarkdown, "repair-queue.md");
});

test("batch runner refreshes aggregate state from per-system pipeline states", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    createBatchState,
    refreshBatchStateFromDisk,
    writeBatchRunState,
  } = require("./run-whitepaper-batch");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-state-"));
  const adpOutput = path.join(outputRoot, "adp");
  const claimOutput = path.join(outputRoot, "claim");
  fs.mkdirSync(adpOutput, { recursive: true });
  fs.mkdirSync(claimOutput, { recursive: true });
  let pipelineState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  pipelineState = updateNodeStatus(pipelineState, "sync", "success");
  pipelineState = updateNodeStatus(pipelineState, "session", "running");
  writePipelineState(path.join(adpOutput, "pipeline-state.json"), pipelineState);
  let claimState = createPipelineState({ code: "claim", name: "理赔系统" });
  claimState = updateNodeStatus(claimState, "sync", "success");
  claimState = updateNodeStatus(claimState, "session", "success");
  claimState = updateNodeStatus(claimState, "collect", "success");
  claimState = updateNodeStatus(claimState, "inspect", "success");
  claimState = updateNodeStatus(claimState, "validate-write", "success");
  claimState = updateNodeStatus(claimState, "db-profile", "success");
  claimState = updateNodeStatus(claimState, "db-model", "success");
  claimState = updateNodeStatus(claimState, "truth-universe", "success");
  claimState = updateNodeStatus(claimState, "truth-claims", "success");
  claimState = updateNodeStatus(claimState, "build-spec", "success");
  claimState = updateNodeStatus(claimState, "compose-guide", "success");
  claimState = updateNodeStatus(claimState, "draft", "success");
  claimState = updateNodeStatus(claimState, "summary", "success");
  claimState = updateNodeStatus(claimState, "narrative", "failed", {
    lastError: "model stream aborted",
  });
  writePipelineState(path.join(claimOutput, "pipeline-state.json"), claimState);
  fs.writeFileSync(
    path.join(adpOutput, "truth-readiness-report.json"),
    JSON.stringify({
      scorePercent: 96,
      canSubmitReview: true,
      canFinalize: true,
      blockers: [],
      generatedAt: "2026-06-03T00:02:00.000Z",
      gates: {
        factCheck: {
          metrics: {
            writableClaimCoverageRatio: 1,
            minWritableClaimCoverage: 0.8,
            missingWritableClaimCount: 0,
          },
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(adpOutput, "coverage-repair-plan.json"),
    JSON.stringify({
      status: "completed",
      narrativePart: "保单任务",
      targetModules: ["保单任务"],
      missingWritableClaimIds: ["function:保单任务:任务详情"],
    }),
    "utf8",
  );

  const batchState = createBatchState(
    [
      { code: "adp", name: "AI保单数据闭环平台" },
      { code: "claim", name: "理赔系统" },
    ],
    { concurrency: 4, startedAt: "2026-06-03T00:00:00.000Z" },
  );
  const refreshed = refreshBatchStateFromDisk(batchState, outputRoot, {
    now: "2026-06-03T00:03:00.000Z",
    args: { "with-whitepaper": true },
  });
  const adp = refreshed.systems.find((item) => item.code === "adp");
  const claim = refreshed.systems.find((item) => item.code === "claim");
  assert.equal(adp.status, "running");
  assert.equal(adp.currentNode, "session");
  assert.equal(adp.truthReadiness.scorePercent, 96);
  assert.equal(adp.truthReadiness.canSubmitReview, true);
  assert.equal(adp.writableClaimCoverage.ratio, 1);
  assert.equal(adp.coverageRepair.status, "completed");
  assert.equal(adp.coverageRepair.narrativePart, "保单任务");
  assert.equal(claim.status, "failed");
  assert.equal(claim.failureCategory, "narrative-generation");
  assert.equal(claim.recoverable, true);
  assert.equal(claim.retryPlan.nodes, "narrative,fact-check,quality,truth-readiness");
  assert.equal(claim.retryPlan.quotaImpact, "agent-writing");
  assert.equal(refreshed.failureSummary.recoverable, 1);
  assert.equal(refreshed.failureSummary.quotaSensitive, 1);
  assert.equal(refreshed.status, "running");

  const writtenPath = writeBatchRunState(outputRoot, refreshed);
  const written = JSON.parse(fs.readFileSync(writtenPath, "utf8"));
  assert.equal(written.systems[0].code, "adp");
  assert.equal(written.concurrency, 4);
  assert.equal(written.systems[0].truthReadiness.scorePercent, 96);
  assert.equal(written.systems[0].coverageRepair.status, "completed");
  assert.equal(written.failureSummary.counts["narrative-generation"], 1);
});

test("batch runner classifies failed children and retries recoverable failures only when enabled", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { EventEmitter } = require("node:events");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { runBatchPipeline } = require("./run-whitepaper-batch");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-retry-"));
  const outputRoot = path.join(dir, "outputs");
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const adpOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(adpOutput, { recursive: true });
  let launches = 0;
  const launchedArgs = [];
  const fakeSpawn = (command, args) => {
    launches += 1;
    launchedArgs.push(args.slice());
    const child = new EventEmitter();
    child.pid = 9000 + launches;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (launches === 1) {
        let failed = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
        failed = updateNodeStatus(failed, "sync", "success");
        failed = updateNodeStatus(failed, "session", "success");
        failed = updateNodeStatus(failed, "collect", "success");
        failed = updateNodeStatus(failed, "inspect", "success");
        failed = updateNodeStatus(failed, "validate-write", "success");
        failed = updateNodeStatus(failed, "db-profile", "success");
        failed = updateNodeStatus(failed, "db-model", "success");
        failed = updateNodeStatus(failed, "truth-universe", "success");
        failed = updateNodeStatus(failed, "truth-claims", "success");
        failed = updateNodeStatus(failed, "build-spec", "success");
        failed = updateNodeStatus(failed, "compose-guide", "success");
        failed = updateNodeStatus(failed, "draft", "success");
        failed = updateNodeStatus(failed, "summary", "success");
        failed = updateNodeStatus(failed, "narrative", "failed", {
          lastError: "model stream aborted",
        });
        writePipelineState(path.join(adpOutput, "pipeline-state.json"), failed);
        child.emit("close", 2, null);
        return;
      }
      let recovered = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
      for (const nodeId of [
        "sync",
        "session",
        "collect",
        "inspect",
        "validate-write",
        "db-profile",
        "db-model",
        "truth-universe",
        "truth-claims",
        "build-spec",
        "compose-guide",
        "draft",
        "summary",
        "narrative",
        "fact-check",
        "quality",
        "truth-readiness",
      ]) {
        recovered = updateNodeStatus(recovered, nodeId, "success");
      }
      writePipelineState(path.join(adpOutput, "pipeline-state.json"), recovered);
      fs.writeFileSync(
        path.join(adpOutput, "fact-check-report.json"),
        JSON.stringify({
          canFinalize: true,
          metrics: {
            writableClaimCoverageRatio: 1,
            minWritableClaimCoverage: 0.8,
            missingWritableClaimCount: 0,
          },
          missingWritableClaimIds: [],
        }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(adpOutput, "truth-readiness-report.json"),
        JSON.stringify({
          scorePercent: 96,
          canSubmitReview: true,
          canFinalize: true,
          blockers: [],
          improvementActions: [],
          gates: {
            factCheck: {
              metrics: {
                writableClaimCoverageRatio: 1,
                minWritableClaimCoverage: 0.8,
                missingWritableClaimCount: 0,
              },
            },
          },
        }),
        "utf8",
      );
      child.emit("close", 0, null);
    });
    return child;
  };

  const state = await runBatchPipeline({
    args: {
      config: configPath,
      systems: "adp",
      "with-whitepaper": true,
      reset: true,
      "batch-retries": 1,
      provider: "manual",
    },
    spawn: fakeSpawn,
  });

  assert.equal(launches, 2);
  assert.equal(state.status, "success");
  assert.equal(state.systems[0].attempts, 2);
  assert.equal(launchedArgs[0].includes("--reset"), true);
  assert.equal(launchedArgs[1].includes("--reset"), false);
  assert.ok(launchedArgs[1].includes("narrative,fact-check,quality,truth-readiness"));
  const written = JSON.parse(
    fs.readFileSync(path.join(outputRoot, "_batch", "run-state.json"), "utf8"),
  );
  assert.equal(written.systems[0].runStatus, "completed");
  assert.equal(written.systems[0].attempts, 2);
  assert.equal(written.diagnosis.summary.ready, 1);
  assert.equal(written.diagnosis.artifacts.diagnosisJson, "diagnosis.json");
  assert.equal(written.repairQueue.summary.total, 0);
  assert.equal(written.repairQueue.artifacts.repairQueueJson, "repair-queue.json");
  assert.equal(written.acceptance.status, "blocked");
  assert.equal(written.acceptance.artifacts.acceptanceJson, "acceptance-report.json");
  assert.equal(written.deliveryReadiness.status, "blocked");
  assert.equal(written.deliveryReadiness.artifacts.deliveryReadinessJson, "delivery-readiness-report.json");
  assert.equal(written.realRunReadiness.status, "blocked");
  assert.equal(written.realRunReadiness.artifacts.realRunReadinessJson, "real-run-readiness-report.json");
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "diagnosis.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "diagnosis.md")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "repair-queue.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "repair-queue.md")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "acceptance-report.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "acceptance-report.md")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.md")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "real-run-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "real-run-readiness-report.md")), true);
  assert.match(fs.readFileSync(path.join(outputRoot, "_batch", "diagnosis.md"), "utf8"), /Batch Diagnosis/);
  assert.match(fs.readFileSync(path.join(outputRoot, "_batch", "repair-queue.md"), "utf8"), /Batch Repair Queue/);
  assert.match(fs.readFileSync(path.join(outputRoot, "_batch", "acceptance-report.md"), "utf8"), /Batch Acceptance Report/);
  assert.match(
    fs.readFileSync(path.join(outputRoot, "_batch", "delivery-readiness-report.md"), "utf8"),
    /Delivery Readiness Report/,
  );
  assert.match(
    fs.readFileSync(path.join(outputRoot, "_batch", "real-run-readiness-report.md"), "utf8"),
    /Real Run Readiness Report/,
  );
});

test("batch repair queue runner builds safe plans and executes runnable groups", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { EventEmitter } = require("node:events");
  const {
    buildRepairClosureReport,
    buildRepairFollowUpPlan,
    buildRepairRunPlan,
    runRepairQueue,
    validateRepairItem,
  } = require("./run-batch-repair-queue");

  const queue = {
    artifactType: "batch-repair-queue",
    batchId: "batch-test",
    generatedAt: "2026-06-03T00:00:00.000Z",
    items: [
      {
        id: "repair-01-adp",
        systemCode: "adp",
        canAutoRun: true,
        reset: false,
        reviewRerun: false,
        nodes: ["fact-check", "quality", "truth-readiness"],
        quotaImpact: "low",
      },
      {
        id: "repair-02-claim",
        systemCode: "claim",
        canAutoRun: true,
        reset: false,
        reviewRerun: false,
        nodes: ["narrative", "fact-check", "quality", "truth-readiness"],
        narrativePart: "function-sections",
        requiresAgentWriting: true,
        quotaImpact: "agent-writing",
      },
      {
        id: "repair-03-bad",
        systemCode: "bad",
        canAutoRun: true,
        reset: true,
        nodes: ["review"],
      },
    ],
  };

  const plan = buildRepairRunPlan(queue, {
    allowAgentWriting: false,
    concurrency: 4,
    configPath: "config/systems.local.yaml",
  });
  assert.equal(plan.summary.runnableItems, 1);
  assert.equal(plan.summary.runnableGroups, 1);
  assert.equal(plan.summary.skipped, 2);
  assert.equal(plan.groups[0].systems.join(","), "adp");
  assert.equal(plan.groups[0].nodesCsv, "fact-check,quality,truth-readiness");
  assert.deepEqual(plan.groups[0].command.args.slice(0, 7), [
    "scripts/run-whitepaper-batch.js",
    "--config",
    "config/systems.local.yaml",
    "--systems",
    "adp",
    "--nodes",
    "fact-check,quality,truth-readiness",
  ]);
  assert.equal(plan.skipped.some((item) => item.reason === "agent-writing-not-allowed"), true);
  assert.equal(validateRepairItem(queue.items[2], { allowAgentWriting: true }).ok, false);

  const agentPlan = buildRepairRunPlan(queue, {
    allowAgentWriting: true,
    concurrency: 4,
    configPath: "config/systems.local.yaml",
  });
  assert.equal(agentPlan.summary.runnableItems, 2);
  assert.equal(agentPlan.groups.length, 2);
  assert.equal(agentPlan.groups[1].command.args.includes("--repair-allow-agent-writing"), true);
  assert.equal(agentPlan.groups[1].command.args.includes("--narrative-part"), true);

  const passedClosure = buildRepairClosureReport(
    {
      status: "success",
      startedAt: "2026-06-03T00:00:00.000Z",
      finishedAt: "2026-06-03T00:01:00.000Z",
      groups: [{ id: "repair-group-01", status: "success", systems: ["adp"], nodesCsv: "truth-readiness" }],
    },
    {
      diagnosis: {
        artifactType: "batch-diagnosis",
        generatedAt: "2026-06-03T00:01:00.000Z",
        summary: { total: 1, ready: 1, blocked: 0, missingWritableClaims: 0 },
        systems: [
          {
            code: "adp",
            ready: true,
            truthScorePercent: 96,
            canSubmitReview: true,
            missingWritableClaimCount: 0,
          },
        ],
      },
      repairQueue: {
        artifactType: "batch-repair-queue",
        generatedAt: "2026-06-03T00:01:00.000Z",
        summary: { total: 0, autoRunnable: 0, blocked: 0, requiresAgentWriting: 0 },
        items: [],
      },
    },
  );
  assert.equal(passedClosure.status, "passed");
  assert.equal(passedClosure.canSubmitAll, true);
  assert.equal(passedClosure.repairQueueEmpty, true);

  const blockedClosure = buildRepairClosureReport(
    {
      status: "success",
      groups: [{ id: "repair-group-01", status: "success", systems: ["claim"], nodesCsv: "truth-readiness" }],
    },
    {
      diagnosis: {
        artifactType: "batch-diagnosis",
        summary: { total: 1, ready: 0, blocked: 1, missingWritableClaims: 2 },
        systems: [
          {
            code: "claim",
            ready: false,
            truthScorePercent: 91,
            canSubmitReview: false,
            missingWritableClaimCount: 2,
          },
        ],
      },
      repairQueue: {
        artifactType: "batch-repair-queue",
        summary: { total: 1, autoRunnable: 0, blocked: 1, requiresAgentWriting: 1 },
        items: [{ systemCode: "claim" }],
      },
    },
  );
  assert.equal(blockedClosure.status, "blocked");
  assert.equal(blockedClosure.canSubmitAll, false);
  assert.ok(blockedClosure.blockers.some((item) => item.includes("below 95%")));
  assert.ok(blockedClosure.blockers.some((item) => item.includes("repair queue")));

  const passedFollowUp = buildRepairFollowUpPlan(
    { status: "success", groups: [] },
    {
      closure: passedClosure,
      diagnosis: {
        artifactType: "batch-diagnosis",
        summary: { total: 1, ready: 1, blocked: 0, missingWritableClaims: 0 },
        systems: [
          {
            code: "adp",
            ready: true,
            truthScorePercent: 96,
            canSubmitReview: true,
            missingWritableClaimCount: 0,
          },
        ],
      },
      repairQueue: {
        artifactType: "batch-repair-queue",
        summary: { total: 0, autoRunnable: 0, blocked: 0, requiresAgentWriting: 0 },
        items: [],
      },
    },
  );
  assert.equal(passedFollowUp.status, "complete");
  assert.equal(passedFollowUp.summary.commands, 0);

  const followUpPlan = buildRepairFollowUpPlan(
    {
      status: "partial",
      groups: [
        {
          id: "repair-group-02",
          status: "pending",
          systems: ["adp"],
          nodesCsv: "fact-check,quality,truth-readiness",
          requiresAgentWriting: false,
        },
      ],
    },
    {
      closure: blockedClosure,
      diagnosis: {
        artifactType: "batch-diagnosis",
        summary: { total: 1, ready: 0, blocked: 1, missingWritableClaims: 2 },
        systems: [
          {
            code: "claim",
            ready: false,
            truthScorePercent: 91,
            canSubmitReview: false,
            missingWritableClaimCount: 2,
            actions: [
              {
                id: "narrative.cover-missing-writable-claims",
                message: "Cover missing writable claims.",
                canRetry: true,
                rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
                narrativePart: "function-sections",
                quotaImpact: "agent-writing",
              },
            ],
          },
        ],
      },
      repairQueue: queue,
      concurrency: 4,
    },
  );
  assert.equal(followUpPlan.status, "ready-to-run");
  assert.ok(followUpPlan.summary.lowQuotaCommands > 0);
  assert.ok(followUpPlan.summary.agentWritingCommands > 0);
  assert.ok(followUpPlan.commands.some((item) => item.id === "repair-remaining-low-quota"));
  assert.ok(followUpPlan.commands.some((item) => item.id === "repair-remaining-agent-writing"));
  assert.equal(
    followUpPlan.commands.find((item) => item.id === "repair-remaining-agent-writing").canAutoRun,
    false,
  );
  assert.match(
    followUpPlan.commands.find((item) => item.id === "repair-remaining-low-quota").command.preview,
    /npm run repair:batch/,
  );
  assert.equal(
    followUpPlan.commands.find((item) => item.id === "repair-remaining-low-quota").command.args.includes("--max-items"),
    false,
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-queue-runner-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const queuePath = path.join(dir, "outputs", "_batch", "repair-queue.json");
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, JSON.stringify(queue), "utf8");

  const dryRunState = await runRepairQueue({
    args: { config: configPath, "dry-run": true },
  });
  assert.equal(dryRunState.status, "dry-run");
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-run-plan.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-run-plan.md")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-run-state.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-closure.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-closure.md")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-follow-up-plan.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "repair-follow-up-plan.md")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "acceptance-report.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "delivery-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "outputs", "_batch", "real-run-readiness-report.json")), true);
  assert.equal(dryRunState.closure.status, "blocked");
  assert.equal(dryRunState.followUpPlan.status, "ready-to-run");
  assert.equal(dryRunState.closure.followUp.status, "ready-to-run");
  assert.equal(dryRunState.acceptance.status, "blocked");
  assert.equal(dryRunState.deliveryReadiness.status, "blocked");
  assert.equal(dryRunState.realRunReadiness.status, "blocked");

  const launched = [];
  const fakeSpawn = (command, args) => {
    launched.push({ command, args });
    const child = new EventEmitter();
    child.pid = 1234;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit("close", 0, null));
    return child;
  };
  const runState = await runRepairQueue({
    args: { config: configPath },
    spawn: fakeSpawn,
  });
  assert.equal(runState.status, "success");
  assert.equal(runState.closure.status, "blocked");
  assert.equal(runState.followUpPlan.status, "ready-to-run");
  assert.equal(runState.acceptance.status, "blocked");
  assert.equal(runState.deliveryReadiness.status, "blocked");
  assert.equal(runState.realRunReadiness.status, "blocked");
  assert.equal(launched.length, 1);
  assert.equal(launched[0].command, process.execPath);
  assert.ok(launched[0].args.includes("--systems"));
  assert.ok(launched[0].args.includes("adp"));
  assert.equal(launched[0].args.includes("--reset"), false);
  assert.equal(launched[0].args.includes("--review-rerun"), false);
});

test("repair follow-up loop consumes low-quota commands only", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { EventEmitter } = require("node:events");
  const {
    buildRepairBatchChildArgs,
    runRepairFollowUpLoop,
    resolveFollowUpPath,
    selectNextFollowUpCommand,
    summarizeLoopStatus,
  } = require("./run-repair-follow-up-loop");

  const followUpPlan = {
    artifactType: "batch-repair-follow-up-plan",
    status: "ready-to-run",
    nextBestAction: "Run the first low-quota follow-up command.",
    summary: { commands: 2, lowQuotaCommands: 1, agentWritingCommands: 1 },
    source: { closureStatus: "blocked" },
    commands: [
      {
        id: "repair-remaining-agent-writing",
        canAutoRun: false,
        canRunWithoutAgentWriting: false,
        requiresAgentWriting: true,
        requiresExplicitQuotaApproval: true,
        command: { npmScript: "repair:batch", args: ["--allow-agent-writing", "--systems", "claim"] },
      },
      {
        id: "repair-remaining-low-quota",
        canAutoRun: true,
        canRunWithoutAgentWriting: true,
        requiresAgentWriting: false,
        command: {
          npmScript: "repair:batch",
          args: ["--systems", "adp", "--queue", "evil.json", "--dry-run", "--continue-on-error"],
        },
      },
    ],
  };
  const selected = selectNextFollowUpCommand(followUpPlan);
  assert.equal(selected.command.id, "repair-remaining-low-quota");
  assert.equal(selected.skipped[0].reason, "agent-writing-not-allowed");
  assert.deepEqual(
    buildRepairBatchChildArgs(selected.command, {
      configPath: "config/systems.local.yaml",
      concurrency: 4,
    }),
    [
      "scripts/run-batch-repair-queue.js",
      "--config",
      "config/systems.local.yaml",
      "--concurrency",
      "4",
      "--systems",
      "adp",
    ],
  );
  assert.equal(summarizeLoopStatus({ status: "needs-agent-writing" }, [], { maxRounds: 3 }).status, "needs-agent-writing");
  assert.equal(
    resolveFollowUpPath({ projectRoot: "D:/project", outputRoot: "D:/project/outputs" }, { plan: "outputs/_batch/custom.json" }),
    path.resolve("D:/project", "outputs/_batch/custom.json"),
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-follow-up-loop-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const batchDir = path.join(dir, "outputs", "_batch");
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, "repair-follow-up-plan.json"), JSON.stringify(followUpPlan), "utf8");

  const dryRunState = await runRepairFollowUpLoop({
    args: { config: configPath, "dry-run": true },
  });
  assert.equal(dryRunState.status, "dry-run");
  assert.equal(dryRunState.rounds.length, 1);
  assert.equal(dryRunState.rounds[0].commandId, "repair-remaining-low-quota");
  assert.equal(fs.existsSync(path.join(batchDir, "repair-follow-up-loop-state.json")), true);
  assert.equal(fs.existsSync(path.join(batchDir, "acceptance-report.json")), true);
  assert.equal(fs.existsSync(path.join(batchDir, "delivery-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(batchDir, "real-run-readiness-report.json")), true);
  assert.equal(dryRunState.acceptance.status, "blocked");
  assert.equal(dryRunState.deliveryReadiness.status, "blocked");
  assert.equal(dryRunState.realRunReadiness.status, "blocked");

  let launchCount = 0;
  const fakeSpawn = (command, args) => {
    launchCount += 1;
    assert.equal(command, process.execPath);
    assert.ok(args.includes("--systems"));
    assert.ok(args.includes("adp"));
    fs.writeFileSync(
      path.join(batchDir, "repair-follow-up-plan.json"),
      JSON.stringify({
        artifactType: "batch-repair-follow-up-plan",
        status: "complete",
        nextBestAction: "No repair follow-up is required.",
        summary: { commands: 0, lowQuotaCommands: 0, agentWritingCommands: 0 },
        source: { closureStatus: "passed" },
        commands: [],
      }),
      "utf8",
    );
    const child = new EventEmitter();
    child.pid = 2345;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit("close", 0, null));
    return child;
  };
  fs.writeFileSync(path.join(batchDir, "repair-follow-up-plan.json"), JSON.stringify(followUpPlan), "utf8");
  const runState = await runRepairFollowUpLoop({
    args: { config: configPath, "max-rounds": 3 },
    spawn: fakeSpawn,
  });
  assert.equal(runState.status, "complete");
  assert.equal(runState.rounds.length, 1);
  assert.equal(runState.finalPlan.status, "complete");
  assert.equal(runState.acceptance.status, "blocked");
  assert.equal(runState.deliveryReadiness.status, "blocked");
  assert.equal(runState.realRunReadiness.status, "blocked");
  assert.equal(launchCount, 1);
});

test("batch acceptance report gates 95+ truth delivery without reading secrets", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildBatchAcceptanceReport,
    renderBatchAcceptanceMarkdown,
    runBatchAcceptanceCheck,
  } = require("./check-batch-acceptance");
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-acceptance-"));
  const outputRoot = path.join(dir, "outputs");
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(path.join(outputRoot, "_batch"), { recursive: true });
  fs.mkdirSync(systemOutput, { recursive: true });
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    databaseProfile:",
      "      enabled: true",
      "      mode: metadata-file",
      "      readOnly: true",
      "      secretFile: ./secrets/db/adp.json",
      "      metadataFile: ./secrets/db/adp-metadata.json",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "quality-report.json"),
    JSON.stringify({
      canFinalize: true,
      menuCoverage: 1,
      corePageScreenshotCoverage: 1,
      coreFunctionClassificationCoverage: 1,
      writeOperationSafetyCompliance: 1,
      unverifiedContentLabeling: 1,
      coreConclusionTraceability: 1,
      failures: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({
      rules: {
        lowConfidenceNotWritable: true,
        databaseOnlyNotConfirmed: true,
        databaseOnlyNotWritable: true,
      },
      metrics: { claimCount: 1, writableClaimCount: 1, confirmedCount: 1, inferredCount: 0 },
      writableClaimIds: ["function:保单任务:任务列表"],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: true,
      failures: [],
      metrics: {
        claimCount: 1,
        writableClaimCount: 1,
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 1,
        missingWritableClaimCount: 0,
        writableClaimCoverageRatio: 1,
        minWritableClaimCoverage: 0.8,
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({ artifactType: "database-profile", tables: [], safety: { secretRedacted: true } }),
    "utf8",
  );
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "# AI保单数据闭环平台功能白皮书", "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      artifactType: "truth-readiness-report",
      version: 1,
      threshold: 0.95,
      score: 0.98,
      scorePercent: 98,
      canSubmitReview: true,
      canFinalize: true,
      gates: {
        database: { pass: true, available: true },
        factCheck: {
          pass: true,
          metrics: {
            writableClaimCoverageRatio: 1,
            minWritableClaimCoverage: 0.8,
            missingWritableClaimCount: 0,
          },
        },
      },
      blockers: [],
      improvementActions: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
      generatedAt: "2026-06-03T00:01:00.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "_batch", "run-state.json"),
    JSON.stringify({
      artifactType: "batch-run-state",
      status: "success",
      batchId: "batch-accept",
      concurrency: 4,
      summary: { total: 1, completed: 1, failed: 0 },
      systems: [{ code: "adp", status: "review-pending", runStatus: "completed" }],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "_batch", "diagnosis.json"),
    JSON.stringify({
      artifactType: "batch-diagnosis",
      status: "success",
      generatedAt: "2026-06-03T00:02:00.000Z",
      summary: { total: 1, ready: 1, blocked: 0, missingWritableClaims: 0 },
      systems: [{ code: "adp", ready: true, missingWritableClaimCount: 0 }],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "_batch", "repair-queue.json"),
    JSON.stringify({
      artifactType: "batch-repair-queue",
      status: "success",
      generatedAt: "2026-06-03T00:02:30.000Z",
      summary: { total: 0, autoRunnable: 0, blocked: 0, requiresAgentWriting: 0 },
      items: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, "_batch", "repair-closure.json"),
    JSON.stringify({
      artifactType: "batch-repair-closure",
      status: "passed",
      diagnosis: { generatedAt: "2026-06-03T00:02:00.000Z" },
      repairQueue: { generatedAt: "2026-06-03T00:02:30.000Z" },
      blockers: [],
    }),
    "utf8",
  );

  const accepted = runBatchAcceptanceCheck({ args: { config: configPath } });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.canSubmitAll, true);
  assert.equal(accepted.summary.accepted, 1);
  assert.equal(accepted.summary.databaseBacked, 1);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "acceptance-report.json")), true);
  assert.match(renderBatchAcceptanceMarkdown(accepted), /Batch Acceptance Report/);

  fs.writeFileSync(path.join(systemOutput, "quality-report.json"), "{\"canFinalize\":false}", "utf8");
  const stale = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(stale.status, "blocked");
  assert.ok(stale.blockers.some((item) => item.id === "truth-readiness.stale-sources"));

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...accepted.systems[0],
      artifactType: "truth-readiness-report",
      scorePercent: 94,
      score: 0.94,
      canSubmitReview: true,
      canFinalize: true,
      gates: {
        database: { available: true },
        factCheck: { metrics: { writableClaimCoverageRatio: 1, minWritableClaimCoverage: 0.8, missingWritableClaimCount: 0 } },
      },
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const belowTarget = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(belowTarget.status, "blocked");
  assert.ok(belowTarget.blockers.some((item) => item.id === "truth-readiness.below-target"));
});

test("delivery readiness distinguishes real pipeline delivery from local smoke artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const {
    buildDeliveryReadinessReport,
    buildDeliveryReadinessStateSummary,
    renderDeliveryReadinessMarkdown,
    writeDeliveryReadinessReport,
  } = require("./check-delivery-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-readiness-"));
  const outputRoot = path.join(dir, "outputs");
  const configPath = path.join(dir, "systems.local.yaml");
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });

  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]) {
    state = updateNodeStatus(state, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);
  fs.writeFileSync(path.join(systemOutput, "quality-report.json"), JSON.stringify({ canFinalize: true }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "verified-claims.json"), JSON.stringify({ claims: [] }), "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: true,
      metrics: {
        writableClaimCoverageRatio: 1,
        minWritableClaimCoverage: 0.8,
        missingWritableClaimCount: 0,
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true, counts: { chars: 2000, evidencePages: 1 } }),
    "utf8",
  );
  fs.writeFileSync(path.join(systemOutput, "database-profile.json"), JSON.stringify({ tables: [] }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "# AI保单数据闭环平台功能白皮书", "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      artifactType: "truth-readiness-report",
      score: 0.98,
      scorePercent: 98,
      canSubmitReview: true,
      canFinalize: true,
      gates: { database: { available: true }, factCheck: { metrics: { writableClaimCoverageRatio: 1 } } },
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
      generatedAt: "2026-06-03T00:01:00.000Z",
    }),
    "utf8",
  );

  const acceptanceReport = {
    artifactType: "batch-acceptance-report",
    status: "accepted",
    canSubmitAll: true,
    targetTruthScorePercent: 95,
    configPath,
    outputRoot,
    generatedAt: "2026-06-03T00:02:00.000Z",
    summary: { total: 1, accepted: 1, blockers: 0 },
    systems: [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        accepted: true,
        databaseProfileConfigured: true,
        databaseEvidenceAvailable: true,
      },
    ],
  };

  const ready = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(ready.status, "ready");
  assert.equal(ready.canDeliver, true);
  assert.equal(ready.configPath, configPath);
  assert.equal(ready.outputRoot, outputRoot);
  assert.equal(ready.summary.ready, 1);
  assert.equal(ready.summary.staleSystems, 0);
  assert.match(renderDeliveryReadinessMarkdown(ready), /Delivery Readiness Report/);
  const artifacts = writeDeliveryReadinessReport(outputRoot, ready);
  const stateSummary = buildDeliveryReadinessStateSummary(ready, artifacts);
  assert.equal(stateSummary.status, "ready");
  assert.equal(stateSummary.canDeliver, true);
  assert.equal(stateSummary.artifacts.deliveryReadinessMarkdown, "delivery-readiness-report.md");
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.md")), true);

  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({ claims: [{ id: "claim-new", text: "changed after truth readiness" }] }),
    "utf8",
  );
  const stale = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.canDeliver, false);
  assert.equal(stale.summary.staleSystems, 1);
  assert.equal(stale.systems[0].staleSourceCount > 0, true);
  assert.ok(stale.blockers.some((item) => item.id === "delivery.truth-readiness-stale-sources"));
  fs.writeFileSync(path.join(systemOutput, "verified-claims.json"), JSON.stringify({ claims: [] }), "utf8");

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      mode: "local-e2e-smoke",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书\n\n本地冒烟，不代表最终业务白皮书内容。",
    "utf8",
  );
  const smoke = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(smoke.status, "blocked");
  assert.equal(smoke.canDeliver, false);
  assert.ok(smoke.blockers.some((item) => item.id === "delivery.smoke-truth-report"));
  assert.ok(smoke.blockers.some((item) => item.id === "delivery.smoke-whitepaper"));
});

test("real run readiness unifies preflight and final delivery state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const {
    buildRealRunReadinessReport,
    renderRealRunReadinessMarkdown,
    writeRealRunReadinessReport,
  } = require("./check-real-run-readiness");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-run-readiness-"));
  const outputRoot = path.join(dir, "outputs");
  const configPath = path.join(dir, "systems.local.yaml");
  const tokenPath = path.join(dir, "secrets", "huntian-token.txt");
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(tokenPath, "valid-token", "utf8");
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(path.join(systemOutput, "evidence-summary.json"), JSON.stringify({ system: { code: "adp" } }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "function-universe.json"), JSON.stringify({ functions: [] }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "verified-claims.json"), JSON.stringify({ claims: [] }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "fact-check-report.json"), JSON.stringify({ canFinalize: true }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "quality-report.json"), JSON.stringify({ canFinalize: true }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "narrative-quality-report.json"), JSON.stringify({ canSubmitReview: true }), "utf8");
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "# AI保单数据闭环平台功能白皮书", "utf8");
  let state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]) {
    state = updateNodeStatus(state, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  state = { ...state, overallStatus: "review-pending" };
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      artifactType: "truth-readiness-report",
      scorePercent: 98,
      canSubmitReview: true,
      canFinalize: true,
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  fs.writeFileSync(
    configPath,
    [
      "auth:",
      "  tokenFile: secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: outputs",
      "  testDataPrefix: AI_AUTO_TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.example.test/",
      "    databaseProfile:",
      "      enabled: false",
    ].join("\n"),
    "utf8",
  );

  const context = {
    projectRoot: dir,
    configPath,
    configDir: dir,
    outputRoot,
    config: {
      runtime: { outputDir: "outputs" },
      systems: [
        {
          code: "adp",
          name: "AI保单数据闭环平台",
          url: "https://pre-adp.example.test/",
          databaseProfile: { enabled: false },
        },
      ],
    },
  };
  const preflight = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
  });
  assert.equal(preflight.status, "ready-to-run");
  assert.equal(preflight.canStartRealRun, true);
  assert.equal(preflight.canDeliver, false);
  assert.match(renderRealRunReadinessMarkdown(preflight), /Real Run Readiness Report/);

  const acceptanceReport = {
    artifactType: "batch-acceptance-report",
    status: "accepted",
    canSubmitAll: true,
    configPath,
    outputRoot,
    generatedAt: "2026-06-03T00:00:00.000Z",
    summary: { total: 1, accepted: 1, blocked: 0, blockers: 0 },
    systems: [{ code: "adp", status: "accepted" }],
  };
  const deliveryReport = {
    artifactType: "delivery-readiness-report",
    status: "ready",
    canDeliver: true,
    configPath,
    outputRoot,
    generatedAt: "2026-06-03T00:01:00.000Z",
    acceptance: {
      status: "accepted",
      canSubmitAll: true,
      generatedAt: "2026-06-03T00:00:00.000Z",
      summary: { total: 1, accepted: 1, blocked: 0, blockers: 0 },
    },
    summary: { total: 1, ready: 1, blocked: 0, blockers: 0 },
    systems: [
      {
        code: "adp",
        status: "ready",
        nodeStatus: Object.fromEntries(
          [
            "sync",
            "session",
            "collect",
            "inspect",
            "validate-write",
            "truth-universe",
            "truth-claims",
            "build-spec",
            "compose-guide",
            "draft",
            "summary",
            "narrative",
            "fact-check",
            "quality",
            "truth-readiness",
          ].map((nodeId) => [nodeId, nodeId === "validate-write" ? "skipped" : "success"]),
        ),
      },
    ],
  };
  const ready = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
    deliveryReport,
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.canDeliver, true);
  const artifacts = writeRealRunReadinessReport(outputRoot, ready);
  assert.equal(fs.existsSync(artifacts.jsonPath), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "real-run-readiness-report.md")), true);

  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({ claims: [{ id: "claim-new", text: "changed after delivery readiness" }] }),
    "utf8",
  );
  const staleTruthSources = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
    deliveryReport,
  });
  assert.equal(staleTruthSources.status, "in-progress");
  assert.equal(staleTruthSources.canDeliver, false);
  assert.ok(staleTruthSources.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  fs.writeFileSync(path.join(systemOutput, "verified-claims.json"), JSON.stringify({ claims: [] }), "utf8");

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      artifactType: "truth-readiness-report",
      scorePercent: 98,
      canSubmitReview: true,
      mode: "local-e2e-smoke",
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const staleSmokeTruth = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
    deliveryReport,
  });
  assert.equal(staleSmokeTruth.status, "in-progress");
  assert.equal(staleSmokeTruth.canDeliver, false);
  assert.ok(staleSmokeTruth.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      artifactType: "truth-readiness-report",
      scorePercent: 98,
      canSubmitReview: true,
      canFinalize: true,
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );

  writePipelineState(path.join(systemOutput, "pipeline-state.json"), { ...state, overallStatus: "failed" });
  const stalePipelineState = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
    deliveryReport,
  });
  assert.equal(stalePipelineState.status, "in-progress");
  assert.equal(stalePipelineState.canDeliver, false);
  assert.ok(stalePipelineState.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);

  const missingNodeStatusReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
    deliveryReport: {
      ...deliveryReport,
      systems: [{ code: "adp", status: "ready" }],
    },
  });
  assert.equal(missingNodeStatusReady.status, "in-progress");
  assert.equal(missingNodeStatusReady.canDeliver, false);
  assert.ok(missingNodeStatusReady.warnings.some((item) => item.id === "delivery.current-truth-invalid"));

  const dbSecretPath = path.join(dir, "secrets", "db", "adp.json");
  fs.mkdirSync(path.dirname(dbSecretPath), { recursive: true });
  const dbMetadataPath = path.join(dir, "fixtures", "db-metadata.json");
  fs.mkdirSync(path.dirname(dbMetadataPath), { recursive: true });
  fs.writeFileSync(dbMetadataPath, JSON.stringify({ tables: [] }), "utf8");
  fs.writeFileSync(dbSecretPath, JSON.stringify({ readOnly: true, metadataFile: "fixtures/db-metadata.json" }), "utf8");
  const dbContext = {
    ...context,
    config: {
      ...context.config,
      systems: [
        {
          ...context.config.systems[0],
          databaseProfile: {
            enabled: true,
            mode: "metadata-file",
            readOnly: true,
            secretFile: "secrets/db/adp.json",
          },
        },
      ],
    },
  };
  const dbReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context: dbContext,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
  });
  assert.equal(dbReady.status, "ready-to-run");
  assert.equal(dbReady.summary.databaseEnabled, 1);

  const connectorReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context: {
      ...context,
      config: {
        ...context.config,
        systems: [
          {
            ...context.config.systems[0],
            databaseProfile: {
              enabled: true,
              mode: "connector",
              secretFile: "secrets/db/adp.json",
            },
          },
        ],
      },
    },
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
  });
  assert.equal(connectorReady.status, "ready-to-run");

  const staleScopeReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport: {
      ...acceptanceReport,
      systems: [{ code: "claim", status: "accepted" }],
    },
    deliveryReport: {
      ...deliveryReport,
      systems: [{ code: "claim", status: "ready" }],
    },
  });
  assert.equal(staleScopeReady.status, "ready-to-run");
  assert.equal(staleScopeReady.canDeliver, false);
  assert.ok(staleScopeReady.warnings.some((item) => item.id === "acceptance.scope-mismatch"));
  assert.ok(staleScopeReady.warnings.some((item) => item.id === "delivery.scope-mismatch"));

  const staleConfigReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport: {
      ...acceptanceReport,
      configPath: path.join(dir, "other-systems.local.yaml"),
    },
    deliveryReport: {
      ...deliveryReport,
      configPath: path.join(dir, "other-systems.local.yaml"),
    },
  });
  assert.equal(staleConfigReady.status, "ready-to-run");
  assert.equal(staleConfigReady.canDeliver, false);
  assert.ok(staleConfigReady.warnings.some((item) => item.id === "acceptance.config-mismatch"));
  assert.ok(staleConfigReady.warnings.some((item) => item.id === "delivery.config-mismatch"));

  const staleOutputReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport: {
      ...acceptanceReport,
      outputRoot: path.join(dir, "other-outputs"),
    },
    deliveryReport: {
      ...deliveryReport,
      outputRoot: path.join(dir, "other-outputs"),
    },
  });
  assert.equal(staleOutputReady.status, "ready-to-run");
  assert.equal(staleOutputReady.canDeliver, false);
  assert.ok(staleOutputReady.warnings.some((item) => item.id === "acceptance.output-mismatch"));
  assert.ok(staleOutputReady.warnings.some((item) => item.id === "delivery.output-mismatch"));

  const deliveryOnlyReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    deliveryReport,
  });
  assert.equal(deliveryOnlyReady.status, "ready-to-run");
  assert.equal(deliveryOnlyReady.canDeliver, false);
  assert.ok(deliveryOnlyReady.warnings.some((item) => item.id === "delivery.acceptance-missing"));

  const acceptedWithoutDelivery = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport,
  });
  assert.equal(acceptedWithoutDelivery.status, "in-progress");
  assert.equal(acceptedWithoutDelivery.canDeliver, false);
  assert.match(acceptedWithoutDelivery.nextAction, /delivery:check/);

  const staleDeliveryAcceptance = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    acceptanceReport: {
      ...acceptanceReport,
      generatedAt: "2026-06-03T00:05:00.000Z",
    },
    deliveryReport,
  });
  assert.equal(staleDeliveryAcceptance.status, "in-progress");
  assert.equal(staleDeliveryAcceptance.canDeliver, false);
  assert.ok(staleDeliveryAcceptance.warnings.some((item) => item.id === "delivery.acceptance-mismatch"));

  const blockedWithStaleReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: false,
      failures: [{ id: "runtime.test-data-prefix-missing", message: "runtime.testDataPrefix is required." }],
      warnings: [],
      counts: { failures: 1, warnings: 0, systems: 1 },
    },
    deliveryReport,
  });
  assert.equal(blockedWithStaleReady.status, "blocked");
  assert.equal(blockedWithStaleReady.canDeliver, false);
});

test("dashboard supports batch pipeline command and active run snapshot", () => {
  const {
    buildActiveRun,
    buildBatchPipelineCommand,
    buildDashboardSnapshot,
  } = require("./local-dashboard/server");
  const command = buildBatchPipelineCommand({
    configPath: "config/systems.local.yaml",
    systems: ["adp", "claim"],
    provider: "manual",
    reset: true,
    concurrency: 4,
  });
  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args.slice(0, 2), [
    "scripts/run-whitepaper-batch.js",
    "--config",
  ]);
  assert.ok(command.args.includes("--systems"));
  assert.ok(command.args.includes("adp,claim"));
  assert.ok(command.args.includes("--with-whitepaper"));
  assert.ok(command.args.includes("--concurrency"));
  assert.ok(command.args.includes("4"));

  const batchActiveRun = buildActiveRun(
    [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        overallStatus: "running",
        currentPhase: "evidence",
        currentNode: "collect",
        nodes: {},
        progress: { total: 18, completed: 2, percent: 11 },
      },
      {
        code: "claim",
        name: "理赔系统",
        overallStatus: "pending",
        currentPhase: "prepare",
        currentNode: "sync",
        nodes: {},
        progress: { total: 18, completed: 0, percent: 0 },
      },
    ],
    {
      status: "running",
      concurrency: 4,
      startedAt: "2026-06-03T00:00:00.000Z",
      summary: { total: 2, queued: 1, running: 1, completed: 0, failed: 0 },
      systems: [
        {
          code: "adp",
          name: "AI保单数据闭环平台",
          status: "running",
          runStatus: "running",
          currentPhase: "evidence",
          currentNode: "collect",
          truthReadiness: { canSubmitReview: true, scorePercent: 96 },
          coverageRepair: { status: "completed", narrativePart: "保单任务" },
        },
        {
          code: "claim",
          name: "理赔系统",
          status: "pending",
          runStatus: "queued",
          currentPhase: "prepare",
          currentNode: "sync",
          failure: {
            category: "narrative-generation",
            label: "写稿生成问题",
            recoverable: true,
            retryPlan: {
              canRetry: true,
              nodes: "narrative,fact-check,quality,truth-readiness",
              quotaImpact: "agent-writing",
            },
          },
          failureCategory: "narrative-generation",
          recoverable: true,
          retryPlan: {
            canRetry: true,
            nodes: "narrative,fact-check,quality,truth-readiness",
            quotaImpact: "agent-writing",
          },
        },
      ],
      failureSummary: {
        counts: { "narrative-generation": 1 },
        recoverable: 1,
        quotaSensitive: 1,
      },
      diagnosis: {
        summary: { total: 2, ready: 1, blocked: 1, missingWritableClaims: 1 },
        artifacts: { diagnosisMarkdown: "diagnosis.md", diagnosisJson: "diagnosis.json" },
      },
      repairQueue: {
        summary: { total: 1, autoRunnable: 0, blocked: 1, requiresAgentWriting: 1 },
        artifacts: { repairQueueMarkdown: "repair-queue.md", repairQueueJson: "repair-queue.json" },
      },
      acceptance: {
        status: "blocked",
        canSubmitAll: false,
        summary: { total: 2, accepted: 1, blocked: 1, blockers: 1 },
        artifacts: { acceptanceMarkdown: "acceptance-report.md", acceptanceJson: "acceptance-report.json" },
      },
      deliveryReadiness: {
        status: "blocked",
        canDeliver: false,
        summary: { total: 2, ready: 1, blocked: 1, smokeEvidence: 0 },
        artifacts: {
          deliveryReadinessMarkdown: "delivery-readiness-report.md",
          deliveryReadinessJson: "delivery-readiness-report.json",
        },
      },
      realRunReadiness: {
        status: "blocked",
        canStartRealRun: false,
        canDeliver: false,
        summary: { systems: 2, readyToRun: 1, databaseEnabled: 1, blockers: 1 },
        artifacts: {
          realRunReadinessMarkdown: "real-run-readiness-report.md",
          realRunReadinessJson: "real-run-readiness-report.json",
        },
      },
    },
  );
  assert.equal(batchActiveRun.mode, "batch");
  assert.equal(batchActiveRun.concurrency, 4);
  assert.equal(batchActiveRun.systems.length, 2);
  assert.equal(batchActiveRun.currentNodeLabel, "1 running / 1 queued");
  assert.equal(batchActiveRun.progress.total, 2);
  assert.equal(batchActiveRun.truthReadyCount, 1);
  assert.equal(batchActiveRun.coverageRepairCount, 1);
  assert.equal(batchActiveRun.failureSummary.recoverable, 1);
  assert.equal(batchActiveRun.failureSummary.quotaSensitive, 1);
  assert.equal(batchActiveRun.diagnosis.summary.ready, 1);
  assert.equal(batchActiveRun.repairQueue.summary.total, 1);
  assert.equal(batchActiveRun.repairQueue.summary.requiresAgentWriting, 1);
  assert.equal(batchActiveRun.acceptance.status, "blocked");
  assert.equal(batchActiveRun.acceptance.summary.accepted, 1);
  assert.equal(batchActiveRun.deliveryReadiness.status, "blocked");
  assert.equal(batchActiveRun.deliveryReadiness.summary.ready, 1);
  assert.equal(batchActiveRun.realRunReadiness.status, "blocked");
  assert.equal(batchActiveRun.realRunReadiness.summary.databaseEnabled, 1);

  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-batch-state-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(dir, "outputs", "_batch"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "run-state.json"),
    JSON.stringify({
      status: "running",
      concurrency: 4,
      startedAt: "2026-06-03T00:00:00.000Z",
      summary: { total: 1, queued: 0, running: 1, completed: 0, failed: 0 },
      systems: [
        {
          code: "adp",
          name: "AI保单数据闭环平台",
          status: "running",
          runStatus: "running",
          pid: 123,
          currentPhase: "compose",
          currentNode: "narrative",
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "diagnosis.json"),
    JSON.stringify({
      artifactType: "batch-diagnosis",
      summary: { total: 1, ready: 0, blocked: 1, missingWritableClaims: 2 },
      systems: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "outputs", "_batch", "diagnosis.md"), "# Batch Diagnosis", "utf8");
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-queue.json"),
    JSON.stringify({
      artifactType: "batch-repair-queue",
      summary: { total: 1, autoRunnable: 0, blocked: 1, requiresAgentWriting: 1 },
      items: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "outputs", "_batch", "repair-queue.md"), "# Batch Repair Queue", "utf8");
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "acceptance-report.json"),
    JSON.stringify({
      artifactType: "batch-acceptance-report",
      status: "blocked",
      canSubmitAll: false,
      summary: { total: 1, accepted: 0, blocked: 1, blockers: 1 },
      blockers: [{ id: "batch.repair-queue-not-empty", message: "Batch repair queue is not empty." }],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "outputs", "_batch", "acceptance-report.md"), "# Batch Acceptance Report", "utf8");
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "delivery-readiness-report.json"),
    JSON.stringify({
      artifactType: "delivery-readiness-report",
      status: "blocked",
      canDeliver: false,
      summary: { total: 1, ready: 0, blocked: 1, blockers: 1, smokeEvidence: 0 },
      acceptance: { status: "blocked", canSubmitAll: false },
      blockers: [{ id: "delivery.acceptance-not-accepted", message: "Batch acceptance is not accepted." }],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "delivery-readiness-report.md"),
    "# Delivery Readiness Report",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "real-run-readiness-report.json"),
    JSON.stringify({
      artifactType: "real-run-readiness-report",
      status: "blocked",
      canStartRealRun: false,
      canDeliver: false,
      summary: { systems: 1, readyToRun: 0, databaseEnabled: 0, blockers: 1, warnings: 1 },
      acceptance: { status: "blocked", canSubmitAll: false },
      deliveryReadiness: { status: "blocked", canDeliver: false },
      nextAction: "Resolve blockers, rerun the required pipeline or repair nodes, then rerun npm run real:check.",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "real-run-readiness-report.md"),
    "# Real Run Readiness Report",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-run-plan.json"),
    JSON.stringify({
      artifactType: "batch-repair-run-plan",
      summary: { runnableItems: 1, runnableGroups: 1, skipped: 0 },
      groups: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "outputs", "_batch", "repair-run-plan.md"), "# Batch Repair Run Plan", "utf8");
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-closure.json"),
    JSON.stringify({
      artifactType: "batch-repair-closure",
      status: "blocked",
      canSubmitAll: false,
      repairQueueEmpty: false,
      blockers: ["1 repair queue item(s) remain"],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "outputs", "_batch", "repair-closure.md"), "# Batch Repair Closure", "utf8");
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-follow-up-plan.json"),
    JSON.stringify({
      artifactType: "batch-repair-follow-up-plan",
      status: "needs-agent-writing",
      nextBestAction: "Run an agent-writing follow-up command only when quota policy permits it.",
      summary: { commands: 1, lowQuotaCommands: 0, agentWritingCommands: 1 },
      commands: [
        {
          id: "repair-remaining-agent-writing",
          requiresAgentWriting: true,
          canAutoRun: false,
          command: { npmScript: "repair:batch", args: ["--allow-agent-writing"] },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-follow-up-plan.md"),
    "# Batch Repair Follow-up Plan",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-run-state.json"),
    JSON.stringify({
      artifactType: "batch-repair-run-state",
      status: "dry-run",
      groups: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "outputs", "_batch", "repair-follow-up-loop-state.json"),
    JSON.stringify({
      artifactType: "batch-repair-follow-up-loop-state",
      status: "needs-agent-writing",
      rounds: [],
      finalPlan: { status: "needs-agent-writing" },
    }),
    "utf8",
  );
  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.batch.status, "running");
  assert.equal(snapshot.activeRun.mode, "batch");
  assert.equal(snapshot.activeRun.systems[0].currentNode, "narrative");
  assert.equal(snapshot.batchDiagnosis.summary.blocked, 1);
  assert.equal(snapshot.batchDiagnosisArtifacts.markdown.exists, true);
  assert.equal(snapshot.batchRepairQueue.summary.total, 1);
  assert.equal(snapshot.batchRepairQueueArtifacts.markdown.exists, true);
  assert.equal(snapshot.batchAcceptanceReport.status, "blocked");
  assert.equal(snapshot.batchAcceptanceArtifacts.markdown.exists, true);
  assert.equal(snapshot.activeRun.acceptance.summary.blockers, 1);
  assert.equal(snapshot.batchDeliveryReadinessReport.status, "blocked");
  assert.equal(snapshot.batchDeliveryReadinessArtifacts.markdown.exists, true);
  assert.equal(snapshot.activeRun.deliveryReadiness.summary.blockers, 1);
  assert.equal(snapshot.batchRealRunReadinessReport.status, "blocked");
  assert.equal(snapshot.batchRealRunReadinessArtifacts.markdown.exists, true);
  assert.equal(snapshot.activeRun.realRunReadiness.summary.blockers, 1);
  assert.equal(snapshot.batchRepairRunPlan.summary.runnableGroups, 1);
  assert.equal(snapshot.batchRepairRunState.status, "dry-run");
  assert.equal(snapshot.batchRepairClosure.status, "blocked");
  assert.equal(snapshot.batchRepairFollowUpPlan.status, "needs-agent-writing");
  assert.equal(snapshot.batchRepairFollowUpLoopState.status, "needs-agent-writing");
  assert.equal(snapshot.batchRepairRunArtifacts.planMarkdown.exists, true);
  assert.equal(snapshot.batchRepairRunArtifacts.closureMarkdown.exists, true);
  assert.equal(snapshot.batchRepairRunArtifacts.followUpMarkdown.exists, true);
  assert.equal(snapshot.batchRepairRunArtifacts.followUpLoopState.exists, true);
  assert.equal(snapshot.activeRun.repairFollowUp.status, "needs-agent-writing");
  assert.equal(snapshot.activeRun.repairQueue.summary.requiresAgentWriting, 1);
});

test("dashboard rejected wording review records overview rewrite scope", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Readable } = require("node:stream");
  const { routeRequest } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-part-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      currentNode: "review",
      overallStatus: "review-pending",
      nodes: { review: { status: "pending" } },
      phases: {},
      artifacts: {},
      review: {},
    }),
    "utf8",
  );

  const request = Readable.from([
    Buffer.from(
      JSON.stringify({
        system: "adp",
        status: "rejected",
        comment: "系统定位和典型业务流程还不够业务化",
        autoRerun: false,
      }),
    ),
  ]);
  request.method = "POST";
  request.url = "/api/review";
  request.headers = { host: "127.0.0.1" };
  let statusCode = 0;
  let body = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      body = String(value || "");
    },
  };

  return routeRequest(request, response, { configPath }).then(() => {
    const payload = JSON.parse(body);
    assert.equal(statusCode, 200);
    assert.equal(payload.rewriteScope, "overview-flow");
    assert.deepEqual(payload.targetSections, ["1", "4"]);
  });
});

test("dashboard rejected module review auto reruns selected narrative part", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Readable } = require("node:stream");
  const { routeRequest } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-module-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      currentNode: "review",
      overallStatus: "review-pending",
      nodes: { review: { status: "pending" } },
      phases: {},
      artifacts: {},
      review: {},
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "evidence-summary.json"),
    JSON.stringify({
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "quality-report.json"), "{}", "utf8");

  const request = Readable.from([
    Buffer.from(
      JSON.stringify({
        system: "adp",
        status: "rejected",
        comment: "AI任务模块的任务列表功能描述错误",
        autoRerun: true,
      }),
    ),
  ]);
  request.method = "POST";
  request.url = "/api/review";
  request.headers = { host: "127.0.0.1" };
  let statusCode = 0;
  let body = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      body = String(value || "");
    },
  };

  return routeRequest(request, response, { configPath }).then(() => {
    const payload = JSON.parse(body);
    assert.equal(statusCode, 200);
    assert.equal(payload.rewriteScope, "function-sections");
    assert.deepEqual(payload.targetModules, ["AI任务"]);
    assert.equal(payload.rerunNarrativePart, "AI任务");
    assert.ok(payload.rerun.args.includes("--narrative-part"));
    assert.ok(payload.rerun.args.includes("AI任务"));
  });
});

test("dashboard rejected multi-module review auto reruns selected narrative parts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Readable } = require("node:stream");
  const { routeRequest } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-multi-module-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      currentNode: "review",
      overallStatus: "review-pending",
      nodes: { review: { status: "pending" } },
      phases: {},
      artifacts: {},
      review: {},
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "evidence-summary.json"),
    JSON.stringify({
      modules: [{ name: "AI任务" }, { name: "发布管理" }],
      functions: [
        { module: "AI任务", name: "任务列表" },
        { module: "发布管理", name: "发布列表" },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "quality-report.json"), "{}", "utf8");

  const request = Readable.from([
    Buffer.from(
      JSON.stringify({
        system: "adp",
        status: "rejected",
        comment: "AI任务和发布管理模块功能描述错误，需要分别修正",
        autoRerun: true,
      }),
    ),
  ]);
  request.method = "POST";
  request.url = "/api/review";
  request.headers = { host: "127.0.0.1" };
  let statusCode = 0;
  let body = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      body = String(value || "");
    },
  };

  return routeRequest(request, response, { configPath }).then(() => {
    const payload = JSON.parse(body);
    assert.equal(statusCode, 200);
    assert.equal(payload.rewriteScope, "function-sections");
    assert.deepEqual(payload.targetModules, ["AI任务", "发布管理"]);
    assert.equal(payload.rerunNarrativePart, "AI任务,发布管理");
    assert.ok(payload.rerun.args.includes("--narrative-part"));
    assert.ok(payload.rerun.args.includes("AI任务,发布管理"));
  });
});

test("dashboard rejected evidence refresh auto reruns evidence then full narrative", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { Readable } = require("node:stream");
  const { routeRequest } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-review-evidence-refresh-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "narrative:",
      "  defaultProvider: manual",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      currentNode: "review",
      overallStatus: "review-pending",
      nodes: { review: { status: "pending" } },
      phases: {},
      artifacts: {},
      review: {},
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "evidence-summary.json"),
    JSON.stringify({
      modules: [{ name: "AI任务" }],
      functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "quality-report.json"), "{}", "utf8");

  const request = Readable.from([
    Buffer.from(
      JSON.stringify({
        system: "adp",
        status: "rejected",
        comment: "AI任务模块的任务列表页面截图遗漏，没有采集到",
        autoRerun: true,
      }),
    ),
  ]);
  request.method = "POST";
  request.url = "/api/review";
  request.headers = { host: "127.0.0.1" };
  let statusCode = 0;
  let body = "";
  const response = {
    writeHead(status) {
      statusCode = status;
    },
    end(value) {
      body = String(value || "");
    },
  };

  return routeRequest(request, response, { configPath }).then(() => {
    const payload = JSON.parse(body);
    assert.equal(statusCode, 200);
    assert.equal(payload.rewriteScope, "evidence-refresh");
    assert.deepEqual(payload.rerunNodes, [
      "collect",
      "inspect",
      "summary",
      "db-model",
      "truth-universe",
      "truth-claims",
      "narrative",
      "fact-check",
      "quality",
      "truth-readiness",
    ]);
    assert.equal(payload.rerunNarrativePart, "");
    assert.ok(
      payload.rerun.args.includes(
        "collect,inspect,summary,db-model,truth-universe,truth-claims,narrative,fact-check,quality,truth-readiness",
      ),
    );
    assert.ok(payload.rerun.args.includes("--review-rerun"));
    assert.equal(payload.rerun.args.includes("--narrative-part"), false);
  });
});

test("pipeline default node list uses operation guide path before whitepaper", () => {
  const { selectedNodes } = require("./run-whitepaper-pipeline");
  assert.deepEqual(selectedNodes({}), [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "build-spec",
    "compose-guide",
    "quality",
  ]);
  assert.deepEqual(selectedNodes({ "with-whitepaper": true }), [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "build-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "quality",
    "truth-readiness",
  ]);
});

test("pipeline and dashboard resolve outputDir from project root for config-local defaults", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadSystem } = require("./run-whitepaper-pipeline");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-output-root-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  const configPath = path.join(projectRoot, "config", "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: ./outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );

  const loaded = loadSystem(configPath, "adp");
  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(loaded.outputRoot, path.join(projectRoot, "outputs"));
  assert.equal(snapshot.outputRoot, path.join(projectRoot, "outputs"));
  assert.equal(snapshot.systems[0].outputDir, path.join(projectRoot, "outputs", "adp"));
});

test("pipeline uses single automatic attempt for narrative by default", () => {
  const { resolveNodeMaxAttempts } = require("./run-whitepaper-pipeline");
  assert.equal(resolveNodeMaxAttempts("narrative", {}), 1);
  assert.equal(resolveNodeMaxAttempts("collect", {}), 3);
  assert.equal(resolveNodeMaxAttempts("narrative", { retries: 2 }), 2);
});

test("pipeline maps missing writable claims to scoped coverage repair narrative part", () => {
  const { buildCoverageRepairPlan } = require("./run-whitepaper-pipeline");

  const plan = buildCoverageRepairPlan({
    systemCode: "adp",
    now: "2026-05-20T00:00:00.000Z",
    factCheckReport: {
      missingWritableClaimIds: [
        "function:保单任务:任务详情",
        "function:发布管理:发布列表",
      ],
      metrics: {
        writableClaimCount: 3,
        coveredWritableClaimCount: 1,
        missingWritableClaimCount: 2,
        writableClaimCoverageRatio: 1 / 3,
        minWritableClaimCoverage: 0.8,
      },
    },
    verifiedClaims: {
      claims: [
        {
          id: "function:保单任务:任务详情",
          module: "保单任务",
          function: "任务详情",
          subject: "任务详情",
          writable: true,
        },
        {
          id: "function:发布管理:发布列表",
          module: "发布管理",
          function: "发布列表",
          subject: "发布列表",
          writable: true,
        },
      ],
    },
  });

  assert.equal(plan.shouldRepair, true);
  assert.equal(plan.narrativePart, "保单任务,发布管理");
  assert.deepEqual(plan.rerunNodes, ["narrative", "fact-check", "quality", "truth-readiness"]);
  assert.deepEqual(plan.targetModules, ["保单任务", "发布管理"]);
  assert.equal(plan.missingWritableClaims[0].function, "任务详情");
  assert.match(plan.fingerprint, /^[0-9a-f]{16}$/);
});

test("pipeline collect node does not resume when reset starts a fresh run", () => {
  const { buildCollectNodeArgs } = require("./run-whitepaper-pipeline");
  const collectArgs = buildCollectNodeArgs({
    args: { reset: true, "max-pages": 20 },
    configPath: "config/systems.local.yaml",
    system: { code: "adp" },
  });

  assert.equal(collectArgs.includes("--resume"), false);
  assert.ok(collectArgs.includes("--max-pages"));
  assert.ok(collectArgs.includes("20"));
});

test("pipeline truth nodes build claims and fact-check artifacts", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-truth-"));
  const projectRoot = path.resolve(__dirname, "..");
  fs.mkdirSync(path.join(tempRoot, "config"), { recursive: true });
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const configPath = path.join(tempRoot, "config", "systems.local.yaml");
  const system = {
    code: "adp",
    name: "AI保单数据闭环平台",
    url: "https://pre-adp.hzins.com/",
  };
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: ../outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "保单任务", entry: "保单任务" }],
      functions: [
        {
          module: "保单任务",
          name: "任务列表",
          menuPath: "保单任务 > 任务列表",
          queryFields: ["保单任务"],
          tableColumns: ["保单任务", "状态"],
          screenshots: [{ id: "shot-1", file: "screenshots/task.png" }],
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    [
      "# AI保单数据闭环平台功能白皮书",
      "### 任务列表",
      "保单任务模块提供任务列表，用于查看保单任务。",
      "",
    ].join("\n"),
    "utf8",
  );

  const dbResult = await runPipelineNode("db-profile", {
    args: {},
    config: { systems: [system], runtime: { outputDir: "../outputs" } },
    configPath,
    system,
    systemOutput,
    projectRoot,
  });
  assert.equal(dbResult.skipped, true);

  const context = {
    args: {},
    config: { systems: [system], runtime: { outputDir: "../outputs" } },
    configPath,
    system: {
      ...system,
      databaseProfile: { enabled: true },
    },
    systemOutput,
    projectRoot,
  };
  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp", name: "AI保单数据闭环平台" },
      source: { mode: "metadata-file", databaseType: "mysql", sampleDataIncluded: false },
      safety: { secretRedacted: true },
      tables: [
        {
          schema: "adp_test",
          name: "policy_task",
          comment: "保单任务",
          columns: [
            { name: "id", type: "bigint", comment: "主键", primaryKey: true },
            { name: "status", type: "varchar", comment: "任务状态", dictionary: ["INIT", "DONE"] },
          ],
        },
      ],
    }),
    "utf8",
  );
  await runPipelineNode("db-model", context);
  await runPipelineNode("truth-universe", context);
  await runPipelineNode("truth-claims", context);
  await runPipelineNode("fact-check", context);
  fs.writeFileSync(
    path.join(systemOutput, "quality-report.json"),
    JSON.stringify({
      canFinalize: true,
      menuCoverage: 1,
      corePageScreenshotCoverage: 1,
      coreFunctionClassificationCoverage: 1,
      writeOperationSafetyCompliance: 1,
      unverifiedContentLabeling: 1,
      coreConclusionTraceability: 1,
      failures: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } }),
    "utf8",
  );
  await runPipelineNode("truth-readiness", context);

  assert.equal(fs.existsSync(path.join(systemOutput, "data-dictionary.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "entity-model.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "function-universe.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "verified-claims.json")), true);
  const report = JSON.parse(fs.readFileSync(path.join(systemOutput, "fact-check-report.json"), "utf8"));
  assert.equal(report.canFinalize, true);
  const readiness = JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8"));
  assert.equal(readiness.canSubmitReview, true);
  assert.equal(readiness.requirements.databaseEvidenceRequired, true);
  assert.equal(readiness.gates.database.available, true);
});

test("pipeline truth-readiness requires database evidence when databaseProfile is enabled", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-truth-db-required-"));
  const projectRoot = path.resolve(__dirname, "..");
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const context = {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台", databaseProfile: { enabled: true } },
    systemOutput,
    projectRoot,
  };
  fs.writeFileSync(
    path.join(systemOutput, "quality-report.json"),
    JSON.stringify({
      canFinalize: true,
      menuCoverage: 1,
      corePageScreenshotCoverage: 1,
      coreFunctionClassificationCoverage: 1,
      writeOperationSafetyCompliance: 1,
      unverifiedContentLabeling: 1,
      coreConclusionTraceability: 1,
      failures: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({
      rules: {
        lowConfidenceNotWritable: true,
        databaseOnlyNotConfirmed: true,
        databaseOnlyNotWritable: true,
      },
      metrics: { claimCount: 1, writableClaimCount: 1, confirmedCount: 1, inferredCount: 0 },
      writableClaimIds: ["function:保单任务:任务列表"],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: true,
      failures: [],
      metrics: {
        claimCount: 1,
        writableClaimCount: 1,
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 1,
        missingWritableClaimCount: 0,
        writableClaimCoverageRatio: 1,
        minWritableClaimCoverage: 0.8,
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } }),
    "utf8",
  );
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "# AI保单数据闭环平台功能白皮书", "utf8");

  await assert.rejects(
    () => runPipelineNode("truth-readiness", context),
    /databaseProfile\.enabled=true but no redacted database evidence is available/,
  );
  const readiness = JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8"));
  assert.equal(readiness.canSubmitReview, false);
  assert.equal(readiness.requirements.databaseEvidenceRequired, true);
  assert.ok(readiness.blockers.some((item) => item.id === "database.required-profile-missing"));
  assert.equal(
    readiness.improvementActions.some((item) => item.id === "database.optional-profile"),
    false,
  );
});

test("pipeline auto repairs writable claim coverage once during fact check", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runPipelineNodeWithState } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-coverage-repair-"));
  const projectRoot = path.resolve(__dirname, "..");
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const context = {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台" },
    systemOutput,
    projectRoot,
  };
  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({
      artifactType: "verified-claims",
      claims: [
        {
          id: "function:保单任务:任务列表",
          type: "function",
          module: "保单任务",
          function: "任务列表",
          subject: "任务列表",
          status: "confirmed",
          confidence: "high",
          writable: true,
        },
        {
          id: "function:保单任务:任务详情",
          type: "function",
          module: "保单任务",
          function: "任务详情",
          subject: "任务详情",
          status: "confirmed",
          confidence: "high",
          writable: true,
        },
      ],
      writableClaimIds: ["function:保单任务:任务列表", "function:保单任务:任务详情"],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    [
      "# AI保单数据闭环平台功能白皮书",
      "保单任务模块提供任务列表。[claim:function:保单任务:任务列表]",
    ].join("\n"),
    "utf8",
  );

  const repairedNarrativeParts = [];
  const result = await runPipelineNodeWithState("fact-check", context, {
    attemptedCoverageRepairFingerprints: new Set(),
    runPipelineNode: async (nodeId, nodeContext) => {
      if (nodeId === "fact-check") {
        const report = runFactCheck({ inputDir: nodeContext.systemOutput });
        if (!report.canFinalize) throw new Error("fact-check failed");
        return report;
      }
      if (nodeId === "narrative") {
        repairedNarrativeParts.push(nodeContext.args["narrative-part"]);
        fs.appendFileSync(
          path.join(nodeContext.systemOutput, "whitepaper.pending-review.md"),
          "\n保单任务模块还提供任务详情能力。[claim:function:保单任务:任务详情]\n",
          "utf8",
        );
        return { status: "completed" };
      }
      throw new Error(`unexpected node: ${nodeId}`);
    },
  });

  const repairPlan = JSON.parse(
    fs.readFileSync(path.join(systemOutput, "coverage-repair-plan.json"), "utf8"),
  );
  const factCheckReport = JSON.parse(
    fs.readFileSync(path.join(systemOutput, "fact-check-report.json"), "utf8"),
  );
  assert.equal(result.coverageRepair.narrativePart, "保单任务");
  assert.deepEqual(repairedNarrativeParts, ["保单任务"]);
  assert.equal(repairPlan.status, "completed");
  assert.deepEqual(repairPlan.executedNodes, ["narrative", "fact-check"]);
  assert.deepEqual(repairPlan.missingWritableClaimIds, ["function:保单任务:任务详情"]);
  assert.equal(factCheckReport.canFinalize, true);
  assert.deepEqual(factCheckReport.missingWritableClaimIds, []);
});

test("pipeline does not repair fact check failures from stale reports", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNodeWithState } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-stale-coverage-report-"));
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: false,
      missingWritableClaimIds: ["function:保单任务:任务详情"],
      metrics: { writableClaimCoverageRatio: 0.5, minWritableClaimCoverage: 0.8 },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify({
      claims: [{ id: "function:保单任务:任务详情", module: "保单任务", writable: true }],
    }),
    "utf8",
  );
  const oldTime = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(systemOutput, "fact-check-report.json"), oldTime, oldTime);
  let narrativeRuns = 0;

  await assert.rejects(
    () =>
      runPipelineNodeWithState(
        "fact-check",
        {
          args: {},
          config: {},
          configPath: path.join(tempRoot, "systems.local.yaml"),
          system: { code: "adp", name: "AI保单数据闭环平台" },
          systemOutput,
          projectRoot: path.resolve(__dirname, ".."),
        },
        {
          attemptedCoverageRepairFingerprints: new Set(),
          runPipelineNode: async (nodeId) => {
            if (nodeId === "narrative") narrativeRuns += 1;
            throw new Error("verified claims malformed");
          },
        },
      ),
    /verified claims malformed/,
  );

  assert.equal(narrativeRuns, 0);
  assert.equal(fs.existsSync(path.join(systemOutput, "coverage-repair-plan.json")), false);
});

test("visible DOM menu candidates are converted to clickable menu records", () => {
  const { applyVisibleDomMenuCandidatesToEvidence } = require("./collect-evidence");
  const evidence = { menuMap: [] };
  const result = applyVisibleDomMenuCandidatesToEvidence(
    evidence,
    [
      { title: "AI 任务管理", menuPath: "AI 任务管理", path: "" },
      { title: "AI 脚本管理", menuPath: "AI 脚本管理", path: "" },
    ],
    { url: "https://pre-adp.hzins.com/" },
  );

  assert.equal(result.menuCount, 2);
  assert.equal(evidence.menuMap[0].title, "AI 任务管理");
  assert.equal(evidence.menuMap[0].url, "");
  assert.equal(evidence.menuMap[0].openStrategy, "text-click");
  assert.equal(evidence.menuMap[0].coreCoverage, true);
});

test("word exporter writes a docx package from final markdown", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { exportWhitepaperWord, markdownToWordDocumentXml } = require("./export-whitepaper-word");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-export-adp-"));
  const inputPath = path.join(dir, "whitepaper.final.md");
  fs.writeFileSync(
    inputPath,
    ["# AI保单数据闭环平台 系统功能白皮书", "", "## 1. 系统定位", "支撑保单数据闭环管理。"].join("\n"),
    "utf8",
  );

  const xml = markdownToWordDocumentXml(fs.readFileSync(inputPath, "utf8"));
  assert.match(xml, /AI保单数据闭环平台/);
  assert.match(xml, /w:document/);

  const result = exportWhitepaperWord({
    inputPath,
    systemName: "AI保单数据闭环平台",
    date: "2026-05-20",
  });
  const bytes = fs.readFileSync(result.outputPath);
  assert.equal(bytes.subarray(0, 2).toString("utf8"), "PK");
  assert.match(path.basename(result.outputPath), /AI保单数据闭环平台_系统功能白皮书_20260520\.docx/);
});

test("approved review creates final markdown and word output", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-word-adp-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\n支撑保单数据闭环管理。",
    "utf8",
  );
  writePassingTruthReadinessReport(dir);

  const decision = runReviewDecision({
    inputDir: dir,
    status: "approved",
    date: "2026-05-20",
  });

  assert.equal(decision.status, "approved");
  assert.ok(fs.existsSync(path.join(dir, "whitepaper.final.md")));
  assert.match(
    fs.readFileSync(path.join(dir, "whitepaper.final.md"), "utf8"),
    /^# AI保单数据闭环平台功能白皮书\n/,
  );
  assert.ok(fs.existsSync(decision.docxPath));
  assert.match(path.basename(decision.docxPath), /\.docx$/);
});

test("approved review requires passing truth readiness gate", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-truth-gate-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\n支撑保单数据闭环管理。",
    "utf8",
  );

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /truth-readiness-report\.json not found/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);

  writePassingTruthReadinessReport(dir, {
    score: 0.91,
    scorePercent: 91,
    canSubmitReview: false,
    blockers: [{ id: "claims.missing-writable", message: "No writable claims." }],
  });

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /Truth readiness gate has not passed/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);
});

test("approved review rejects stale truth readiness fingerprints", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-stale-truth-"));
  const pendingPath = path.join(dir, "whitepaper.pending-review.md");
  fs.writeFileSync(
    pendingPath,
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\n支撑保单数据闭环管理。",
    "utf8",
  );
  writePassingTruthReadinessReport(dir);
  fs.appendFileSync(pendingPath, "\n\n## 2. 未经门禁复核的新内容\n这里新增了未经事实核验的业务结论。", "utf8");

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /Truth readiness report is stale/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);
});

test("approved review rejects smoke truth readiness by default", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-smoke-truth-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n本地冒烟，不代表最终业务白皮书内容。",
    "utf8",
  );
  writePassingTruthReadinessReport(dir, {
    mode: "local-e2e-smoke",
    improvementActions: [
      {
        id: "smoke-only",
        message: "Smoke gate validates approval/export plumbing only.",
      },
    ],
  });

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /Smoke truth readiness report cannot approve real delivery/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);

  const e2eDir = path.join(dir, "outputs", "_e2e", "adp-smoke");
  fs.mkdirSync(e2eDir, { recursive: true });
  fs.writeFileSync(
    path.join(e2eDir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\n支撑保单数据闭环管理。",
    "utf8",
  );
  writePassingTruthReadinessReport(e2eDir);
  assert.throws(
    () => runReviewDecision({ inputDir: e2eDir, status: "approved" }),
    /Smoke truth readiness report cannot approve real delivery/,
  );
  assert.equal(fs.existsSync(path.join(e2eDir, "whitepaper.final.md")), false);
});

test("approved review tolerates malformed optional pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-bad-state-adp-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\n支撑保单数据闭环管理。",
    "utf8",
  );
  writePassingTruthReadinessReport(dir);
  fs.writeFileSync(path.join(dir, "pipeline-state.json"), "{bad json", "utf8");

  const decision = runReviewDecision({
    inputDir: dir,
    status: "approved",
    systemName: "AI保单数据闭环平台",
    date: "2026-05-20",
  });

  assert.equal(decision.status, "approved");
  assert.ok(fs.existsSync(path.join(dir, "whitepaper.final.md")));
  assert.ok(fs.existsSync(decision.docxPath));
  assert.equal(fs.readFileSync(path.join(dir, "pipeline-state.json"), "utf8"), "{bad json");
});

test("rejected review tolerates malformed optional evidence summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-bad-summary-adp-"));
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), "{bad json", "utf8");

  const decision = runReviewDecision({
    inputDir: dir,
    status: "rejected",
    comment: "业务流程说明不清楚，需要重新整理。",
  });

  assert.equal(decision.status, "rejected");
  assert.deepEqual(decision.targetModules, []);
  assert.ok(decision.rerunNodes.includes("narrative"));
  assert.ok(fs.existsSync(path.join(dir, "review-decision.json")));
  assert.equal(fs.readFileSync(path.join(dir, "evidence-summary.json"), "utf8"), "{bad json");
});

test("rejected review ignores non-object optional evidence summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-non-object-summary-adp-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify([{ modules: [{ name: "AI任务" }] }]),
    "utf8",
  );

  const decision = runReviewDecision({
    inputDir: dir,
    status: "rejected",
    comment: "AI任务模块的任务列表功能描述错误",
  });

  assert.equal(decision.status, "rejected");
  assert.equal(decision.rewriteScope, "function-sections");
  assert.deepEqual(decision.targetModules, []);
  assert.equal(decision.narrativePart, "function-sections");
  assert.ok(fs.existsSync(path.join(dir, "review-decision.json")));
});

test("local e2e smoke approves copied adp artifacts without mutating source output", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runLocalE2ESmoke } = require("./run-local-e2e-smoke");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-e2e-adp-"));
  const sourceOutput = path.join(dir, "outputs", "adp");
  const smokeOutput = path.join(dir, "outputs", "_e2e", "adp-smoke");
  fs.mkdirSync(sourceOutput, { recursive: true });
  fs.writeFileSync(
    path.join(sourceOutput, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [],
      functions: [],
    }),
    "utf8",
  );

  const result = runLocalE2ESmoke({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    sourceOutput,
    smokeOutput,
    date: "2026-05-20",
  });

  assert.equal(result.status, "passed");
  assert.ok(fs.existsSync(path.join(smokeOutput, "whitepaper.pending-review.md")));
  assert.ok(fs.existsSync(result.docxPath));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(smokeOutput, "truth-readiness-report.json"), "utf8")).mode,
    "local-e2e-smoke",
  );
  assert.equal(fs.existsSync(path.join(sourceOutput, "whitepaper.final.md")), false);
});

test("buildSmokePendingReview renders readable smoke markdown", () => {
  const { buildSmokePendingReview } = require("./run-local-e2e-smoke");
  const markdown = buildSmokePendingReview({
    systemName: "合同系统",
    evidenceSummary: {
      modules: [{ name: "合同管理" }],
      functions: [{ name: "合同查询" }, { name: "合同新增" }],
    },
  });

  assert.match(markdown, /^# 合同系统 系统功能白皮书/);
  assert.match(markdown, /## 1\. 系统定位/);
  assert.match(markdown, /识别到 1 个模块、2 个功能点/);
  assert.doesNotMatch(markdown, /绯荤粺|鍔熻兘|鐧界毊/);
});

test("local e2e smoke ignores non-object copied evidence summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runLocalE2ESmoke } = require("./run-local-e2e-smoke");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-e2e-summary-shape-"));
  const sourceOutput = path.join(dir, "outputs", "adp");
  const smokeOutput = path.join(dir, "outputs", "_e2e", "adp-smoke");
  fs.mkdirSync(sourceOutput, { recursive: true });
  fs.writeFileSync(
    path.join(sourceOutput, "evidence-summary.json"),
    JSON.stringify([{ modules: [{ name: "should-not-count" }] }]),
    "utf8",
  );

  const result = runLocalE2ESmoke({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    sourceOutput,
    smokeOutput,
    date: "2026-05-20",
  });

  const pending = fs.readFileSync(
    path.join(smokeOutput, "whitepaper.pending-review.md"),
    "utf8",
  );
  assert.equal(result.status, "passed");
  assert.match(pending, / 0 /);
  assert.equal(
    fs.readFileSync(path.join(sourceOutput, "evidence-summary.json"), "utf8"),
    JSON.stringify([{ modules: [{ name: "should-not-count" }] }]),
  );
});

test("renderWhitepaper writes concise core sections and evidence appendix", () => {
  const markdown = renderWhitepaper({
    systemInfo: {
      name: "合同管理系统",
      testUrl: "https://contract.example.test/",
      collectedAt: "2026-05-18 17:30",
      loginRole: "全权限测试账号",
      businessPositioning: "支撑合同查询、创建和测试数据清理。",
      users: "合同业务操作员、审批人员。",
      capabilities: ["合同新增", "合同删除", "合同查询"],
    },
    modules: [
      {
        name: "合同管理",
        entry: "合同管理 > 合同列表",
        summary: "管理合同记录。",
      },
    ],
    functions: [
      {
        module: "合同管理",
        name: "合同删除",
        entry: "合同管理 > 合同列表 > 删除按钮",
        description: "删除 AI 创建的测试合同记录。",
        operations: "搜索测试合同 -> 删除 -> 重新搜索无结果",
        keyFields: "合同编号",
        screenshotRefs: ["shot-001"],
        validationNote: "仅验证 AI_AUTO_TEST_ 测试数据删除。",
      },
    ],
    screenshotIndex: [
      {
        id: "shot-001",
        file: "screenshots/合同管理_合同删除_确认弹窗.png",
        caption: "删除确认弹窗。",
        module: "合同管理",
        function: "合同删除",
        includeInWhitepaper: true,
      },
    ],
    pendingItems: [],
    testDataLedger: [],
    failedPages: [],
  });

  assert.match(markdown, /# 合同管理系统 系统功能白皮书/);
  assert.match(markdown, /## 3\. 核心功能说明/);
  assert.match(markdown, /!\[删除确认弹窗。\]\(screenshots\/合同管理_合同删除_确认弹窗\.png\)/);
  assert.doesNotMatch(markdown, /REPLACE_WITH_JWT/);
});

test("renderWhitepaper derives concise functions from collected page evidence", () => {
  const markdown = renderWhitepaper({
    systemInfo: {
      name: "财务中台系统",
      testUrl: "https://venus-fincenter.hzins.com/welcome",
      collectedAt: "2026-05-19 09:50",
      loginRole: "全权限测试账号",
    },
    pageInventory: [
      {
        id: "menu-page-3",
        menuPath: "基础管理 > 业务线映射表",
        title: "业务线映射表",
        url: "https://venus-fincenter.hzins.com/base/businessLineMapping",
        evidenceRefs: ["shot-003"],
      },
    ],
    actionInventory: [
      { pageId: "menu-page-3", name: "查 询" },
      { pageId: "menu-page-3", name: "新 增" },
      { pageId: "menu-page-3", name: "导 出" },
    ],
    formInventory: [
      {
        pageId: "menu-page-3",
        formName: "form-1",
        fields: [{ label: "请选择平台" }, { label: "映射源id" }],
      },
    ],
    tableInventory: [
      {
        pageId: "menu-page-3",
        columns: ["流水号", "平台", "映射类型", "业务线名称", "操作"],
      },
    ],
    screenshotIndex: [
      {
        id: "shot-003",
        file: "screenshots/业务线映射表.png",
        caption: "业务线映射表页面。",
        includeInWhitepaper: true,
      },
    ],
    pendingItems: [],
    testDataLedger: [],
    failedPages: [],
  });

  assert.match(markdown, /基础管理/);
  assert.match(markdown, /业务线映射表/);
  assert.match(markdown, /主要操作.*查询、新增、导出/);
  assert.match(markdown, /常见查询.*请选择平台、映射源id/);
  assert.match(markdown, /核心字段.*流水号、平台、映射类型、业务线名称、操作/);
});

test("pruneResolvedFailedPages drops failures that already have screenshots", () => {
  const { pruneResolvedFailedPages, menuHasCollectedScreenshot } = require("./system-whitepaper-lib");
  const evidence = createInitialEvidence({
    code: "pilot",
    name: "财务中台",
    url: "https://venus-fincenter.hzins.com/welcome",
  });
  evidence.menuMap.push({
    path: "基础管理 > 币种",
    title: "币种",
    menuPath: "基础管理 > 币种",
    url: "https://venus-fincenter.hzins.com/base/currency",
    status: "visited",
    coreCoverage: true,
  });
  evidence.pageInventory.push({
    id: "menu-page-1",
    menuPath: "基础管理 > 币种",
    type: "menu-page",
    screenshot: "screenshots/sample.png",
  });
  evidence.failedPages = [
    { path: "基础管理 > 币种", reason: "old failure" },
    { path: "未采集菜单", reason: "still missing" },
  ];
  const result = pruneResolvedFailedPages(evidence);
  assert.equal(result.removed, 1);
  assert.equal(evidence.failedPages.length, 1);
  assert.equal(evidence.failedPages[0].path, "未采集菜单");
  assert.equal(
    menuHasCollectedScreenshot(evidence, {
      menuPath: "基础管理 > 币种",
      title: "币种",
    }),
    true,
  );
});

test("selectMenusForEvidenceRefresh only returns menus with existing screenshots", () => {
  const { selectMenusForEvidenceRefresh } = require("./system-whitepaper-lib");
  const evidence = createInitialEvidence({
    code: "pilot",
    name: "财务中台",
    url: "https://venus-fincenter.hzins.com/welcome",
  });
  evidence.menuMap = [
    {
      path: "基础管理 > 币种",
      title: "币种",
      menuPath: "基础管理 > 币种",
      url: "https://venus-fincenter.hzins.com/base/currency",
      status: "visited",
      coreCoverage: true,
    },
    {
      path: "基础管理 > 保险公司",
      title: "保险公司",
      menuPath: "基础管理 > 保险公司",
      url: "https://venus-fincenter.hzins.com/base/insurance-company",
      status: "observed",
      coreCoverage: true,
    },
  ];
  evidence.pageInventory.push({
    id: "menu-page-1",
    menuPath: "基础管理 > 币种",
    type: "menu-page",
    screenshot: "screenshots/sample.png",
  });
  const selected = selectMenusForEvidenceRefresh(evidence.menuMap, 10, evidence);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].menuPath, "基础管理 > 币种");
});

test("isEnvironmentSwitcherMenu excludes adp environment switch links", () => {
  const { isEnvironmentSwitcherMenu } = require("./system-whitepaper-lib");
  assert.equal(
    isEnvironmentSwitcherMenu({
      title: "本地/UAT 环境",
      url: "https://pre-adp.hzins.com/#",
    }),
    true,
  );
  assert.equal(
    isEnvironmentSwitcherMenu({
      title: "生产环境",
      url: "https://pre-adp.hzins.com/#",
    }),
    true,
  );
  assert.equal(
    isEnvironmentSwitcherMenu({
      title: "AI 任务管理",
      menuPath: "AI 任务管理",
      openStrategy: "text-click",
    }),
    false,
  );
});

test("applyVisibleDomMenuCandidatesToEvidence filters environment switchers", () => {
  const { applyVisibleDomMenuCandidatesToEvidence } = require("./collect-evidence");
  const evidence = { menuMap: [] };
  const result = applyVisibleDomMenuCandidatesToEvidence(
    evidence,
    [
      { title: "本地/UAT 环境", menuPath: "本地/UAT 环境", path: "#" },
      { title: "AI 任务管理", menuPath: "AI 任务管理", path: "" },
    ],
    { url: "https://pre-adp.hzins.com/", name: "AI保单数据闭环平台" },
  );
  assert.equal(result.menuCount, 2);
  assert.equal(evidence.menuMap.length, 1);
  assert.equal(evidence.menuMap[0].title, "AI 任务管理");
});

test("buildEvidenceSnapshot reads evidence-summary screenshots", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildEvidenceSnapshot } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-snapshot-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { collectedAt: "2026-05-24T12:00:00.000Z" },
      metrics: { counts: { menus: 12, pages: 8, coreMenus: 10, visitedMenus: 6 } },
      screenshots: [
        {
          id: "shot-1",
          file: "screenshots/home.png",
          module: "首页",
          function: "系统入口",
          caption: "首页截图",
        },
      ],
    }),
    "utf8",
  );

  const snapshot = buildEvidenceSnapshot(dir);
  assert.equal(snapshot.menuCount, 12);
  assert.equal(snapshot.pageCount, 8);
  assert.equal(snapshot.screenshotCount, 1);
  assert.equal(snapshot.screenshots[0].file, "screenshots/home.png");
});

test("dashboard download route serves docx artifact", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const http = require("node:http");
  const { createDashboardServer } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-download-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  const docxPath = path.join(output, "AI保单数据闭环平台_系统功能白皮书_20260524.docx");
  fs.writeFileSync(docxPath, "PK\x03\x04fake-docx", "utf8");
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      overallStatus: "finalized",
      review: { status: "approved" },
      artifacts: { docx: path.basename(docxPath) },
      nodes: {},
      phases: {},
    }),
    "utf8",
  );

  const server = createDashboardServer({ configPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/api/download?system=adp&artifact=docx`, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        })
        .on("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-disposition"] || ""), /attachment/i);
    assert.equal(response.body.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dashboard download route tolerates malformed pipeline state", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const http = require("node:http");
  const { createDashboardServer } = require("./local-dashboard/server");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-download-bad-state-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "pipeline-state.json"), "{bad json", "utf8");
  fs.writeFileSync(
    path.join(output, "AI保单数据闭环平台_系统功能白皮书_20260524.docx"),
    "PK\x03\x04fallback-docx",
    "utf8",
  );

  const server = createDashboardServer({ configPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/api/download?system=adp&artifact=docx`, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        })
        .on("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-disposition"] || ""), /attachment/i);
    assert.equal(response.body.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("generate write validation plan ignores stale pageIds and environment switchers", () => {
  const { buildScenariosFromEvidence } = require("./generate-write-validation-plan");
  const scenarios = buildScenariosFromEvidence({
    pageInventory: [{ id: "page-1", menuPath: "首页" }],
    actionInventory: [
      {
        pageId: "page-stale",
        type: "create",
        name: "新增任务",
        risk: "normal",
      },
    ],
    menuMap: [{ title: "本地/UAT 环境", menuPath: "本地/UAT 环境", url: "https://pre-adp.hzins.com/#" }],
  });
  assert.ok(!scenarios.some((item) => item.pageId === "page-stale"));
  assert.ok(!scenarios.some((item) => item.menuPath === "本地/UAT 环境"));
  assert.equal(scenarios[0]?.id, "auto-default");
});

test("buildOperationSpec prefers registry positioning over homepage-only signals", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec, gate } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://pre-adp.hzins.com/" },
      menuMap: [
        { title: "AI任务管理", menuPath: "AI任务管理", url: "https://pre-adp.hzins.com/#/tasks" },
        { title: "AI发布管理", menuPath: "AI发布管理", url: "https://pre-adp.hzins.com/#/publish" },
        { title: "AI数据监控", menuPath: "AI数据监控", url: "https://pre-adp.hzins.com/#/monitor" },
        { title: "元数据管理", menuPath: "元数据管理", url: "https://pre-adp.hzins.com/#/meta" },
      ],
      pageInventory: [
        {
          id: "page-home",
          type: "home",
          title: "欢迎",
          menuPath: "首页",
          mainAreas: ["region"],
        },
        {
          id: "page-task",
          menuPath: "AI任务管理",
          title: "AI任务管理",
          type: "menu-page",
          screenshot: "screenshots/task.png",
        },
        {
          id: "page-publish",
          menuPath: "AI发布管理",
          title: "AI发布管理",
          type: "menu-page",
          screenshot: "screenshots/publish.png",
        },
        {
          id: "page-monitor",
          menuPath: "AI数据监控",
          title: "AI数据监控",
          type: "menu-page",
          screenshot: "screenshots/monitor.png",
        },
        {
          id: "page-meta",
          menuPath: "元数据管理",
          title: "元数据管理",
          type: "menu-page",
          screenshot: "screenshots/meta.png",
        },
      ],
      tableInventory: [
        {
          pageId: "page-task",
          columns: ["保险公司", "任务类型", "需求状态"],
        },
      ],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    },
    system: {
      code: "adp",
      name: "AI保单数据闭环平台",
      businessHint: "AI 数据闭环平台用于解决保险中介产品上架最后一公里问题。",
      operationGuideMinMenus: 4,
    },
    writeValidation: {
      scenarios: [
        {
          menuPath: "AI任务管理",
          buttonText: "新建AI任务",
          status: "partial",
          reason: "submit-button-not-found",
          filledFieldCount: 3,
          screenshotPath: "screenshots/task-form.png",
        },
      ],
    },
    networkIndex: {
      entries: [{ method: "GET", url: "https://pre-adp.hzins.com/api/options", schemaKeys: ["taskTypes"] }],
    },
  });

  assert.match(spec.positioning.text, /最后一公里/);
  assert.equal(spec.positioning.confidence, "high");
  assert.equal(spec.positioning.sources[0].type, "registry");
  assert.equal(spec.modules.some((item) => item.name === "AI任务管理"), true);
  assert.equal(spec.modules.find((item) => item.name === "AI任务管理").flows.length, 1);
  assert.equal(gate.counts.modules, 4);
  assert.equal(gate.canComposeGuide, true);
});

test("loadOperationSpecInputs rejects malformed core evidence", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadOperationSpecInputs } = require("./operation-spec/lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-spec-bad-evidence-"));
  fs.writeFileSync(path.join(dir, "evidence.json"), "{bad json", "utf8");
  fs.writeFileSync(path.join(dir, "write-validation-result.json"), "{bad json", "utf8");
  fs.writeFileSync(path.join(dir, "network-index.json"), "{bad json", "utf8");

  assert.throws(
    () => loadOperationSpecInputs(dir, { code: "adp", name: "AI保单数据闭环平台" }),
    /Evidence is malformed/,
  );
});

test("loadOperationSpecInputs ignores non-object optional enrichment files", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { loadOperationSpecInputs } = require("./operation-spec/lib");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-spec-non-object-optional-"));
  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://pre-adp.hzins.com/" },
      menuMap: [{ title: "AI任务管理", menuPath: "AI任务管理", url: "https://pre-adp.hzins.com/#/tasks" }],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page", screenshot: "screenshots/task.png" },
      ],
      tableInventory: [],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "write-validation-result.json"), "[]", "utf8");
  fs.writeFileSync(path.join(dir, "network-index.json"), "\"invalid\"", "utf8");

  const { spec } = loadOperationSpecInputs(dir, {
    code: "adp",
    name: "AI保单数据闭环平台",
    operationGuideAllowDraft: true,
  });

  assert.equal(spec.networkEntryCount, 0);
  assert.equal(spec.modules.length, 1);
  assert.equal(spec.modules[0].flows.length, 0);
});

test("build-operation-spec ignores malformed optional enrichment files", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-spec-bad-optional-"));
  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://pre-adp.hzins.com/" },
      menuMap: [
        { title: "AI任务管理", menuPath: "AI任务管理", url: "https://pre-adp.hzins.com/#/tasks" },
        { title: "AI发布管理", menuPath: "AI发布管理", url: "https://pre-adp.hzins.com/#/publish" },
        { title: "AI数据监控", menuPath: "AI数据监控", url: "https://pre-adp.hzins.com/#/monitor" },
      ],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page", screenshot: "screenshots/task.png" },
        { id: "page-publish", menuPath: "AI发布管理", title: "AI发布管理", type: "menu-page", screenshot: "screenshots/publish.png" },
        { id: "page-monitor", menuPath: "AI数据监控", title: "AI数据监控", type: "menu-page", screenshot: "screenshots/monitor.png" },
      ],
      tableInventory: [{ pageId: "page-task", columns: ["保险公司"] }],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "write-validation-result.json"), "{bad json", "utf8");
  fs.writeFileSync(path.join(dir, "network-index.json"), "{bad json", "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/build-operation-spec.js", "--input", dir, "--allow-draft"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, "operation-spec.json"), "utf8"));
  const gate = JSON.parse(fs.readFileSync(path.join(dir, "operation-guide-gate.json"), "utf8"));
  assert.equal(spec.networkEntryCount, 0);
  assert.equal(spec.modules.some((item) => item.name === "AI任务管理"), true);
  assert.equal(gate.counts.modules, 3);
});

test("build-operation-spec ignores non-object optional enrichment files", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-spec-non-object-cli-"));
  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://pre-adp.hzins.com/" },
      menuMap: [
        { title: "AI任务管理", menuPath: "AI任务管理", url: "https://pre-adp.hzins.com/#/tasks" },
        { title: "AI发布管理", menuPath: "AI发布管理", url: "https://pre-adp.hzins.com/#/publish" },
      ],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page", screenshot: "screenshots/task.png" },
        { id: "page-publish", menuPath: "AI发布管理", title: "AI发布管理", type: "menu-page", screenshot: "screenshots/publish.png" },
      ],
      tableInventory: [],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "write-validation-result.json"), "[]", "utf8");
  fs.writeFileSync(path.join(dir, "network-index.json"), "\"invalid\"", "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/build-operation-spec.js", "--input", dir, "--allow-draft"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const spec = JSON.parse(fs.readFileSync(path.join(dir, "operation-spec.json"), "utf8"));
  assert.equal(spec.networkEntryCount, 0);
  assert.equal(spec.modules.length, 2);
  assert.equal(spec.modules.some((item) => item.flows.length > 0), false);
});

test("generateOperationGuideMarkdown renders module and flow sections", () => {
  const { generateOperationGuideMarkdown } = require("./generate-operation-guide");
  const markdown = generateOperationGuideMarkdown({
    systemName: "AI保单数据闭环平台",
    testUrl: "https://pre-adp.hzins.com/",
    positioning: { text: "平台定位句。", confidence: "high", sources: [{ type: "registry" }] },
    navigation: [{ menuPath: "AI任务管理", entry: "左侧「AI任务管理」" }],
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        businessHint: "管理 AI 任务。",
        list: { columns: ["保险公司", "任务类型"], queryFields: ["保险公司"], rowActions: ["编辑"] },
        flows: [
          {
            name: "新建AI任务",
            trigger: "新建AI任务",
            steps: [{ title: "定义参数", fields: [{ label: "保险公司", required: true, control: "select" }], buttons: ["下一步"] }],
          },
        ],
        tabs: [],
        screenshots: ["screenshots/task.png"],
      },
    ],
    pending: [],
  });
  assert.match(markdown, /操作指引/);
  assert.match(markdown, /AI任务管理/);
  assert.match(markdown, /新建AI任务/);
  assert.match(markdown, /保险公司/);
});

test("generate-operation-guide falls back to spec gate when gate cache is malformed", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-guide-bad-gate-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "operation-spec.json"),
    JSON.stringify({
      systemName: "AI保单数据闭环平台",
      testUrl: "https://pre-adp.hzins.com/",
      positioning: { text: "平台定位句。", confidence: "high", sources: [{ type: "registry" }] },
      navigation: [{ menuPath: "AI任务管理", entry: "左侧「AI任务管理」" }],
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          businessHint: "管理 AI 任务。",
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          flows: [],
          tabs: [],
          screenshots: [],
        },
      ],
      pending: [],
      gate: { canComposeGuide: true, readinessPercent: 100, failures: [] },
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "operation-guide-gate.json"), "{bad json", "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/generate-operation-guide.js", "--config", configPath, "--system", "adp"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const markdown = fs.readFileSync(path.join(output, "operation-guide.md"), "utf8");
  assert.match(markdown, /AI任务管理/);
});

test("generate-operation-guide falls back to spec gate when gate cache is non-object", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-guide-non-object-gate-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const output = path.join(dir, "outputs", "adp");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "operation-spec.json"),
    JSON.stringify({
      systemName: "AI保单数据闭环平台",
      testUrl: "https://pre-adp.hzins.com/",
      positioning: { text: "平台定位句。", confidence: "high", sources: [{ type: "registry" }] },
      navigation: [{ menuPath: "AI任务管理", entry: "左侧「AI任务管理」" }],
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          businessHint: "管理 AI 任务。",
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          flows: [],
          tabs: [],
          screenshots: [],
        },
      ],
      pending: [],
      gate: { canComposeGuide: true, readinessPercent: 100, failures: [] },
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "operation-guide-gate.json"), "[]", "utf8");

  const result = spawnSync(
    process.execPath,
    ["scripts/generate-operation-guide.js", "--config", configPath, "--system", "adp"],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const markdown = fs.readFileSync(path.join(output, "operation-guide.md"), "utf8");
  assert.match(markdown, /AI任务管理/);
});

test("createNetworkRecorder stores xhr entries without response bodies", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createNetworkRecorder } = require("./operation-spec/network-recorder");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "network-recorder-"));
  const recorder = createNetworkRecorder({
    systemOutput: dir,
    systemCode: "adp",
    allowedHosts: ["pre-adp.hzins.com"],
  });

  await recorder.entries.push({
    method: "GET",
    url: "https://pre-adp.hzins.com/api/options",
    schemaKeys: ["taskTypes"],
    capturedAt: new Date().toISOString(),
  });
  const outputPath = recorder.save();
  const saved = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.entries[0].schemaKeys[0], "taskTypes");
  assert.equal(saved.entries[0].body, undefined);
});

test("package manifest declares external dependencies used by packaged scripts", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { builtinModules } = require("node:module");
  const repoRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

  function walkJsFiles(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkJsFiles(entryPath));
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(entryPath);
      }
    }
    return files;
  }

  const packagedJsFiles = new Set();
  for (const entry of packageJson.files || []) {
    const normalized = entry.replace(/\\/g, "/");
    const entryPath = path.join(repoRoot, normalized);
    if (!fs.existsSync(entryPath)) {
      continue;
    }
    const stat = fs.statSync(entryPath);
    if (stat.isFile() && normalized.endsWith(".js")) {
      packagedJsFiles.add(entryPath);
    } else if (stat.isDirectory()) {
      for (const filePath of walkJsFiles(entryPath)) {
        packagedJsFiles.add(filePath);
      }
    }
  }

  const externalPackages = new Set();
  const dependencyPatterns = [
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const filePath of packagedJsFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of dependencyPatterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (
          builtins.has(specifier) ||
          specifier.startsWith(".") ||
          specifier.startsWith("/") ||
          specifier.startsWith("node:")
        ) {
          continue;
        }
        const packageName = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        externalPackages.add(packageName);
      }
    }
  }

  assert.deepEqual(
    [...externalPackages].sort(),
    Object.keys(packageJson.dependencies || {}).sort(),
    "package.json dependencies should match packaged script require() usage",
  );
});

test("init-local-config creates first-run config without overwriting user config", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { initLocalConfig } = require("./init-local-config");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-init-"));
  fs.mkdirSync(path.join(projectRoot, "examples"), { recursive: true });
  fs.copyFileSync(
    path.resolve(__dirname, "..", "examples", "systems.example.yaml"),
    path.join(projectRoot, "examples", "systems.example.yaml"),
  );

  const first = initLocalConfig({ projectRoot });
  assert.equal(first.createdConfig, true);
  assert.equal(fs.existsSync(path.join(projectRoot, "config", "systems.local.yaml")), true);
  assert.equal(fs.existsSync(path.join(projectRoot, "secrets")), true);
  assert.equal(fs.existsSync(path.join(projectRoot, "outputs")), true);

  const configPath = path.join(projectRoot, "config", "systems.local.yaml");
  fs.writeFileSync(configPath, "user-config\n", "utf8");
  const second = initLocalConfig({ projectRoot });
  assert.equal(second.createdConfig, false);
  assert.equal(fs.readFileSync(configPath, "utf8"), "user-config\n");
});

test("doctor fails fast when local config is missing", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { formatDoctorReport, runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-missing-"));

  const report = runDoctor({ projectRoot });

  assert.equal(report.ok, false);
  assert.equal(report.failures[0].id, "config.missing");
  assert.match(formatDoctorReport(report), /npm run init/);
});

test("doctor passes valid local config with token and writable output", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-valid-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "secrets", "huntian-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ../secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: ../outputs",
      "  testDataPrefix: AI_AUTO_TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    allowedWriteActions:",
      "      - create",
      "    forbiddenActions:",
      "      - external-push",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.counts.systems, 1);
});

test("doctor resolves default secrets and outputs relative to project root", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-root-paths-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "secrets", "huntian-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ./secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: ./outputs",
      "  testDataPrefix: AI_AUTO_TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });

  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
});

test("doctor rejects unsafe test data prefix and duplicate system codes", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-unsafe-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "secrets", "huntian-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ../secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: ../outputs",
      "  testDataPrefix: TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "  - code: adp",
      "    name: 重复系统",
      "    url: https://pre-adp-copy.hzins.com/",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });
  const failureIds = report.failures.map((item) => item.id);

  assert.equal(report.ok, false);
  assert.ok(failureIds.includes("runtime.test-data-prefix-unsafe"));
  assert.ok(failureIds.includes("system.code-duplicate"));
});

test("doctor validates enabled database profile secret under private secrets", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-db-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "secrets", "huntian-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({ type: "mysql", host: "127.0.0.1", user: "readonly", password: "secret" }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ./secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: ./outputs",
      "  testDataPrefix: AI_AUTO_TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    databaseProfile:",
      "      enabled: true",
      "      secretFile: ./secrets/db/adp.json",
      "      metadataFile: ./secrets/db/adp-metadata.json",
      "      allowSampleData: true",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });
  const warningIds = report.warnings.map((item) => item.id);

  assert.equal(report.ok, true);
  assert.ok(warningIds.includes("system.database-metadata-file-missing"));
  assert.ok(warningIds.includes("system.database-sample-data-enabled"));
});

test("collect database profile writes redacted schema evidence from private metadata", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { collectDatabaseProfile, sanitizeSampleRow, sanitizeSecret } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-profile-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({
      type: "mysql",
      host: "127.0.0.1",
      port: 3306,
      database: "adp_test",
      user: "readonly",
      password: "secret",
      metadataFile: "./secrets/db/adp-metadata.json",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp-metadata.json"),
    JSON.stringify({
      databaseType: "mysql",
      tables: [
        {
          schema: "adp_test",
          name: "policy_task",
          comment: "保单任务",
          rowCount: 12,
          columns: [
            { name: "id", type: "bigint", comment: "主键", primaryKey: true },
            {
              name: "status",
              type: "varchar",
              comment: "任务状态",
              dictionary: ["INIT", "DONE"],
            },
            { name: "customer_phone", type: "varchar", comment: "客户手机号", nullable: "NO", primaryKey: "false" },
            { name: "created_time", type: "datetime", comment: "创建时间" },
          ],
          sampleRows: [{ id: 1, customer_phone: "13800138000", status: "DONE" }],
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "runtime:",
      "  outputDir: ./outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    databaseProfile:",
      "      enabled: true",
      "      secretFile: ./secrets/db/adp.json",
      "      includeSchemas:",
      "        - adp_test",
      "      sampleRows: 1",
      "      allowSampleData: true",
      "",
    ].join("\n"),
    "utf8",
  );

  const { outputPath, profile } = await collectDatabaseProfile({
    config: path.join(projectRoot, "config", "systems.local.yaml"),
    system: "adp",
  });

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(profile.source.secret.password, "[redacted]");
  assert.equal(profile.source.secret.host, "[redacted]");
  assert.equal(profile.tables[0].sampleRows[0].customer_phone, "1***0");
  assert.equal(profile.entityCandidates[0].statusColumns[0].name, "status");
  const customerPhoneColumn = profile.tables[0].columns.find((column) => column.name === "customer_phone");
  assert.equal(customerPhoneColumn.nullable, false);
  assert.equal(customerPhoneColumn.primaryKey, false);
  assert.equal(sanitizeSecret({ password: "secret" }).password, "[redacted]");
  assert.equal(sanitizeSampleRow({ customerName: "张三" }).customerName, "***");
});

test("collect database profile supports private read-only connector adapter", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    collectDatabaseProfile,
    collectMetadataViaConnector,
    groupColumnsByTable,
    resolveIncludeSchemas,
  } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-connector-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({
      type: "mysql",
      host: "127.0.0.1",
      port: 3306,
      database: "adp_test",
      user: "readonly",
      password: "secret",
      readOnly: true,
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "runtime:",
      "  outputDir: ./outputs",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    databaseProfile:",
      "      enabled: true",
      "      mode: connector",
      "      secretFile: ./secrets/db/adp.json",
      "      includeSchemas:",
      "        - adp_test",
      "      sampleRows: 1",
      "      allowSampleData: true",
      "",
    ].join("\n"),
    "utf8",
  );

  const grouped = groupColumnsByTable([
    {
      schema: "adp_test",
      name: "policy_task",
      tableComment: "保单任务",
      rowCount: 3,
      columnName: "status",
      dataType: "varchar",
      columnComment: "任务状态",
      nullable: false,
      primaryKey: false,
    },
  ]);
  assert.equal(grouped[0].columns[0].name, "status");
  assert.deepEqual(resolveIncludeSchemas({ database: "fallback_db" }, {}), ["fallback_db"]);
  assert.throws(() => resolveIncludeSchemas({}, {}), /includeSchemas or secret\.database/);

  const { outputPath, profile } = await collectDatabaseProfile({
    config: path.join(projectRoot, "config", "systems.local.yaml"),
    system: "adp",
    adapter: async ({ secret, profileConfig, type }) => {
      assert.equal(secret.password, "secret");
      assert.equal(type, "mysql");
      assert.deepEqual(profileConfig.includeSchemas, ["adp_test"]);
      return {
        databaseType: "mysql",
        tables: [
          {
            schema: "adp_test",
            name: "policy_task",
            comment: "保单任务",
            rowCount: 3,
            columns: [
              { name: "id", type: "bigint", comment: "主键", primaryKey: true },
              { name: "status", type: "varchar", comment: "任务状态" },
              { name: "customer_phone", type: "varchar", comment: "客户手机号" },
            ],
            sampleRows: [{ id: 7, status: "DONE", customer_phone: "13800138000" }],
          },
        ],
      };
    },
  });

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(profile.source.mode, "connector");
  assert.equal(profile.source.secret.password, undefined);
  assert.equal(profile.source.secret.host, "[redacted]");
  assert.equal(profile.source.secret.readOnly, true);
  assert.equal(profile.tables[0].sampleRows[0].customer_phone, "1***0");
  assert.equal(profile.entityCandidates[0].entity, "保单任务");

  await assert.rejects(
    () => collectMetadataViaConnector({ type: "mysql" }, { includeSchemas: ["adp_test"] }, { adapter: async () => ({}) }),
    /requires readOnly=true/,
  );
});

test("collect database profile connector samples non-sensitive columns only", async () => {
  const { collectMetadataViaConnector } = require("./collect-database-profile");
  const executed = [];
  const connection = {
    async execute(sql, params) {
      executed.push({ sql, params });
      if (sql.includes("information_schema.COLUMNS")) {
        return [[
          {
            schema: "adp_test",
            name: "policy_task",
            tableComment: "保单任务",
            rowCount: 4,
            columnName: "id",
            columnType: "bigint",
            dataType: "bigint",
            columnComment: "主键",
            is_nullable: "NO",
            column_key: "PRI",
          },
          {
            schema: "adp_test",
            name: "policy_task",
            tableComment: "保单任务",
            rowCount: 4,
            columnName: "status",
            columnType: "varchar(20)",
            dataType: "varchar",
            columnComment: "任务状态",
            is_nullable: "NO",
            column_key: "",
          },
          {
            schema: "adp_test",
            name: "policy_task",
            tableComment: "保单任务",
            rowCount: 4,
            columnName: "customer_phone",
            columnType: "varchar(20)",
            dataType: "varchar",
            columnComment: "客户手机号",
            is_nullable: "YES",
            column_key: "",
          },
          {
            schema: "adp_test",
            name: "policy_task",
            tableComment: "保单任务",
            rowCount: 4,
            columnName: "external_ref",
            columnType: "varchar(80)",
            dataType: "varchar",
            columnComment: "外部编码",
            is_nullable: "YES",
            column_key: "",
          },
        ]];
      }
      return [[
        { id: 1, status: "DONE", external_ref: "person@example.com" },
        { id: 2, status: "INIT", external_ref: "plain-ref" },
        { id: 3, status: "DONE", external_ref: "11010519491231002X" },
        { id: 4, status: "DONE", external_ref: "overflow" },
      ]];
    },
    async end() {
      executed.push({ sql: "end", params: [] });
    },
  };
  const metadata = await collectMetadataViaConnector(
    {
      type: "mysql",
      host: "127.0.0.1",
      database: "adp_test",
      user: "readonly",
      password: "secret",
      readOnly: true,
    },
    {
      includeSchemas: ["adp_test"],
      allowSampleData: true,
      sampleRows: 5,
    },
    {
      driver: {
        async createConnection(config) {
          assert.equal(config.password, "secret");
          return connection;
        },
      },
    },
  );

  const table = metadata.tables[0];
  const sampleQuery = executed.find((entry) => entry.sql.startsWith("SELECT `id`"));
  assert.equal(table.columns.find((column) => column.name === "id").nullable, false);
  assert.equal(table.columns.find((column) => column.name === "id").primaryKey, true);
  assert.equal(table.columns.find((column) => column.name === "customer_phone").nullable, true);
  assert.ok(sampleQuery.sql.includes("`status`"));
  assert.ok(sampleQuery.sql.includes("`external_ref`"));
  assert.equal(sampleQuery.sql.includes("customer_phone"), false);
  assert.deepEqual(sampleQuery.params, [3]);
  assert.equal(table.sampleRows.length, 3);
  assert.equal(table.sampleRows[0].external_ref, "p***m");
  assert.equal(table.sampleRows[2].external_ref, "1***X");
});

test("doctor validates connector database profile read-only contract", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-db-connector-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "secrets", "huntian-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({ type: "mysql", host: "127.0.0.1", user: "readonly", password: "secret", readOnly: true }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ./secrets/huntian-token.txt",
      "runtime:",
      "  environment: test",
      "  outputDir: ./outputs",
      "  testDataPrefix: AI_AUTO_TEST_",
      "systems:",
      "  - code: adp",
      "    name: AI保单数据闭环平台",
      "    url: https://pre-adp.hzins.com/",
      "    databaseProfile:",
      "      enabled: true",
      "      mode: connector",
      "      secretFile: ./secrets/db/adp.json",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });

  assert.equal(report.ok, true);
  assert.equal(report.failures.some((item) => item.id === "system.database-connector-readonly-missing"), false);
  assert.equal(report.warnings.some((item) => item.id === "system.database-metadata-file-missing"), false);
});

test("build database model derives dictionary and entity model from redacted profile", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildDatabaseModelArtifacts,
    buildDatabaseModelFromDir,
    inferEntityRelations,
  } = require("./build-database-model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "database-model-"));
  const profile = {
    artifactType: "database-profile",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    source: {
      mode: "connector",
      databaseType: "mysql",
      sampleDataIncluded: true,
    },
    safety: { secretRedacted: true },
    tables: [
      {
        schema: "adp_test",
        name: "policy_task",
        comment: "保单任务",
        rowCount: 12,
        columns: [
          { name: "id", type: "bigint", comment: "主键", primaryKey: true },
          { name: "policy_id", type: "bigint", comment: "保单ID" },
          { name: "status", type: "varchar", comment: "任务状态", dictionary: ["INIT", "DONE"] },
          { name: "customer_phone", type: "varchar", comment: "客户手机号" },
          { name: "created_time", type: "datetime", comment: "创建时间" },
        ],
        sampleRows: [{ id: 1, status: "DONE", customer_phone: "1***0" }],
        foreignKeys: [{ column: "policy_id", refTable: "policy" }],
      },
      {
        schema: "adp_test",
        name: "policy",
        comment: "保单",
        columns: [{ name: "id", type: "bigint", comment: "主键", primaryKey: true }],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(profile), "utf8");

  const direct = buildDatabaseModelArtifacts(profile, { generatedAt: "2026-06-03T00:00:00.000Z" });
  const result = buildDatabaseModelFromDir(dir, { generatedAt: "2026-06-03T00:00:00.000Z" });
  const taskEntity = result.entityModel.entities.find((entity) => entity.table === "adp_test.policy_task");

  assert.equal(fs.existsSync(path.join(dir, "data-dictionary.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "entity-model.json")), true);
  assert.equal(direct.dataDictionary.metrics.tableCount, 2);
  assert.equal(result.dataDictionary.metrics.statusFieldCount, 1);
  assert.equal(result.dataDictionary.metrics.sensitiveFieldCount, 1);
  assert.equal(result.dataDictionary.tables[0].sampleRows, undefined);
  assert.equal(taskEntity.statusFields[0].name, "status");
  assert.equal(taskEntity.evidence.sampleRowsIncluded, true);
  assert.equal(result.entityModel.metrics.relationCount, 2);
  assert.ok(result.entityModel.relations.some((relation) => relation.type === "foreign-key"));
  assert.ok(inferEntityRelations(result.dataDictionary.tables).some((relation) => relation.type === "naming-reference"));
});

test("build function universe merges UI functions and redacted database entities", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildFunctionUniverseArtifact,
    buildFunctionUniverseFromDir,
    scoreFunctionEntityMatch,
  } = require("./build-function-universe");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "function-universe-"));
  const evidenceSummary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务", entry: "保单任务 > 任务列表", summary: "任务处理" }],
    functions: [
      {
        module: "保单任务",
        name: "任务列表",
        menuPath: "保单任务 > 任务列表",
        actions: ["查询", "新增"],
        queryFields: ["保单号", "任务状态"],
        tableColumns: ["保单号", "状态", "创建时间"],
        screenshots: [{ id: "shot-1", file: "screenshots/task.png" }],
      },
    ],
  };
  const databaseProfile = {
    artifactType: "database-profile",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    entityCandidates: [
      {
        entity: "保单任务",
        table: "adp_test.policy_task",
        confidence: "medium",
        statusColumns: [{ name: "status", comment: "任务状态", dictionary: ["INIT", "DONE"] }],
        timeColumns: [{ name: "created_time", comment: "创建时间" }],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), JSON.stringify(evidenceSummary), "utf8");
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(databaseProfile), "utf8");
  fs.writeFileSync(
    path.join(dir, "entity-model.json"),
    JSON.stringify({
      artifactType: "entity-model",
      system: { code: "adp", name: "AI保单数据闭环平台" },
      entities: [
        {
          entity: "保单任务",
          table: "adp_test.policy_task",
          confidence: "medium",
          statusFields: [{ name: "status", comment: "任务状态", dictionary: ["INIT", "DONE"] }],
          timeFields: [{ name: "created_time", comment: "创建时间" }],
          evidence: { sampleRowsIncluded: true, sampleFieldNames: ["id", "status"] },
          sources: [{ type: "db-table", id: "adp_test.policy_task", label: "保单任务" }],
        },
      ],
      relations: [
        {
          from: "adp_test.policy_task",
          to: "adp_test.policy",
          type: "foreign-key",
          columns: ["policy_id"],
          confidence: "high",
          sources: [{ type: "db-foreign-key", id: "adp_test.policy_task.policy_id", label: "policy" }],
        },
      ],
    }),
    "utf8",
  );

  const direct = buildFunctionUniverseArtifact({
    evidenceSummary,
    databaseProfile,
    entityModel: JSON.parse(fs.readFileSync(path.join(dir, "entity-model.json"), "utf8")),
  });
  const { outputPath, artifact } = buildFunctionUniverseFromDir(dir);

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(direct.modules[0].name, "保单任务");
  assert.equal(artifact.functions[0].evidenceStrength, "medium");
  assert.equal(artifact.entities[0].statusColumns[0].name, "status");
  assert.equal(artifact.entities[0].evidence.sampleRowsIncluded, true);
  assert.equal(artifact.links[0].table, "adp_test.policy_task");
  assert.equal(artifact.entityRelations[0].type, "foreign-key");
  assert.equal(artifact.coverage.linkedFunctionCount, 1);
  assert.equal(artifact.coverage.entityRelationCount, 1);
  assert.equal(
    scoreFunctionEntityMatch(artifact.functions[0], artifact.entities[0]).confidence,
    "medium",
  );
});

test("build function universe tolerates malformed optional database profile", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildFunctionUniverseFromDir } = require("./build-function-universe");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "function-universe-bad-db-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "AI任务" }],
      functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "database-profile.json"), "{bad json", "utf8");

  const { artifact } = buildFunctionUniverseFromDir(dir);

  assert.equal(artifact.functions.length, 1);
  assert.equal(artifact.entities.length, 0);
});

test("build verified claims assigns confidence and writable boundaries", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildVerifiedClaimsArtifact,
    buildVerifiedClaimsFromDir,
    claimHasDatabaseEvidence,
    claimHasUiEvidence,
    classifyClaim,
  } = require("./build-verified-claims");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-claims-"));
  const functionUniverse = {
    artifactType: "function-universe",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [
      {
        name: "保单任务",
        sources: [{ type: "ui-module", id: "保单任务", label: "保单任务" }],
      },
    ],
    functions: [
      {
        module: "保单任务",
        name: "任务列表",
        menuPath: "保单任务 > 任务列表",
        queryFields: ["保单号", "任务状态"],
        tableColumns: ["保单号", "状态"],
        sources: [
          { type: "ui-function", id: "保单任务 > 任务列表", label: "任务列表" },
          { type: "screenshot", id: "shot-1", label: "screenshots/task.png" },
        ],
      },
      {
        module: "保单任务",
        name: "隐藏入口",
        sources: [{ type: "ui-function", id: "隐藏入口", label: "隐藏入口" }],
      },
    ],
    entities: [
      {
        name: "保单任务",
        table: "adp_test.policy_task",
        confidence: "medium",
        statusColumns: [
          { name: "status", comment: "任务状态", dictionary: ["INIT", "DONE"] },
        ],
        sources: [{ type: "db-table", id: "adp_test.policy_task", label: "保单任务" }],
      },
    ],
    links: [
      {
        module: "保单任务",
        function: "任务列表",
        entity: "保单任务",
        table: "adp_test.policy_task",
        confidence: "medium",
        sources: [
          { type: "ui-function", id: "保单任务 > 任务列表", label: "任务列表" },
          { type: "db-table", id: "adp_test.policy_task", label: "保单任务" },
        ],
      },
    ],
    entityRelations: [
      {
        from: "adp_test.policy_task",
        to: "adp_test.policy",
        type: "foreign-key",
        columns: ["policy_id"],
        confidence: "high",
        sources: [{ type: "db-foreign-key", id: "adp_test.policy_task.policy_id", label: "policy" }],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "function-universe.json"), JSON.stringify(functionUniverse), "utf8");

  const direct = buildVerifiedClaimsArtifact({ functionUniverse });
  const { outputPath, artifact } = buildVerifiedClaimsFromDir(dir);
  const confirmedFunction = artifact.claims.find((claim) => claim.id === "function:保单任务:任务列表");
  const weakFunction = artifact.claims.find((claim) => claim.id === "function:保单任务:隐藏入口");
  const dbEntity = artifact.claims.find((claim) => claim.type === "business-entity");
  const statusClaim = artifact.claims.find((claim) => claim.type === "status-field");
  const relationClaim = artifact.claims.find((claim) => claim.type === "entity-relation");

  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(direct.artifactType, "verified-claims");
  assert.equal(classifyClaim("medium", [{ type: "screenshot" }]), "confirmed");
  assert.equal(confirmedFunction.status, "confirmed");
  assert.equal(confirmedFunction.writable, true);
  assert.equal(weakFunction.status, "weak");
  assert.equal(weakFunction.writable, false);
  assert.equal(dbEntity.status, "inferred");
  assert.equal(dbEntity.writable, false);
  assert.equal(statusClaim.status, "inferred");
  assert.equal(statusClaim.writable, false);
  assert.equal(relationClaim.status, "inferred");
  assert.equal(relationClaim.writable, false);
  assert.equal(claimHasDatabaseEvidence(relationClaim), true);
  assert.equal(claimHasUiEvidence(relationClaim), false);
  assert.equal(
    artifact.claims
      .filter((claim) => claimHasDatabaseEvidence(claim) && !claimHasUiEvidence(claim))
      .every((claim) => claim.writable === false),
    true,
  );
  assert.ok(artifact.writableClaimIds.includes("link:保单任务:任务列表:adp-test-policy-task"));
  assert.equal(artifact.writableClaimIds.some((id) => id.startsWith("relation:")), false);
  assert.equal(artifact.metrics.claimCount, 7);
  assert.equal(artifact.metrics.databaseOnlyClaimCount, 3);
  assert.equal(artifact.metrics.weakCount, 1);
  assert.equal(artifact.rules.databaseOnlyNotWritable, true);
});

test("build verified claims never marks database-only claims writable", () => {
  const { claimIsWritable } = require("./build-verified-claims");

  assert.equal(
    claimIsWritable({
      type: "business-entity",
      status: "confirmed",
      sources: [{ type: "db-table", id: "adp_test.policy_task" }],
    }),
    false,
  );
  assert.equal(
    claimIsWritable({
      type: "function-entity-link",
      status: "inferred",
      sources: [
        { type: "ui-function", id: "保单任务 > 任务列表" },
        { type: "db-table", id: "adp_test.policy_task" },
      ],
    }),
    true,
  );
});

test("build verified claims rejects missing function universe", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildVerifiedClaimsFromDir } = require("./build-verified-claims");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-claims-missing-"));

  assert.throws(
    () => buildVerifiedClaimsFromDir(dir),
    /Function universe not found/,
  );
});

test("fact check passes writable claims and allows weak claims only in pending section", () => {
  const {
    buildFactCheckReport,
  } = require("./fact-check-whitepaper");
  const claimsArtifact = {
    claims: [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
      {
        id: "status:adp-test-policy-task:status",
        type: "status-field",
        subject: "status",
        entity: "保单任务",
        writable: false,
        status: "weak",
      },
    ],
  };
  const markdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 任务列表",
    "保单任务模块提供任务列表，用于查看保单任务。",
    "## 待确认事项",
    "status 字段含义仍需结合页面流程确认。",
    "",
  ].join("\n");

  const report = buildFactCheckReport({ markdown, claimsArtifact });

  assert.equal(report.canFinalize, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.pendingReferences.length, 1);
  assert.ok(report.supported.some((item) => item.claimId === "function:保单任务:任务列表"));
  assert.equal(report.metrics.writableClaimCoverageRatio, 1);
  assert.deepEqual(report.missingWritableClaimIds, []);
});

test("fact check blocks low writable claim coverage", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = {
    claims: [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
      {
        id: "function:保单任务:任务详情",
        type: "function-presence",
        subject: "任务详情",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
    ],
  };
  const markdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 任务列表",
    "保单任务模块提供任务列表。任务列表用于查看保单任务。",
    "",
  ].join("\n");

  const report = buildFactCheckReport({
    markdown,
    claimsArtifact,
    minWritableClaimCoverage: 0.8,
  });

  assert.equal(report.canFinalize, false);
  assert.ok(report.failures.some((item) => /Writable claim coverage/.test(item)));
  assert.equal(report.metrics.writableClaimCoverageRatio, 0.5);
  assert.deepEqual(report.coveredWritableClaimIds, ["function:保单任务:任务列表"]);
  assert.deepEqual(report.missingWritableClaimIds, ["function:保单任务:任务详情"]);
});

test("fact check blocks unknown headings and weak body assertions", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = {
    claims: [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
      {
        id: "status:adp-test-policy-task:status",
        type: "status-field",
        subject: "status",
        entity: "保单任务",
        writable: false,
        status: "weak",
      },
    ],
  };
  const markdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 自动理赔审批",
    "保单任务会根据 status 自动完成理赔审批。",
    "",
  ].join("\n");

  const report = buildFactCheckReport({ markdown, claimsArtifact });

  assert.equal(report.canFinalize, false);
  assert.ok(report.failures.some((item) => /Unsupported headings/.test(item)));
  assert.ok(report.failures.some((item) => /Non-writable claims/.test(item)));
  assert.equal(report.unsupportedHeadings[0].term, "自动理赔审批");
  assert.equal(report.nonWritableAssertions[0].term, "status");
  assert.equal(report.weakAssertions[0].term, "status");
});

test("fact check rejects unknown and non-writable explicit claim references", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = {
    claims: [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
      {
        id: "entity:adp-test-policy-task",
        type: "business-entity",
        subject: "保单任务",
        writable: false,
        status: "weak",
      },
    ],
  };
  const markdown = [
    "### 任务列表",
    "任务列表已取证。[claim:function:保单任务:任务列表]",
    "保单任务实体待确认。[claim:entity:adp-test-policy-task]",
    "未知引用。[claim:missing:claim]",
    "",
  ].join("\n");

  const report = buildFactCheckReport({ markdown, claimsArtifact });

  assert.equal(report.canFinalize, false);
  assert.deepEqual(report.unknownClaimRefs, ["missing:claim"]);
  assert.deepEqual(report.nonWritableClaimRefs, ["entity:adp-test-policy-task"]);
  assert.deepEqual(report.coveredWritableClaimIds, ["function:保单任务:任务列表"]);
});

test("run fact check writes report and requires verified claims object", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-check-run-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    ["### 任务列表", "保单任务模块提供任务列表。"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify({
      claims: [
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          writable: true,
          status: "confirmed",
        },
      ],
    }),
    "utf8",
  );

  const report = runFactCheck({ inputDir: dir });

  assert.equal(report.canFinalize, true);
  assert.equal(fs.existsSync(path.join(dir, "fact-check-report.json")), true);
  fs.writeFileSync(path.join(dir, "verified-claims.json"), "[]", "utf8");
  assert.throws(
    () => runFactCheck({ inputDir: dir }),
    /Verified claims must be a JSON object/,
  );
});

test("truth readiness passes only when evidence claims fact-check and narrative gates pass", () => {
  const { buildTruthReadinessReport, normalizeThreshold } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: {
        canFinalize: true,
        menuCoverage: 1,
        corePageScreenshotCoverage: 1,
        coreFunctionClassificationCoverage: 1,
        writeOperationSafetyCompliance: 1,
        unverifiedContentLabeling: 1,
        coreConclusionTraceability: 1,
        failures: [],
      },
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: {
        rules: {
          lowConfidenceNotWritable: true,
          databaseOnlyNotConfirmed: true,
          databaseOnlyNotWritable: true,
        },
        metrics: {
          claimCount: 2,
          writableClaimCount: 1,
          confirmedCount: 1,
          inferredCount: 0,
          weakCount: 0,
          databaseOnlyClaimCount: 1,
        },
        writableClaimIds: ["function:保单任务:任务列表"],
      },
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: {
        canFinalize: true,
        failures: [],
        metrics: {
          claimCount: 1,
          writableClaimCount: 1,
          checkedAssertions: 1,
          supportedAssertions: 1,
          supportedRatio: 1,
          coveredWritableClaimCount: 1,
          missingWritableClaimCount: 0,
          writableClaimCoverageRatio: 1,
          minWritableClaimCoverage: 0.8,
        },
      },
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: { canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } },
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(normalizeThreshold(95), 0.95);
  assert.equal(report.scorePercent, 100);
  assert.equal(report.canSubmitReview, true);
  assert.equal(report.gates.database.available, false);
  assert.ok(report.improvementActions.some((item) => item.id === "database.optional-profile"));
});

test("truth readiness blocks missing writable claims and writes report", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-readiness-"));
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify({
      canFinalize: true,
      menuCoverage: 1,
      corePageScreenshotCoverage: 1,
      coreFunctionClassificationCoverage: 1,
      writeOperationSafetyCompliance: 1,
      unverifiedContentLabeling: 1,
      coreConclusionTraceability: 1,
      failures: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify({
      rules: {
        lowConfidenceNotWritable: true,
        databaseOnlyNotConfirmed: true,
        databaseOnlyNotWritable: true,
      },
      metrics: { claimCount: 1, writableClaimCount: 0, confirmedCount: 1, inferredCount: 0 },
      writableClaimIds: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: true,
      failures: [],
      metrics: {
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 1,
        missingWritableClaimCount: 0,
        writableClaimCoverageRatio: 1,
        minWritableClaimCoverage: 0.8,
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-quality-report.json"),
    JSON.stringify({ canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } }),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(fs.existsSync(path.join(dir, "truth-readiness-report.json")), true);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.blockers.some((item) => item.id === "claims.missing-writable"));
  assert.ok(report.blockers.some((item) => item.rerunNodes.includes("truth-readiness")));
});

test("truth readiness blocks incomplete verified claim boundary rules", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: {
        canFinalize: true,
        menuCoverage: 1,
        corePageScreenshotCoverage: 1,
        coreFunctionClassificationCoverage: 1,
        writeOperationSafetyCompliance: 1,
        unverifiedContentLabeling: 1,
        coreConclusionTraceability: 1,
        failures: [],
      },
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: {
        rules: { lowConfidenceNotWritable: true, databaseOnlyNotConfirmed: true },
        metrics: { claimCount: 1, writableClaimCount: 1, confirmedCount: 1, inferredCount: 0, weakCount: 0 },
        writableClaimIds: ["function:保单任务:任务列表"],
      },
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: {
        canFinalize: true,
        failures: [],
        metrics: {
          claimCount: 1,
          writableClaimCount: 1,
          checkedAssertions: 1,
          supportedAssertions: 1,
          supportedRatio: 1,
          coveredWritableClaimCount: 1,
          missingWritableClaimCount: 0,
          writableClaimCoverageRatio: 1,
          minWritableClaimCoverage: 0.8,
        },
      },
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: { canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } },
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.claims.pass, false);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.claims.failures.some((item) => /boundary rules/.test(item)));
});

test("truth readiness blocks low writable claim coverage", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: {
        canFinalize: true,
        menuCoverage: 1,
        corePageScreenshotCoverage: 1,
        coreFunctionClassificationCoverage: 1,
        writeOperationSafetyCompliance: 1,
        unverifiedContentLabeling: 1,
        coreConclusionTraceability: 1,
        failures: [],
      },
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: {
        rules: {
          lowConfidenceNotWritable: true,
          databaseOnlyNotConfirmed: true,
          databaseOnlyNotWritable: true,
        },
        metrics: { claimCount: 2, writableClaimCount: 2, confirmedCount: 2, inferredCount: 0, weakCount: 0 },
        writableClaimIds: ["function:保单任务:任务列表", "function:保单任务:任务详情"],
      },
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: {
        canFinalize: false,
        failures: ["Writable claim coverage is below the required threshold."],
        missingWritableClaimIds: ["function:保单任务:任务详情"],
        metrics: {
          claimCount: 2,
          writableClaimCount: 2,
          checkedAssertions: 1,
          supportedAssertions: 1,
          supportedRatio: 1,
          coveredWritableClaimCount: 1,
          missingWritableClaimCount: 1,
          writableClaimCoverageRatio: 0.5,
          minWritableClaimCoverage: 0.8,
        },
      },
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: { canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } },
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.factCheck.pass, false);
  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.factCheck.metrics.writableClaimCoverageRatio, 0.5);
  assert.deepEqual(report.gates.factCheck.missingWritableClaimIds, ["function:保单任务:任务详情"]);
  assert.ok(report.blockers.some((item) => item.id === "fact-check.writable-coverage"));
  assert.ok(
    report.improvementActions.some(
      (item) =>
        item.id === "narrative.cover-missing-writable-claims" &&
        item.narrativePart === "function-sections" &&
        item.missingWritableClaimIds.includes("function:保单任务:任务详情"),
    ),
  );
});

test("package manifest whitelists only skill runtime assets", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"),
  );
  const files = packageJson.files || [];
  assert.match(
    packageJson.scripts?.["pack:check"] || "",
    /^npm pack --dry-run --json --cache \.npm-cache$/,
    "pack:check should remain the stable packaging self-check",
  );

  for (const requiredPath of [
    "SKILL.md",
    "agents/",
    "docs/narrative-guide.md",
    "evidence-schema.md",
    "explorer-guide.md",
    "form-fill-rules.md",
    "quality-checklist.md",
    "safety-rules.md",
    "whitepaper-template.md",
    "examples/",
    "scripts/build-database-model.js",
    "scripts/build-function-universe.js",
    "scripts/build-verified-claims.js",
    "scripts/check-batch-acceptance.js",
    "scripts/check-delivery-readiness.js",
    "scripts/check-real-run-readiness.js",
    "scripts/check-truth-readiness.js",
    "scripts/fact-check-whitepaper.js",
    "scripts/system-whitepaper-lib.js",
    "scripts/collect-database-profile.js",
    "scripts/doctor.js",
    "scripts/init-local-config.js",
    "scripts/run-whitepaper-batch.js",
    "scripts/run-whitepaper-pipeline.js",
    "scripts/run-phase3b.js",
    "scripts/run-batch-repair-queue.js",
    "scripts/run-repair-follow-up-loop.js",
    "scripts/run-local-e2e-smoke.js",
    "scripts/system-whitepaper.test.js",
    "scripts/local-dashboard/",
  ]) {
    assert.ok(files.includes(requiredPath), `${requiredPath} must remain packaged`);
  }

  for (const excludedPath of [
    "docs/",
    "scripts/",
    "docs/CODEX-INTEGRATION.md",
    "docs/CURSOR-TOKEN-OPTIMIZATION.md",
    "docs/OPERATION-GUIDE-OPTIMIZATION-PLAN.md",
    "docs/PILOT-ROADMAP.md",
    "docs/UNATTENDED-PIPELINE-ROADMAP.md",
    "docs/SCRIPTS-DEVELOPER-NOTES.md",
    "scripts/README.md",
    "config/",
  ]) {
    assert.equal(files.includes(excludedPath), false, `${excludedPath} should not be packaged`);
  }
});

test("npm pack dry-run excludes private and process-only assets", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const repoRoot = path.resolve(__dirname, "..");
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-npm-cache-"));
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

  const result = spawnSync(
    npmCmd,
    ["pack", "--dry-run", "--json", "--cache", cacheDir],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const pack = JSON.parse(result.stdout);
  const paths = new Set((pack[0]?.files || []).map((file) => file.path));

  for (const requiredPath of [
    "SKILL.md",
    "agents/openai.yaml",
    "docs/narrative-guide.md",
    "scripts/build-database-model.js",
    "scripts/build-function-universe.js",
    "scripts/build-verified-claims.js",
    "scripts/check-batch-acceptance.js",
    "scripts/check-delivery-readiness.js",
    "scripts/check-real-run-readiness.js",
    "scripts/check-truth-readiness.js",
    "scripts/fact-check-whitepaper.js",
    "scripts/system-whitepaper-lib.js",
    "scripts/collect-database-profile.js",
    "scripts/doctor.js",
    "scripts/init-local-config.js",
    "scripts/run-whitepaper-batch.js",
    "scripts/run-whitepaper-pipeline.js",
    "scripts/run-batch-repair-queue.js",
    "scripts/run-repair-follow-up-loop.js",
    "scripts/run-local-e2e-smoke.js",
    "scripts/system-whitepaper.test.js",
    "scripts/local-dashboard/server.js",
  ]) {
    assert.ok(paths.has(requiredPath), `${requiredPath} must be in npm pack output`);
  }

  const packageScriptEntrypoints = Object.values(packageJson.scripts || {})
    .flatMap((command) =>
      [...String(command).matchAll(/(?:^|\s)node\s+(scripts\/[^\s]+)/g)].map((match) =>
        match[1].replace(/\\/g, "/"),
      ),
    );
  for (const scriptPath of packageScriptEntrypoints) {
    assert.ok(paths.has(scriptPath), `${scriptPath} is referenced by package.json scripts`);
  }

  for (const forbiddenPattern of [
    /^node_modules\//,
    /^secrets\//,
    /^outputs\//,
    /^config\//,
    /^\.npm-cache\//,
    /^\.tmp\//,
    /^docs\/CODEX-INTEGRATION\.md$/,
    /^docs\/CURSOR-TOKEN-OPTIMIZATION\.md$/,
    /^docs\/OPERATION-GUIDE-OPTIMIZATION-PLAN\.md$/,
    /^docs\/PILOT-ROADMAP\.md$/,
    /^docs\/UNATTENDED-PIPELINE-ROADMAP\.md$/,
    /^docs\/SCRIPTS-DEVELOPER-NOTES\.md$/,
    /^scripts\/README\.md$/,
  ]) {
    const match = [...paths].find((packedPath) => forbiddenPattern.test(packedPath));
    assert.equal(match, undefined, `${match} should not be in npm pack output`);
  }
});

test("packed skill can load packaged entrypoints from extracted tarball", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const repoRoot = path.resolve(__dirname, "..");
  const tmpRoot = path.join(repoRoot, ".tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(tmpRoot, "pack-smoke-"));
  const cacheDir = path.join(workDir, "npm-cache");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  let tarballPath = null;

  try {
    const packResult = spawnSync(npmCmd, ["pack", "--cache", cacheDir], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(packResult.status, 0, packResult.stderr || packResult.stdout);
    const tarballName = packResult.stdout.trim().split(/\r?\n/).pop();
    assert.match(tarballName, /^system-whitepaper-skill-.*\.tgz$/);

    tarballPath = path.join(repoRoot, tarballName);
    const extractResult = spawnSync("tar", ["-xzf", tarballPath, "-C", workDir], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60_000,
    });
    assert.equal(extractResult.status, 0, extractResult.stderr || extractResult.stdout);
    const packageDir = path.join(workDir, "package");
    for (const relativePath of [
      "SKILL.md",
      "agents/openai.yaml",
      "scripts/build-database-model.js",
      "scripts/build-function-universe.js",
      "scripts/build-verified-claims.js",
      "scripts/check-batch-acceptance.js",
      "scripts/check-delivery-readiness.js",
      "scripts/check-real-run-readiness.js",
      "scripts/check-truth-readiness.js",
      "scripts/fact-check-whitepaper.js",
      "scripts/system-whitepaper-lib.js",
      "scripts/collect-database-profile.js",
      "scripts/doctor.js",
      "scripts/init-local-config.js",
      "scripts/sync-systems-registry.js",
      "scripts/run-phase3b.js",
      "scripts/run-whitepaper-batch.js",
      "scripts/run-whitepaper-pipeline.js",
      "scripts/local-dashboard/server.js",
    ]) {
      assert.equal(
        fs.existsSync(path.join(packageDir, relativePath)),
        true,
        `${relativePath} should exist in extracted package`,
      );
    }

    const requireEntrypoints = spawnSync(
      process.execPath,
      [
        "-e",
        [
          'require("./scripts/build-database-model");',
          'require("./scripts/build-function-universe");',
          'require("./scripts/build-verified-claims");',
          'require("./scripts/check-batch-acceptance");',
          'require("./scripts/check-delivery-readiness");',
          'require("./scripts/check-real-run-readiness");',
          'require("./scripts/check-truth-readiness");',
          'require("./scripts/fact-check-whitepaper");',
          'require("./scripts/system-whitepaper-lib");',
          'require("./scripts/collect-database-profile");',
          'require("./scripts/doctor");',
          'require("./scripts/init-local-config");',
          'require("./scripts/sync-systems-registry");',
          'require("./scripts/run-phase3b");',
          'require("./scripts/run-whitepaper-batch");',
          'require("./scripts/run-whitepaper-pipeline");',
          'require("./scripts/local-dashboard/server");',
        ].join(""),
      ],
      {
        cwd: packageDir,
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    assert.equal(requireEntrypoints.status, 0, requireEntrypoints.stderr || requireEntrypoints.stdout);
  } finally {
    if (tarballPath) {
      fs.rmSync(tarballPath, { force: true });
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

