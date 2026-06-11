const assert = require("node:assert/strict");
const test = require("node:test");

function spawnSyncSummary(result) {
  return [
    `status=${result.status}`,
    `signal=${result.signal || ""}`,
    `attempts=${result.spawnAttempts || 1}`,
    result.error ? `error=${result.error.code || result.error.name}: ${result.error.message}` : "",
    result.stderr ? `stderr=${String(result.stderr).slice(0, 2000)}` : "",
    result.stdout ? `stdout=${String(result.stdout).slice(0, 2000)}` : "",
  ].filter(Boolean).join("\n");
}

function runCliMainForTest(main, argv = []) {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const stdout = [];
  const stderr = [];
  process.argv = [process.execPath, "test-cli", ...argv];
  process.exitCode = undefined;
  console.log = (...args) => stdout.push(args.join(" "));
  console.error = (...args) => stderr.push(args.join(" "));
  process.exit = (code = 0) => {
    process.exitCode = typeof code === "number" ? code : Number(code) || 0;
    const error = new Error(`process.exit(${process.exitCode})`);
    error.testCliExit = true;
    throw error;
  };
  try {
    main();
    return {
      status: typeof process.exitCode === "number" ? process.exitCode : 0,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (error) {
    if (error.testCliExit) {
      return {
        status: typeof process.exitCode === "number" ? process.exitCode : 0,
        stdout: stdout.join("\n"),
        stderr: stderr.join("\n"),
      };
    }
    return {
      status: 1,
      stdout: stdout.join("\n"),
      stderr: [stderr.join("\n"), error.message].filter(Boolean).join("\n"),
      error,
    };
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
  }
}

async function runAsyncCliMainForTest(main, argv = []) {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const stdout = [];
  const stderr = [];
  process.argv = [process.execPath, "test-cli", ...argv];
  process.exitCode = undefined;
  console.log = (...args) => stdout.push(args.join(" "));
  console.error = (...args) => stderr.push(args.join(" "));
  process.exit = (code = 0) => {
    process.exitCode = typeof code === "number" ? code : Number(code) || 0;
    const error = new Error(`process.exit(${process.exitCode})`);
    error.testCliExit = true;
    throw error;
  };
  try {
    await main();
    return {
      status: typeof process.exitCode === "number" ? process.exitCode : 0,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (error) {
    if (error.testCliExit) {
      return {
        status: typeof process.exitCode === "number" ? process.exitCode : 0,
        stdout: stdout.join("\n"),
        stderr: stderr.join("\n"),
      };
    }
    return {
      status: 1,
      stdout: stdout.join("\n"),
      stderr: [stderr.join("\n"), error.message].filter(Boolean).join("\n"),
      error,
    };
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
  }
}

const {
  applyPageZoom,
  assertSafeWriteTarget,
  buildChromiumLaunchArgs,
  buildChromiumContextLaunchOptions,
  buildInspectionSurfaceDelta,
  buildInspectionSurfaceSnapshot,
  buildEvidenceSummary,
  buildQualityReport,
  classifyCaptureAction,
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
  mergeMenuMapEntries,
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

function buildFixtureWritableClaimFromMarkdown(markdown) {
  const bodyText = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
    .join(" ");
  if (bodyText.includes("任务列表")) {
    return {
      id: "function:保单任务:任务列表",
      subject: "任务列表",
      module: "保单任务",
      function: "任务列表",
    };
  }
  if (bodyText.includes("保单数据闭环管理")) {
    return {
      id: "function:系统定位:保单数据闭环管理",
      subject: "保单数据闭环管理",
      module: "系统定位",
      function: "保单数据闭环管理",
    };
  }
  if (bodyText.includes("业务白皮书内容")) {
    return {
      id: "function:系统定位:业务白皮书内容",
      subject: "业务白皮书内容",
      module: "系统定位",
      function: "业务白皮书内容",
    };
  }
  const chineseTerm = bodyText.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9]{2,15}/)?.[0];
  const asciiTerm = bodyText.match(/[A-Za-z][A-Za-z0-9 _.-]{2,40}/)?.[0]?.trim();
  const subject = chineseTerm || asciiTerm || "系统定位";
  return {
    id: `function:系统定位:${subject}`,
    subject,
    module: "系统定位",
    function: subject,
  };
}

function passingNarrativeMarkdown() {
  return [
    "# AI保单数据闭环平台功能白皮书",
    "",
    "## 1. 系统定位",
    "AI保单数据闭环平台用于支撑保单数据闭环管理，围绕保单任务的查询、跟踪和状态核对形成统一工作入口。",
    "系统定位说明覆盖业务目标、使用场景、数据处理边界和页面证据来源，便于后续审阅时区分已验证结论与待确认事项。",
    "",
    "## 2. 核心功能说明",
    "保单任务 > 任务列表入口与保单任务模块共同提供任务列表，用于查看保单任务、任务状态和处理进展。页面证据显示该模块以列表查询为主，并能观察到新增任务列表入口，因此适合归纳为只读核对、任务跟踪和待确认的新建表单检查能力。",
    "保单任务 > 任务列表模块的职责是围绕任务列表、新增任务列表等能力展开；该职责依据页面结构归纳，仍保留待业务确认边界。保单任务模块当前证据显示共 1 个菜单页，已采集 1 个，可作为页面证据覆盖范围说明。",
    "功能总结只写入当前证据能够支撑的内容，不把数据库字段或弱推理直接写成确定结论。",
    "用途总结聚焦已观察到的页面能力：一是帮助业务人员快速定位保单任务，二是辅助核对任务处理状态，三是为后续人工处理或问题排查提供页面入口。",
    "如果后续数据库画像显示存在任务表、状态字段或保单关联字段，这些内容只能作为解释业务对象的辅助证据，不能替代浏览器页面证据直接证明审批、写入或自动流转能力。",
    "",
    "## 3. 核心功能说明",
    "任务列表围绕保单任务对象展示任务状态、创建时间和处理进展，当前证据只支持查询、查看和只读核对，不支持写入型审批结论。",
    "",
    "## 4. 典型业务流程",
    "端到端业务处理链路为 partially-observed：1. 业务人员接收保单任务后，在保单任务模块按保单号、任务状态等条件定位任务对象；2. 任务列表展示状态、创建时间、处理进展等状态与质量信号，供人员判断是否需要继续处理；3. 已观察步骤包含新增任务列表，说明页面存在信息采集与提交入口，但保存后的跨模块顺序和未覆盖模块职责仍为证据约束推理；4. 保单任务模块与后续人工处理入口、问题排查页面协同，把异常状态或质量不通过结果传递给复核人员；5. 对未覆盖的详情处理、审批写入或后台自动流转，流程进入待确认边界，问题回流给业务人员补充取证或人工确认。",
    "流程说明依据菜单、页面、截图和任务列表证据组织，最终输出是保单任务状态核对结果；未被浏览器证据覆盖的审批、写入、自动处理和数据库关系不作为确认结论。",
  ].join("\n");
}

function passingUiOnlyNarrativeMarkdown() {
  return [
    "# AI保单数据闭环平台功能白皮书",
    "",
    "## 1. 系统定位",
    "AI保单数据闭环平台面向保单任务的页面化管理场景，当前证据能够确认的核心入口是保单任务菜单和任务列表页面。",
    "系统定位聚焦页面已观察到的查询、查看和核对能力，不把后台库表、隐藏逻辑或未打开的页面推断成已经确认的业务功能。",
    "",
    "## 2. 核心功能说明",
    "保单任务 > 任务列表入口与保单任务模块提供任务列表，用于承接保单任务的页面查询和结果查看。白皮书只把任务列表写成页面可见功能，并把用途限定在定位任务、查看列表结果、辅助业务人员继续处理这三个方向。",
    "保单任务 > 任务列表模块的职责是围绕任务列表、新增任务列表等能力展开；该职责来自页面结构归纳，仍需业务确认。保单任务模块当前证据显示共 1 个菜单页，已采集 1 个。",
    "功能总结依据菜单名称、页面入口和已采集截图组织，不写入未被页面证据覆盖的编辑、审批、自动流转或批量处理结论。",
    "用途总结强调该页面为业务人员提供统一入口：先进入保单任务菜单，再打开任务列表，再基于页面展示的结果判断下一步是否需要补充取证或人工处理。",
    "",
    "## 3. 核心功能说明",
    "任务列表把保单任务对象、处理状态和页面结果集中展示，适合描述为只读核对与问题识别入口。",
    "",
    "## 4. 典型业务流程",
    "端到端业务处理链路为 partially-observed：1. 业务人员围绕保单任务对象进入保单任务模块，使用保单号、处理状态等条件定位任务列表；2. 页面展示处理状态、创建时间和处理结果等状态/质量信号，帮助判断任务是否正常推进；3. 已观察步骤包含新增任务列表，说明页面存在信息采集与提交入口，但跨模块顺序或未覆盖模块职责仍为证据约束推理；4. 任务列表与后续人工处理入口、问题排查页面协同，异常状态或质量不通过结果需要传递给复核人员；5. 对详情页、弹窗处理、提交动作和自动流转尚未形成证据的部分，保持为待确认边界，并把问题回流到补采截图、按钮证据和安全操作记录。",
    "该流程写法保证白皮书的业务流程来自证据链，而不是根据系统名称、菜单名称或后台资料进行过度外推。",
  ].join("\n");
}

function passingTaskListOnlyNarrativeMarkdown() {
  return [
    "# AI保单数据闭环平台功能白皮书",
    "",
    "## 1. 系统定位",
    "AI保单数据闭环平台当前可确认的是任务列表只读核对场景，白皮书只写页面证据能够支持的查询、查看和结果核对能力。",
    "定位说明不把后台库表、隐藏规则或未打开页面推断为已确认业务功能。",
    "",
    "## 2. 核心功能说明",
    "任务列表用于承接页面查询和结果查看，业务价值限定在定位任务列表记录、查看列表结果、辅助人员继续处理三个方向。",
    "功能总结依据页面入口、查询字段和截图证据组织，不写入未验证的编辑、审批、自动流转或批量处理结论。",
    "",
    "## 3. 核心功能说明",
    "任务列表记录、处理结果和质量提示共同构成只读核对入口，适合描述为问题识别和人工复核前置能力。",
    "",
    "## 4. 典型业务流程",
    "端到端流程为：1. 业务人员围绕任务列表记录发起查询，使用列表提供的筛选条件定位对象；2. 页面展示处理结果、质量提示和核对结果，帮助判断记录是否正常推进；3. 列表页面与人工复核入口、问题排查页面协同，把异常结果或质量不通过信息传递给复核人员；4. 对详情处理、提交动作和自动流转尚未形成证据的部分，保持为待确认边界，并把问题回流到补采截图、按钮证据和安全操作记录。",
    "该流程只描述页面证据支持的任务列表核对闭环，未覆盖的后台规则和写入动作不作为确认结论。",
  ].join("\n");
}

function writePassingTruthReadinessReport(dir, overrides = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const {
    buildReadinessSourceArtifacts,
    loadReadinessInputs,
  } = require("./check-truth-readiness");
  const writeTextIfMissing = (fileName, value) => {
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, value, "utf8");
    }
  };
  writeTextIfMissing("whitepaper.pending-review.md", passingNarrativeMarkdown());
  writePassingTruthArtifacts(dir, {
    databaseProfile: overrides.requirements?.databaseEvidenceRequired ? true : false,
    requireDatabaseEvidence: overrides.requirements?.databaseEvidenceRequired === true,
    systemCode: overrides.system?.code,
    systemName: overrides.system?.name,
  });
  const baseGates = {
    evidence: { pass: true, scorePercent: 100 },
    workflow: { pass: true, scorePercent: 100, metrics: { operationFlowCount: 1, observedWorkflowStepCount: 1 } },
    businessProcess: { pass: true, scorePercent: 100 },
    whitepaperPlan: {
      pass: true,
      scorePercent: 100,
      metrics: {
        planPresent: true,
        requiredItemCount: 1,
        allowedFactCount: 1,
        pendingItemCount: 0,
        planRequiredCoverageRatio: 1,
        minPlanRequiredCoverage: 0.95,
      },
    },
    claims: { pass: true, scorePercent: 100 },
    factCheck: { pass: true, scorePercent: 100 },
    goldenEval: {
      pass: true,
      required: false,
      available: false,
      scorePercent: 100,
      metrics: {
        coverageRatio: 1,
        criticalCoverageRatio: 1,
        overclaimCount: 0,
      },
    },
    narrative: { pass: true, scorePercent: 100 },
    database: { pass: true, available: false, scorePercent: 0 },
    lineage: { pass: true, scorePercent: 100 },
  };
  const baseReport = {
    artifactType: "truth-readiness-report",
    version: 1,
    threshold: 0.95,
    score: 0.98,
    scorePercent: 98,
    canSubmitReview: true,
    canFinalize: true,
    requirements: { databaseEvidenceRequired: false, goldenEvalRequired: false },
    gates: baseGates,
    blockers: [],
    improvementActions: [],
    sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(dir)),
    generatedAt: "2026-05-20T00:00:00.000Z",
  };
  const report = {
    ...baseReport,
    ...overrides,
    requirements: {
      ...baseReport.requirements,
      ...(overrides.requirements || {}),
    },
    gates: {
      ...baseGates,
      ...(overrides.gates || {}),
    },
  };
  fs.writeFileSync(
    path.join(dir, "truth-readiness-report.json"),
    JSON.stringify(report),
    "utf8",
  );
  return report;
}

function writePassingTruthArtifacts(dir, options = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const {
    buildTruthReadinessReport,
    buildReadinessSourceArtifacts,
    loadReadinessInputs,
  } = require("./check-truth-readiness");
  const {
    buildFunctionUniverseArtifact,
    buildSourceArtifacts: buildUniverseSourceArtifacts,
  } = require("./build-function-universe");
  const {
    buildSourceArtifacts: buildClaimSourceArtifacts,
    buildVerifiedClaimsArtifact,
  } = require("./build-verified-claims");
  const { buildBusinessProcessModelFromDir } = require("./build-business-process-model");
  const { buildWhitepaperPlanFromDir } = require("./build-whitepaper-plan");
  const { buildDatabaseModelFromDir } = require("./build-database-model");
  const { buildQualitySourceArtifacts } = require("./check-quality");
  if (!fs.existsSync(path.join(dir, "whitepaper.pending-review.md"))) {
    fs.writeFileSync(
      path.join(dir, "whitepaper.pending-review.md"),
      passingNarrativeMarkdown(),
      "utf8",
    );
  }
  const fixtureClaim = buildFixtureWritableClaimFromMarkdown(
    fs.readFileSync(path.join(dir, "whitepaper.pending-review.md"), "utf8"),
  );
  if (!fs.existsSync(path.join(dir, "evidence.json"))) {
    const menuPath = `${fixtureClaim.module} > ${fixtureClaim.function}`;
    const screenshotId = `${fixtureClaim.id}:screenshot`;
    fs.writeFileSync(
      path.join(dir, "evidence.json"),
      JSON.stringify({
        systemInfo: {
          code: options.systemCode || "adp",
          name: options.systemName || "AI保单数据闭环平台",
        },
        menuMap: [{ title: fixtureClaim.function, menuPath, status: "visited", url: "/policy-task" }],
        pageInventory: [
          {
            id: "policy-task",
            type: "page",
            title: fixtureClaim.function,
            menuPath,
            url: "/policy-task",
            screenshot: `${fixtureClaim.function}.png`,
            evidenceRefs: [screenshotId],
          },
        ],
        screenshotIndex: [
          {
            id: screenshotId,
            file: `${fixtureClaim.function}.png`,
            module: fixtureClaim.module,
            function: fixtureClaim.function,
            caption: fixtureClaim.function,
          },
        ],
        actionInventory: [{ pageId: "policy-task", name: "查询", function: fixtureClaim.function, type: "query" }],
        formInventory: [{ pageId: "policy-task", fields: [{ label: fixtureClaim.function }] }],
        tableInventory: [{ pageId: "policy-task", columns: [fixtureClaim.function] }],
        unverifiedContentLabeling: 1,
        coreConclusionTraceability: 1,
      }),
      "utf8",
    );
  }
  const evidenceSummaryPath = path.join(dir, "evidence-summary.json");
  const evidenceSummary = buildEvidenceSummary(JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8")));
  fs.writeFileSync(evidenceSummaryPath, JSON.stringify(evidenceSummary), "utf8");
  writeOperationSpecFixture(dir, {
    system: { code: options.systemCode || "adp", name: options.systemName || "AI保单数据闭环平台", operationGuideMinMenus: 1 },
  });
  const currentEvidence = JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8"));
  const currentEvidenceSummary = JSON.parse(fs.readFileSync(evidenceSummaryPath, "utf8"));
  const { buildWorkflowSpecFromDir } = require("./build-workflow-spec");
  buildWorkflowSpecFromDir(dir, { generatedAt: "2026-06-03T00:00:30.000Z" });
  const qualityMetrics = computeEvidenceMetrics(currentEvidence);
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify({
      ...buildQualityReport({
        ...qualityMetrics,
        blockedItems: currentEvidence.blockedItems || [],
      }),
      counts: qualityMetrics.counts,
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath: path.join(dir, "evidence.json"),
        evidenceSummaryPath,
        operationSpecPath: path.join(dir, "operation-spec.json"),
        operationGuideGatePath: path.join(dir, "operation-guide-gate.json"),
      }),
    }),
    "utf8",
  );
  const databaseProfilePath = path.join(dir, "database-profile.json");
  if (options.databaseProfile !== false) {
    fs.writeFileSync(
      databaseProfilePath,
      JSON.stringify({
        artifactType: "database-profile",
        system: { code: options.systemCode || "adp", name: options.systemName || "AI保单数据闭环平台" },
        tables: [
          {
            schema: "adp_test",
            name: "policy_task",
            comment: fixtureClaim.function,
            rowCount: 12,
            columns: [
              { name: "id", type: "bigint", comment: "主键", primaryKey: true },
              { name: "policy_no", type: "varchar", comment: "保单号" },
              { name: "created_time", type: "datetime", comment: "创建时间" },
            ],
          },
        ],
        safety: { secretRedacted: true },
      }),
      "utf8",
    );
  }
  const dataDictionaryPath = path.join(dir, "data-dictionary.json");
  const entityModelPath = path.join(dir, "entity-model.json");
  if (options.databaseProfile === false) {
    for (const filePath of [databaseProfilePath, dataDictionaryPath, entityModelPath]) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } else {
    buildDatabaseModelFromDir(dir, { generatedAt: "2026-06-03T00:00:00.000Z" });
  }
  const functionUniversePath = path.join(dir, "function-universe.json");
  const readOptionalJson = (filePath) => fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : {};
  const functionUniverse = buildFunctionUniverseArtifact({
    evidenceSummary: currentEvidenceSummary,
    databaseProfile: readOptionalJson(databaseProfilePath),
    entityModel: readOptionalJson(entityModelPath),
    operationSpec: readOptionalJson(path.join(dir, "operation-spec.json")),
    sourceArtifacts: buildUniverseSourceArtifacts({
      evidenceSummary: evidenceSummaryPath,
      databaseProfile: databaseProfilePath,
      entityModel: entityModelPath,
      operationSpec: path.join(dir, "operation-spec.json"),
    }),
    generatedAt: "2026-06-03T00:00:00.000Z",
  });
  fs.writeFileSync(functionUniversePath, JSON.stringify(functionUniverse), "utf8");
  const verifiedClaims = buildVerifiedClaimsArtifact({
    functionUniverse: JSON.parse(fs.readFileSync(functionUniversePath, "utf8")),
    sourceArtifacts: buildClaimSourceArtifacts({ functionUniversePath }),
    generatedAt: "2026-06-03T00:00:30.000Z",
  });
  fs.writeFileSync(path.join(dir, "verified-claims.json"), JSON.stringify(verifiedClaims), "utf8");
  buildBusinessProcessModelFromDir(dir, { generatedAt: "2026-06-03T00:00:40.000Z" });
  buildWhitepaperPlanFromDir(dir, { generatedAt: "2026-06-03T00:00:45.000Z" });
  const writableClaimLines = verifiedClaims.claims
    .filter((claim) => claim.writable)
    .map((claim) => `${claim.module || claim.subject || ""} ${claim.subject || claim.function || claim.entity || ""} [claim:${claim.id}]`);
  const pendingReviewPath = path.join(dir, "whitepaper.pending-review.md");
  const pendingReview = fs.readFileSync(pendingReviewPath, "utf8");
  fs.writeFileSync(
    pendingReviewPath,
    [pendingReview, "", "## 5. 已验证声明索引", ...writableClaimLines].join("\n"),
    "utf8",
  );
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });
  const report = buildTruthReadinessReport({
    artifacts: loadReadinessInputs(dir),
    threshold: 0.95,
    requireDatabaseEvidence: options.requireDatabaseEvidence === true,
    expectedSystem: { code: options.systemCode || "adp", name: options.systemName || "AI保单数据闭环平台" },
    generatedAt: "2026-06-03T00:01:00.000Z",
  });
  assert.equal(report.canSubmitReview, true);
  assert.equal(report.gates.lineage.pass, true);
  assert.deepEqual(report.sourceArtifacts, buildReadinessSourceArtifacts(loadReadinessInputs(dir)));
  fs.writeFileSync(path.join(dir, "truth-readiness-report.json"), JSON.stringify(report), "utf8");
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

test("mergeFrameSnapshots preserves home overview cards across frame snapshots", () => {
  const merged = mergeFrameSnapshots([
    {
      title: "首页",
      url: "https://example.test/",
      buttons: [],
      forms: [],
      tables: [],
      links: [],
      overviewCards: [
        {
          title: "业务流程",
          items: [{ title: "需求输出", description: "需求文档输出" }],
        },
      ],
      landmarks: [],
    },
    {
      title: "",
      url: "",
      buttons: [],
      forms: [],
      tables: [],
      links: [],
      overviewCards: [
        {
          title: "任务流程",
          items: [{ title: "数据同步 Skill", description: "自动化同步流程" }],
        },
      ],
      landmarks: [],
    },
  ]);

  assert.equal(merged.overviewCards.length, 2);
  assert.equal(merged.overviewCards[0].items[0].title, "需求输出");
  assert.equal(merged.overviewCards[1].title, "任务流程");
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

test("classifyCaptureAction separates flow starts progress read detail navigation unsafe and unknown actions", () => {
  assert.deepEqual(classifyCaptureAction({ text: "新建AI任务", role: "button" }), {
    class: "flow-start",
    safeToClick: true,
    reason: "business-flow-entry",
    text: "新建AI任务",
  });
  assert.equal(classifyCaptureAction({ text: "下一步", role: "button" }).class, "flow-progress");
  assert.equal(classifyCaptureAction({ text: "查看详情", role: "button" }).class, "read-detail");
  assert.equal(classifyCaptureAction({ text: "任务页签", role: "tab" }).class, "navigation");
  assert.equal(classifyCaptureAction({ text: "删除", role: "button" }).safeToClick, false);
  assert.equal(classifyCaptureAction({ text: "刷新", role: "button" }).class, "unknown");
});

test("buildInspectionSurfaceDelta rejects url-only changes and keeps only business deltas", () => {
  const beforeSnapshot = {
    url: "https://sit-adp.hzins.com/#/tasks",
    forms: [{ formName: "查询", fields: [{ label: "保险公司" }] }],
    buttons: ["查询", "重置", "新建AI任务"],
    tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
  };

  assert.equal(
    buildInspectionSurfaceDelta({
      action: classifyCaptureAction({ text: "新建AI任务", role: "button" }),
      beforeSnapshot,
      afterSnapshot: { ...beforeSnapshot, url: "https://sit-adp.hzins.com/#/tasks?x=1" },
    }).valid,
    false,
  );

  const delta = buildInspectionSurfaceDelta({
    action: classifyCaptureAction({ text: "新建AI任务", role: "button" }),
    beforeSnapshot,
    afterSnapshot: {
      url: beforeSnapshot.url,
      forms: [
        {
          formName: "定义参数",
          fields: [
            { label: "保险公司", type: "select", required: true },
            { label: "接口方式", type: "select", required: true },
          ],
        },
      ],
      buttons: ["上一步", "下一步", "保存"],
      tables: [],
    },
  });

  assert.equal(delta.valid, true);
  assert.deepEqual(delta.forms[0].fields.map((field) => field.label), ["接口方式"]);
  assert.deepEqual(delta.buttons, ["上一步", "下一步", "保存"]);
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
    triggerLabel: "新增合同",
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
  assert.equal(evidence.pageInventory[0].triggerLabel, "新增合同");
  assert.equal(evidence.actionInventory.length, 2);
  assert.equal(evidence.formInventory[0].formName, "新增合同表单");
  assert.equal(evidence.screenshotIndex[0].caption, "新增合同弹窗。");
});

test("buildInspectionSurfaceSnapshot captures page-level form surfaces after safe clicks", () => {
  const snapshot = buildInspectionSurfaceSnapshot({
    candidateText: "新建AI任务",
    beforeSnapshot: {
      url: "https://sit-adp.hzins.com/",
      forms: [{ formName: "查询表单", fields: [{ label: "保险公司" }] }],
      buttons: ["查询", "重置", "新建AI任务"],
      tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
    },
    afterSnapshot: {
      title: "AI保单数据闭环平台",
      url: "https://sit-adp.hzins.com/",
      forms: [
        {
          formName: "任务配置",
          fields: [
            { label: "保险公司", type: "select", required: true },
            { label: "接口方式", type: "select", required: true },
            { label: "需求文档", type: "textarea", required: true },
          ],
        },
      ],
      buttons: ["上一步", "下一步", "保存"],
      tables: [],
    },
  });

  assert.equal(snapshot.type, "container");
  assert.equal(snapshot.triggerLabel, "新建AI任务");
  assert.equal(snapshot.title, "新建AI任务");
  assert.deepEqual(snapshot.forms[0].fields.map((field) => field.label), ["接口方式", "需求文档"]);
  assert.deepEqual(snapshot.buttons, ["上一步", "下一步", "保存"]);
});

test("buildInspectionSurfaceSnapshot ignores unchanged list pages after safe clicks", () => {
  const beforeSnapshot = {
    url: "https://sit-adp.hzins.com/",
    forms: [{ formName: "查询表单", fields: [{ label: "保险公司" }] }],
    buttons: ["查询", "重置", "新建AI任务"],
    tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
  };

  assert.equal(
    buildInspectionSurfaceSnapshot({
      candidateText: "新建AI任务",
      beforeSnapshot,
      afterSnapshot: JSON.parse(JSON.stringify(beforeSnapshot)),
    }),
    null,
  );
});

test("buildInspectionSurfaceSnapshot ignores url-only changes without surface delta", () => {
  const beforeSnapshot = {
    url: "https://sit-adp.hzins.com/#/tasks",
    forms: [{ formName: "查询表单", fields: [{ label: "保险公司" }] }],
    buttons: ["查询", "重置", "新建AI任务"],
    tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
  };
  const afterSnapshot = {
    ...JSON.parse(JSON.stringify(beforeSnapshot)),
    url: "https://sit-adp.hzins.com/#/tasks?refresh=1",
  };

  assert.equal(
    buildInspectionSurfaceSnapshot({
      candidateText: "新建AI任务",
      beforeSnapshot,
      afterSnapshot,
    }),
    null,
  );
});

test("buildInspectionSurfaceSnapshot keeps only delta fields and flow buttons", () => {
  const snapshot = buildInspectionSurfaceSnapshot({
    candidateText: "新建AI任务",
    beforeSnapshot: {
      url: "https://sit-adp.hzins.com/#/tasks",
      forms: [{ formName: "查询表单", fields: [{ label: "保险公司" }] }],
      buttons: ["查询", "重置", "新建AI任务"],
      tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
    },
    afterSnapshot: {
      url: "https://sit-adp.hzins.com/#/tasks",
      forms: [
        {
          formName: "任务配置",
          fields: [
            { label: "保险公司", type: "select" },
            { label: "接口方式", type: "select" },
            { label: "需求文档", type: "textarea" },
          ],
        },
      ],
      buttons: ["查询", "下一步", "保存"],
      tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
    },
  });

  assert.deepEqual(snapshot.forms[0].fields.map((field) => field.label), ["接口方式", "需求文档"]);
  assert.deepEqual(snapshot.buttons, ["下一步", "保存"]);
  assert.equal(snapshot.tables.length, 0);
  assert.equal(snapshot.captureScope, "page-delta");
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

test("home overview cards are preserved as evidence without creating write actions", () => {
  const evidence = createInitialEvidence({
    code: "finance",
    name: "财务费用系统",
    url: "https://finance.example.test/",
  });

  mergePageSnapshotIntoEvidence(evidence, {
    id: "page-home",
    menuPath: "首页",
    type: "home",
    title: "财务费用系统",
    url: "https://finance.example.test/",
    links: [],
    buttons: ["退出"],
    overviewCards: [
      {
        title: "业务流程",
        items: [
          { title: "费用申请", description: "员工提交费用报销申请" },
          { title: "预算校验", description: "系统校验预算和科目" },
          { title: "财务复核", description: "财务人员复核报销材料" },
        ],
      },
      {
        title: "任务流程",
        items: [
          { title: "待办处理", description: "处理待审批和待复核任务" },
        ],
      },
    ],
    screenshot: {
      id: "shot-home",
      file: "screenshots/home.png",
      caption: "首页截图。",
      module: "首页",
      function: "系统入口",
    },
  });

  assert.equal(evidence.pageInventory[0].overviewCards.length, 2);
  assert.equal(evidence.pageInventory[0].overviewCards[0].items[0].title, "费用申请");
  assert.equal(evidence.actionInventory.some((item) => item.name === "费用申请"), false);
  const summary = buildEvidenceSummary(evidence);
  assert.equal(summary.homeOverview.cards.length, 2);
  assert.equal(summary.homeOverview.cards[0].items.length, 3);
});

test("operation spec derives bounded portal workflow modules from home overview cards", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const evidence = createInitialEvidence({
    code: "finance",
    name: "财务费用系统",
    url: "https://finance.example.test/",
  });
  mergePageSnapshotIntoEvidence(evidence, {
    id: "page-home",
    menuPath: "首页",
    type: "home",
    title: "财务费用系统",
    url: "https://finance.example.test/",
    links: [],
    buttons: ["退出"],
    overviewCards: [
      {
        title: "业务流程",
        items: [
          { title: "费用申请", description: "员工提交费用报销申请" },
          { title: "预算校验", description: "系统校验预算和科目" },
          { title: "财务复核", description: "财务人员复核报销材料" },
          { title: "付款归档", description: "完成付款并归档凭证" },
        ],
      },
      {
        title: "任务流程",
        items: [
          { title: "待办处理", description: "处理待审批和待复核任务" },
          { title: "异常退回", description: "材料不完整时退回补充" },
        ],
      },
    ],
    screenshot: {
      id: "shot-home",
      file: "screenshots/home.png",
      caption: "首页截图。",
      module: "首页",
      function: "系统入口",
    },
  });

  const evidenceSummary = buildEvidenceSummary(evidence);
  const { spec, gate } = buildOperationSpec({
    evidence,
    evidenceSummary,
    system: {
      code: "finance",
      name: "财务费用系统",
      operationGuideMinMenus: 2,
    },
  });

  const portalModules = spec.modules.filter((module) => module.source === "home-overview-card");
  assert.equal(portalModules.length, 6);
  assert.equal(portalModules[0].coreBusinessModule, true);
  assert.equal(portalModules[0].flows[0].status, "inferred-from-home-overview");
  assert.match(portalModules[0].flows[0].reason, /首页流程卡片/);
  assert.ok(portalModules[0].screenshots.includes("screenshots/home.png"));
  assert.equal(gate.canComposeGuide, true);
  assert.equal(spec.metrics.moduleCount, 6);
  assert.equal(spec.positioning.sources.some((item) => item.type === "homepage-overview-cards"), true);
});

test("V6 non-ADP portal home overview flows stay generic and inferred", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const scenarios = [
    {
      code: "finance",
      name: "财务费用系统",
      cardTitle: "业务流程",
      items: ["费用申请", "预算校验", "财务复核", "付款归档"],
    },
    {
      code: "hr",
      name: "人力资源系统",
      cardTitle: "入职流程",
      items: ["入职申请", "资料审核", "账号开通", "入职归档"],
    },
    {
      code: "foundation",
      name: "内部基础服务系统",
      cardTitle: "权限流程",
      items: ["权限申请", "负责人审批", "权限开通", "到期复核"],
    },
  ];

  for (const scenario of scenarios) {
    const evidence = createInitialEvidence({
      code: scenario.code,
      name: scenario.name,
      url: `https://${scenario.code}.example.test/`,
    });
    mergePageSnapshotIntoEvidence(evidence, {
      id: `page-home-${scenario.code}`,
      menuPath: "首页",
      type: "home",
      title: scenario.name,
      url: `https://${scenario.code}.example.test/`,
      links: [],
      buttons: ["退出"],
      overviewCards: [
        {
          title: scenario.cardTitle,
          items: scenario.items.map((item) => ({
            title: item,
            description: `${item}环节`,
          })),
        },
      ],
      screenshot: {
        id: `shot-home-${scenario.code}`,
        file: `screenshots/${scenario.code}-home.png`,
        caption: `${scenario.name}首页截图。`,
        module: "首页",
        function: "系统入口",
      },
    });

    const evidenceSummary = buildEvidenceSummary(evidence);
    const { spec } = buildOperationSpec({
      evidence,
      evidenceSummary,
      system: {
        code: scenario.code,
        name: scenario.name,
        operationGuideMinMenus: 1,
      },
    });
    const workflowSpec = buildWorkflowSpec({
      operationSpec: spec,
      generatedAt: "2026-06-11T00:00:00.000Z",
    });
    const portalModules = spec.modules.filter((module) => module.source === "home-overview-card");

    assert.equal(evidenceSummary.homeOverview.cards.length, 1);
    assert.equal(portalModules.length, scenario.items.length);
    assert.equal(spec.metrics.flowCount, scenario.items.length);
    assert.equal(spec.metrics.writeActionCount || 0, 0);
    assert.equal(workflowSpec.metrics.observedWorkflowCount, 0);
    assert.equal(workflowSpec.metrics.inferredWorkflowCount, scenario.items.length);
    assert.equal(workflowSpec.metrics.homeOverviewWorkflowCount, scenario.items.length);
    assert.equal(workflowSpec.metrics.narratableWorkflowCount, scenario.items.length);
    assert.equal(
      workflowSpec.workflows.every((workflow) =>
        workflow.evidenceStatus === "inferred" &&
        workflow.canNarrateAsObserved === false &&
        workflow.canNarrateAsInferred === true &&
        workflow.boundaries.length > 0,
      ),
      true,
    );
  }
});

test("home overview text parser extracts portal flow cards from visible homepage text", () => {
  const { extractHomeOverviewCardsFromText } = require("./collect-evidence");
  const cards = extractHomeOverviewCardsFromText(
    [
      "AI保单数据闭环平台",
      "业务流程",
      "需求输出",
      "需求文档输出 配置任务生成 数据同步性能",
      "需求验证",
      "测试用例执行 业务确认",
      "需求验收",
      "验收报告输出 下载 发布配置启用",
      "数据监控",
      "监控生产异常数据 无数据管理",
      "任务流程",
      "需求分析 Skill",
      "智能分析业务需求 自动生成配置方案",
      "数据同步 Skill",
      "智能数据映射 自动化同步流程",
    ].join(" "),
  );

  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "业务流程");
  assert.deepEqual(cards[0].items.slice(0, 2).map((item) => item.title), ["需求输出", "需求验证"]);
  assert.equal(cards[1].title, "任务流程");
  assert.equal(cards[1].items[0].title, "需求分析 Skill");
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

test("buildQualityReport ignores obsolete initial exploration blocker after evidence exists", () => {
  const report = buildQualityReport({
    menuCoverage: 1,
    corePageScreenshotCoverage: 1,
    coreFunctionClassificationCoverage: 1,
    writeOperationSafetyCompliance: 1,
    unverifiedContentLabeling: 1,
    coreConclusionTraceability: 1,
    counts: {
      visitedMenus: 4,
      pages: 4,
      actions: 52,
    },
    blockedItems: [
      {
        severity: "P0",
        reason: "尚未执行 Playwright 页面探索",
        resolved: false,
      },
    ],
  });

  assert.equal(report.canFinalize, true);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.blockingIssues, []);
});

test("check-quality filters initial Playwright blocker when operation spec recovered surfaces", () => {
  const { filterObsoleteQualityBlockedItems } = require("./check-quality");
  const blockedItems = [
    { severity: "P0", reason: "尚未执行 Playwright 页面探索", resolved: false },
    { severity: "P1", reason: "保留的真实问题", resolved: false },
  ];

  assert.deepEqual(
    filterObsoleteQualityBlockedItems(
      blockedItems,
      { gate: { canComposeGuide: true }, metrics: { moduleCount: 4, screenshotCount: 4 } },
      null,
    ),
    [{ severity: "P1", reason: "保留的真实问题", resolved: false }],
  );
  assert.deepEqual(filterObsoleteQualityBlockedItems(blockedItems, null, null), blockedItems);
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
  const { readOperationGuideGate } = require("./check-quality");
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

  assert.throws(
    () => readOperationGuideGate(path.join(dir, "operation-guide-gate.json")),
    /Operation guide gate is malformed/,
  );
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

test("syncWhitepaperNamedArtifacts can skip final display artifact", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { syncWhitepaperNamedArtifacts } = require("./system-whitepaper-lib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-sync-skip-final-"));
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), "# pending", "utf8");
  fs.writeFileSync(path.join(dir, "whitepaper.final.md"), "# final", "utf8");

  const named = syncWhitepaperNamedArtifacts({
    systemOutput: dir,
    systemName: "试点系统",
    date: "2026-05-21T08:00:00.000Z",
    syncFinal: false,
  });

  assert.equal(named.pendingReview, "试点系统_系统功能白皮书_20260521_待审.md");
  assert.equal(named.final, "");
  assert.ok(fs.existsSync(path.join(dir, named.pendingReview)));
  assert.equal(fs.existsSync(path.join(dir, "试点系统_系统功能白皮书_20260521.md")), false);
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

test("build evidence summary recovers sparse evidence from operation spec", () => {
  const { mergeOperationSpecIntoEvidenceSummary } = require("./build-evidence-summary");
  const sparseSummary = buildEvidenceSummary({
    systemInfo: {
      code: "adp",
      name: "AI保单数据闭环平台",
      testUrl: "https://sit-adp.hzins.com/",
    },
    menuMap: [],
    pageInventory: [],
    actionInventory: [],
    formInventory: [],
    tableInventory: [],
    screenshotIndex: [],
  });
  const recovered = mergeOperationSpecIntoEvidenceSummary(sparseSummary, {
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    testUrl: "https://sit-adp.hzins.com/",
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」菜单",
        businessHint: "用于查看和处理保单数据闭环任务。",
        list: {
          columns: ["任务编号", "保单号", "处理状态"],
          queryFields: ["任务编号", "保单号"],
          rowActions: ["查询", "查看"],
        },
        screenshots: ["screenshots/ai-task.png"],
        flows: [{ name: "任务查询", steps: ["进入菜单", "输入条件", "查看结果"] }],
      },
    ],
  });

  assert.equal(recovered.system.code, "adp");
  assert.equal(recovered.modules[0].name, "AI任务管理");
  assert.equal(recovered.functions[0].menuPath, "左侧「AI任务管理」菜单");
  assert.deepEqual(recovered.functions[0].tableColumns, ["任务编号", "保单号", "处理状态"]);
  assert.deepEqual(recovered.functions[0].queryFields, ["任务编号", "保单号"]);
  assert.equal(recovered.screenshots[0].file, "screenshots/ai-task.png");
  assert.equal(recovered.metrics.counts.pages, 1);
});

test("build evidence summary ignores missing operation spec recovery input", () => {
  const { mergeOperationSpecIntoEvidenceSummary } = require("./build-evidence-summary");
  const sparseSummary = buildEvidenceSummary({
    systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://sit-adp.hzins.com/" },
    menuMap: [],
    pageInventory: [],
    actionInventory: [],
    formInventory: [],
    tableInventory: [],
    screenshotIndex: [],
  });

  assert.doesNotThrow(() => mergeOperationSpecIntoEvidenceSummary(sparseSummary, null));
  assert.strictEqual(mergeOperationSpecIntoEvidenceSummary(sparseSummary, null), sparseSummary);
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
    verifiedClaims: verifiedClaimsFixture([
      {
        id: "function:ai-task:list",
        type: "function-presence",
        subject: "任务列表",
        module: "AI任务",
        writable: true,
        status: "confirmed",
        text: "AI任务模块提供任务列表。",
      },
    ]),
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
  assert.match(prompt, /待确认事项使用扁平 bullet/);
  assert.match(prompt, /合并同类待确认/);
  assert.doesNotMatch(prompt, /SKILL\.md/);
  assert.doesNotMatch(prompt, /docs\/narrative-guide\.md/);
  assert.doesNotMatch(prompt, /whitepaper\.draft\.md/);
  assert.doesNotMatch(prompt, /fin-center/);
  assert.match(prompt, /不要读取.*secrets\//);
  assert.match(prompt, /不要读取.*\.playwright-\*/);
});

test("phase3b compact business process model preserves v2 status boundary and derivation", () => {
  const { compactBusinessProcessModel } = require("./narrative/phase3b");
  const filler = Object.fromEntries(
    Array.from({ length: 90 }, (_, index) => [`extra${index}`, `value-${index}`]),
  );

  const compact = compactBusinessProcessModel({
    artifactType: "business-process-model",
    version: 2,
    system: { code: "finance", name: "费用与预算管理系统" },
    ...filler,
    businessObjects: [{ name: "费用申请", category: "transaction-record" }],
    processes: [
      {
        name: "费用申请闭环",
        status: "partially-observed",
        boundary: "预算占用未观察到实际写入，只能作为字段和模块职责的合理推理。",
        steps: [
          {
            name: "提交费用申请",
            status: "observed",
            source: "workflow-spec",
            evidence: ["workflow:费用申请:提交"],
          },
          {
            name: "预算占用",
            status: "inferred",
            source: "operation-spec",
            evidence: ["module:预算控制"],
            boundary: "未观察到预算占用写入动作。",
          },
        ],
      },
    ],
    derivation: {
      builder: "build-business-process-model",
      algorithmVersion: 2,
      profileId: "",
      sourceHash: "source-hash",
      contentHash: "content-hash",
    },
  });

  assert.equal(compact.available, true);
  assert.equal(compact.model.version, 2);
  assert.equal(compact.model.processes[0].status, "partially-observed");
  assert.match(compact.model.processes[0].boundary, /预算占用未观察/);
  assert.equal(compact.model.processes[0].steps[1].status, "inferred");
  assert.equal(compact.model.derivation.contentHash, "content-hash");
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

test("phase3b prompt requires verified claims artifact before writing", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-missing-claims-"));

  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReport: {},
      }),
    /Verified claims not found/,
  );

  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify({ artifactType: "verified-claims", claims: [], rules: {} }),
    "utf8",
  );
  assert.throws(
    () =>
      buildPhase3bPrompt({
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
        evidenceSummary: { system: { code: "adp", name: "AI保单数据闭环平台" } },
        outputPath: path.join(dir, "whitepaper.pending-review.md"),
        qualityReport: {},
      }),
    /boundary rules are incomplete/,
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
  assert.match(brief, /不要新增 `### P0`/);
  assert.match(skeleton, /本骨架由脚本基于 evidence-summary \/ operation-spec 生成/);
  assert.match(skeleton, /\[待升华：业务定位/);
  assert.match(skeleton, /#### 任务列表/);
  assert.match(markdown, /## 1\. 系统概览/);
  assert.match(markdown, /## 4\. 典型业务流程/);
  assert.match(markdown, /## 7\. 附录：证据索引/);
  assert.match(markdown, /screenshots\/task\.png/);
});

test("V6 pending confirmations consolidate repeated module uncertainty", () => {
  const { consolidatePendingConfirmationSection } = require("./narrative/phase3b");
  const markdown = [
    "# 业务系统功能白皮书（待审核）",
    "",
    "## 6. 待确认事项",
    "- 首页模块虽暴露「首页」功能入口，但功能级操作细节（按钮、字段、写操作）证据不足，具体首页功能范围待确认。",
    "- 需求输出模块虽暴露「需求输出」功能入口，但功能级操作细节（按钮、字段、写操作）证据不足，具体需求输出功能范围待确认。",
    "- 数据监控模块虽暴露「数据监控」功能入口，但功能级操作细节（按钮、字段、写操作）证据不足，具体数据监控功能范围待确认。",
    "- 业务处理链路的跨模块顺序为 inferred 推理，未观察到端到端执行证据，实际流转规则与触发条件待业务确认。",
    "- 单据级状态字段与状态机尚未捕获，状态流转命名与转换规则待确认。",
    "",
    "## 7. 附录：证据索引",
    "- 证据保留。",
  ].join("\n");

  const result = consolidatePendingConfirmationSection(markdown);
  const uncertaintyCount = (result.match(/无法|尚未|不宜|未覆盖|需补采|证据不足|待确认/g) || [])
    .length;

  assert.equal(uncertaintyCount, 1);
  assert.match(result, /涉及：首页、需求输出、数据监控/);
  assert.match(result, /仍需业务侧复核/);
  assert.match(result, /inferred 推理/);
  assert.doesNotMatch(result, /证据不足/);
  assert.doesNotMatch(result, /尚未/);
  assert.doesNotMatch(result, /待业务确认/);
  assert.match(result, /## 7\. 附录：证据索引/);
});

test("phase3b redacts non-writable claim ids from prompts and assembled markdown", () => {
  const {
    assemblePendingReviewMarkdown,
    buildPhase3bPrompt,
  } = require("./narrative/phase3b");
  const claimsArtifact = verifiedClaimsFixture([
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
      subject: "保单实体",
      module: "保单任务",
      writable: false,
      status: "weak",
    },
  ]);
  const summary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务" }],
    functions: [{ module: "保单任务", name: "任务列表" }],
  };
  const prompt = buildPhase3bPrompt({
    systemName: "AI保单数据闭环平台",
    evidenceSummary: summary,
    qualityReport: {},
    verifiedClaims: claimsArtifact,
  });
  const markdown = assemblePendingReviewMarkdown({
    evidenceSummary: summary,
    verifiedClaims: claimsArtifact,
    fragments: [
      "## 3. 核心功能说明",
      "保单任务模块提供任务列表。[claim:function:保单任务:任务列表]",
      "## 6. 待确认事项",
      "- 保单实体需要结合数据库或接口证据确认。[claim:entity:adp-test-policy-task]",
    ].join("\n\n"),
  });

  assert.match(prompt, /function:保单任务:任务列表/);
  assert.doesNotMatch(prompt, /entity:adp-test-policy-task/);
  assert.match(prompt, /sourceClaimIdRedacted/);
  assert.match(markdown, /\[claim:function:保单任务:任务列表]/);
  assert.doesNotMatch(markdown, /\[claim:entity:adp-test-policy-task]/);
  assert.match(markdown, /保单实体需要结合数据库或接口证据确认。/);
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
    verifiedClaims: verifiedClaimsFixture([]),
  });
  const modulePrompt = buildPhase3bPartPrompt({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    outputPath: "outputs/adp/whitepaper.pending-review.md",
    part: parts.find((item) => item.moduleName === "AI任务"),
    qualityReport: {},
    verifiedClaims: verifiedClaimsFixture([]),
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
  assert.match(overviewPrompt, /待确认事项使用扁平 bullet/);
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
  const claims = verifiedClaimsFixture([
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
  ]);
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

test("phase3b preparation prefers operation spec over stale placeholder summary", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writePreparationFiles } = require("./narrative/phase3b");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-operation-spec-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      metrics: { counts: { pages: 0 } },
      modules: [{ name: "本地", entry: "本地", summary: "旧占位模块" }],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "quality-report.json"), JSON.stringify({ failures: [], warnings: [] }), "utf8");
  fs.writeFileSync(
    path.join(dir, "operation-spec.json"),
    JSON.stringify({
      artifactType: "operation-spec",
      systemCode: "adp",
      systemName: "AI保单数据闭环平台",
      testUrl: "https://sit-adp.hzins.com/",
      positioning: { text: "覆盖需求输出、需求验证、需求验收与数据监控。" },
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          businessHint: "配置、查询并执行保司数据对接 AI 任务。",
          list: { columns: ["保险公司", "任务类型"], queryFields: ["全部"], rowActions: [] },
          screenshots: ["screenshots/task.png"],
        },
        {
          name: "AI发布管理",
          entry: "左侧「AI发布管理」",
          businessHint: "管理 AI 能力发布与上线。",
          list: { columns: ["保险公司", "配置质量"], queryFields: ["全部"], rowActions: [] },
          screenshots: ["screenshots/publish.png"],
        },
      ],
    }),
    "utf8",
  );
  writeVerifiedClaimsFixture(dir);

  const prepared = writePreparationFiles({
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
    evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
    operationSpecPath: path.join(dir, "operation-spec.json"),
    qualityReportPath: path.join(dir, "quality-report.json"),
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
  });
  const skeleton = fs.readFileSync(path.join(dir, "whitepaper.skeleton.md"), "utf8");
  const prompt = fs.readFileSync(path.join(dir, "phase3b-prompt.md"), "utf8");

  assert.deepEqual(
    prepared.parts.filter((item) => item.type === "module").map((item) => item.moduleName),
    ["AI任务管理", "AI发布管理"],
  );
  assert.equal(prepared.evidenceSummary.functions.length, 2);
  assert.match(skeleton, /AI任务管理/);
  assert.match(skeleton, /AI发布管理/);
  assert.doesNotMatch(skeleton, /本地/);
  assert.match(prompt, /operation-spec 是优先业务证据/);
  assert.match(prompt, /AI任务管理/);
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
  writeOperationSpecFixture(dir);
  writeQualityReportFixture(dir);
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify({ failures: [], warnings: [], counts: { evidencePages: 1 } }),
    "utf8",
  );
  writeVerifiedClaimsFixture(dir);
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
  assert.equal(result.partPrompts.length, 2);
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.pending-review.md")), false);
});

test("pipeline narrative node fails fast when manual provider has no pending review", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-manual-narrative-"));
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
  writeOperationSpecFixture(dir);
  writeQualityReportFixture(dir);
  writeVerifiedClaimsFixture(dir);

  await assert.rejects(
    () =>
      runPipelineNode("narrative", {
        args: { provider: "manual", narrativeProvider: "manual" },
        config: {},
        configPath: path.join(dir, "systems.local.yaml"),
        projectRoot: path.resolve(__dirname, ".."),
        system: { code: "adp", name: "AI保单数据闭环平台" },
        systemOutput: dir,
      }),
    /manual only prepared prompts.*whitepaper\.pending-review\.md/,
  );
  assert.equal(fs.existsSync(path.join(dir, "phase3b-prompt.md")), true);
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
  writeVerifiedClaimsFixture(dir);

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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);

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
  writeVerifiedClaimsFixture(dir);

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
  writeVerifiedClaimsFixture(dir);

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
      system: { code: "adp", name: "AI保单数据闭环平台", collectedAt: "2026-05-21T08:00:00.000Z" },
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
  writeVerifiedClaimsFixture(dir);
  const staleNamedFinalPath = path.join(dir, "AI保单数据闭环平台_系统功能白皮书_20260521.md");
  fs.writeFileSync(path.join(dir, "whitepaper.final.md"), "# stale internal final", "utf8");
  fs.writeFileSync(staleNamedFinalPath, "# stale named final", "utf8");
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
  assert.equal(fs.readFileSync(path.join(dir, "whitepaper.final.md"), "utf8"), "# stale internal final");
  assert.equal(fs.readFileSync(staleNamedFinalPath, "utf8"), "# stale named final");
  assert.equal(fs.existsSync(path.join(dir, "AI保单数据闭环平台_系统功能白皮书_20260521_待审.md")), true);
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
  writeVerifiedClaimsFixture(dir);
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
    narrativePart: "overview-flow,AI任务",
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
      narrativePart: "AI任务",
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

test("phase3b assembly demotes unsupported core headings to body text", () => {
  const {
    assemblePendingReviewMarkdown,
  } = require("./narrative/phase3b");
  const markdown = assemblePendingReviewMarkdown({
    evidenceSummary: {
      system: { name: "AI保单数据闭环平台" },
      functions: [],
    },
    verifiedClaims: verifiedClaimsFixture([
      {
        id: "module:AI任务管理",
        type: "module-presence",
        subject: "AI任务管理",
        module: "AI任务管理",
        status: "confirmed",
        writable: true,
      },
    ]),
    fragments: [
      "## 3. 核心功能说明",
      "",
      "### AI任务管理",
      "",
      "AI任务管理用于处理已取证任务。",
      "",
      "### 跨模块质量与回流能力",
      "",
      "跨模块质量与回流能力是综合说明，不是取证模块标题。",
    ].join("\n"),
  });

  assert.match(markdown, /^### AI任务管理$/m);
  assert.doesNotMatch(markdown, /^### 跨模块质量与回流能力$/m);
  assert.match(markdown, /^\*\*跨模块质量与回流能力\*\*$/m);
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
      narrativePart: "overview-flow",
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

test("phase3b full part assembly does not inherit stale baseline sections", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    assembleIfFragmentsExist,
    buildNarrativeParts,
    selectNarrativeParts,
  } = require("./narrative/phase3b");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-full-no-baseline-"));
  fs.writeFileSync(
    path.join(dir, "narrative-fragments.md"),
    [
      "## 1. 系统概览",
      "旧概览，尚未执行 Playwright 页面探索。",
      "## 2. 功能模块概览",
      "- **本地**：旧占位模块。",
      "## 3. 核心功能说明",
      "functions 列表为空，无法撰写核心功能说明。",
      "## 4. 典型业务流程",
      "旧流程，不宜编造。",
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

  const parts = buildNarrativeParts(
    { outputPath: path.join(dir, "whitepaper.pending-review.md") },
    { functions: [{ module: "AI任务", name: "任务列表" }] },
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
  assert.doesNotMatch(fragments, /尚未执行 Playwright/);
  assert.doesNotMatch(fragments, /functions 列表为空/);
  assert.doesNotMatch(fragments, /本地/);
});

test("phase3b sanitizes model-only headings before final assembly", () => {
  const { sanitizeNarrativeFragments } = require("./narrative/phase3b");
  const markdown = sanitizeNarrativeFragments(
    [
      "# AI保单数据闭环平台 · 业务叙事片段",
      "",
      "## 3. 核心功能说明",
      "### AI任务管理",
      "模块说明。",
      "",
      "## 4. 典型业务流程",
      "### 保司数据对接 AI 任务闭环",
      "流程说明。",
      "",
      "## 6. 待确认事项",
      "### P0",
      "- 待确认。",
    ].join("\n"),
  );

  assert.doesNotMatch(markdown, /^#\s+/m);
  assert.match(markdown, /^### AI任务管理$/m);
  assert.doesNotMatch(markdown, /^### 保司数据对接/m);
  assert.match(markdown, /\*\*保司数据对接 AI 任务闭环\*\*/);
  assert.doesNotMatch(markdown, /^### P0$/m);
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
  writeVerifiedClaimsFixture(dir);

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
  writeVerifiedClaimsFixture(dir);

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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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
  writeVerifiedClaimsFixture(dir);
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

test("run-phase3b CLI reports usage before provider resolution when system is missing", async () => {
  const { main } = require("./run-phase3b");

  const result = await runAsyncCliMainForTest(main, []);

  assert.notEqual(result.status, 0, spawnSyncSummary(result));
  assert.match(result.stderr, /Usage: node scripts\/run-phase3b\.js --system adp/);
  assert.doesNotMatch(result.stderr, /Cannot access 'config' before initialization/);
});

test("run-phase3b CLI forwards narrative part and review rerun options", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./run-phase3b");

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
  writeVerifiedClaimsFixture(output);
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

  const result = await runAsyncCliMainForTest(
    main,
    [
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
  );

  assert.equal(result.status, 0, spawnSyncSummary(result));
  const payload = JSON.parse(result.stdout);
  const usage = JSON.parse(fs.readFileSync(path.join(output, "phase3b-usage.json"), "utf8"));
  assert.equal(payload.narrativePart, "overview-flow");
  assert.deepEqual(payload.partPrompts.map((item) => item.id), ["overview-flow"]);
  assert.equal(usage.narrativePart, "overview-flow");
  assert.match(fs.readFileSync(path.join(output, "phase3b-prompt.md"), "utf8"), /系统概览需要更业务化/);
});

test("run-phase3b CLI tolerates malformed optional pipeline state", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./run-phase3b");

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
  writeVerifiedClaimsFixture(output);
  fs.writeFileSync(path.join(output, "pipeline-state.json"), "{bad json", "utf8");

  const result = await runAsyncCliMainForTest(main, [
    "--config",
    configPath,
    "--system",
    "adp",
    "--provider",
    "manual",
  ]);

  assert.equal(result.status, 0, spawnSyncSummary(result));
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
  assert.equal(state.nodes["business-process"].label, "业务流程");
  assert.equal(state.nodes["whitepaper-plan"].label, "写作计划");
  assert.equal(state.nodes["build-spec"].label, "整理规格");
  assert.equal(state.nodes["workflow-spec"].label, "流程规格");
  assert.equal(state.nodes["compose-guide"].label, "操作指引");
  assert.equal(state.nodes.draft.label, "底稿");
  assert.equal(state.nodes.summary.label, "摘要");
  assert.equal(state.nodes["fact-check"].label, "事实核验");
  assert.equal(state.nodes["golden-eval"].label, "金标评测");
  assert.equal(state.nodes["truth-readiness"].label, "真实度门禁");
  assert.equal(state.artifacts.truthReadiness, "truth-readiness-report.json");
  assert.equal(state.artifacts.dataDictionary, "data-dictionary.json");
  assert.equal(state.artifacts.entityModel, "entity-model.json");
  assert.equal(state.artifacts.businessProcessModel, "business-process-model.json");
  assert.equal(state.artifacts.workflowSpec, "workflow-spec.json");
  assert.equal(Object.keys(state.nodes).length, 22);
});

test("pipeline state includes workflow-spec node and artifact label", () => {
  const { NODES, createPipelineState } = require("./pipeline-state");
  const workflowNode = NODES.find((node) => node.id === "workflow-spec");
  const businessProcessNode = NODES.find((node) => node.id === "business-process");
  assert.deepEqual(workflowNode, { id: "workflow-spec", phase: "compose", label: "流程规格" });
  assert.deepEqual(businessProcessNode, { id: "business-process", phase: "compose", label: "业务流程" });
  assert.ok(
    NODES.findIndex((node) => node.id === "workflow-spec") <
      NODES.findIndex((node) => node.id === "business-process"),
  );
  const state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  assert.equal(state.nodes["workflow-spec"].phase, "compose");
  assert.equal(state.nodes["business-process"].phase, "compose");
  assert.equal(state.artifacts.workflowSpec, "workflow-spec.json");
});

test("pipeline state includes whitepaper-plan after business-process", () => {
  const { NODES, createPipelineState } = require("./pipeline-state");
  const planNode = NODES.find((node) => node.id === "whitepaper-plan");
  assert.deepEqual(planNode, { id: "whitepaper-plan", phase: "compose", label: "写作计划" });
  assert.ok(
    NODES.findIndex((node) => node.id === "business-process") <
      NODES.findIndex((node) => node.id === "whitepaper-plan"),
  );
  assert.ok(
    NODES.findIndex((node) => node.id === "whitepaper-plan") <
      NODES.findIndex((node) => node.id === "draft"),
  );
  const state = createPipelineState({ code: "generic-finance", name: "费用与预算管理系统" });
  assert.equal(state.nodes["whitepaper-plan"].phase, "compose");
  assert.equal(state.artifacts.whitepaperPlan, "whitepaper-plan.json");
});

test("pipeline reset archives and clears existing system output before fresh collection", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    resetSystemOutputDirectory,
    shouldResetSystemOutput,
  } = require("./run-whitepaper-pipeline");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-reset-output-"));
  const outputRoot = path.join(projectRoot, "outputs");
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(path.join(systemOutput, "stale-evidence.json"), "{}", "utf8");

  assert.equal(shouldResetSystemOutput({ reset: true, "with-whitepaper": true }, ["sync", "collect"]), true);
  const result = resetSystemOutputDirectory({
    systemOutput,
    outputRoot,
    projectRoot,
    systemCode: "adp",
  });

  assert.equal(result.reset, true);
  assert.equal(fs.existsSync(systemOutput), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "stale-evidence.json")), false);
  assert.equal(fs.existsSync(path.join(result.archivedTo, "stale-evidence.json")), true);
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
  delete legacy.nodes["business-process"];
  delete legacy.nodes["whitepaper-plan"];
  delete legacy.nodes["build-spec"];
  delete legacy.nodes["workflow-spec"];
  delete legacy.nodes["compose-guide"];
  delete legacy.nodes["fact-check"];
  delete legacy.nodes["golden-eval"];
  delete legacy.nodes["truth-readiness"];
  delete legacy.phases.truth;
  delete legacy.phases.compose;

  const { state, changed } = migratePipelineState(legacy);
  assert.equal(changed, true);
  assert.equal(state.nodes["db-profile"].label, "库表画像");
  assert.equal(state.nodes["db-model"].label, "库表模型");
  assert.equal(state.nodes["truth-universe"].label, "功能宇宙");
  assert.equal(state.nodes["truth-claims"].label, "可信断言");
  assert.equal(state.nodes["business-process"].label, "业务流程");
  assert.equal(state.nodes["whitepaper-plan"].label, "写作计划");
  assert.equal(state.nodes["build-spec"].label, "整理规格");
  assert.equal(state.nodes["workflow-spec"].label, "流程规格");
  assert.equal(state.nodes["compose-guide"].label, "操作指引");
  assert.equal(state.nodes["fact-check"].label, "事实核验");
  assert.equal(state.nodes["golden-eval"].label, "金标评测");
  assert.equal(state.nodes["truth-readiness"].label, "真实度门禁");
  assert.equal(state.nodes["db-profile"].status, "pending");
  assert.equal(state.nodes["db-model"].status, "pending");
  assert.equal(state.nodes["business-process"].status, "pending");
  assert.equal(state.nodes["whitepaper-plan"].status, "pending");
  assert.equal(state.nodes["build-spec"].status, "pending");
  assert.equal(state.nodes["workflow-spec"].status, "pending");
  assert.equal(state.phases.truth.label, "真相");
  assert.equal(state.phases.compose.label, "成稿");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-migrate-"));
  const statePath = path.join(dir, "pipeline-state.json");
  writePipelineState(statePath, legacy);
  const loaded = readPipelineState(statePath, { persist: true });
  assert.equal(loaded.nodes["build-spec"].label, "整理规格");
  assert.equal(loaded.nodes["workflow-spec"].label, "流程规格");
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
    "summary",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "business-process",
    "whitepaper-plan",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "draft",
    "fact-check",
    "golden-eval",
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

test("narrative quality blocks placeholder draft when operation spec has business modules", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    operationSpec: {
      modules: [
        { name: "AI任务管理", screenshots: ["screenshots/task.png"] },
        { name: "AI发布管理", screenshots: ["screenshots/publish.png"] },
        { name: "数据与运行观测", screenshots: ["screenshots/monitor.png"] },
        { name: "元数据管理", screenshots: ["screenshots/meta.png"] },
      ],
    },
    markdown: [
      "# AI保单数据闭环平台功能白皮书（待审核）",
      "",
      "# AI保单数据闭环平台 — 叙事片段",
      "",
      "## 1. 系统概览",
      "quality 摘要标记 P0 阻塞：尚未执行 Playwright 页面探索。",
      "",
      "## 2. 功能模块概览",
      "| 模块名称 | 证据状态 | 说明 |",
      "| 本地 | 已推断存在 | UI 模块/菜单证据可证明系统暴露了名为「本地」的功能模块。 |",
      "",
      "## 3. 核心功能说明",
      "evidence-summary 中 functions 列表为空，无法撰写核心功能说明。",
      "",
      "## 4. 典型业务流程",
      "当前无已验证的功能级断言与容器级流程证据，不宜编造端到端业务流程。",
      "",
      "## 5. 使用角色与权限边界",
      "无法确认角色权限边界。",
      "",
      "## 6. 待确认事项",
      "- 待确认：verified-claims（2026-05-25）需补采。",
      "",
      "## 7. 附录：证据索引",
      "- 本轮 evidence-summary 未包含可附录化的页面证据。",
    ].join("\n"),
  });

  assert.equal(report.canSubmitReview, false);
  assert.match(report.failures.join("\n"), /叙事片段/);
  assert.match(report.failures.join("\n"), /functions 列表为空/);
  assert.match(report.failures.join("\n"), /operation-spec 业务模块/);
  assert.match(report.failures.join("\n"), /本地/);
});

test("narrative quality blocks chapter 4 that only describes menu clicks", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    markdown: [
      "# AI保单数据闭环平台功能白皮书",
      "",
      "## 1. 系统定位",
      "系统定位说明覆盖保单数据闭环管理、页面证据来源和待确认边界。".repeat(10),
      "",
      "## 2. 核心功能说明",
      "保单任务模块提供任务列表，用于页面查询和只读核对。".repeat(10),
      "",
      "## 3. 核心功能说明",
      "任务列表页面用于保存已观察到的查询入口和截图证据。",
      "",
      "## 4. 典型业务流程",
      "人员进入菜单，打开页面，点击查询按钮，查看列表页面，再返回菜单。".repeat(6),
    ].join("\n"),
  });

  assert.equal(report.canSubmitReview, false);
  assert.match(report.failures.join("\n"), /疑似只是菜单\/页面操作说明/);
  assert.match(report.failures.join("\n"), /业务对象/);
  assert.match(report.failures.join("\n"), /状态或质量信号/);
});

test("narrative quality validates business process model coverage when present", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    markdown: passingNarrativeMarkdown(),
    businessProcessModelPresent: true,
    businessProcessModel: {
      processes: [
        {
          name: "保单任务状态核对",
          businessObjects: ["保单任务"],
          statusSignals: ["任务状态"],
          feedbackLoops: ["问题回流"],
        },
        {
          name: "赔付审核回流",
          businessObjects: ["赔付案件"],
          statusSignals: ["审核状态"],
          feedbackLoops: ["驳回回流"],
        },
      ],
    },
  });

  assert.equal(report.canSubmitReview, false);
  assert.match(report.failures.join("\n"), /business-process-model\.json 流程覆盖不足/);
  assert.match(report.failures.join("\n"), /赔付审核回流/);
});

test("narrative quality requires boundary wording for inferred business process flows", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    operationSpec: {
      modules: [
        { name: "费用申请" },
        { name: "预算控制" },
        { name: "审批中心" },
      ],
    },
    markdown: [
      "# 费用与预算管理系统功能白皮书",
      "",
      "## 1. 系统定位",
      "系统定位说明覆盖费用申请、预算控制和审批中心的协同处理场景，当前正文基于页面证据组织业务说明。",
      "",
      "## 2. 核心功能说明",
      "费用申请模块承接申请录入，预算控制模块提供预算科目和风险状态，审批中心展示审核状态。",
      "",
      "## 4. 典型业务流程",
      "费用申请闭环为：1. 申请人围绕费用申请对象提交申请，触发费用申请模块处理；2. 预算控制模块根据预算科目同步校验可用金额并生成风险状态；3. 审批中心依据审核状态形成通过或驳回结果，并把异常问题回流给申请人复核。",
    ].join("\n"),
    businessProcessModelPresent: true,
    businessProcessModel: {
      version: 2,
      processes: [
        {
          name: "费用申请闭环",
          status: "partially-observed",
          boundary: "预算占用未观察到实际写入，只能作为字段和模块职责的合理推理。",
          businessObjects: ["费用申请"],
          statusSignals: ["风险状态", "审核状态"],
          feedbackLoops: ["异常问题回流"],
          steps: [
            { name: "提交费用申请", status: "observed" },
            { name: "预算校验", status: "inferred", boundary: "未观察到预算占用写入动作。" },
          ],
        },
      ],
    },
  });

  assert.equal(report.canSubmitReview, false);
  assert.match(report.failures.join("\n"), /推断\/部分观测流程/);
  assert.match(report.failures.join("\n"), /费用申请闭环/);
});

test("narrative quality accepts generic inferred process name when boundary is covered", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    operationSpec: {
      modules: [{ name: "保单任务" }],
    },
    markdown: passingNarrativeMarkdown(),
    businessProcessModelPresent: true,
    businessProcessModel: {
      version: 2,
      processes: [
        {
          name: "业务处理链路",
          status: "partially-observed",
          boundary: "存在已观察步骤，但跨模块顺序或未覆盖模块职责仍为证据约束推理。",
          businessObjects: ["保单任务"],
          statusSignals: ["任务状态"],
          feedbackLoops: ["问题回流"],
          steps: [
            { name: "定位保单任务", status: "observed" },
            {
              name: "信息采集与提交",
              status: "inferred",
              boundary: "该步骤为证据约束下的业务流程推理，不能写成已验证自动流转。",
            },
          ],
        },
      ],
    },
  });

  assert.equal(report.canSubmitReview, true);
});

test("narrative quality warns when business process model is missing", () => {
  const { buildNarrativeQualityReport } = require("./check-narrative");
  const report = buildNarrativeQualityReport({
    minChars: 100,
    markdown: passingNarrativeMarkdown(),
    businessProcessModelPresent: false,
  });

  assert.equal(report.canSubmitReview, true);
  assert.ok(report.warnings.some((item) => /business-process-model\.json 不存在/.test(item)));
});

test("check-narrative fails on malformed evidence summary without writing report", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./check-narrative");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "narrative-bad-summary-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台\n\n## 1. 系统定位\n" +
      "系统定位说明。".repeat(120) +
      "\n\n## 4. 典型业务流程\n业务流程说明。\n证据来自首页截图。",
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), "{bad json", "utf8");

  const result = runCliMainForTest(main, ["--input", dir]);

  assert.equal(result.status, 1, spawnSyncSummary(result));
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
    "business-process",
    "whitepaper-plan",
    "narrative",
    "fact-check",
    "golden-eval",
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
    ["summary", "db-model", "truth-universe", "truth-claims", "business-process", "whitepaper-plan", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
    "business-process",
    "whitepaper-plan",
    "narrative",
    "fact-check",
    "golden-eval",
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
    "business-process",
    "whitepaper-plan",
    "narrative",
    "fact-check",
    "golden-eval",
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
    "business-process",
    "whitepaper-plan",
    "narrative",
    "fact-check",
    "golden-eval",
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
    "business-process",
    "whitepaper-plan",
    "narrative",
    "fact-check",
    "golden-eval",
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

  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
        rerunNodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
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
  assert.deepEqual(decision.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
    "summary",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "business-process",
    "whitepaper-plan",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "draft",
    "narrative",
    "fact-check",
    "golden-eval",
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
  const staleNamedFinalPath = path.join(adpOutput, "AI保单数据闭环平台_系统功能白皮书_20260521.md");
  fs.writeFileSync(staleNamedFinalPath, "# stale named final", "utf8");
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
  assert.equal(snapshot.systems[0].progress.completed, 22);
  assert.equal(snapshot.systems[0].artifacts.final.exists, true);
  assert.equal(snapshot.systems[0].artifacts.final.file, "whitepaper.final.md");
  assert.equal(fs.readFileSync(staleNamedFinalPath, "utf8"), "# stale named final");
  assert.equal(snapshot.systems[0].artifacts.docx.exists, false);
  assert.equal(snapshot.systems[0].artifacts.databaseProfile.exists, false);
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

test("dashboard snapshot exposes golden eval readiness metrics", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-golden-"));
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
  for (const nodeId of ["sync", "session", "collect", "inspect", "validate-write", "summary", "db-profile", "db-model", "truth-universe", "truth-claims", "business-process", "whitepaper-plan", "build-spec", "workflow-spec", "compose-guide", "draft", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]) {
    state = updateNodeStatus(state, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  writePipelineState(path.join(output, "pipeline-state.json"), state);
  writePassingTruthReadinessReport(output, {
    gates: {
      goldenEval: {
        id: "goldenEval",
        label: "Golden Eval",
        pass: true,
        required: true,
        available: true,
        score: 1,
        scorePercent: 100,
        metrics: {
          coverageRatio: 0.97,
          criticalCoverageRatio: 1,
          overclaimCount: 0,
        },
        failures: [],
      },
    },
  });

  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(snapshot.systems[0].truthReadiness.goldenEval.coverageRatio, 0.97);
  assert.equal(snapshot.systems[0].truthReadiness.goldenEval.criticalCoverageRatio, 1);
  assert.equal(snapshot.systems[0].truthReadiness.goldenEval.overclaimCount, 0);
  assert.equal(snapshot.systems[0].truthReadiness.goldenEval.required, true);
});

test("V5 dashboard truth gate summary exposes workflow process plan and golden gaps", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-v5-gates-"));
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: finance",
      "    name: 财务费用系统",
      "    url: https://finance.example.test/",
    ].join("\n"),
    "utf8",
  );
  const output = path.join(dir, "outputs", "finance");
  fs.mkdirSync(output, { recursive: true });
  let state = createPipelineState({ code: "finance", name: "财务费用系统" });
  for (const nodeId of ["sync", "session", "collect", "inspect", "truth-universe", "truth-claims", "business-process", "whitepaper-plan", "build-spec", "workflow-spec", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]) {
    state = updateNodeStatus(state, nodeId, "success");
  }
  writePipelineState(path.join(output, "pipeline-state.json"), state);
  writePassingTruthReadinessReport(output, {
    score: 0.72,
    scorePercent: 72,
    canSubmitReview: false,
    gates: {
      workflow: {
        id: "workflow",
        pass: false,
        score: 0,
        scorePercent: 0,
        metrics: { operationFlowCount: 0, observedWorkflowStepCount: 0 },
        failures: ["workflow-spec.json has no observed workflow steps."],
      },
      businessProcess: {
        id: "businessProcess",
        pass: false,
        score: 0,
        scorePercent: 0,
        metrics: { processCount: 0, staleSourceCount: 1, stepEvidenceMissingCount: 2, defaultDomainLeakCount: 0 },
        failures: ["business-process-model.json is stale."],
      },
      whitepaperPlan: {
        id: "whitepaperPlan",
        pass: false,
        score: 0.5,
        scorePercent: 50,
        metrics: {
          requiredItemCount: 4,
          coveredRequiredItemCount: 2,
          planRequiredCoverageRatio: 0.5,
          missingRequiredItemCount: 2,
        },
        failures: ["Pending-review whitepaper omits required whitepaper-plan items."],
      },
      goldenEval: {
        id: "goldenEval",
        pass: false,
        required: true,
        available: true,
        score: 0.8,
        scorePercent: 80,
        metrics: { coverageRatio: 0.8, criticalCoverageRatio: 1, overclaimCount: 0 },
        failures: ["Golden Eval fact coverage is below threshold."],
      },
    },
    blockers: [{ id: "golden-eval.coverage", message: "Golden Eval fact coverage is below threshold.", rerunNodes: ["golden-eval", "quality", "truth-readiness"] }],
  });

  const snapshot = buildDashboardSnapshot({ configPath });
  const gateSummary = snapshot.systems[0].truthReadiness.gateSummary;

  assert.equal(gateSummary.workflow.pass, false);
  assert.equal(gateSummary.workflow.metrics.operationFlowCount, 0);
  assert.equal(gateSummary.workflow.metrics.observedWorkflowStepCount, 0);
  assert.equal(gateSummary.businessProcess.pass, false);
  assert.equal(gateSummary.businessProcess.metrics.staleSourceCount, 1);
  assert.equal(gateSummary.businessProcess.metrics.stepEvidenceMissingCount, 2);
  assert.equal(gateSummary.whitepaperPlan.pass, false);
  assert.equal(gateSummary.whitepaperPlan.metrics.requiredItemCount, 4);
  assert.equal(gateSummary.whitepaperPlan.metrics.missingRequiredItemCount, 2);
  assert.equal(gateSummary.goldenEval.pass, false);
  assert.equal(gateSummary.goldenEval.metrics.coverageRatio, 0.8);
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
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), passingNarrativeMarkdown(), "utf8");
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
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), passingNarrativeMarkdown(), "utf8");
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
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");

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
  fs.writeFileSync(path.join(adpOutput, "whitepaper.pending-review.md"), passingUiOnlyNarrativeMarkdown(), "utf8");
  writePassingTruthArtifacts(adpOutput, { databaseProfile: false });
  let adpState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  for (const nodeId of [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "summary",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "business-process",
    "whitepaper-plan",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "draft",
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
    finalizeWhitepaperMarkdown(fs.readFileSync(path.join(adpOutput, "whitepaper.pending-review.md"), "utf8"), {
      systemName: "AI保单数据闭环平台",
    }),
    "utf8",
  );

  const snapshot = buildDashboardSnapshot({ configPath });
  assert.equal(snapshot.systems[0].currentPhase, "completed");
  assert.equal(snapshot.systems[0].currentNode, "end");
  assert.equal(snapshot.systems[0].artifacts.docx.exists, true);
  assert.match(snapshot.systems[0].artifacts.docx.file || "", /\.docx$/i);
  assert.equal(fs.existsSync(`${snapshot.systems[0].artifacts.docx.path}.manifest.json`), true);
});

test("dashboard snapshot regenerates stale docx for finalized system", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const { buildDashboardSnapshot } = require("./local-dashboard/server");
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-docx-stale-"));
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
  fs.writeFileSync(path.join(adpOutput, "whitepaper.pending-review.md"), passingUiOnlyNarrativeMarkdown(), "utf8");
  writePassingTruthArtifacts(adpOutput, { databaseProfile: false });
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
    "business-process",
    "whitepaper-plan",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "golden-eval",
    "quality",
    "truth-readiness",
    "review",
  ]) {
    adpState = updateNodeStatus(adpState, nodeId, nodeId === "validate-write" ? "skipped" : "success");
  }
  adpState.review.status = "approved";
  adpState = {
    ...adpState,
    overallStatus: "finalized",
    currentPhase: "completed",
    currentNode: "end",
    artifacts: { ...(adpState.artifacts || {}), docx: "stale-old.docx" },
  };
  writePipelineState(path.join(adpOutput, "pipeline-state.json"), adpState);
  fs.writeFileSync(
    path.join(adpOutput, "whitepaper.final.md"),
    finalizeWhitepaperMarkdown(fs.readFileSync(path.join(adpOutput, "whitepaper.pending-review.md"), "utf8"), {
      systemName: "AI保单数据闭环平台",
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(adpOutput, "stale-old.docx"), "PK\x03\x04stale-docx", "utf8");

  const snapshot = buildDashboardSnapshot({ configPath });
  const docx = snapshot.systems[0].artifacts.docx;
  assert.equal(docx.exists, true);
  assert.match(docx.file || "", /\.docx$/i);
  assert.notEqual(docx.file, "stale-old.docx");
  assert.equal(fs.existsSync(`${docx.path}.manifest.json`), true);
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

test("stopPipeline terminalizes stale batch run-state without tracked child", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { stopPipeline, buildDashboardSnapshot } = require("./local-dashboard/server");
  const { writeBatchRunState } = require("./run-whitepaper-batch");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-stop-batch-"));
  const configPath = path.join(dir, "systems.local.yaml");
  const outputRoot = path.join(dir, "outputs");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: outputs",
      "systems:",
      "  - code: adp",
      "    name: demo",
      "    url: https://x/",
      "  - code: claim",
      "    name: claim",
      "    url: https://claim/",
    ].join("\n"),
    "utf8",
  );
  writeBatchRunState(outputRoot, {
    artifactType: "batch-run-state",
    version: 1,
    status: "running",
    startedAt: "2026-06-03T00:00:00.000Z",
    summary: { total: 2, queued: 1, running: 1, completed: 0, failed: 0 },
    systems: [
      {
        code: "adp",
        name: "demo",
        status: "running",
        runStatus: "running",
        pid: 123,
        currentPhase: "compose",
        currentNode: "narrative",
      },
      {
        code: "claim",
        name: "claim",
        status: "pending",
        runStatus: "queued",
        pid: null,
        currentPhase: "prepare",
        currentNode: "sync",
      },
    ],
  });

  const result = stopPipeline({ configPath });
  const batch = JSON.parse(fs.readFileSync(path.join(outputRoot, "_batch", "run-state.json"), "utf8"));
  const snapshot = buildDashboardSnapshot({ configPath });

  assert.equal(result.status, "stopped");
  assert.deepEqual(result.terminatedBatchSystems, ["adp", "claim"]);
  assert.equal(batch.status, "failed");
  assert.equal(batch.summary.running, 0);
  assert.equal(batch.summary.queued, 0);
  assert.equal(batch.summary.failed, 2);
  assert.ok(batch.finishedAt);
  assert.equal(batch.systems.some((item) => ["running", "queued"].includes(item.runStatus)), false);
  assert.equal(batch.systems[0].status, "paused");
  assert.equal(batch.systems[0].runStatus, "failed");
  assert.equal(batch.systems[0].pid, null);
  assert.equal(batch.systems[0].failureCategory, "interrupted");
  assert.equal(batch.systems[1].status, "paused");
  assert.equal(batch.systems[1].runStatus, "failed");
  assert.equal(snapshot.running, false);
  assert.equal(snapshot.activeRun, null);
  assert.equal(snapshot.batch.status, "failed");
  assert.deepEqual(snapshot.batchStopSummary.terminatedBatchSystems, ["adp", "claim"]);
  assert.equal(snapshot.batchStopSummary.terminatedCount, 2);
  assert.equal(snapshot.batchStopSummary.terminatedSystems[0].stopReason, "dashboard-stop");
  assert.deepEqual(snapshot.batch.stopSummary.terminatedBatchSystems, ["adp", "claim"]);
  assert.match(snapshot.batch.stopSummary.terminatedSystems[0].lastError, /stopped|停止/i);
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
    "business-process",
    "whitepaper-plan",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "draft",
    "summary",
    "narrative",
    "fact-check",
    "golden-eval",
    "quality",
    "truth-readiness",
  ]) {
    state = updateNodeStatus(
      state,
      nodeId,
      ["validate-write", "draft", "summary", "narrative", "golden-eval", "truth-readiness"].includes(nodeId)
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
  writeOperationSpecFixture(dir);
  writeQualityReportFixture(dir);
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
      progress: {
        total: 2,
        finished: 1,
        successful: 1,
        failed: 0,
        completed: 1,
        percent: 50,
        kind: "batch",
      },
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
            nodes: "narrative,fact-check,golden-eval,quality,truth-readiness",
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
  assert.match(html, /运行结束：1\/2/);
  assert.match(html, /成功：1/);
  assert.match(html, /失败：0/);
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
  assert.match(html, /建议重试节点 narrative,fact-check,golden-eval,quality,truth-readiness/);
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

test("agent isolation guard accepts isolated workers and rejects overlap", () => {
  const { validateAgentIsolationPlan } = require("./check-agent-isolation");

  const isolated = validateAgentIsolationPlan({
    artifactType: "agent-isolation-plan",
    version: 1,
    expectedWorkers: 4,
    coordinator: {
      id: "main",
      worktree: "D:/repo/system-whitepaper",
      branch: "main",
    },
    mergePolicy: {
      coordinatorOnlyMerge: true,
      reviewRequired: true,
    },
    workers: [
      {
        id: "dashboard",
        worktree: "D:/repo/system-whitepaper-dashboard",
        branch: "codex/dashboard-progress",
        outputDir: "outputs/agent-dashboard",
        handoffReport: "outputs/agent-dashboard/handoff.json",
        writeScope: ["scripts/local-dashboard/"],
      },
      {
        id: "readiness",
        worktree: "D:/repo/system-whitepaper-readiness",
        branch: "codex/readiness-gates",
        outputDir: "outputs/agent-readiness",
        handoffReport: "outputs/agent-readiness/handoff.json",
        writeScope: ["scripts/check-real-run-readiness.js"],
      },
      {
        id: "batch-stop",
        worktree: "D:/repo/system-whitepaper-batch-stop",
        branch: "codex/batch-stop-state",
        outputDir: "outputs/agent-batch-stop",
        handoffReport: "outputs/agent-batch-stop/handoff.json",
        writeScope: ["scripts/run-whitepaper-batch.js"],
      },
      {
        id: "auditor",
        readOnly: true,
        worktree: "D:/repo/system-whitepaper-auditor",
      },
    ],
  });

  assert.equal(isolated.ok, true);
  assert.equal(isolated.summary.workers, 4);
  assert.equal(isolated.summary.writableWorkers, 3);
  assert.equal(isolated.summary.readOnlyWorkers, 1);
  assert.equal(isolated.summary.handoffReports, 3);

  const overlapping = validateAgentIsolationPlan({
    artifactType: "agent-isolation-plan",
    version: 1,
    expectedWorkers: 4,
    coordinator: {
      id: "main",
      worktree: "D:/repo/system-whitepaper",
      branch: "main",
    },
    workers: [
      {
        id: "one",
        worktree: "D:/repo/system-whitepaper-one",
        branch: "codex/shared",
        outputDir: "outputs/_batch",
        handoffReport: "outputs/_batch/one-handoff.json",
        writeScope: ["scripts/"],
      },
      {
        id: "two",
        worktree: "D:/repo/system-whitepaper-one",
        branch: "codex/shared",
        outputDir: "outputs/_batch/nested",
        handoffReport: "outputs/_batch/one-handoff.json",
        writeScope: ["scripts/check-real-run-readiness.js"],
      },
      {
        id: "three",
        worktree: "D:/repo/system-whitepaper/worker-three",
        branch: "codex/three",
        outputDir: "outputs/three",
        handoffReport: "outputs/three/handoff.json",
        writeScope: ["SKILL.md"],
      },
      {
        id: "four",
        readOnly: true,
        worktree: "D:/repo/system-whitepaper-four",
        writeScope: ["docs/narrative-guide.md"],
      },
    ],
  });
  const violationIds = overlapping.violations.map((item) => item.id);

  assert.equal(overlapping.ok, false);
  assert.ok(violationIds.includes("merge.policy-missing"));
  assert.ok(violationIds.includes("worker.worktree-duplicate"));
  assert.ok(violationIds.includes("worker.worktree-main"));
  assert.ok(violationIds.includes("worker.branch-duplicate"));
  assert.ok(violationIds.includes("worker.output-overlap"));
  assert.ok(violationIds.includes("worker.output-coordinator-owned"));
  assert.ok(violationIds.includes("worker.handoff-duplicate"));
  assert.ok(violationIds.includes("worker.handoff-output-mismatch"));
  assert.ok(violationIds.includes("worker.handoff-coordinator-owned"));
  assert.ok(violationIds.includes("worker.write-scope-overlap"));
  assert.ok(violationIds.includes("worker.coordinator-owned-scope"));
  assert.ok(violationIds.includes("worker.read-only-write-scope"));
});

test("agent isolation strict mode verifies actual worktrees, branches, handoffs, and diff scope", () => {
  const { validateAgentIsolationPlan } = require("./check-agent-isolation");
  const files = new Map([
    [
      "d:\\repo\\system-whitepaper-dashboard\\outputs\\agent-dashboard\\handoff.json",
      JSON.stringify({
        workerId: "dashboard",
        changedFiles: ["scripts/local-dashboard/server.js"],
        tests: ["node --test --test-name-pattern dashboard scripts/system-whitepaper.test.js"],
      }),
    ],
    [
      "d:\\repo\\system-whitepaper-readiness\\outputs\\agent-readiness\\handoff.json",
      JSON.stringify({
        workerId: "readiness",
        changedFiles: ["scripts/check-real-run-readiness.js"],
        tests: ["node --test --test-name-pattern readiness scripts/system-whitepaper.test.js"],
      }),
    ],
    [
      "d:\\repo\\system-whitepaper-batch-stop\\outputs\\agent-batch-stop\\handoff.json",
      JSON.stringify({
        workerId: "batch-stop",
        changedFiles: ["scripts/run-whitepaper-batch.js"],
        tests: ["node --test --test-name-pattern batch scripts/system-whitepaper.test.js"],
      }),
    ],
  ]);
  const git = (args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return [
        "worktree D:/repo/system-whitepaper",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
        "worktree D:/repo/system-whitepaper-dashboard",
        "HEAD bbb",
        "branch refs/heads/codex/dashboard-progress",
        "",
        "worktree D:/repo/system-whitepaper-readiness",
        "HEAD ccc",
        "branch refs/heads/codex/readiness-gates",
        "",
        "worktree D:/repo/system-whitepaper-batch-stop",
        "HEAD ddd",
        "branch refs/heads/codex/batch-stop-state",
        "",
        "worktree D:/repo/system-whitepaper-auditor",
        "HEAD eee",
        "branch refs/heads/codex/auditor",
        "",
      ].join("\n");
    }
    if (command === "-C d:/repo/system-whitepaper status --short") return "";
    if (command === "-C d:/repo/system-whitepaper-dashboard status --short") {
      return " M scripts/local-dashboard/server.js\n?? outputs/agent-dashboard/handoff.json\n";
    }
    if (command === "-C d:/repo/system-whitepaper-readiness status --short") return " M scripts/check-real-run-readiness.js\n";
    if (command === "-C d:/repo/system-whitepaper-batch-stop status --short") return " M scripts/run-whitepaper-batch.js\n";
    return "";
  };

  const strict = validateAgentIsolationPlan(
    {
      artifactType: "agent-isolation-plan",
      version: 1,
      expectedWorkers: 4,
      coordinator: {
        id: "main",
        worktree: "D:/repo/system-whitepaper",
        branch: "main",
      },
      mergePolicy: {
        coordinatorOnlyMerge: true,
        reviewRequired: true,
      },
      workers: [
        {
          id: "dashboard",
          worktree: "D:/repo/system-whitepaper-dashboard",
          branch: "codex/dashboard-progress",
          outputDir: "outputs/agent-dashboard",
          handoffReport: "outputs/agent-dashboard/handoff.json",
          writeScope: ["scripts/local-dashboard/"],
        },
        {
          id: "readiness",
          worktree: "D:/repo/system-whitepaper-readiness",
          branch: "codex/readiness-gates",
          outputDir: "outputs/agent-readiness",
          handoffReport: "outputs/agent-readiness/handoff.json",
          writeScope: ["scripts/check-real-run-readiness.js"],
        },
        {
          id: "batch-stop",
          worktree: "D:/repo/system-whitepaper-batch-stop",
          branch: "codex/batch-stop-state",
          outputDir: "outputs/agent-batch-stop",
          handoffReport: "outputs/agent-batch-stop/handoff.json",
          writeScope: ["scripts/run-whitepaper-batch.js"],
        },
        {
          id: "auditor",
          readOnly: true,
          worktree: "D:/repo/system-whitepaper-auditor",
        },
      ],
    },
    {
      verifyWorktrees: true,
      requireHandoffs: true,
      requireCleanCoordinator: true,
      git,
      fileExists: (filePath) => files.has(String(filePath).toLowerCase()),
      readTextFile: (filePath) => files.get(String(filePath).toLowerCase()),
    },
  );

  assert.equal(strict.ok, true);
  assert.equal(strict.summary.actualWorktreesChecked, 4);
  assert.equal(strict.summary.actualHandoffReportsChecked, 3);
  assert.equal(strict.summary.actualChangedFilesChecked, 4);
});

test("agent isolation strict mode rejects missing worktree, dirty coordinator, and out-of-scope handoff", () => {
  const { validateAgentIsolationPlan } = require("./check-agent-isolation");
  const handoffPath = "d:\\repo\\system-whitepaper-dashboard\\outputs\\agent-dashboard\\handoff.json";
  const git = (args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return [
        "worktree D:/repo/system-whitepaper",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
        "worktree D:/repo/system-whitepaper-dashboard",
        "HEAD bbb",
        "branch refs/heads/codex/wrong-branch",
        "",
      ].join("\n");
    }
    if (command === "-C d:/repo/system-whitepaper status --short") return " M SKILL.md\n";
    if (command === "-C d:/repo/system-whitepaper-dashboard status --short") return " M scripts/system-whitepaper.test.js\n";
    return "";
  };

  const strict = validateAgentIsolationPlan(
    {
      artifactType: "agent-isolation-plan",
      version: 1,
      expectedWorkers: 2,
      coordinator: {
        id: "main",
        worktree: "D:/repo/system-whitepaper",
        branch: "main",
      },
      mergePolicy: {
        coordinatorOnlyMerge: true,
        reviewRequired: true,
      },
      workers: [
        {
          id: "dashboard",
          worktree: "D:/repo/system-whitepaper-dashboard",
          branch: "codex/dashboard-progress",
          outputDir: "outputs/agent-dashboard",
          handoffReport: "outputs/agent-dashboard/handoff.json",
          writeScope: ["scripts/local-dashboard/"],
        },
        {
          id: "readiness",
          worktree: "D:/repo/system-whitepaper-readiness",
          branch: "codex/readiness-gates",
          outputDir: "outputs/agent-readiness",
          handoffReport: "outputs/agent-readiness/handoff.json",
          writeScope: ["scripts/check-real-run-readiness.js"],
        },
      ],
    },
    {
      verifyWorktrees: true,
      requireHandoffs: true,
      requireCleanCoordinator: true,
      git,
      fileExists: (filePath) => String(filePath).toLowerCase() === handoffPath,
      readTextFile: () =>
        JSON.stringify({
          workerId: "dashboard",
          changedFiles: ["scripts/system-whitepaper.test.js"],
          tests: [],
        }),
    },
  );
  const violationIds = strict.violations.map((item) => item.id);
  const warningIds = strict.warnings.map((item) => item.id);

  assert.equal(strict.ok, false);
  assert.ok(violationIds.includes("coordinator.worktree-dirty"));
  assert.ok(violationIds.includes("worker.branch-actual-mismatch"));
  assert.ok(violationIds.includes("worker.diff-out-of-scope"));
  assert.ok(violationIds.includes("worker.handoff-file-out-of-scope"));
  assert.ok(violationIds.includes("worker.worktree-not-registered"));
  assert.ok(violationIds.includes("worker.handoff-missing-actual"));
  assert.ok(warningIds.includes("worker.handoff-tests-missing"));
});

test("agent worktree preparation dry-runs isolated git worktree and output directory commands", () => {
  const path = require("node:path");
  const { buildAgentWorktreePreparation } = require("./prepare-agent-worktrees");
  const git = (args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return [
        "worktree D:/repo/system-whitepaper",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
      ].join("\n");
    }
    if (command === "-C d:/repo/system-whitepaper status --short") return "";
    return "";
  };
  const report = buildAgentWorktreePreparation(
    {
      artifactType: "agent-isolation-plan",
      version: 1,
      expectedWorkers: 4,
      coordinator: {
        id: "main",
        worktree: "D:/repo/system-whitepaper",
        branch: "main",
      },
      mergePolicy: {
        coordinatorOnlyMerge: true,
        reviewRequired: true,
      },
      workers: [
        {
          id: "dashboard",
          worktree: "D:/repo/system-whitepaper-dashboard",
          branch: "codex/dashboard-progress",
          outputDir: "outputs/agent-dashboard",
          handoffReport: "outputs/agent-dashboard/handoff.json",
          writeScope: ["scripts/local-dashboard/"],
        },
        {
          id: "readiness",
          worktree: "D:/repo/system-whitepaper-readiness",
          branch: "codex/readiness-gates",
          outputDir: "outputs/agent-readiness",
          handoffReport: "outputs/agent-readiness/handoff.json",
          writeScope: ["scripts/check-real-run-readiness.js"],
        },
        {
          id: "batch-stop",
          worktree: "D:/repo/system-whitepaper-batch-stop",
          branch: "codex/batch-stop-state",
          outputDir: "outputs/agent-batch-stop",
          handoffReport: "outputs/agent-batch-stop/handoff.json",
          writeScope: ["scripts/run-whitepaper-batch.js"],
        },
        {
          id: "auditor",
          readOnly: true,
          worktree: "D:/repo/system-whitepaper-auditor",
        },
      ],
    },
    {
      expectedWorkers: 4,
      git,
      branchExists: (branch) => branch === "codex/readiness-gates",
      pathExists: () => false,
    },
  );

  assert.equal(report.ok, true);
  assert.equal(report.apply, false);
  assert.equal(report.summary.gitCommands, 4);
  assert.equal(report.summary.mkdirCommands, 3);
  assert.deepEqual(report.commands[0], {
    workerId: "dashboard",
    tool: "git",
    args: ["worktree", "add", "-b", "codex/dashboard-progress", path.resolve("D:/repo/system-whitepaper-dashboard"), "HEAD"],
    note: "create writable worker worktree and branch",
  });
  assert.deepEqual(report.commands[2], {
    workerId: "readiness",
    tool: "git",
    args: ["worktree", "add", path.resolve("D:/repo/system-whitepaper-readiness"), "codex/readiness-gates"],
    note: "create writable worker worktree from existing branch",
  });
  assert.deepEqual(report.commands[6], {
    workerId: "auditor",
    tool: "git",
    args: ["worktree", "add", "--detach", path.resolve("D:/repo/system-whitepaper-auditor"), "HEAD"],
    note: "create read-only worker worktree",
  });
});

test("agent worktree preparation blocks existing unregistered paths and checked-out branches", () => {
  const path = require("node:path");
  const { buildAgentWorktreePreparation } = require("./prepare-agent-worktrees");
  const git = (args) => {
    const command = args.join(" ");
    if (command === "worktree list --porcelain") {
      return [
        "worktree D:/repo/system-whitepaper",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
        "worktree D:/repo/other",
        "HEAD bbb",
        "branch refs/heads/codex/readiness-gates",
        "",
      ].join("\n");
    }
    if (command === "-C d:/repo/system-whitepaper status --short") return "";
    return "";
  };
  const report = buildAgentWorktreePreparation(
    {
      artifactType: "agent-isolation-plan",
      version: 1,
      expectedWorkers: 2,
      coordinator: {
        id: "main",
        worktree: "D:/repo/system-whitepaper",
        branch: "main",
      },
      mergePolicy: {
        coordinatorOnlyMerge: true,
        reviewRequired: true,
      },
      workers: [
        {
          id: "dashboard",
          worktree: "D:/repo/system-whitepaper-dashboard",
          branch: "codex/dashboard-progress",
          outputDir: "outputs/agent-dashboard",
          handoffReport: "outputs/agent-dashboard/handoff.json",
          writeScope: ["scripts/local-dashboard/"],
        },
        {
          id: "readiness",
          worktree: "D:/repo/system-whitepaper-readiness",
          branch: "codex/readiness-gates",
          outputDir: "outputs/agent-readiness",
          handoffReport: "outputs/agent-readiness/handoff.json",
          writeScope: ["scripts/check-real-run-readiness.js"],
        },
      ],
    },
    {
      expectedWorkers: 2,
      git,
      pathExists: (targetPath) => targetPath === path.resolve("D:/repo/system-whitepaper-dashboard"),
    },
  );
  const violationIds = report.violations.map((item) => item.id);

  assert.equal(report.ok, false);
  assert.ok(violationIds.includes("worker.worktree-path-exists"));
  assert.ok(violationIds.includes("worker.branch-already-checked-out"));
});

test("agent worktree preparation apply executes git commands and mkdirs in report order", () => {
  const { applyAgentWorktreePreparation } = require("./prepare-agent-worktrees");
  const calls = [];
  const applied = applyAgentWorktreePreparation(
    {
      ok: true,
      commands: [
        {
          workerId: "dashboard",
          tool: "git",
          args: ["worktree", "add", "-b", "codex/dashboard-progress", "D:/repo/system-whitepaper-dashboard", "HEAD"],
        },
        {
          workerId: "dashboard",
          tool: "mkdir",
          path: "D:/repo/system-whitepaper-dashboard/outputs/agent-dashboard",
        },
      ],
    },
    {
      git: (args) => {
        calls.push(["git", args]);
        return "";
      },
      mkdir: (targetPath) => {
        calls.push(["mkdir", targetPath]);
      },
    },
  );

  assert.equal(applied.length, 2);
  assert.deepEqual(calls, [
    ["git", ["worktree", "add", "-b", "codex/dashboard-progress", "D:/repo/system-whitepaper-dashboard", "HEAD"]],
    ["mkdir", "D:/repo/system-whitepaper-dashboard/outputs/agent-dashboard"],
  ]);
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
    refreshBatchStateFromDisk,
    renderBatchDiagnosisMarkdown,
    renderBatchRepairQueueMarkdown,
    resolveBatchConcurrency,
    resolveBatchRetries,
    selectBatchSystems,
    recomputeBatchState,
    terminateBatchInFlightSystems,
    updateBatchSystem,
    writeBatchDiagnosis,
    writeBatchRepairQueue,
  } = require("./run-whitepaper-batch");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
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
    "fact-check,golden-eval,quality,truth-readiness",
  );
  assert.equal(
    buildRetryNodes({ withWhitepaper: true }, "fact-check"),
    "fact-check,golden-eval,quality,truth-readiness",
  );
  assert.equal(
    buildRetryNodes({ "with-whitepaper": true }, "truth-universe"),
    "truth-universe,truth-claims,business-process,whitepaper-plan,build-spec,workflow-spec,compose-guide,draft,summary,narrative,fact-check,golden-eval,quality,truth-readiness",
  );
  const retryArgs = buildRetryArgs(
    { "with-whitepaper": true, reset: true, "batch-retries": 2, provider: "manual" },
    "narrative",
  );
  assert.equal(retryArgs.reset, undefined);
  assert.equal(retryArgs["batch-retries"], undefined);
  assert.equal(retryArgs.nodes, "narrative,fact-check,golden-eval,quality,truth-readiness");
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
  assert.equal(narrativeFailure.retryPlan.nodes, "narrative,fact-check,golden-eval,quality,truth-readiness");
  assert.equal(narrativeFailure.retryPlan.quotaImpact, "agent-writing");
  assert.equal(
    classifyBatchFailure({ currentNode: "session", lastError: "401 unauthorized" }).category,
    "auth-or-session",
  );

  const initial = createBatchState(config.systems, {
    concurrency: 4,
    configPath: "config/systems.local.yaml",
    outputRoot: "outputs",
    startedAt: "2026-06-03T00:00:00.000Z",
    now: "2026-06-03T00:00:00.000Z",
  });
  assert.equal(initial.artifactType, "batch-run-state");
  assert.equal(initial.configPath, "config/systems.local.yaml");
  assert.equal(initial.outputRoot, "outputs");
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

  const dirtyPaused = recomputeBatchState({
    ...running,
    systems: [
      {
        ...running.systems[0],
        status: "paused",
        runStatus: "running",
      },
      {
        ...running.systems[1],
        status: "paused",
        runStatus: "queued",
      },
    ],
  });
  assert.equal(dirtyPaused.status, "failed");
  assert.equal(dirtyPaused.summary.running, 0);
  assert.equal(dirtyPaused.summary.queued, 0);
  assert.equal(dirtyPaused.summary.failed, 2);

  const dirtyCompleted = recomputeBatchState({
    ...running,
    systems: [
      {
        ...running.systems[0],
        status: "pending",
        runStatus: "completed",
      },
    ],
  });
  assert.equal(dirtyCompleted.status, "running");
  assert.equal(dirtyCompleted.summary.completed, 0);
  assert.equal(dirtyCompleted.summary.queued, 1);

  const interrupted = terminateBatchInFlightSystems(running, {
    signal: "SIGINT",
    message: "Interrupted by SIGINT",
    stopReason: "signal:SIGINT",
    now: "2026-06-03T00:03:00.000Z",
    args: { "with-whitepaper": true },
  });
  assert.equal(interrupted.status, "failed");
  assert.equal(interrupted.summary.running, 0);
  assert.equal(interrupted.summary.queued, 0);
  assert.equal(interrupted.summary.failed, 2);
  assert.ok(interrupted.finishedAt);
  assert.equal(interrupted.systems.some((item) => ["running", "queued"].includes(item.runStatus)), false);
  assert.equal(interrupted.systems[0].runStatus, "failed");
  assert.equal(interrupted.systems[0].status, "paused");
  assert.equal(interrupted.systems[0].pid, null);
  assert.equal(interrupted.systems[0].failureCategory, "interrupted");
  assert.equal(interrupted.systems[0].recoverable, true);
  assert.equal(interrupted.systems[1].runStatus, "failed");
  assert.equal(interrupted.systems[1].status, "paused");

  const refreshRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-refresh-"));
  const adpOutput = path.join(refreshRoot, "adp");
  let pausedState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  pausedState = updateNodeStatus(pausedState, "narrative", "running");
  pausedState = updateNodeStatus(pausedState, "narrative", "paused", {
    lastError: "用户手动停止",
  });
  writePipelineState(path.join(adpOutput, "pipeline-state.json"), pausedState);
  const refreshed = refreshBatchStateFromDisk(running, refreshRoot, {
    now: "2026-06-03T00:04:00.000Z",
    args: { "with-whitepaper": true },
  });
  assert.equal(refreshed.systems[0].runStatus, "failed");
  assert.equal(refreshed.systems[0].status, "paused");
  assert.equal(refreshed.systems[0].failureCategory, "interrupted");
  assert.equal(refreshed.summary.running, 0);

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
              rerunNodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
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
            nodes: "narrative,fact-check,golden-eval,quality,truth-readiness",
            quotaImpact: "agent-writing",
          },
        },
        failureCategory: "quality-gate",
        recoverable: true,
        retryPlan: {
          canRetry: true,
          nodes: "narrative,fact-check,golden-eval,quality,truth-readiness",
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
  assert.deepEqual(repairQueue.items[0].nodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
  assert.equal(repairQueue.items[0].canAutoRun, false);
  assert.match(repairQueue.items[0].blockedReason, /Agent-writing quota/);
  assert.deepEqual(repairQueue.items[0].missingWritableClaimIds, ["function:理赔:案件详情"]);
  assert.deepEqual(
    repairQueue.items[0].command.args,
    [
      "--systems",
      "claim",
      "--nodes",
      "narrative,fact-check,golden-eval,quality,truth-readiness",
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

test("batch repair queue prefers low-quota stale refresh over narrative rewrite", () => {
  const {
    buildBatchDiagnosis,
    buildBatchRepairQueue,
  } = require("./run-whitepaper-batch");

  const diagnosis = buildBatchDiagnosis({
    batchId: "batch-stale",
    status: "failed",
    systems: [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        status: "failed",
        runStatus: "failed",
        currentNode: "truth-readiness",
        truthReadiness: {
          scorePercent: 70,
          canSubmitReview: false,
          canFinalize: false,
          blockers: [
            {
              id: "narrative.stale-sources",
              severity: "P1",
              message: "narrative-quality-report.json is stale.",
              rerunNodes: ["quality", "truth-readiness"],
              quotaImpact: "low",
            },
            {
              id: "truth.score-below-threshold",
              severity: "P0",
              message: "Truth readiness score is below threshold.",
              rerunNodes: ["truth-claims", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
            },
          ],
          improvementActions: [],
        },
        writableClaimCoverage: { missingWritableClaimCount: 0 },
      },
    ],
  });

  const repairQueue = buildBatchRepairQueue(diagnosis, { allowAgentWriting: false });

  assert.equal(diagnosis.summary.quotaSensitive, 0);
  assert.equal(repairQueue.summary.autoRunnable, 1);
  assert.equal(repairQueue.summary.requiresAgentWriting, 0);
  assert.equal(repairQueue.items[0].actionId, "narrative.stale-sources");
  assert.deepEqual(repairQueue.items[0].nodes, ["quality", "truth-readiness"]);
  assert.equal(repairQueue.items[0].quotaImpact, "low");
  assert.equal(repairQueue.items[0].canAutoRun, true);
});

test("batch repair queue prioritizes unsafe database profile refresh without agent writing", () => {
  const {
    buildBatchDiagnosis,
    buildBatchRepairQueue,
  } = require("./run-whitepaper-batch");

  const diagnosis = buildBatchDiagnosis({
    batchId: "batch-unsafe-db",
    status: "failed",
    systems: [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        status: "failed",
        runStatus: "failed",
        currentNode: "truth-readiness",
        truthReadiness: {
          scorePercent: 70,
          canSubmitReview: false,
          canFinalize: false,
          blockers: [
            {
              id: "database.profile-unsafe",
              severity: "P0",
              message: "database-profile.json is not safely redacted.",
              rerunNodes: ["db-profile", "db-model", "truth-universe", "truth-claims", "truth-readiness"],
              quotaImpact: "low",
            },
            {
              id: "truth.score-below-threshold",
              severity: "P0",
              message: "Truth readiness score is below threshold.",
              rerunNodes: ["truth-claims", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
            },
          ],
          improvementActions: [],
        },
        writableClaimCoverage: { missingWritableClaimCount: 0 },
      },
    ],
  });

  const repairQueue = buildBatchRepairQueue(diagnosis, { allowAgentWriting: false });

  assert.equal(diagnosis.summary.quotaSensitive, 0);
  assert.equal(repairQueue.summary.autoRunnable, 1);
  assert.equal(repairQueue.summary.requiresAgentWriting, 0);
  assert.equal(repairQueue.items[0].actionId, "database.profile-unsafe");
  assert.deepEqual(repairQueue.items[0].nodes, [
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "truth-readiness",
  ]);
  assert.equal(repairQueue.items[0].quotaImpact, "low");
  assert.equal(repairQueue.items[0].canAutoRun, true);
});

test("V5 batch diagnosis summarizes generic gate gaps for non ADP systems", () => {
  const {
    buildBatchDiagnosis,
    buildBatchRepairQueue,
  } = require("./run-whitepaper-batch");

  const diagnosis = buildBatchDiagnosis({
    batchId: "batch-v5-generic",
    status: "failed",
    systems: [
      {
        code: "finance",
        name: "财务费用系统",
        status: "failed",
        runStatus: "failed",
        currentNode: "truth-readiness",
        truthReadiness: {
          scorePercent: 72,
          canSubmitReview: false,
          canFinalize: false,
          gates: {
            workflow: {
              pass: false,
              scorePercent: 0,
              metrics: { operationFlowCount: 0, observedWorkflowStepCount: 0 },
              failures: ["workflow-spec.json has no observed workflow steps."],
            },
            businessProcess: {
              pass: false,
              scorePercent: 0,
              metrics: { processCount: 0, staleSourceCount: 1, stepEvidenceMissingCount: 2 },
              failures: ["business-process-model.json is stale."],
            },
            whitepaperPlan: {
              pass: false,
              scorePercent: 50,
              metrics: {
                requiredItemCount: 4,
                coveredRequiredItemCount: 2,
                planRequiredCoverageRatio: 0.5,
                missingRequiredItemCount: 2,
              },
              failures: ["Pending-review whitepaper omits required whitepaper-plan items."],
            },
            goldenEval: {
              pass: false,
              required: true,
              available: true,
              scorePercent: 80,
              metrics: { coverageRatio: 0.8, criticalCoverageRatio: 1, overclaimCount: 0 },
              failures: ["Golden Eval fact coverage is below threshold."],
            },
          },
          blockers: [
            {
              id: "workflow.steps-missing",
              severity: "P0",
              message: "No observed workflow steps are available.",
              rerunNodes: ["collect", "inspect", "build-spec", "workflow-spec", "business-process", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
            },
            {
              id: "business-process.lineage-stale",
              severity: "P0",
              message: "business-process-model.json is stale.",
              rerunNodes: ["build-spec", "workflow-spec", "business-process", "narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
            },
            {
              id: "whitepaper-plan.required-coverage",
              severity: "P0",
              message: "Pending-review whitepaper omits required whitepaper-plan items.",
              rerunNodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
              quotaImpact: "agent-writing",
            },
            {
              id: "golden-eval.coverage",
              severity: "P0",
              message: "Golden Eval fact coverage is below threshold.",
              rerunNodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
            },
          ],
          improvementActions: [],
        },
        writableClaimCoverage: { missingWritableClaimCount: 0 },
      },
    ],
  });

  assert.equal(diagnosis.summary.gapTypes["workflow-evidence"], 1);
  assert.equal(diagnosis.summary.gapTypes["business-process"], 1);
  assert.equal(diagnosis.summary.gapTypes["whitepaper-plan"], 1);
  assert.equal(diagnosis.summary.gapTypes["golden-eval"], 1);
  assert.ok(diagnosis.systems[0].gaps.some((gap) => gap.type === "workflow-evidence"));
  assert.ok(diagnosis.systems[0].gaps.some((gap) => gap.type === "business-process"));
  assert.ok(diagnosis.systems[0].gaps.some((gap) => gap.type === "whitepaper-plan"));
  assert.ok(diagnosis.systems[0].gaps.some((gap) => gap.type === "golden-eval"));

  const repairQueue = buildBatchRepairQueue(diagnosis, { allowAgentWriting: false });
  assert.deepEqual(repairQueue.items[0].gapTypes, [
    "workflow-evidence",
    "business-process",
    "whitepaper-plan",
    "golden-eval",
  ]);
  assert.equal(repairQueue.items[0].primaryGapType, "workflow-evidence");
  assert.equal(repairQueue.items[0].canAutoRun, false);
  assert.equal(repairQueue.items[0].quotaImpact, "agent-writing");
  assert.ok(repairQueue.items[0].nodes.includes("golden-eval"));
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
  claimState = updateNodeStatus(claimState, "business-process", "success");
  claimState = updateNodeStatus(claimState, "build-spec", "success");
  claimState = updateNodeStatus(claimState, "workflow-spec", "success");
  claimState = updateNodeStatus(claimState, "compose-guide", "success");
  claimState = updateNodeStatus(claimState, "draft", "success");
  claimState = updateNodeStatus(claimState, "summary", "success");
  claimState = updateNodeStatus(claimState, "narrative", "failed", {
    lastError: "model stream aborted",
  });
  writePipelineState(path.join(claimOutput, "pipeline-state.json"), claimState);
  writeTruthReadinessReportFixture(adpOutput, {
    score: 0.96,
    scorePercent: 96,
    generatedAt: "2026-06-03T00:02:00.000Z",
  });
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
  assert.equal(claim.retryPlan.nodes, "narrative,fact-check,golden-eval,quality,truth-readiness");
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

test("batch runner preserves completed partial reruns when truth readiness is submittable", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    createBatchState,
    refreshBatchStateFromDisk,
  } = require("./run-whitepaper-batch");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-partial-refresh-"));
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });
  let pipelineState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  pipelineState = updateNodeStatus(pipelineState, "sync", "success");
  pipelineState = updateNodeStatus(pipelineState, "session", "success");
  pipelineState = updateNodeStatus(pipelineState, "collect", "success");
  pipelineState = updateNodeStatus(pipelineState, "inspect", "success");
  pipelineState = updateNodeStatus(pipelineState, "validate-write", "success");
  pipelineState = updateNodeStatus(pipelineState, "quality", "success");
  pipelineState = updateNodeStatus(pipelineState, "truth-readiness", "success");
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), pipelineState);
  let batchState = createBatchState(
    [{ code: "adp", name: "AI保单数据闭环平台" }],
    { concurrency: 1, startedAt: "2026-06-03T00:00:00.000Z" },
  );
  batchState = {
    ...batchState,
    systems: batchState.systems.map((item) => ({
      ...item,
      status: "success",
      runStatus: "completed",
      exitCode: 0,
      finishedAt: "2026-06-03T00:01:00.000Z",
    })),
  };

  const refreshed = refreshBatchStateFromDisk(batchState, outputRoot, {
    now: "2026-06-03T00:02:00.000Z",
    args: { nodes: "quality,truth-readiness" },
  });

  assert.equal(refreshed.status, "success");
  assert.equal(refreshed.summary.completed, 1);
  assert.equal(refreshed.systems[0].status, "success");
  assert.equal(refreshed.systems[0].runStatus, "completed");
  assert.equal(refreshed.systems[0].truthReadiness.scorePercent, 100);
});

test("batch runner degrades invalid truth readiness artifacts during refresh", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildBatchDiagnosis,
    buildBatchRepairQueue,
    createBatchState,
    refreshBatchStateFromDisk,
  } = require("./run-whitepaper-batch");
  const { createPipelineState, updateNodeStatus, writePipelineState } = require("./pipeline-state");
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "whitepaper-batch-invalid-truth-"));
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  let pipelineState = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
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
    pipelineState = updateNodeStatus(pipelineState, nodeId, "success");
  }
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), pipelineState);
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      scorePercent: 100,
      canSubmitReview: true,
      canFinalize: true,
      blockers: [],
      improvementActions: [],
      generatedAt: "2026-06-03T00:02:00.000Z",
    }),
    "utf8",
  );

  const batchState = createBatchState(
    [{ code: "adp", name: "AI保单数据闭环平台" }],
    { concurrency: 4, startedAt: "2026-06-03T00:00:00.000Z" },
  );
  const refreshed = refreshBatchStateFromDisk(batchState, outputRoot, {
    now: "2026-06-03T00:03:00.000Z",
    args: { "with-whitepaper": true },
  });
  const system = refreshed.systems[0];
  assert.equal(system.truthReadiness.scorePercent, 0);
  assert.equal(system.truthReadiness.canSubmitReview, false);
  assert.equal(system.truthReadiness.invalidArtifact, true);
  assert.equal(system.truthReadiness.blockers[0].id, "truth-readiness.invalid-artifact");

  const diagnosis = buildBatchDiagnosis(refreshed);
  assert.equal(diagnosis.summary.ready, 0);
  assert.equal(diagnosis.summary.blocked, 1);
  assert.equal(diagnosis.systems[0].ready, false);
  assert.ok(diagnosis.systems[0].gaps.some((gap) => gap.type === "truth-readiness.invalid-artifact"));

  const repairQueue = buildBatchRepairQueue(diagnosis);
  assert.equal(repairQueue.summary.autoRunnable, 1);
  assert.equal(repairQueue.items[0].actionId, "truth-readiness.invalid-artifact");
  assert.deepEqual(repairQueue.items[0].nodes, ["truth-readiness"]);
  assert.equal(repairQueue.items[0].quotaImpact, "low");
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
        failed = updateNodeStatus(failed, "business-process", "success");
        failed = updateNodeStatus(failed, "build-spec", "success");
        failed = updateNodeStatus(failed, "workflow-spec", "success");
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
        "business-process",
        "build-spec",
        "workflow-spec",
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
      writeTruthReadinessReportFixture(adpOutput, {
        score: 0.96,
        scorePercent: 96,
        generatedAt: "2026-06-03T00:02:00.000Z",
      });
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
  assert.ok(launchedArgs[1].includes("narrative,fact-check,golden-eval,quality,truth-readiness"));
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
    assertValidRepairClosureArtifact,
    assertValidRepairFollowUpPlanArtifact,
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
        nodes: ["fact-check", "golden-eval", "quality", "truth-readiness"],
        quotaImpact: "low",
      },
      {
        id: "repair-02-claim",
        systemCode: "claim",
        canAutoRun: true,
        reset: false,
        reviewRerun: false,
        nodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
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
  assert.equal(plan.groups[0].nodesCsv, "fact-check,golden-eval,quality,truth-readiness");
  assert.deepEqual(plan.groups[0].command.args.slice(0, 7), [
    "scripts/run-whitepaper-batch.js",
    "--config",
    "config/systems.local.yaml",
    "--systems",
    "adp",
    "--nodes",
    "fact-check,golden-eval,quality,truth-readiness",
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
  assert.doesNotThrow(() => assertValidRepairClosureArtifact(passedClosure));
  assert.throws(
    () => assertValidRepairClosureArtifact({ ...passedClosure, repairQueueEmpty: false }),
    /repairQueueEmpty=true/,
  );
  assert.throws(
    () => assertValidRepairClosureArtifact({ ...passedClosure, blockers: ["still blocked"] }),
    /zero failed groups, pending groups, and blockers/,
  );

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
  assert.doesNotThrow(() => assertValidRepairFollowUpPlanArtifact(passedFollowUp));
  assert.throws(
    () =>
      assertValidRepairFollowUpPlanArtifact({
        ...passedFollowUp,
        commands: [
          {
            id: "forged-command",
            canAutoRun: true,
            canRunWithoutAgentWriting: true,
            requiresAgentWriting: false,
            command: { npmScript: "repair:batch", args: [] },
          },
        ],
        summary: { ...passedFollowUp.summary, commands: 1, lowQuotaCommands: 1 },
      }),
    /status=complete requires no remaining commands/,
  );

  const followUpPlan = buildRepairFollowUpPlan(
    {
      status: "partial",
      groups: [
        {
          id: "repair-group-02",
          status: "pending",
          systems: ["adp"],
          nodesCsv: "fact-check,golden-eval,quality,truth-readiness",
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
                rerunNodes: ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"],
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
  assert.doesNotThrow(() => assertValidRepairFollowUpPlanArtifact(followUpPlan));
  assert.throws(
    () =>
      assertValidRepairFollowUpPlanArtifact({
        ...followUpPlan,
        commands: followUpPlan.commands.filter((item) => item.requiresAgentWriting),
        summary: { ...followUpPlan.summary, commands: 1, lowQuotaCommands: 0, agentWritingCommands: 1 },
      }),
    /status=ready-to-run requires low-quota commands/,
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
    buildFollowUpChildArgs,
    runRepairFollowUpLoop,
    resolveFollowUpPath,
    selectNextFollowUpCommand,
    summarizeLoopStatus,
  } = require("./run-repair-follow-up-loop");

  const followUpPlan = {
    artifactType: "batch-repair-follow-up-plan",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    status: "ready-to-run",
    nextBestAction: "Run the first low-quota follow-up command.",
    source: {
      closureStatus: "blocked",
      runStatus: "partial",
      diagnosisGeneratedAt: "2026-06-03T00:00:00.000Z",
      repairQueueGeneratedAt: "2026-06-03T00:00:00.000Z",
    },
    policy: {
      reset: false,
      reviewNodeAllowed: false,
      agentWritingRequiresFlag: true,
    },
    summary: {
      commands: 2,
      lowQuotaCommands: 1,
      agentWritingCommands: 1,
      failedGroups: 0,
      pendingGroups: 0,
      remainingQueueItems: 1,
      lowQuotaQueueItems: 1,
      agentWritingQueueItems: 0,
      blockedQueueItems: 0,
    },
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
    queueItems: [
      {
        id: "repair-remaining-low-quota",
        systemCode: "adp",
        canAutoRun: true,
        quotaImpact: "low",
        nodesCsv: "truth-readiness",
      },
    ],
    blockedQueueItems: [],
    blockers: ["batch repair still requires follow-up"],
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
  const diagnosisBatchCommand = {
    id: "diagnosis-refresh",
    canAutoRun: true,
    canRunWithoutAgentWriting: true,
    requiresAgentWriting: false,
    requiresExplicitQuotaApproval: false,
    command: {
      npmScript: "batch",
      args: ["--systems", "adp", "--nodes", "truth-readiness", "--reset", "--config", "evil.yaml"],
    },
  };
  assert.equal(selectNextFollowUpCommand({ commands: [diagnosisBatchCommand] }).command.id, "diagnosis-refresh");
  assert.deepEqual(
    buildFollowUpChildArgs(diagnosisBatchCommand, {
      configPath: "config/systems.local.yaml",
      concurrency: 4,
    }),
    [
      "scripts/run-whitepaper-batch.js",
      "--config",
      "config/systems.local.yaml",
      "--concurrency",
      "4",
      "--systems",
      "adp",
      "--nodes",
      "truth-readiness",
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
        version: 1,
        generatedAt: "2026-06-03T00:01:00.000Z",
        status: "complete",
        nextBestAction: "No repair follow-up is required.",
        source: {
          closureStatus: "passed",
          runStatus: "success",
          diagnosisGeneratedAt: "2026-06-03T00:01:00.000Z",
          repairQueueGeneratedAt: "2026-06-03T00:01:00.000Z",
        },
        policy: {
          reset: false,
          reviewNodeAllowed: false,
          agentWritingRequiresFlag: true,
        },
        summary: {
          commands: 0,
          lowQuotaCommands: 0,
          agentWritingCommands: 0,
          failedGroups: 0,
          pendingGroups: 0,
          remainingQueueItems: 0,
          lowQuotaQueueItems: 0,
          agentWritingQueueItems: 0,
          blockedQueueItems: 0,
        },
        commands: [],
        queueItems: [],
        blockedQueueItems: [],
        blockers: [],
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

  fs.writeFileSync(
    path.join(batchDir, "repair-follow-up-plan.json"),
    JSON.stringify({
      ...followUpPlan,
      commands: followUpPlan.commands.filter((item) => item.requiresAgentWriting),
      summary: { ...followUpPlan.summary, commands: 1, lowQuotaCommands: 0, agentWritingCommands: 1 },
    }),
    "utf8",
  );
  await assert.rejects(
    () => runRepairFollowUpLoop({ args: { config: configPath, "max-rounds": 1 }, spawn: fakeSpawn }),
    /not a valid follow-up artifact/,
  );
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
  const { buildFactCheckSourceArtifacts, runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const { fingerprintFile } = require("./repair-artifacts");
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
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });
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
  const batchSourceArtifact = (fileName) => ({
    file: fileName,
    sourceType: "file",
    fingerprint: fingerprintFile(path.join(outputRoot, "_batch", fileName)),
  });
  const repairClosureSourceArtifacts = {
    batchDiagnosis: batchSourceArtifact("diagnosis.json"),
    repairQueue: batchSourceArtifact("repair-queue.json"),
  };
  const repairClosurePath = path.join(outputRoot, "_batch", "repair-closure.json");
  fs.writeFileSync(
    repairClosurePath,
    JSON.stringify({
      artifactType: "batch-repair-closure",
      version: 1,
      generatedAt: "2026-06-03T00:03:00.000Z",
      status: "passed",
      targetTruthScorePercent: 95,
      canSubmitAll: true,
      repairQueueEmpty: true,
      runStatus: "success",
      runStartedAt: "2026-06-03T00:02:30.000Z",
      runFinishedAt: "2026-06-03T00:03:00.000Z",
      diagnosisAvailable: true,
      repairQueueAvailable: true,
      diagnosis: {
        generatedAt: "2026-06-03T00:02:00.000Z",
        summary: {
          total: 1,
          ready: 1,
          blocked: 0,
          belowTarget: 0,
          missingWritableClaims: 0,
          minTruthScore: 98,
        },
      },
      repairQueue: {
        generatedAt: "2026-06-03T00:02:30.000Z",
        summary: { total: 0, autoRunnable: 0, blocked: 0, requiresAgentWriting: 0 },
      },
      sourceArtifacts: repairClosureSourceArtifacts,
      sourceFingerprints: {
        batchDiagnosis: repairClosureSourceArtifacts.batchDiagnosis.fingerprint,
        repairQueue: repairClosureSourceArtifacts.repairQueue.fingerprint,
      },
      batchSystems: ["adp"],
      selectedSystems: ["adp"],
      failedGroups: [],
      pendingGroups: [],
      blockers: [],
    }),
    "utf8",
  );

  const accepted = runBatchAcceptanceCheck({ args: { config: configPath } });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.canSubmitAll, true);
  assert.equal(accepted.summary.accepted, 1);
  assert.equal(accepted.summary.databaseBacked, 1);
  assert.equal(accepted.summary.smokeEvidence, 0);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "acceptance-report.json")), true);
  assert.match(renderBatchAcceptanceMarkdown(accepted), /Batch Acceptance Report/);

  const acceptedRunState = JSON.parse(fs.readFileSync(path.join(outputRoot, "_batch", "run-state.json"), "utf8"));
  fs.writeFileSync(
    path.join(outputRoot, "_batch", "run-state.json"),
    JSON.stringify({
      ...acceptedRunState,
      systems: [{ code: "adp", status: "skipped", runStatus: "completed" }],
    }),
    "utf8",
  );
  const skippedRunState = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(skippedRunState.status, "blocked");
  assert.ok(skippedRunState.blockers.some((item) => item.id === "batch.run-state-system-skipped"));
  fs.writeFileSync(path.join(outputRoot, "_batch", "run-state.json"), JSON.stringify(acceptedRunState), "utf8");

  const acceptedClosureArtifact = JSON.parse(fs.readFileSync(repairClosurePath, "utf8"));
  fs.writeFileSync(
    repairClosurePath,
    JSON.stringify({
      ...acceptedClosureArtifact,
      repairQueueEmpty: false,
    }),
    "utf8",
  );
  const forgedClosure = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(forgedClosure.status, "blocked");
  assert.ok(forgedClosure.blockers.some((item) => item.id === "repair.closure-invalid-artifact"));
  fs.writeFileSync(
    repairClosurePath,
    JSON.stringify(acceptedClosureArtifact),
    "utf8",
  );

  fs.writeFileSync(
    repairClosurePath,
    JSON.stringify({
      ...acceptedClosureArtifact,
      diagnosis: {
        ...acceptedClosureArtifact.diagnosis,
        generatedAt: "2026-06-02T23:59:00.000Z",
      },
    }),
    "utf8",
  );
  const staleClosure = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(staleClosure.status, "blocked");
  assert.ok(staleClosure.blockers.some((item) => item.id === "repair.closure-stale"));
  fs.writeFileSync(repairClosurePath, JSON.stringify(acceptedClosureArtifact), "utf8");

  const followUpSourceArtifacts = {
    batchDiagnosis: batchSourceArtifact("diagnosis.json"),
    repairQueue: batchSourceArtifact("repair-queue.json"),
    repairClosure: batchSourceArtifact("repair-closure.json"),
  };
  const followUpPlanPath = path.join(outputRoot, "_batch", "repair-follow-up-plan.json");
  fs.writeFileSync(
    followUpPlanPath,
    JSON.stringify({
      artifactType: "batch-repair-follow-up-plan",
      version: 1,
      generatedAt: "2026-06-03T00:03:30.000Z",
      status: "ready-to-run",
      nextBestAction: "Run stale low-quota command.",
      source: {
        closureStatus: "blocked",
        runStatus: "success",
        diagnosisGeneratedAt: "2026-06-02T23:59:00.000Z",
        repairQueueGeneratedAt: "2026-06-03T00:02:30.000Z",
      },
      policy: {
        reset: false,
        reviewNodeAllowed: false,
        agentWritingRequiresFlag: true,
      },
      sourceArtifacts: followUpSourceArtifacts,
      sourceFingerprints: {
        batchDiagnosis: followUpSourceArtifacts.batchDiagnosis.fingerprint,
        repairQueue: followUpSourceArtifacts.repairQueue.fingerprint,
        repairClosure: followUpSourceArtifacts.repairClosure.fingerprint,
      },
      batchSystems: ["adp"],
      selectedSystems: ["adp"],
      summary: {
        commands: 1,
        lowQuotaCommands: 1,
        agentWritingCommands: 0,
        remainingQueueItems: 0,
        blockedQueueItems: 0,
      },
      commands: [
        {
          id: "stale-follow-up",
          canAutoRun: true,
          canRunWithoutAgentWriting: true,
          requiresAgentWriting: false,
          requiresExplicitQuotaApproval: false,
          command: { npmScript: "repair:batch", args: [] },
        },
      ],
      queueItems: [],
      blockedQueueItems: [],
      blockers: [],
    }),
    "utf8",
  );
  const staleFollowUp = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(staleFollowUp.status, "blocked");
  assert.ok(staleFollowUp.blockers.some((item) => item.id === "repair.follow-up-stale"));
  fs.unlinkSync(followUpPlanPath);

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      canSubmitReview: true,
      score: 1,
      scorePercent: 100,
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const invalidTruthArtifact = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(invalidTruthArtifact.status, "blocked");
  assert.equal(invalidTruthArtifact.systems[0].scorePercent, 0);
  assert.equal(invalidTruthArtifact.systems[0].canSubmitReview, false);
  assert.ok(invalidTruthArtifact.blockers.some((item) => item.id === "truth-readiness.invalid-artifact"));
  writeTruthReadinessReportFixture(systemOutput, {
    score: 0.98,
    scorePercent: 98,
    requirements: { databaseEvidenceRequired: true },
    gates: {
      database: { pass: true, available: true, required: true, profileAvailable: true, scorePercent: 100 },
    },
  });

  fs.writeFileSync(path.join(systemOutput, "database-profile.json"), JSON.stringify({ artifactType: "entity-model" }), "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const invalidDatabaseProfile = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(invalidDatabaseProfile.status, "blocked");
  assert.equal(invalidDatabaseProfile.systems[0].databaseEvidenceAvailable, false);
  assert.ok(invalidDatabaseProfile.blockers.some((item) => item.id === "database.profile-missing"));

  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({ artifactType: "database-profile", system: { code: "other" }, tables: [], safety: { secretRedacted: true } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const wrongSystemDatabaseProfile = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(wrongSystemDatabaseProfile.status, "blocked");
  assert.equal(wrongSystemDatabaseProfile.systems[0].databaseEvidenceAvailable, false);
  assert.ok(wrongSystemDatabaseProfile.blockers.some((item) => item.id === "database.profile-missing"));

  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp" },
      source: { secret: { type: "mysql", host: "127.0.0.1", password: "[redacted]" } },
      tables: [],
      safety: { secretRedacted: true },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const unsafeDatabaseProfile = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(unsafeDatabaseProfile.status, "blocked");
  assert.equal(unsafeDatabaseProfile.systems[0].databaseEvidenceAvailable, false);
  assert.equal(unsafeDatabaseProfile.summary.databaseBacked, 0);
  assert.ok(unsafeDatabaseProfile.blockers.some((item) => item.id === "database.profile-unsafe"));

  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({ artifactType: "database-profile", system: { code: "adp" }, tables: [], safety: { secretRedacted: true } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      mode: "local-e2e-smoke",
    }),
    "utf8",
  );
  const smokeTruth = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(smokeTruth.status, "blocked");
  assert.equal(smokeTruth.canSubmitAll, false);
  assert.equal(smokeTruth.summary.smokeEvidence, 1);
  assert.ok(smokeTruth.blockers.some((item) => item.id === "truth-readiness.smoke-report"));

  const e2eOutputRoot = path.join(dir, "outputs", "_e2e");
  const e2eSystemOutput = path.join(e2eOutputRoot, "adp");
  fs.mkdirSync(e2eSystemOutput, { recursive: true });
  for (const file of fs.readdirSync(systemOutput)) {
    const source = path.join(systemOutput, file);
    const target = path.join(e2eSystemOutput, file);
    if (fs.statSync(source).isFile()) {
      fs.copyFileSync(source, target);
    }
  }
  fs.mkdirSync(path.join(e2eOutputRoot, "_batch"), { recursive: true });
  for (const file of fs.readdirSync(path.join(outputRoot, "_batch"))) {
    const source = path.join(outputRoot, "_batch", file);
    const target = path.join(e2eOutputRoot, "_batch", file);
    if (fs.statSync(source).isFile()) {
      fs.copyFileSync(source, target);
    }
  }
  fs.writeFileSync(
    path.join(e2eSystemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(e2eSystemOutput, "truth-readiness-report.json"), "utf8")),
      mode: "",
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(e2eSystemOutput)),
    }),
    "utf8",
  );
  const e2eAcceptance = buildBatchAcceptanceReport({
    context: {
      configPath,
      outputRoot: e2eOutputRoot,
      config: {
        systems: [{ code: "adp", name: "AI保单数据闭环平台", databaseProfile: { enabled: true } }],
      },
    },
    systems: [{ code: "adp", name: "AI保单数据闭环平台", databaseProfile: { enabled: true } }],
  });
  assert.equal(e2eAcceptance.status, "blocked");
  assert.equal(e2eAcceptance.canSubmitAll, false);
  assert.ok(e2eAcceptance.blockers.some((item) => item.id === "truth-readiness.output-under-e2e"));

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      mode: "",
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书\n\nlocal-e2e-smoke artifact, not final business whitepaper.",
    "utf8",
  );
  const smokeWhitepaper = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(smokeWhitepaper.status, "blocked");
  assert.equal(smokeWhitepaper.canSubmitAll, false);
  assert.equal(smokeWhitepaper.summary.smokeEvidence, 1);
  assert.ok(smokeWhitepaper.blockers.some((item) => item.id === "whitepaper.smoke-artifact"));

  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingUiOnlyNarrativeMarkdown(),
    "utf8",
  );
  runFactCheck({ inputDir: systemOutput });
  runNarrativeCheck({ inputDir: systemOutput });
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );

  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.final.md"),
    `${passingUiOnlyNarrativeMarkdown()}\n\n## 手工篡改的终稿内容\n这里模拟终稿绕过待审稿和事实核验。`,
    "utf8",
  );
  const forgedFinalWhitepaper = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(forgedFinalWhitepaper.status, "blocked");
  assert.equal(forgedFinalWhitepaper.canSubmitAll, false);
  assert.ok(forgedFinalWhitepaper.blockers.some((item) => item.id === "whitepaper.final-not-approved-pending"));
  fs.unlinkSync(path.join(systemOutput, "whitepaper.final.md"));

  fs.writeFileSync(path.join(systemOutput, "quality-report.json"), "{\"canFinalize\":false}", "utf8");
  const stale = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(stale.status, "blocked");
  assert.ok(stale.blockers.some((item) => item.id === "truth-readiness.stale-sources"));

  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      artifactType: "fact-check-report",
      version: 1,
      canFinalize: false,
      failures: [],
      coveredWritableClaimIds: [],
      missingWritableClaimIds: ["function:保单任务:任务列表"],
      metrics: {
        claimCount: 1,
        writableClaimCount: 1,
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 0,
        missingWritableClaimCount: 1,
        writableClaimCoverageRatio: 0,
        minWritableClaimCoverage: 0.8,
      },
      sourceArtifacts: buildFactCheckSourceArtifacts({
        markdownPath: path.join(systemOutput, "whitepaper.pending-review.md"),
        claimsPath: path.join(systemOutput, "verified-claims.json"),
      }),
    }),
    "utf8",
  );
  writeQualityReportFixture(systemOutput);
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify(truthReadinessReportFixture(systemOutput, {
      score: 0.99,
      scorePercent: 99,
      requirements: { databaseEvidenceRequired: true },
      gates: {
        database: { pass: true, available: true, required: true, profileAvailable: true, scorePercent: 100 },
      },
      generatedAt: "2026-06-03T00:03:00.000Z",
    })),
    "utf8",
  );
  const currentGateFailed = buildBatchAcceptanceReport({ args: { config: configPath } });
  assert.equal(currentGateFailed.status, "blocked");
  assert.ok(currentGateFailed.systems[0].scorePercent < 95);
  assert.equal(currentGateFailed.systems[0].canSubmitReview, false);
  assert.ok(currentGateFailed.blockers.some((item) => item.id === "truth-readiness.current-gate-failed"));
  assert.ok(currentGateFailed.blockers.some((item) => item.id === "fact-check.writable-coverage"));
  assert.ok(currentGateFailed.blockers.some((item) => item.id === "fact-check.missing-writable-claims"));

  runFactCheck({ inputDir: systemOutput });
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify(truthReadinessReportFixture(systemOutput, {
      scorePercent: 94,
      score: 0.94,
      canSubmitReview: true,
      canFinalize: true,
      requirements: { databaseEvidenceRequired: true },
      gates: {
        database: { pass: true, available: true, required: true, profileAvailable: true, scorePercent: 100 },
        factCheck: {
          pass: true,
          scorePercent: 100,
          metrics: { writableClaimCoverageRatio: 1, minWritableClaimCoverage: 0.8, missingWritableClaimCount: 0 },
        },
      },
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    })),
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
  const { buildFactCheckSourceArtifacts } = require("./fact-check-whitepaper");
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");
  const {
    buildDeliveryReadinessReport,
    buildDeliveryReadinessStateSummary,
    renderDeliveryReadinessMarkdown,
    writeDeliveryReadinessReport,
  } = require("./check-delivery-readiness");
  const { exportWhitepaperWord } = require("./export-whitepaper-word");
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
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown(),
    "utf8",
  );
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });

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

  const pendingOnly = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(pendingOnly.status, "blocked");
  assert.equal(pendingOnly.canDeliver, false);
  assert.equal(pendingOnly.configPath, configPath);
  assert.equal(pendingOnly.outputRoot, outputRoot);
  assert.equal(pendingOnly.summary.ready, 0);
  assert.equal(pendingOnly.summary.whitepapers, 1);
  assert.equal(pendingOnly.summary.staleSystems, 0);
  assert.equal(pendingOnly.systems[0].whitepaperExists, true);
  assert.equal(pendingOnly.systems[0].pendingReviewExists, true);
  assert.equal(pendingOnly.systems[0].finalExists, false);
  assert.equal(pendingOnly.systems[0].docxCurrent, false);
  assert.ok(pendingOnly.blockers.some((item) => item.id === "delivery.final-missing"));
  assert.ok(pendingOnly.blockers.some((item) => item.id === "delivery.review-not-approved"));
  assert.match(renderDeliveryReadinessMarkdown(pendingOnly), /Delivery Readiness Report/);

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      canSubmitReview: true,
      score: 1,
      scorePercent: 100,
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const invalidTruthArtifact = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(invalidTruthArtifact.status, "blocked");
  assert.equal(invalidTruthArtifact.systems[0].scorePercent, 0);
  assert.equal(invalidTruthArtifact.systems[0].canSubmitReview, false);
  assert.ok(invalidTruthArtifact.blockers.some((item) => item.id === "delivery.truth-invalid-artifact"));
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });

  fs.writeFileSync(
    path.join(systemOutput, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp" },
      source: { secret: { type: "mysql", host: "127.0.0.1", password: "[redacted]" } },
      tables: [],
      safety: { secretRedacted: true },
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(systemOutput, "truth-readiness-report.json"), "utf8")),
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    }),
    "utf8",
  );
  const unsafeDbReady = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(unsafeDbReady.status, "blocked");
  assert.equal(unsafeDbReady.systems[0].databaseEvidenceAvailable, false);
  assert.equal(unsafeDbReady.summary.databaseBacked, 0);
  assert.ok(unsafeDbReady.blockers.some((item) => item.id === "delivery.current-truth-gate-failed"));
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });

  const artifacts = writeDeliveryReadinessReport(outputRoot, pendingOnly);
  const stateSummary = buildDeliveryReadinessStateSummary(pendingOnly, artifacts);
  assert.equal(stateSummary.status, "blocked");
  assert.equal(stateSummary.canDeliver, false);
  assert.equal(stateSummary.artifacts.deliveryReadinessMarkdown, "delivery-readiness-report.md");
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.json")), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "delivery-readiness-report.md")), true);

  const finalPath = path.join(systemOutput, "whitepaper.final.md");
  const approvedFinalMarkdown = finalizeWhitepaperMarkdown(
    fs.readFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "utf8"),
    { systemName: "AI保单数据闭环平台" },
  );
  fs.writeFileSync(finalPath, approvedFinalMarkdown, "utf8");
  const word = exportWhitepaperWord({
    inputPath: finalPath,
    systemName: "AI保单数据闭环平台",
    date: "2026-06-03",
  });
  state = {
    ...state,
    overallStatus: "finalized",
    review: { status: "approved" },
    artifacts: {
      ...(state.artifacts || {}),
      final: "whitepaper.final.md",
      docx: path.basename(word.outputPath),
      docxManifest: path.basename(word.manifestPath),
    },
  };
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);
  const finalReady = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(finalReady.status, "ready");
  assert.equal(finalReady.canDeliver, true);
  assert.equal(finalReady.summary.finalWhitepapers, 1);
  assert.equal(finalReady.summary.docxCurrent, 1);
  assert.equal(finalReady.systems[0].docxExists, true);
  assert.equal(finalReady.systems[0].docxManifestExists, true);
  assert.equal(finalReady.systems[0].docxCurrent, true);
  fs.writeFileSync(
    finalPath,
    `${approvedFinalMarkdown}\n\n## 手工篡改的终稿内容\n这里模拟终稿绕过待审稿和事实核验后重新导出 Word。`,
    "utf8",
  );
  const forgedWord = exportWhitepaperWord({
    inputPath: finalPath,
    systemName: "AI保单数据闭环平台",
    date: "2026-06-03",
  });
  const forgedFinal = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(forgedFinal.status, "blocked");
  assert.equal(forgedFinal.canDeliver, false);
  assert.equal(forgedFinal.systems[0].docxCurrent, true);
  assert.ok(forgedFinal.blockers.some((item) => item.id === "delivery.final-not-approved-pending"));
  fs.unlinkSync(forgedWord.outputPath);
  fs.unlinkSync(forgedWord.manifestPath);
  fs.writeFileSync(finalPath, approvedFinalMarkdown, "utf8");
  exportWhitepaperWord({
    inputPath: finalPath,
    systemName: "AI保单数据闭环平台",
    date: "2026-06-03",
  });
  fs.appendFileSync(finalPath, "\n\n## 未导出的变更\n这里模拟最终稿变更后未重新导出 Word。", "utf8");
  const staleWord = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(staleWord.status, "blocked");
  assert.equal(staleWord.canDeliver, false);
  assert.equal(staleWord.systems[0].docxCurrent, false);
  assert.ok(staleWord.blockers.some((item) => item.id === "delivery.docx-not-current"));
  fs.unlinkSync(finalPath);
  fs.unlinkSync(word.outputPath);
  fs.unlinkSync(word.manifestPath);

  fs.unlinkSync(path.join(systemOutput, "whitepaper.pending-review.md"));
  const missingWhitepaper = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(missingWhitepaper.status, "blocked");
  assert.equal(missingWhitepaper.canDeliver, false);
  assert.equal(missingWhitepaper.summary.whitepapers, 0);
  const missingWhitepaperBlocker = missingWhitepaper.blockers.find((item) => item.id === "delivery.whitepaper-missing");
  assert.ok(missingWhitepaperBlocker);
  assert.deepEqual(missingWhitepaperBlocker.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown(),
    "utf8",
  );

  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.final.md"),
    "# AI保单数据闭环平台功能白皮书\n\n本地冒烟，不代表最终业务白皮书内容。",
    "utf8",
  );
  const smokeFinal = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(smokeFinal.status, "blocked");
  assert.equal(smokeFinal.canDeliver, false);
  const smokeWhitepaperBlocker = smokeFinal.blockers.find((item) => item.id === "delivery.smoke-whitepaper");
  assert.ok(smokeWhitepaperBlocker);
  assert.deepEqual(smokeWhitepaperBlocker.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
  fs.unlinkSync(path.join(systemOutput, "whitepaper.final.md"));

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
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });

  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      artifactType: "fact-check-report",
      version: 1,
      canFinalize: false,
      failures: [],
      coveredWritableClaimIds: [],
      missingWritableClaimIds: ["function:保单任务:任务列表"],
      metrics: {
        claimCount: 1,
        writableClaimCount: 1,
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 0,
        missingWritableClaimCount: 1,
        writableClaimCoverageRatio: 0,
        minWritableClaimCoverage: 0.8,
      },
      sourceArtifacts: buildFactCheckSourceArtifacts({
        markdownPath: path.join(systemOutput, "whitepaper.pending-review.md"),
        claimsPath: path.join(systemOutput, "verified-claims.json"),
      }),
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify(truthReadinessReportFixture(systemOutput, {
      score: 0.99,
      scorePercent: 99,
      requirements: { databaseEvidenceRequired: true },
      gates: {
        database: { pass: true, available: true, required: true, profileAvailable: true, scorePercent: 100 },
        factCheck: {
          pass: true,
          scorePercent: 100,
          metrics: { writableClaimCoverageRatio: 1, minWritableClaimCoverage: 0.8, missingWritableClaimCount: 0 },
        },
      },
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    })),
    "utf8",
  );
  const currentGateFailed = buildDeliveryReadinessReport({ acceptanceReport });
  assert.equal(currentGateFailed.status, "blocked");
  assert.equal(currentGateFailed.canDeliver, false);
  assert.equal(currentGateFailed.systems[0].scorePercent, 75);
  assert.equal(currentGateFailed.systems[0].canSubmitReview, false);
  assert.ok(currentGateFailed.blockers.some((item) => item.id === "delivery.current-truth-gate-failed"));
  writePassingTruthArtifacts(systemOutput, { requireDatabaseEvidence: true });

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

test("V5 batch acceptance rerun chains preserve golden eval after fact check", () => {
  const os = require("node:os");
  const path = require("node:path");
  const { buildSystemAcceptance } = require("./check-batch-acceptance");
  const context = { outputRoot: path.join(os.tmpdir(), "v5-batch-rerun-chain") };

  const report = buildSystemAcceptance({ code: "finance", name: "财务费用系统" }, context, {
    targetTruthScorePercent: 95,
  });

  const missingWhitepaperBlocker = report.blockers.find((item) => item.id === "whitepaper.missing");
  assert.ok(missingWhitepaperBlocker);
  assert.deepEqual(missingWhitepaperBlocker.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
});

test("batch aggregate report contracts reject forged ready states", () => {
  const { assertValidBatchAcceptanceReportArtifact } = require("./check-batch-acceptance");
  const { assertValidDeliveryReadinessReportArtifact } = require("./check-delivery-readiness");
  const acceptance = {
    artifactType: "batch-acceptance-report",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    status: "accepted",
    canSubmitAll: true,
    targetTruthScorePercent: 95,
    configPath: "config/systems.local.yaml",
    outputRoot: "outputs",
    summary: { total: 1, accepted: 1, blocked: 0, blockers: 0, warnings: 0 },
    systems: [{ code: "adp", status: "accepted", accepted: true, canSubmitReview: true, blockers: [] }],
    blockers: [],
    warnings: [],
  };
  const delivery = {
    artifactType: "delivery-readiness-report",
    version: 1,
    generatedAt: "2026-06-03T00:01:00.000Z",
    status: "ready",
    canDeliver: true,
    targetTruthScorePercent: 95,
    acceptance: { status: "accepted", canSubmitAll: true, generatedAt: acceptance.generatedAt },
    configPath: "config/systems.local.yaml",
    outputRoot: "outputs",
    summary: { total: 1, ready: 1, blocked: 0, blockers: 0, warnings: 0 },
    systems: [{ code: "adp", status: "ready", ready: true, accepted: true, canSubmitReview: true, blockers: [] }],
    blockers: [],
    warnings: [],
  };

  assert.doesNotThrow(() => assertValidBatchAcceptanceReportArtifact(acceptance));
  assert.doesNotThrow(() => assertValidDeliveryReadinessReportArtifact(delivery));
  assert.throws(
    () =>
      assertValidBatchAcceptanceReportArtifact({
        ...acceptance,
        blockers: [{ id: "truth-readiness.current-gate-failed" }],
      }),
    /zero blockers/,
  );
  assert.throws(
    () =>
      assertValidBatchAcceptanceReportArtifact({
        ...acceptance,
        systems: [{ code: "adp", status: "blocked", accepted: false, blockers: [] }],
      }),
    /every system to be accepted/,
  );
  assert.throws(
    () =>
      assertValidDeliveryReadinessReportArtifact({
        ...delivery,
        acceptance: { status: "blocked", canSubmitAll: false },
      }),
    /accepted batch acceptance/,
  );
  assert.throws(
    () =>
      assertValidDeliveryReadinessReportArtifact({
        ...delivery,
        systems: [{ code: "adp", status: "blocked", ready: false, blockers: [] }],
      }),
    /every system to be ready/,
  );
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
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingUiOnlyNarrativeMarkdown(),
    "utf8",
  );
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });
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
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    status: "accepted",
    canSubmitAll: true,
    targetTruthScorePercent: 95,
    configPath,
    outputRoot,
    summary: { total: 1, accepted: 1, blocked: 0, blockers: 0, warnings: 0 },
    systems: [{ code: "adp", status: "accepted", accepted: true, canSubmitReview: true, blockers: [] }],
    blockers: [],
    warnings: [],
  };
  const deliveryReport = {
    artifactType: "delivery-readiness-report",
    version: 1,
    generatedAt: "2026-06-03T00:01:00.000Z",
    status: "ready",
    canDeliver: true,
    targetTruthScorePercent: 95,
    configPath,
    outputRoot,
    acceptance: {
      status: "accepted",
      canSubmitAll: true,
      generatedAt: "2026-06-03T00:00:00.000Z",
      summary: { total: 1, accepted: 1, blocked: 0, blockers: 0 },
    },
    summary: { total: 1, ready: 1, blocked: 0, blockers: 0, warnings: 0 },
    systems: [
      {
        code: "adp",
        status: "ready",
        ready: true,
        accepted: true,
        canSubmitReview: true,
        blockers: [],
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
    blockers: [],
    warnings: [],
  };
  const completedBatchRunState = {
    artifactType: "batch-run-state",
    status: "success",
    batchId: "batch-real-run",
    concurrency: 4,
    configPath,
    outputRoot,
    startedAt: "2026-06-03T00:00:00.000Z",
    finishedAt: "2026-06-03T00:02:00.000Z",
    summary: { total: 1, queued: 0, running: 0, completed: 1, failed: 0, paused: 0 },
    systems: [
      {
        code: "adp",
        name: "AI保单数据闭环平台",
        status: "review-pending",
        runStatus: "completed",
        currentPhase: "approve",
        currentNode: "review",
      },
    ],
  };
  fs.mkdirSync(path.join(outputRoot, "_batch"), { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "_batch", "run-state.json"), JSON.stringify(completedBatchRunState), "utf8");
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
  assert.equal(ready.batchRun.status, "success");
  const artifacts = writeRealRunReadinessReport(outputRoot, ready);
  assert.equal(fs.existsSync(artifacts.jsonPath), true);
  assert.equal(fs.existsSync(path.join(outputRoot, "_batch", "real-run-readiness-report.md")), true);

  const collectSkippedState = {
    ...state,
    nodes: {
      ...state.nodes,
      collect: {
        ...state.nodes.collect,
        status: "skipped",
      },
    },
  };
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), collectSkippedState);
  const skippedRequiredNodeReady = buildRealRunReadinessReport({
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
  assert.equal(skippedRequiredNodeReady.status, "in-progress");
  assert.equal(skippedRequiredNodeReady.canDeliver, false);
  assert.ok(
    skippedRequiredNodeReady.warnings.some(
      (item) => item.id === "delivery.current-required-nodes-not-success",
    ),
  );
  writePipelineState(path.join(systemOutput, "pipeline-state.json"), state);

  const skippedBatchReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
    batchRunState: {
      ...completedBatchRunState,
      systems: [
        {
          ...completedBatchRunState.systems[0],
          status: "skipped",
          runStatus: "completed",
        },
      ],
    },
    acceptanceReport,
    deliveryReport,
  });
  assert.equal(skippedBatchReady.status, "in-progress");
  assert.equal(skippedBatchReady.canDeliver, false);
  assert.ok(skippedBatchReady.warnings.some((item) => item.id === "batch.run-state-not-terminal"));

  const runningBatchRunState = {
    ...completedBatchRunState,
    status: "running",
    finishedAt: "",
    summary: { total: 1, queued: 0, running: 1, completed: 0, failed: 0, paused: 0 },
    systems: [
      {
        ...completedBatchRunState.systems[0],
        status: "running",
        runStatus: "running",
        currentPhase: "compose",
        currentNode: "narrative",
      },
    ],
  };
  const runningBatchReady = buildRealRunReadinessReport({
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
    batchRunState: runningBatchRunState,
  });
  assert.equal(runningBatchReady.status, "in-progress");
  assert.equal(runningBatchReady.canDeliver, false);
  assert.equal(runningBatchReady.deliveryReadiness, null);
  assert.equal(runningBatchReady.batchRun.status, "running");
  assert.ok(runningBatchReady.warnings.some((item) => item.id === "batch.run-state-not-terminal"));

  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书\n\n本地冒烟，不代表最终业务白皮书内容。",
    "utf8",
  );
  const staleWhitepaper = buildRealRunReadinessReport({
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
  assert.equal(staleWhitepaper.status, "in-progress");
  assert.equal(staleWhitepaper.canDeliver, false);
  assert.ok(staleWhitepaper.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  assert.match(
    staleWhitepaper.warnings.find((item) => item.id === "delivery.current-truth-invalid")?.message || "",
    /whitepaper.*adp:smoke-whitepaper/,
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown(),
    "utf8",
  );

  fs.unlinkSync(path.join(systemOutput, "whitepaper.pending-review.md"));
  const missingWhitepaperReady = buildRealRunReadinessReport({
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
  assert.equal(missingWhitepaperReady.status, "in-progress");
  assert.equal(missingWhitepaperReady.canDeliver, false);
  assert.ok(missingWhitepaperReady.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  assert.match(
    missingWhitepaperReady.warnings.find((item) => item.id === "delivery.current-truth-invalid")?.message || "",
    /whitepaper.*adp:missing-whitepaper/,
  );
  fs.writeFileSync(
    path.join(systemOutput, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown(),
    "utf8",
  );

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
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });

  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify(truthReadinessReportFixture(systemOutput, {
      scorePercent: 98,
      score: 0.98,
      canSubmitReview: true,
      canFinalize: true,
      mode: "local-e2e-smoke",
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    })),
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
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });

  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify({
      canFinalize: false,
      failures: [],
      metrics: {
        claimCount: 1,
        writableClaimCount: 1,
        checkedAssertions: 1,
        supportedAssertions: 1,
        supportedRatio: 1,
        coveredWritableClaimCount: 0,
        missingWritableClaimCount: 1,
        writableClaimCoverageRatio: 0,
        minWritableClaimCoverage: 0.8,
      },
      missingWritableClaimIds: ["function:保单任务:任务列表"],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(systemOutput, "truth-readiness-report.json"),
    JSON.stringify(truthReadinessReportFixture(systemOutput, {
      scorePercent: 98,
      score: 0.98,
      canSubmitReview: true,
      canFinalize: true,
      blockers: [],
      sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(systemOutput)),
    })),
    "utf8",
  );
  const currentGateInvalidReady = buildRealRunReadinessReport({
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
  assert.equal(currentGateInvalidReady.status, "in-progress");
  assert.equal(currentGateInvalidReady.canDeliver, false);
  assert.ok(currentGateInvalidReady.warnings.some((item) => item.id === "delivery.current-truth-invalid"));
  assert.match(
    currentGateInvalidReady.warnings.find((item) => item.id === "delivery.current-truth-invalid")?.message || "",
    /adp:current-truth-gate-failed/,
  );
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });

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
  const dbMetadataPath = path.join(dir, "secrets", "db", "adp-metadata.json");
  fs.writeFileSync(dbMetadataPath, JSON.stringify({ tables: [] }), "utf8");
  fs.writeFileSync(dbSecretPath, JSON.stringify({ readOnly: true, metadataFile: "secrets/db/adp-metadata.json" }), "utf8");
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

  const unsafeMetadataDir = path.join(dir, "fixtures");
  fs.mkdirSync(unsafeMetadataDir, { recursive: true });
  fs.writeFileSync(path.join(unsafeMetadataDir, "db-metadata.json"), JSON.stringify({ tables: [] }), "utf8");
  fs.writeFileSync(dbSecretPath, JSON.stringify({ readOnly: true, metadataFile: "fixtures/db-metadata.json" }), "utf8");
  const unsafeMetadataReady = buildRealRunReadinessReport({
    args: { systems: "adp" },
    context: dbContext,
    doctor: {
      ok: true,
      failures: [],
      warnings: [],
      counts: { failures: 0, warnings: 0, systems: 1 },
    },
  });
  assert.equal(unsafeMetadataReady.status, "blocked");
  assert.ok(unsafeMetadataReady.blockers.some((item) => item.id === "database.metadata-path-unsafe"));
  fs.writeFileSync(dbSecretPath, JSON.stringify({ readOnly: true, metadataFile: "secrets/db/adp-metadata.json" }), "utf8");

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

  const forgedAcceptanceReady = buildRealRunReadinessReport({
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
      summary: { total: 1, accepted: 0, blocked: 1, blockers: 0 },
      systems: [{ code: "adp", status: "blocked", accepted: false, blockers: [] }],
    },
    deliveryReport,
  });
  assert.equal(forgedAcceptanceReady.status, "ready-to-run");
  assert.equal(forgedAcceptanceReady.canDeliver, false);
  assert.ok(forgedAcceptanceReady.warnings.some((item) => item.id === "acceptance.invalid-artifact"));

  const forgedDeliveryReady = buildRealRunReadinessReport({
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
      summary: { total: 1, ready: 0, blocked: 1, blockers: 0 },
      systems: [{ code: "adp", status: "blocked", ready: false, nodeStatus: deliveryReport.systems[0].nodeStatus }],
    },
  });
  assert.equal(forgedDeliveryReady.status, "in-progress");
  assert.equal(forgedDeliveryReady.canDeliver, false);
  assert.ok(forgedDeliveryReady.warnings.some((item) => item.id === "delivery.invalid-artifact"));

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

test("real run readiness classifies V7 blocked categories", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildRealRunReadinessReport,
    renderRealRunReadinessMarkdown,
  } = require("./check-real-run-readiness");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real-run-v7-categories-"));
  const outputRoot = path.join(dir, "outputs");
  const dbSecretPath = path.join(dir, "secrets", "db", "finance.json");
  fs.mkdirSync(path.dirname(dbSecretPath), { recursive: true });
  fs.mkdirSync(path.join(dir, "fixtures"), { recursive: true });
  fs.writeFileSync(
    dbSecretPath,
    JSON.stringify({ readOnly: false, metadataFile: "fixtures/finance-metadata.json" }),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "fixtures", "finance-metadata.json"), JSON.stringify({ tables: [] }), "utf8");

  const report = buildRealRunReadinessReport({
    args: { systems: "finance,finance" },
    context: {
      projectRoot: dir,
      configPath: path.join(dir, "systems.local.yaml"),
      configDir: dir,
      outputRoot,
      config: {
        runtime: { outputDir: "outputs" },
        systems: [
          {
            code: "finance",
            name: "Finance System",
            url: "",
            databaseProfile: {
              enabled: true,
              mode: "connector",
              secretFile: "secrets/db/finance.json",
            },
          },
        ],
      },
    },
    doctor: {
      ok: false,
      failures: [{ id: "runtime.test-data-prefix-missing", message: "runtime.testDataPrefix is required." }],
      warnings: [],
      counts: { failures: 1, warnings: 0, systems: 1 },
    },
  });

  const byId = new Map(report.blockers.map((item) => [item.id, item]));
  assert.equal(byId.get("doctor.runtime.test-data-prefix-missing").blockedCategory, "config");
  assert.equal(byId.get("system.url-missing").blockedCategory, "config");
  assert.equal(byId.get("system.duplicate-request").blockedCategory, "resource");
  assert.equal(byId.get("database.connector-not-readonly").blockedCategory, "db");
  assert.deepEqual(report.summary.blockedCategories, { config: 2, resource: 1, db: 1 });

  const markdown = renderRealRunReadinessMarkdown(report);
  assert.match(markdown, /\| Category \|/);
  assert.match(markdown, /database\.connector-not-readonly \| db \|/);
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
              nodes: "narrative,fact-check,golden-eval,quality,truth-readiness",
              quotaImpact: "agent-writing",
            },
          },
          failureCategory: "narrative-generation",
          recoverable: true,
          retryPlan: {
            canRetry: true,
            nodes: "narrative,fact-check,golden-eval,quality,truth-readiness",
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
      "business-process",
      "whitepaper-plan",
      "narrative",
      "fact-check",
      "golden-eval",
      "quality",
      "truth-readiness",
    ]);
    assert.equal(payload.rerunNarrativePart, "");
    assert.ok(
      payload.rerun.args.includes(
        "collect,inspect,summary,db-model,truth-universe,truth-claims,business-process,whitepaper-plan,narrative,fact-check,golden-eval,quality,truth-readiness",
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
    "workflow-spec",
    "compose-guide",
    "quality",
  ]);
  assert.deepEqual(selectedNodes({ "with-whitepaper": true }), [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "summary",
    "build-spec",
    "workflow-spec",
    "compose-guide",
    "db-profile",
    "db-model",
    "truth-universe",
    "truth-claims",
    "business-process",
    "whitepaper-plan",
    "draft",
    "narrative",
    "fact-check",
    "golden-eval",
    "quality",
    "truth-readiness",
  ]);
});

test("pipeline local batch state marks finalized systems completed", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { writeBatchState } = require("./run-whitepaper-pipeline");

  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-local-batch-state-"));
  writeBatchState(outputRoot, {
    code: "adp",
    overallStatus: "finalized",
    currentPhase: "completed",
    currentNode: "end",
  });

  const written = JSON.parse(
    fs.readFileSync(path.join(outputRoot, "_batch", "run-state.json"), "utf8"),
  );
  assert.equal(written.systems[0].status, "finalized");
  assert.equal(written.systems[0].runStatus, "completed");
  assert.equal(written.summary.completed, 1);
  assert.equal(written.total, 1);
});

test("pipeline golden-eval node skips without configured golden facts", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-golden-skip-"));
  const systemOutput = path.join(tempRoot, "outputs", "generic-finance");
  fs.mkdirSync(systemOutput, { recursive: true });

  const result = await runPipelineNode("golden-eval", {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "generic-finance", name: "费用与预算管理系统" },
    systemOutput,
    projectRoot: path.resolve(__dirname, ".."),
  });

  assert.equal(result.skipped, true);
  assert.match(result.reason, /golden facts/i);
  assert.equal(fs.existsSync(path.join(systemOutput, "golden-eval-report.json")), false);
});

test("pipeline golden-eval node writes report when golden facts are configured", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-golden-run-"));
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const goldenFactsPath = path.join(tempRoot, "adp-golden-facts.json");
  fs.writeFileSync(
    goldenFactsPath,
    JSON.stringify({
      artifactType: "golden-facts",
      version: 1,
      systemCode: "adp",
      facts: [
        {
          id: "adp:value:coverage",
          priority: "P0",
          statement: "平台覆盖保司数据闭环。",
          match: { all: ["保司", "数据", "闭环"] },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), "平台覆盖保司数据闭环。", "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "fact-check-report.json"),
    JSON.stringify(factCheckReportFixture()),
    "utf8",
  );

  const result = await runPipelineNode("golden-eval", {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台", goldenFactsPath },
    systemOutput,
    projectRoot: path.resolve(__dirname, ".."),
  });

  assert.equal(result.status, 0);
  const report = JSON.parse(fs.readFileSync(path.join(systemOutput, "golden-eval-report.json"), "utf8"));
  assert.equal(report.artifactType, "golden-eval-report");
  assert.equal(report.canPass, true);
  assert.equal(report.metrics.coverageRatio, 1);
});

test("pipeline workflow-spec node writes workflow spec from operation spec", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-workflow-spec-"));
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(
    path.join(systemOutput, "operation-spec.json"),
    JSON.stringify(
      operationSpecFixture({
        modules: [
          {
            name: "AI任务管理",
            entry: "左侧「AI任务管理」",
            list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
            flows: [
              {
                name: "新建AI任务",
                trigger: "新增",
                sourcePage: "AI任务管理",
                status: "partial",
                steps: [{ name: "打开新建表单", action: "点击新增", fields: ["保险公司"] }],
                reason: "submit-button-not-found",
              },
            ],
            tabs: [],
            screenshots: [],
            apis: [],
          },
        ],
        metrics: { flowCount: 1 },
      }),
    ),
    "utf8",
  );
  const context = {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台" },
    systemOutput,
    projectRoot: path.resolve(__dirname, ".."),
  };

  await runPipelineNode("workflow-spec", context);

  const workflowSpec = JSON.parse(fs.readFileSync(path.join(systemOutput, "workflow-spec.json"), "utf8"));
  assert.equal(workflowSpec.artifactType, "workflow-spec");
  assert.equal(workflowSpec.metrics.observedWorkflowCount, 1);
  assert.equal(workflowSpec.metrics.stepCount, 1);
});

test("truth-universe refreshes stale evidence summary before building claims universe", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "truth-universe-refresh-summary-"));
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const summaryPath = path.join(systemOutput, "evidence-summary.json");
  const evidencePath = path.join(systemOutput, "evidence.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({
      system: {
        code: "adp",
        name: "AI保单数据闭环平台",
        testUrl: "https://pre-adp.hzins.com/",
      },
      modules: [{ name: "旧模块", entry: "旧模块" }],
      functions: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({
      systemInfo: {
        code: "adp",
        name: "AI保单数据闭环平台",
        testUrl: "https://sit-adp.hzins.com/",
        loginRole: "全权限测试账号",
        collectedAt: "2026-06-05T00:00:00.000Z",
      },
      menuMap: [
        {
          id: "task",
          title: "AI任务管理",
          menuPath: "AI任务管理",
          url: "/task",
          status: "visited",
        },
      ],
      pageInventory: [
        {
          id: "task-list",
          type: "page",
          title: "任务列表",
          menuPath: "AI任务管理 > 任务列表",
          url: "/task",
          screenshot: "screenshots/task.png",
          evidenceRefs: ["shot-task"],
        },
      ],
      screenshotIndex: [
        {
          id: "shot-task",
          file: "screenshots/task.png",
          module: "AI任务管理",
          function: "任务列表",
        },
      ],
      actionInventory: [],
      formInventory: [],
      tableInventory: [],
      failedPages: [],
      pendingItems: [],
    }),
    "utf8",
  );
  const old = new Date(Date.now() - 60_000);
  const fresh = new Date();
  fs.utimesSync(summaryPath, old, old);
  fs.utimesSync(evidencePath, fresh, fresh);

  await runPipelineNode("truth-universe", {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "config", "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台" },
    systemOutput,
    projectRoot: path.resolve(__dirname, ".."),
  });

  const refreshedSummary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const universe = JSON.parse(fs.readFileSync(path.join(systemOutput, "function-universe.json"), "utf8"));
  assert.equal(refreshedSummary.system.testUrl, "https://sit-adp.hzins.com/");
  assert.equal(universe.system.testUrl, "https://sit-adp.hzins.com/");
  assert.equal(universe.sourceArtifacts.evidenceSummary.fingerprint.sha256.length, 64);
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
  assert.deepEqual(plan.rerunNodes, ["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]);
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
  const { runNarrativeCheck } = require("./check-narrative");
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
    path.join(systemOutput, "evidence.json"),
    JSON.stringify({
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://pre-adp.hzins.com/" },
      menuMap: [{ title: "保单任务", menuPath: "保单任务", url: "https://pre-adp.hzins.com/#/policy-task" }],
      menuInventory: [{ title: "保单任务", menuPath: "保单任务", status: "visited", url: "https://pre-adp.hzins.com/#/policy-task" }],
      pageInventory: [
        { id: "policy-task", type: "menu-page", menuPath: "保单任务", title: "任务列表", screenshot: "screenshots/task.png" },
      ],
      tableInventory: [{ pageId: "policy-task", columns: ["保单任务", "状态"] }],
      formInventory: [{ pageId: "policy-task", fields: [{ label: "保单任务", type: "input" }] }],
      actionInventory: [{ pageId: "policy-task", function: "任务列表", name: "查看", type: "query" }],
      screenshotIndex: [{ pageId: "policy-task", module: "保单任务", function: "任务列表", file: "screenshots/task.png" }],
    }),
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
    passingUiOnlyNarrativeMarkdown(),
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
    args: { "allow-draft": true },
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
  await runPipelineNode("summary", context);
  await runPipelineNode("build-spec", context);
  await runPipelineNode("compose-guide", context);
  await runPipelineNode("summary", context);
  await runPipelineNode("db-model", context);
  await runPipelineNode("truth-universe", context);
  await runPipelineNode("truth-claims", context);
  await runPipelineNode("business-process", context);
  await runPipelineNode("fact-check", context);

  assert.equal(fs.existsSync(path.join(systemOutput, "data-dictionary.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "entity-model.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "function-universe.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "verified-claims.json")), true);
  assert.equal(fs.existsSync(path.join(systemOutput, "business-process-model.json")), true);
  const report = JSON.parse(fs.readFileSync(path.join(systemOutput, "fact-check-report.json"), "utf8"));
  assert.equal(report.canFinalize, true);
});

test("pipeline truth-readiness requires database evidence when databaseProfile is enabled", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
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
  writeQualityReportFixture(systemOutput);
  fs.writeFileSync(path.join(systemOutput, "whitepaper.pending-review.md"), passingUiOnlyNarrativeMarkdown(), "utf8");
  fs.writeFileSync(
    path.join(systemOutput, "verified-claims.json"),
    JSON.stringify(verifiedClaimsFixture([
      {
        id: "function:保单任务:任务列表",
        subject: "任务列表",
        module: "保单任务",
        status: "confirmed",
        writable: true,
      },
    ])),
    "utf8",
  );
  runFactCheck({ inputDir: systemOutput });
  runNarrativeCheck({ inputDir: systemOutput });

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
    JSON.stringify(
      verifiedClaimsFixture([
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
      ]),
    ),
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
  const {
    exportWhitepaperWord,
    markdownToWordDocumentXml,
    resolveDocxManifestPath,
  } = require("./export-whitepaper-word");

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
  assert.equal(result.manifestPath, resolveDocxManifestPath(result.outputPath));
  assert.equal(fs.existsSync(result.manifestPath), true);
  assert.equal(result.manifest.artifactType, "whitepaper-docx-manifest");
  assert.equal(result.manifest.input.file, "whitepaper.final.md");
  assert.equal(result.manifest.input.fingerprint.exists, true);
  assert.equal(result.manifest.output.file, path.basename(result.outputPath));
  assert.equal(result.manifest.output.fingerprint.exists, true);
});

test("word exporter approval guard requires approved truth-gated final markdown", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { assertApprovedWhitepaperWordInput } = require("./export-whitepaper-word");
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-export-guard-"));
  const pendingPath = path.join(dir, "whitepaper.pending-review.md");
  const finalPath = path.join(dir, "whitepaper.final.md");
  const pendingMarkdown = passingNarrativeMarkdown();
  const finalMarkdown = finalizeWhitepaperMarkdown(pendingMarkdown, {
    systemName: "AI保单数据闭环平台",
  });
  fs.writeFileSync(pendingPath, pendingMarkdown, "utf8");
  fs.writeFileSync(finalPath, finalMarkdown, "utf8");

  assert.throws(
    () =>
      assertApprovedWhitepaperWordInput(finalPath, {
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
      }),
    /approved review state/,
  );

  fs.writeFileSync(
    path.join(dir, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      overallStatus: "finalized",
      review: { status: "approved" },
    }),
    "utf8",
  );
  writePassingTruthReadinessReport(dir);
  fs.writeFileSync(
    finalPath,
    finalizeWhitepaperMarkdown(fs.readFileSync(pendingPath, "utf8"), {
      systemName: "AI保单数据闭环平台",
    }),
    "utf8",
  );
  const allowed = assertApprovedWhitepaperWordInput(finalPath, {
    systemCode: "adp",
    systemName: "AI保单数据闭环平台",
  });
  assert.equal(allowed.finalPath, finalPath);

  fs.appendFileSync(finalPath, "\n\n## 未审定追加内容\n该内容绕过待审稿。", "utf8");
  assert.throws(
    () =>
      assertApprovedWhitepaperWordInput(finalPath, {
        systemCode: "adp",
        systemName: "AI保单数据闭环平台",
      }),
    /match the approved pending-review Markdown/,
  );
});

test("approved review creates final markdown and word output", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-word-adp-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
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
  assert.ok(fs.existsSync(decision.docxManifestPath));
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
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
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
    canFinalize: false,
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
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
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

test("approved review rejects invalid truth readiness artifact contract", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-invalid-truth-artifact-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "truth-readiness-report.json"),
    JSON.stringify({
      canSubmitReview: true,
      score: 1,
      scorePercent: 100,
      blockers: [],
      sourceArtifacts: {},
    }),
    "utf8",
  );

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /not a valid truth readiness artifact.*artifactType/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);
});

test("approved review recomputes current truth readiness before final approval", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-current-truth-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
    "utf8",
  );
  writePassingTruthReadinessReport(dir, {
    requirements: { databaseEvidenceRequired: true },
    system: { code: "adp", name: "AI保单数据闭环平台" },
    gates: {
      evidence: { pass: true, scorePercent: 100 },
      claims: { pass: true, scorePercent: 100 },
      factCheck: { pass: true, scorePercent: 100 },
      narrative: { pass: true, scorePercent: 100 },
      database: { pass: true, required: true, profileAvailable: true, scorePercent: 100 },
    },
  });
  fs.writeFileSync(
    path.join(dir, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "other" },
      tables: [],
      safety: { secretRedacted: true },
    }),
    "utf8",
  );
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const reportPath = path.join(dir, "truth-readiness-report.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  report.sourceArtifacts = buildReadinessSourceArtifacts(loadReadinessInputs(dir));
  fs.writeFileSync(reportPath, JSON.stringify(report), "utf8");

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved", systemCode: "adp" }),
    /Current truth readiness gate has not passed.*belongs to other, expected adp/s,
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
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
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
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
    "utf8",
  );
  writePassingTruthReadinessReport(e2eDir);
  assert.throws(
    () => runReviewDecision({ inputDir: e2eDir, status: "approved" }),
    /Smoke truth readiness report cannot approve real delivery/,
  );
  assert.equal(fs.existsSync(path.join(e2eDir, "whitepaper.final.md")), false);
});

test("approved review rejects smoke wording in pending markdown even with passing truth readiness", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-smoke-markdown-"));
  writePassingTruthReadinessReport(dir);
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书（待审核）\n\n## 1. 系统定位\nlocal-e2e-smoke artifact, not final business whitepaper.",
    "utf8",
  );

  assert.throws(
    () => runReviewDecision({ inputDir: dir, status: "approved" }),
    /pending-review markdown contains smoke wording/,
  );
  assert.equal(fs.existsSync(path.join(dir, "whitepaper.final.md")), false);
});

test("approved review tolerates malformed optional pipeline state", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runReviewDecision } = require("./run-review-decision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-bad-state-adp-"));
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    passingNarrativeMarkdown().replace("# AI保单数据闭环平台功能白皮书", "# AI保单数据闭环平台功能白皮书（待审核）"),
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
  assert.ok(fs.existsSync(decision.docxManifestPath));
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

test("mergePageSnapshotIntoEvidence filters environment switcher links", () => {
  const evidence = createInitialEvidence({ code: "adp", name: "AI保单数据闭环平台", url: "https://sit-adp.hzins.com/" });
  mergePageSnapshotIntoEvidence(evidence, {
    id: "home",
    title: "AI保单数据闭环平台",
    url: "https://sit-adp.hzins.com/",
    links: [
      { text: "本地/UAT 环境", href: "https://sit-adp.hzins.com/#" },
      { text: "生产环境", href: "https://sit-adp.hzins.com/#" },
      { text: "AI 任务管理", href: "https://sit-adp.hzins.com/#/task" },
    ],
    buttons: [],
    forms: [],
    tables: [],
  });

  assert.deepEqual(
    evidence.menuMap.map((item) => item.title),
    ["AI 任务管理"],
  );
});

test("mergeMenuMapEntries drops existing environment switcher menu entries", () => {
  const merged = mergeMenuMapEntries([
    { title: "本地/UAT 环境", menuPath: "本地/UAT 环境", url: "https://sit-adp.hzins.com/#" },
    { title: "生产环境", menuPath: "生产环境", url: "https://sit-adp.hzins.com/#" },
    { title: "AI 任务管理", menuPath: "AI 任务管理", url: "https://sit-adp.hzins.com/#/task" },
  ]);

  assert.deepEqual(
    merged.map((item) => item.title),
    ["AI 任务管理"],
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
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");

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
  fs.writeFileSync(docxPath, "PK\x03\x04stale-docx", "utf8");
  fs.writeFileSync(
    path.join(output, "whitepaper.pending-review.md"),
    passingUiOnlyNarrativeMarkdown(),
    "utf8",
  );
  writePassingTruthArtifacts(output, { databaseProfile: false });
  fs.writeFileSync(
    path.join(output, "whitepaper.final.md"),
    finalizeWhitepaperMarkdown(fs.readFileSync(path.join(output, "whitepaper.pending-review.md"), "utf8"), {
      systemName: "AI保单数据闭环平台",
    }),
    "utf8",
  );
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
  const downloadArtifact = (artifact) =>
    new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/api/download?system=adp&artifact=${artifact}`, (res) => {
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
  const downloadDocx = () => downloadArtifact("docx");

  try {
    const response = await downloadDocx();
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-disposition"] || ""), /attachment/i);
    assert.equal(response.body.subarray(0, 2).toString("utf8"), "PK");
    assert.notEqual(response.body.toString("utf8"), "PK\x03\x04stale-docx");
    assert.equal(fs.existsSync(`${path.join(output, path.basename(docxPath))}.manifest.json`), false);
    const generated = fs.readdirSync(output).find((file) => file.endsWith(".docx.manifest.json"));
    assert.ok(generated);

    fs.appendFileSync(
      path.join(output, "whitepaper.final.md"),
      "\n\n## 手工篡改的终稿内容\n这里模拟看板生成 Word 后终稿被绕过待审稿修改。",
      "utf8",
    );
    const blocked = await downloadDocx();
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.body.toString("utf8"), /Artifact not found: docx/);
    const blockedFinal = await downloadArtifact("final");
    assert.equal(blockedFinal.statusCode, 400);
    assert.match(blockedFinal.body.toString("utf8"), /Final delivery requires final Markdown/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dashboard preview route guards final artifact with truth approval", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const http = require("node:http");
  const { createDashboardServer } = require("./local-dashboard/server");
  const { finalizeWhitepaperMarkdown } = require("./system-whitepaper-lib");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-preview-final-"));
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
  fs.writeFileSync(path.join(output, "whitepaper.pending-review.md"), passingUiOnlyNarrativeMarkdown(), "utf8");
  writePassingTruthArtifacts(output, { databaseProfile: false });
  fs.writeFileSync(
    path.join(output, "whitepaper.final.md"),
    finalizeWhitepaperMarkdown(fs.readFileSync(path.join(output, "whitepaper.pending-review.md"), "utf8"), {
      systemName: "AI保单数据闭环平台",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(output, "pipeline-state.json"),
    JSON.stringify({
      code: "adp",
      name: "AI保单数据闭环平台",
      overallStatus: "finalized",
      review: { status: "approved" },
      nodes: {},
      phases: {},
    }),
    "utf8",
  );

  const server = createDashboardServer({ configPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const preview = (artifact) =>
    new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/api/preview?system=adp&artifact=${artifact}`, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        })
        .on("error", reject);
    });

  try {
    const approvedFinal = await preview("final");
    assert.equal(approvedFinal.statusCode, 200);
    assert.match(approvedFinal.body, /AI保单数据闭环平台功能白皮书/);

    fs.appendFileSync(
      path.join(output, "whitepaper.final.md"),
      "\n\n## 手工篡改的终稿内容\n这里模拟终稿预览绕过待审稿。",
      "utf8",
    );
    const blockedFinal = await preview("final");
    assert.equal(blockedFinal.statusCode, 400);
    assert.match(blockedFinal.body, /Final delivery requires final Markdown/);

    const pendingReview = await preview("pendingReview");
    assert.equal(pendingReview.statusCode, 200);
    assert.match(pendingReview.body, /白皮书预览/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dashboard download route blocks docx without valid approval state", async () => {
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

    assert.equal(response.statusCode, 400);
    assert.match(response.body.toString("utf8"), /Artifact not found: docx/);
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

test("buildOperationSpec derives module surfaces from evidence summary screenshots when evidence is sparse", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec, gate } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://sit-adp.hzins.com/" },
      menuMap: [],
      pageInventory: [],
      tableInventory: [],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    },
    evidenceSummary: {
      modules: [{ name: "本地", entry: "本地", summary: "共 0 个菜单页，已采集 0 个。" }],
      functions: [],
      screenshots: [
        { module: "AI任务管理", function: "AI任务管理", file: "screenshots/task.png" },
        { module: "AI发布管理", function: "AI发布管理", file: "screenshots/publish.png" },
        { module: "数据与运行观测", function: "数据与运行观测", file: "screenshots/monitor.png" },
        { module: "元数据管理", function: "元数据管理", file: "screenshots/meta.png" },
      ],
    },
    system: {
      code: "adp",
      name: "AI保单数据闭环平台",
      businessHint: "AI 数据闭环平台用于解决保险中介产品上架最后一公里问题。",
      operationGuideMinMenus: 4,
      moduleBusinessHints: {
        AI任务管理: "配置、查询并执行保司数据对接 AI 任务。",
      },
    },
    writeValidation: {
      scenarios: [
        { id: "auto-AI任务管理", action: "create", targetName: "AI_AUTO_TEST_AI任务管理", status: "planned" },
      ],
    },
  });

  assert.deepEqual(spec.modules.map((item) => item.name), [
    "AI任务管理",
    "AI发布管理",
    "数据与运行观测",
    "元数据管理",
  ]);
  assert.equal(spec.modules.find((item) => item.name === "AI任务管理").screenshots[0], "screenshots/task.png");
  assert.equal(spec.modules.find((item) => item.name === "AI任务管理").businessHint, "配置、查询并执行保司数据对接 AI 任务。");
  assert.equal(spec.modules.find((item) => item.name === "AI任务管理").flows.length, 0);
  assert.equal(spec.modules.find((item) => item.name === "AI任务管理").plannedFlows.length, 1);
  assert.ok(spec.pending.some((item) => /AI任务管理/.test(item.topic || "") && /计划状态|缺少列表列/.test(item.reason || "")));
  assert.equal(gate.counts.modules, 4);
  assert.equal(gate.canComposeGuide, true);
});

test("buildOperationSpec derives observed flows from container step evidence", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台", testUrl: "https://sit-adp.hzins.com/" },
      menuMap: [
        { title: "AI任务管理", menuPath: "AI任务管理", url: "https://sit-adp.hzins.com/#/tasks" },
      ],
      pageInventory: [
        {
          id: "page-task",
          menuPath: "AI任务管理",
          title: "AI任务管理",
          type: "menu-page",
          screenshot: "screenshots/task.png",
        },
        {
          id: "container-define",
          sourcePageId: "page-task",
          menuPath: "新建AI任务",
          title: "定义参数",
          type: "modal",
          screenshot: "screenshots/define.png",
        },
        {
          id: "container-output",
          sourcePageId: "page-task",
          menuPath: "新建AI任务",
          title: "需求输出",
          type: "modal",
          screenshot: "screenshots/output.png",
        },
        {
          id: "container-case",
          sourcePageId: "page-task",
          menuPath: "新建AI任务",
          title: "用例执行",
          type: "modal",
          screenshot: "screenshots/cases.png",
        },
        {
          id: "container-accept",
          sourcePageId: "page-task",
          menuPath: "新建AI任务",
          title: "验收确认",
          type: "modal",
          screenshot: "screenshots/accept.png",
        },
      ],
      tableInventory: [
        {
          pageId: "page-task",
          columns: ["保险公司", "任务类型", "接口方式", "需求状态", "操作"],
        },
      ],
      actionInventory: [
        { pageId: "page-task", name: "新建AI任务", type: "create", risk: "normal" },
        { pageId: "container-define", name: "下一步", type: "button", risk: "normal" },
        { pageId: "container-output", name: "下一步", type: "button", risk: "normal" },
        { pageId: "container-case", name: "下一步", type: "button", risk: "normal" },
        { pageId: "container-accept", name: "完成", type: "button", risk: "normal" },
      ],
      formInventory: [
        {
          pageId: "container-define",
          formName: "定义参数",
          fields: [
            { label: "保险公司", type: "select", required: true },
            { label: "接口方式", type: "select", required: true },
          ],
        },
        {
          pageId: "container-output",
          formName: "需求输出",
          fields: [{ label: "需求文档", type: "textarea", required: true }],
        },
        {
          pageId: "container-case",
          formName: "用例执行",
          fields: [{ label: "测试结果", type: "textarea", required: false }],
        },
        {
          pageId: "container-accept",
          formName: "验收确认",
          fields: [{ label: "验收意见", type: "textarea", required: false }],
        },
      ],
      screenshotIndex: [],
    },
    system: {
      code: "adp",
      name: "AI保单数据闭环平台",
      businessHint: "AI 数据闭环平台用于解决保险中介产品上架最后一公里问题。",
      operationGuideMinMenus: 1,
      operationGuideAllowDraft: true,
    },
    writeValidation: {
      scenarios: [
        {
          menuPath: "AI任务管理",
          action: "create",
          buttonText: "新建AI任务",
          status: "planned",
          reason: "safe-inspection-only",
        },
      ],
    },
    networkIndex: {
      entries: [
        { method: "GET", url: "https://sit-adp.hzins.com/api/tasks", schemaKeys: ["taskType", "status"] },
      ],
    },
  });

  const taskModule = spec.modules.find((item) => item.name === "AI任务管理");
  assert.equal(spec.modules.some((item) => item.name === "新建AI任务"), false);
  assert.equal(taskModule.surfaceType, "business-flow");
  assert.equal(taskModule.flows.length, 1);
  assert.equal(taskModule.plannedFlows.length, 0);
  assert.equal(taskModule.flows[0].name, "新建AI任务");
  assert.equal(taskModule.flows[0].status, "observed");
  assert.deepEqual(taskModule.flows[0].steps.map((step) => step.title), [
    "定义参数",
    "需求输出",
    "用例执行",
    "验收确认",
  ]);
  assert.deepEqual(taskModule.flows[0].steps[0].fields.map((field) => field.label), ["保险公司", "接口方式"]);
  assert.deepEqual(taskModule.flows[0].steps[3].buttons, ["完成"]);
  assert.equal(taskModule.flows[0].steps[0].screenshots[0], "screenshots/define.png");
});

test("buildOperationSpec does not promote screenshot-only containers to observed flows", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
      menuMap: [{ title: "AI任务管理", menuPath: "AI任务管理" }],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page", screenshot: "screenshots/task.png" },
        { id: "container-tip-1", sourcePageId: "page-task", title: "操作提示", type: "modal", screenshot: "screenshots/tip-1.png" },
        { id: "container-tip-2", sourcePageId: "page-task", title: "帮助说明", type: "modal", screenshot: "screenshots/tip-2.png" },
      ],
      tableInventory: [{ pageId: "page-task", columns: ["任务名称", "状态", "操作"] }],
      actionInventory: [
        { pageId: "page-task", name: "新建AI任务", type: "create", risk: "normal" },
        { pageId: "container-tip-1", name: "关闭", type: "button", risk: "normal" },
        { pageId: "container-tip-2", name: "知道了", type: "button", risk: "normal" },
      ],
      formInventory: [],
      screenshotIndex: [],
    },
    system: { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1, operationGuideAllowDraft: true },
  });

  const taskModule = spec.modules.find((item) => item.name === "AI任务管理");
  assert.equal(taskModule.surfaceType, "business-list");
  assert.equal(taskModule.flows.length, 0);
});

test("buildOperationSpec consumes only one generic planned flow per observed container flow", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
      menuMap: [{ title: "AI任务管理", menuPath: "AI任务管理" }],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page" },
        { id: "container-form", sourcePageId: "page-task", title: "新建AI任务", type: "modal", screenshot: "screenshots/form.png" },
      ],
      tableInventory: [{ pageId: "page-task", columns: ["任务名称", "状态", "操作"] }],
      actionInventory: [
        { pageId: "page-task", name: "新建AI任务", type: "create", risk: "normal" },
        { pageId: "container-form", name: "保存", type: "button", risk: "normal" },
      ],
      formInventory: [
        { pageId: "container-form", fields: [{ label: "任务名称", type: "input", required: true }] },
      ],
      screenshotIndex: [],
    },
    system: { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1, operationGuideAllowDraft: true },
    writeValidation: {
      scenarios: [
        { id: "auto-task-create", menuPath: "AI任务管理", action: "create", status: "planned" },
        { id: "auto-batch-create", menuPath: "AI任务管理", action: "create", status: "planned" },
      ],
    },
  });

  const taskModule = spec.modules.find((item) => item.name === "AI任务管理");
  assert.equal(taskModule.flows.length, 1);
  assert.equal(taskModule.plannedFlows.length, 1);
});

test("buildOperationSpec keeps sourcePageId tab pages as modules instead of containers", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
      menuMap: [],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page" },
        { id: "page-task-detail", sourcePageId: "page-task", menuPath: "任务明细", title: "任务明细", type: "tab-page" },
      ],
      tableInventory: [
        { pageId: "page-task", columns: ["任务名称", "状态"] },
        { pageId: "page-task-detail", columns: ["执行批次", "执行状态"] },
      ],
      actionInventory: [],
      formInventory: [],
      screenshotIndex: [],
    },
    system: { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1, operationGuideAllowDraft: true },
  });

  assert.equal(spec.modules.some((item) => item.name === "任务明细"), true);
  assert.equal(spec.modules.find((item) => item.name === "任务明细").surfaceType, "business-list");
});

test("buildOperationSpec separates container flows by trigger label", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
      menuMap: [{ title: "AI任务管理", menuPath: "AI任务管理" }],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page" },
        {
          id: "container-create",
          sourcePageId: "page-task",
          title: "新建AI任务",
          type: "container",
          triggerLabel: "新建AI任务",
          screenshot: "screenshots/create.png",
        },
        {
          id: "container-edit",
          sourcePageId: "page-task",
          title: "编辑AI任务",
          type: "container",
          triggerLabel: "编辑AI任务",
          screenshot: "screenshots/edit.png",
        },
      ],
      tableInventory: [{ pageId: "page-task", columns: ["任务名称", "状态", "操作"] }],
      actionInventory: [
        { pageId: "page-task", name: "新建AI任务", type: "create", risk: "normal" },
        { pageId: "page-task", name: "编辑AI任务", type: "update", risk: "normal" },
        { pageId: "container-create", name: "保存", type: "button", risk: "normal" },
        { pageId: "container-edit", name: "保存", type: "button", risk: "normal" },
      ],
      formInventory: [
        { pageId: "container-create", fields: [{ label: "任务名称", type: "input", required: true }] },
        { pageId: "container-edit", fields: [{ label: "执行状态", type: "select", required: true }] },
      ],
      screenshotIndex: [],
    },
    system: { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1, operationGuideAllowDraft: true },
  });

  const taskModule = spec.modules.find((item) => item.name === "AI任务管理");
  assert.deepEqual(taskModule.flows.map((flow) => flow.name), ["新建AI任务", "编辑AI任务"]);
  assert.deepEqual(taskModule.flows.map((flow) => flow.steps.map((step) => step.title)), [
    ["新建AI任务"],
    ["编辑AI任务"],
  ]);
});

test("buildOperationSpec does not promote read-only detail containers to flows", () => {
  const { buildOperationSpec } = require("./operation-spec/lib");
  const { spec } = buildOperationSpec({
    evidence: {
      systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
      menuMap: [{ title: "AI任务管理", menuPath: "AI任务管理" }],
      pageInventory: [
        { id: "page-task", menuPath: "AI任务管理", title: "AI任务管理", type: "menu-page" },
        {
          id: "container-detail",
          sourcePageId: "page-task",
          title: "任务详情",
          type: "container",
          triggerLabel: "查看",
          screenshot: "screenshots/detail.png",
        },
      ],
      tableInventory: [{ pageId: "page-task", columns: ["任务名称", "状态", "操作"] }],
      actionInventory: [
        { pageId: "page-task", name: "查看", type: "read", risk: "normal" },
        { pageId: "container-detail", name: "返回", type: "button", risk: "normal" },
      ],
      formInventory: [
        { pageId: "container-detail", fields: [{ label: "执行状态", type: "input", required: false }] },
      ],
      screenshotIndex: [],
    },
    system: { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1, operationGuideAllowDraft: true },
  });

  const taskModule = spec.modules.find((item) => item.name === "AI任务管理");
  assert.equal(taskModule.flows.length, 0);
  assert.equal(taskModule.surfaceType, "business-list");
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
  const { main } = require("./build-operation-spec");

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

  const result = runCliMainForTest(main, ["--input", dir, "--allow-draft"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
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
  const { main } = require("./build-operation-spec");

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

  const result = runCliMainForTest(main, ["--input", dir, "--allow-draft"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
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

function operationSpecFixture(overrides = {}) {
  const spec = {
    artifactType: "operation-spec",
    version: 1,
    schemaVersion: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    systemCode: "adp",
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
        apis: [],
      },
    ],
    crossLinks: [],
    networkEntryCount: 0,
    pending: [],
    metrics: {
      moduleCount: 1,
      navigationCount: 1,
      flowCount: 0,
      screenshotCount: 0,
      pendingCount: 0,
      crossLinkCount: 0,
      networkEntryCount: 0,
    },
    gate: { canComposeGuide: true, readinessPercent: 100, failures: [] },
    sourceArtifacts: {
      evidence: {
        file: "evidence.json",
        status: "missing",
        fingerprint: { exists: false, size: 0, mtimeMs: null, sha256: "" },
      },
    },
  };
  return {
    ...spec,
    ...overrides,
    positioning: { ...spec.positioning, ...(overrides.positioning || {}) },
    metrics: { ...spec.metrics, ...(overrides.metrics || {}) },
    gate: { ...spec.gate, ...(overrides.gate || {}) },
    sourceArtifacts: { ...spec.sourceArtifacts, ...(overrides.sourceArtifacts || {}) },
  };
}

function genericOperationSpecFixture(overrides = {}) {
  return operationSpecFixture({
    systemCode: "generic-finance",
    systemName: "费用与预算管理系统",
    testUrl: "https://finance.example.local/",
    positioning: { text: "费用与预算管理系统定位句。", confidence: "high", sources: [{ type: "registry" }] },
    navigation: [
      { menuPath: "费用申请", entry: "菜单 / 费用申请" },
      { menuPath: "预算控制", entry: "菜单 / 预算控制" },
    ],
    modules: [
      {
        name: "费用申请",
        entry: "菜单 / 费用申请",
        businessHint: "维护员工费用申请记录，支持提交、审核和状态跟踪。",
        list: {
          columns: ["申请编号", "申请人", "费用类型", "金额", "审批状态", "处理结果"],
          queryFields: ["申请人", "费用类型", "审批状态"],
          rowActions: ["查看", "编辑", "提交", "撤回"],
        },
        flows: [
          {
            name: "费用申请提交",
            trigger: "提交",
            sourcePage: "费用申请",
            status: "partial",
            steps: [
              { name: "填写费用申请", action: "录入金额和费用类型", fields: ["金额", "费用类型"] },
              { name: "提交审批", action: "点击提交", fields: ["审批状态"] },
            ],
            reason: "approval-result-not-submitted-in-test",
          },
        ],
        plannedFlows: [],
        tabs: [],
        screenshots: [],
        apis: [],
      },
      {
        name: "预算控制",
        entry: "菜单 / 预算控制",
        businessHint: "查看预算额度、占用金额和超预算风险。",
        list: {
          columns: ["预算科目", "年度预算", "已占用金额", "可用金额", "风险状态"],
          queryFields: ["预算科目", "风险状态"],
          rowActions: ["查看", "冻结", "调整"],
        },
        flows: [],
        plannedFlows: [],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: {
      moduleCount: 2,
      navigationCount: 2,
      flowCount: 1,
      screenshotCount: 0,
      pendingCount: 0,
      crossLinkCount: 0,
      networkEntryCount: 0,
    },
    ...overrides,
  });
}

function genericEvidenceSummaryFixture(overrides = {}) {
  return {
    artifactType: "evidence-summary",
    version: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    system: { code: "generic-finance", name: "费用与预算管理系统" },
    modules: [
      { name: "费用申请", entry: "菜单 / 费用申请", summary: "维护费用申请和审批状态。" },
      { name: "预算控制", entry: "菜单 / 预算控制", summary: "查看预算额度和风险状态。" },
    ],
    functions: [
      {
        id: "function:费用申请",
        module: "费用申请",
        name: "费用申请列表",
        menuPath: "菜单 / 费用申请",
        actions: ["查看", "编辑", "提交", "撤回"],
        queryFields: ["申请人", "费用类型", "审批状态"],
        tableColumns: ["申请编号", "申请人", "费用类型", "金额", "审批状态", "处理结果"],
      },
      {
        id: "function:预算控制",
        module: "预算控制",
        name: "预算控制列表",
        menuPath: "菜单 / 预算控制",
        actions: ["查看", "冻结", "调整"],
        queryFields: ["预算科目", "风险状态"],
        tableColumns: ["预算科目", "年度预算", "已占用金额", "可用金额", "风险状态"],
      },
    ],
    metrics: { moduleCount: 2, functionCount: 2 },
    ...overrides,
  };
}

function evidenceSummaryFixtureForOperation(operationSpec = {}, overrides = {}) {
  return {
    artifactType: "evidence-summary",
    version: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    system: {
      code: operationSpec.systemCode || "adp",
      name: operationSpec.systemName || "AI保单数据闭环平台",
      testUrl: operationSpec.testUrl || "",
    },
    modules: (operationSpec.modules || []).map((module) => ({
      name: module.name || "",
      entry: module.entry || module.name || "",
      summary: module.businessHint || "",
    })),
    functions: (operationSpec.modules || []).map((module) => ({
      id: `function:${module.name || ""}`,
      module: module.name || "",
      name: `${module.name || ""}列表`,
      menuPath: module.entry || module.name || "",
      actions: module.list?.rowActions || [],
      queryFields: module.list?.queryFields || [],
      tableColumns: module.list?.columns || [],
    })),
    metrics: {
      moduleCount: (operationSpec.modules || []).length,
      functionCount: (operationSpec.modules || []).length,
    },
    ...overrides,
  };
}

function businessProcessModelFixtureForReadiness(input = {}) {
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = input.operationSpec || operationSpecFixture();
  const workflowSpec = input.workflowSpec || workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = input.evidenceSummary || evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = input.verifiedClaims || verifiedClaimsFixture([]);
  return buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
}

function whitepaperPlanFixtureForReadiness(input = {}) {
  const { buildWhitepaperPlan } = require("./build-whitepaper-plan");
  const operationSpec = input.operationSpec || operationSpecFixture();
  const workflowSpec = input.workflowSpec || workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = input.evidenceSummary || evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = input.verifiedClaims || verifiedClaimsFixture([]);
  const businessProcessModel =
    input.businessProcessModel ||
    businessProcessModelFixtureForReadiness({
      operationSpec,
      workflowSpec,
      evidenceSummary,
      verifiedClaims,
    });
  return buildWhitepaperPlan({
    verifiedClaims,
    businessProcessModel,
    workflowSpec,
    operationSpec,
    evidenceSummary,
    sourceArtifacts: input.sourceArtifacts || {},
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
}

function whitepaperPlanFixtureInputs(overrides = {}) {
  const operationSpec = overrides.operationSpec || genericOperationSpecFixture();
  const workflowSpec = overrides.workflowSpec || workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = overrides.evidenceSummary || genericEvidenceSummaryFixture();
  const verifiedClaims =
    overrides.verifiedClaims ||
    verifiedClaimsFixture([
      {
        id: "function:费用申请:费用申请列表",
        type: "function-presence",
        module: "费用申请",
        subject: "费用申请列表",
        function: "费用申请列表",
        status: "confirmed",
        writable: true,
        confidence: "high",
        evidence: {
          queryFields: ["申请人", "审批状态"],
          tableColumns: ["申请编号", "金额", "审批状态"],
        },
      },
      {
        id: "database:budget_detail",
        type: "business-entity",
        module: "预算控制",
        subject: "预算明细表",
        entity: "预算明细表",
        status: "weak",
        writable: false,
        confidence: "low",
      },
    ]);
  const businessProcessModel =
    overrides.businessProcessModel ||
    businessProcessModelFixtureForReadiness({
      operationSpec,
      workflowSpec,
      evidenceSummary,
      verifiedClaims,
    });
  return {
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
    ...overrides,
  };
}

function workflowSpecFixtureFromOperation(operationSpec, overrides = {}) {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const workflowSpec = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-03T00:00:30.000Z",
    sourceArtifacts: overrides.sourceArtifacts || {
      operationSpec: {
        file: "operation-spec.json",
        status: "ok",
        fingerprint: { exists: false, size: 0, mtimeMs: null, sha256: "" },
      },
    },
  });
  return {
    ...workflowSpec,
    ...overrides,
    metrics: {
      ...workflowSpec.metrics,
      ...(overrides.metrics || {}),
    },
    sourceArtifacts: {
      ...workflowSpec.sourceArtifacts,
      ...(overrides.sourceArtifacts || {}),
    },
  };
}

test("buildWorkflowSpec extracts observed operation flows with evidence boundaries", () => {
  const {
    assertValidWorkflowSpecArtifact,
    buildWorkflowSpec,
  } = require("./build-workflow-spec");

  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        surfaceType: "business-flow",
        coreBusinessModule: true,
        businessHint: "配置、查询并执行保司数据对接 AI 任务。",
        businessObject: { value: "AI任务", confidence: "high", evidence: ["菜单:AI任务管理"] },
        list: {
          columns: ["保险公司", "任务类型", "需求状态", "配置质量"],
          queryFields: ["保险公司", "任务类型"],
          filters: [],
          enumOptions: {},
          rowActions: ["配置历史", "质量"],
        },
        lifecycleSignals: [
          {
            field: "需求状态",
            signalType: "demand-lifecycle-status",
            enumOptions: ["需求已完成", "需求待生效", "需求生效"],
            confidence: "high",
            evidence: ["列表列:需求状态"],
          },
        ],
        qualitySignals: [
          {
            field: "配置质量",
            signalType: "configuration-quality-status",
            enumOptions: ["高风险", "需关注", "良好"],
            confidence: "high",
            evidence: ["列表列:配置质量"],
          },
        ],
        flows: [
          {
            name: "新建AI任务",
            trigger: "新建AI任务",
            status: "partial",
            reason: "submit-button-not-found",
            steps: [
              {
                title: "定义参数",
                fields: [{ label: "保险公司", required: true, control: "select" }],
                buttons: ["下一步"],
                screenshots: ["screenshots/define.png"],
                validation: { status: "partial", filledFieldCount: 2 },
              },
              {
                title: "需求输出",
                fields: [{ label: "需求文档", required: false, control: "textarea" }],
                buttons: ["下一步"],
                screenshots: ["screenshots/output.png"],
              },
              {
                title: "用例执行",
                fields: [{ label: "测试结果", required: false, control: "textarea" }],
                buttons: ["下一步"],
                screenshots: ["screenshots/cases.png"],
              },
              {
                title: "验收确认",
                fields: [{ label: "验收意见", required: false, control: "textarea" }],
                buttons: ["完成"],
                screenshots: ["screenshots/accept.png"],
              },
            ],
          },
        ],
        plannedFlows: [],
        tabs: [],
        screenshots: ["screenshots/task.png"],
        apis: [{ method: "GET", url: "/api/task/options", schemaKeys: ["taskTypes"] }],
      },
    ],
  });

  const artifact = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-03T00:00:00.000Z",
    sourceArtifacts: {
      operationSpec: { file: "operation-spec.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
    },
  });

  assertValidWorkflowSpecArtifact(artifact);
  assert.equal(artifact.artifactType, "workflow-spec");
  assert.equal(artifact.metrics.workflowCount, 1);
  assert.equal(artifact.metrics.observedWorkflowCount, 1);
  assert.equal(artifact.metrics.candidateWorkflowCount, 0);
  assert.equal(artifact.metrics.stepCount, 4);

  const workflow = artifact.workflows[0];
  assert.equal(workflow.module, "AI任务管理");
  assert.equal(workflow.name, "新建AI任务");
  assert.equal(workflow.evidenceStatus, "observed");
  assert.equal(workflow.executionStatus, "partial");
  assert.equal(workflow.canNarrateAsObserved, true);
  assert.deepEqual(workflow.steps.map((step) => step.name), [
    "定义参数",
    "需求输出",
    "用例执行",
    "验收确认",
  ]);
  assert.equal(workflow.businessObject.name, "AI任务");
  assert.equal(workflow.lifecycleSignals[0].field, "需求状态");
  assert.equal(workflow.qualitySignals[0].field, "配置质量");
  assert.ok(workflow.boundaries.some((item) => /submit-button-not-found/.test(item.reason)));
  assert.ok(workflow.evidenceRefs.some((ref) => ref.artifact === "operation-spec" && ref.pointer === "/modules/0/flows/0"));
});

test("buildWorkflowSpec keeps planned operation flows as non-observed candidates", () => {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        surfaceType: "business-workflow-candidate",
        coreBusinessModule: true,
        businessObject: { value: "AI任务", confidence: "medium", evidence: ["菜单:AI任务管理"] },
        list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
        lifecycleSignals: [],
        qualitySignals: [],
        flows: [],
        plannedFlows: [
          {
            name: "新建AI任务",
            trigger: "新建AI任务",
            status: "planned",
            reason: "仅生成计划，未形成可写入主流程的页面操作证据。",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
  });

  const artifact = buildWorkflowSpec({ operationSpec, generatedAt: "2026-06-03T00:00:00.000Z" });
  assert.equal(artifact.metrics.workflowCount, 1);
  assert.equal(artifact.metrics.observedWorkflowCount, 0);
  assert.equal(artifact.metrics.candidateWorkflowCount, 1);
  assert.equal(artifact.workflows[0].evidenceStatus, "candidate");
  assert.equal(artifact.workflows[0].canNarrateAsObserved, false);
  assert.deepEqual(artifact.workflows[0].steps, []);
  assert.ok(artifact.pending.some((item) => /新建AI任务/.test(item.topic) && /未形成/.test(item.reason)));
});

test("V6 homepage overview workflows are inferred not observed", () => {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "费用申请",
        entry: "首页「业务流程」",
        source: "home-overview-card",
        sourceCardTitle: "业务流程",
        surfaceType: "business-flow",
        coreBusinessModule: true,
        businessObject: {
          value: "费用申请",
          confidence: "medium",
          evidence: ["首页流程卡片:业务流程:费用申请"],
        },
        list: {
          columns: [],
          queryFields: [],
          filters: [],
          enumOptions: {},
          rowActions: [],
        },
        lifecycleSignals: [],
        qualitySignals: [],
        flows: [
          {
            name: "费用申请",
            trigger: "业务流程",
            status: "inferred-from-home-overview",
            reason: "依据首页流程卡片和截图归纳，未形成已点击菜单或写操作证据。",
            steps: [
              {
                title: "费用申请",
                fields: [],
                buttons: [],
                tables: [],
                screenshots: ["screenshots/home.png"],
                validation: {
                  status: "not-executed",
                  filledFieldCount: 0,
                  source: "home-overview-card",
                },
              },
            ],
          },
        ],
        plannedFlows: [],
        tabs: [],
        screenshots: ["screenshots/home.png"],
        apis: [],
      },
    ],
  });

  const artifact = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(artifact.metrics.workflowCount, 1);
  assert.equal(artifact.metrics.observedWorkflowCount, 0);
  assert.equal(artifact.metrics.inferredWorkflowCount, 1);
  assert.equal(artifact.metrics.homeOverviewWorkflowCount, 1);
  assert.equal(artifact.metrics.narratableWorkflowCount, 1);
  assert.equal(artifact.metrics.inferredStepCount, 1);
  const workflow = artifact.workflows[0];
  assert.equal(workflow.evidenceStatus, "inferred");
  assert.equal(workflow.sourceType, "home-overview-card");
  assert.equal(workflow.canNarrateAsObserved, false);
  assert.equal(workflow.canNarrateAsInferred, true);
  assert.equal(workflow.steps.length, 1);
  assert.ok(workflow.boundaries.some((item) => /首页流程卡片/.test(item.reason)));
});

test("build-workflow-spec writes workflow spec with operation source fingerprint", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./build-workflow-spec");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-spec-cli-"));
  fs.writeFileSync(
    path.join(dir, "operation-spec.json"),
    JSON.stringify(operationSpecFixture({
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          surfaceType: "business-flow",
          coreBusinessModule: true,
          businessObject: { value: "AI任务", confidence: "high", evidence: ["菜单:AI任务管理"] },
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          lifecycleSignals: [],
          qualitySignals: [],
          flows: [
            {
              name: "新建AI任务",
              trigger: "新建AI任务",
              status: "partial",
              steps: [{ title: "定义参数", fields: [], buttons: ["下一步"] }],
            },
          ],
          plannedFlows: [],
          tabs: [],
          screenshots: [],
          apis: [],
        },
      ],
    })),
    "utf8",
  );

  const result = runCliMainForTest(main, ["--input", dir]);

  assert.equal(result.status, 0, spawnSyncSummary(result));
  const output = JSON.parse(fs.readFileSync(path.join(dir, "workflow-spec.json"), "utf8"));
  assert.equal(output.artifactType, "workflow-spec");
  assert.equal(output.sourceArtifacts.operationSpec.file, "operation-spec.json");
  assert.equal(output.sourceArtifacts.operationSpec.fingerprint.exists, true);
  assert.equal(output.workflows[0].confidence, "medium");
});

test("assertValidWorkflowSpecArtifact rejects forged workflow metrics", () => {
  const {
    assertValidWorkflowSpecArtifact,
    buildWorkflowSpec,
  } = require("./build-workflow-spec");
  const artifact = buildWorkflowSpec({
    operationSpec: operationSpecFixture({
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          surfaceType: "business-workflow-candidate",
          coreBusinessModule: true,
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          flows: [],
          plannedFlows: [{ name: "新建AI任务", trigger: "新建AI任务", status: "planned" }],
          tabs: [],
          screenshots: [],
          apis: [],
        },
      ],
    }),
    generatedAt: "2026-06-03T00:00:00.000Z",
    sourceArtifacts: {
      operationSpec: { file: "operation-spec.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
    },
  });
  artifact.metrics.workflowCount = 99;

  assert.throws(
    () => assertValidWorkflowSpecArtifact(artifact),
    /workflow-spec\.json metrics\.workflowCount must match/,
  );
});

test("assertValidWorkflowSpecArtifact requires operation spec source fingerprint", () => {
  const {
    assertValidWorkflowSpecArtifact,
    buildWorkflowSpec,
  } = require("./build-workflow-spec");
  const artifact = buildWorkflowSpec({
    operationSpec: operationSpecFixture({
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          surfaceType: "business-flow",
          coreBusinessModule: true,
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          flows: [
            {
              name: "新建AI任务",
              trigger: "新建AI任务",
              status: "partial",
              steps: [{ title: "定义参数", fields: [], buttons: ["下一步"] }],
            },
          ],
          plannedFlows: [],
          tabs: [],
          screenshots: [],
          apis: [],
        },
      ],
    }),
    generatedAt: "2026-06-03T00:00:00.000Z",
  });

  assert.throws(
    () => assertValidWorkflowSpecArtifact(artifact),
    /workflow-spec\.json sourceArtifacts\.operationSpec\.fingerprint must reference the current operation-spec\.json/,
  );
});

test("generate-operation-guide falls back to spec gate when gate cache is malformed", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./generate-operation-guide");

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
    JSON.stringify(operationSpecFixture()),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "operation-guide-gate.json"), "{bad json", "utf8");

  const result = runCliMainForTest(main, ["--config", configPath, "--system", "adp"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const markdown = fs.readFileSync(path.join(output, "operation-guide.md"), "utf8");
  assert.match(markdown, /AI任务管理/);
});

test("generate-operation-guide falls back to spec gate when gate cache is non-object", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./generate-operation-guide");

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
    JSON.stringify(operationSpecFixture()),
    "utf8",
  );
  fs.writeFileSync(path.join(output, "operation-guide-gate.json"), "[]", "utf8");

  const result = runCliMainForTest(main, ["--config", configPath, "--system", "adp"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const markdown = fs.readFileSync(path.join(output, "operation-guide.md"), "utf8");
  assert.match(markdown, /AI任务管理/);
});

test("generate-operation-guide rejects forged operation spec artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { main } = require("./generate-operation-guide");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "operation-guide-forged-spec-"));
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
    JSON.stringify(operationSpecFixture({ metrics: { moduleCount: 99 } })),
    "utf8",
  );

  const result = runCliMainForTest(main, ["--config", configPath, "--system", "adp"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /operation-spec\.json is not a valid operation spec artifact/);
  assert.equal(fs.existsSync(path.join(output, "operation-guide.md")), false);
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

test("quality-gate-auto selects smallest useful gate from changed files", () => {
  const {
    classifyGateImpact,
    selectGateLevel,
    buildGateCommand,
  } = require("./quality-gate-auto");

  assert.deepEqual(classifyGateImpact(["docs/narrative-guide.md"]), {
    docsOnly: true,
    hasBehavior: false,
    hasCore: false,
    hasFull: false,
    reasons: ["docs-only"],
  });
  assert.equal(selectGateLevel(classifyGateImpact(["docs/narrative-guide.md"])), "quick");
  assert.equal(selectGateLevel(classifyGateImpact(["scripts/system-whitepaper-lib.js"])), "core");
  assert.equal(selectGateLevel(classifyGateImpact(["scripts/collect-evidence.js"])), "full");
  assert.equal(selectGateLevel(classifyGateImpact(["scripts/check-truth-readiness.js"])), "full");
  assert.equal(selectGateLevel(classifyGateImpact(["package.json"])), "core");
  assert.deepEqual(buildGateCommand("quick"), ["npm", "run", "test:gate:quick"]);
});

test("package manifest exposes automatic quality gate entrypoint", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const repoRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

  assert.equal(packageJson.scripts?.["test:gate:auto"], "node scripts/quality-gate-auto.js");
  assert.ok((packageJson.files || []).includes("scripts/quality-gate-auto.js"));
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
  fs.writeFileSync(path.join(projectRoot, "secrets", "db", "adp-metadata.json"), JSON.stringify({ tables: [] }), "utf8");
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
      "      secretDir: ./secrets/db",
      "      metadataFile: ./secrets/db/adp-metadata.json",
      "      allowSampleData: true",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });
  const warningIds = report.warnings.map((item) => item.id);

  assert.equal(report.ok, true);
  assert.ok(warningIds.includes("system.database-sample-data-enabled"));
});

test("doctor rejects database profile secret and metadata outside private secrets", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runDoctor } = require("./doctor");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-doctor-db-private-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs", "adp"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "outputs", "adp", "db.json"), JSON.stringify({ readOnly: true }), "utf8");
  fs.writeFileSync(path.join(projectRoot, "outputs", "adp", "metadata.json"), JSON.stringify({ tables: [] }), "utf8");
  fs.writeFileSync(path.join(projectRoot, "secrets-token.txt"), "test-token-value", "utf8");
  fs.writeFileSync(
    path.join(projectRoot, "config", "systems.local.yaml"),
    [
      "auth:",
      "  tokenFile: ./secrets-token.txt",
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
      "      secretFile: ./outputs/adp/db.json",
      "      metadataFile: ./outputs/adp/metadata.json",
      "",
    ].join("\n"),
    "utf8",
  );

  const report = runDoctor({ projectRoot });
  const failureIds = report.failures.map((item) => item.id);

  assert.equal(report.ok, false);
  assert.ok(failureIds.includes("system.database-secret-path-unsafe"));
  assert.ok(failureIds.includes("system.database-metadata-path-unsafe"));
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
      ssl: {
        ca: "public-ca",
        password: "nested-secret",
      },
      options: [
        { name: "keep", value: "plain" },
        { token: "nested-token", endpointUrl: "https://db.internal" },
      ],
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
            { name: "payload", type: "json", comment: "扩展信息" },
            { name: "created_time", type: "datetime", comment: "创建时间" },
          ],
          sampleRows: [
            {
              id: 1,
              customer_phone: "13800138000",
              status: "DONE",
              payload: {
                contact: { mobile: "13900139000", email: "owner@example.com" },
                tags: ["normal", "11010519491231002X"],
              },
            },
            {
              id: 2,
              customer_phone: "13700137000",
              status: "INIT",
              payload: {
                contact: { mobile: "13700137000", email: "second@example.com" },
                tags: ["normal"],
              },
            },
            {
              id: 3,
              customer_phone: "13600136000",
              status: "DONE",
              payload: {
                contact: { mobile: "13600136000", email: "third@example.com" },
                tags: ["normal"],
              },
            },
            {
              id: 4,
              customer_phone: "13500135000",
              status: "DONE",
              payload: {
                contact: { mobile: "13500135000", email: "fourth@example.com" },
                tags: ["normal"],
              },
            },
          ],
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
      "      sampleRows: 5",
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
  assert.equal(profile.tables[0].sampleRows.length, 3);
  assert.equal(profile.tables[0].sampleRows[0].customer_phone, "1***0");
  assert.equal(profile.tables[0].sampleRows[0].payload.contact.mobile, "1***0");
  assert.equal(profile.tables[0].sampleRows[0].payload.contact.email, "o***m");
  assert.equal(profile.tables[0].sampleRows[0].payload.tags[0], "normal");
  assert.equal(profile.tables[0].sampleRows[0].payload.tags[1], "1***X");
  assert.equal(profile.entityCandidates[0].statusColumns[0].name, "status");
  const customerPhoneColumn = profile.tables[0].columns.find((column) => column.name === "customer_phone");
  assert.equal(customerPhoneColumn.nullable, false);
  assert.equal(customerPhoneColumn.primaryKey, false);
  assert.equal(profile.source.secret.ssl.ca, "public-ca");
  assert.equal(profile.source.secret.ssl.password, "[redacted]");
  assert.equal(profile.source.secret.options[0].value, "plain");
  assert.equal(profile.source.secret.options[1].token, "[redacted]");
  assert.equal(profile.source.secret.options[1].endpointUrl, "[redacted]");
  assert.deepEqual(sanitizeSecret({ password: "secret", nested: { token: "abc", keep: "ok" } }), {
    password: "[redacted]",
    nested: { token: "[redacted]", keep: "ok" },
  });
  assert.deepEqual(sanitizeSampleRow({ customerName: "张三", payload: { phone: "13900139000", keep: "ok" } }), {
    customerName: "***",
    payload: { phone: "1***0", keep: "ok" },
  });
  assert.deepEqual(sanitizeSampleRow({ customerProfile: { phone: "13900139000", keep: "ok" } }), {
    customerProfile: "[redacted]",
  });
  assert.deepEqual(
    sanitizeSampleRow(
      { value: "13800138000", payload: { 手机: "13900139000", keep: "ok" } },
      [{ name: "value", comment: "客户手机号" }],
    ),
    {
      value: "1***0",
      payload: { 手机: "1***0", keep: "ok" },
    },
  );
});

test("collect database profile resolves secret from databaseProfile secretDir and system code", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    collectDatabaseProfile,
    resolveDatabaseProfileConfig,
    resolveExpectedDatabaseSecretPath,
  } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-secretdir-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({
      type: "mysql",
      database: "adp_test",
      user: "readonly",
      password: "secret",
      readOnly: true,
    }),
    "utf8",
  );
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
      "    databaseProfile:",
      "      enabled: true",
      "      mode: connector",
      "      secretDir: ./secrets/db",
      "",
    ].join("\n"),
    "utf8",
  );

  const profileConfig = resolveDatabaseProfileConfig(
    {
      code: "adp",
      databaseProfile: {
        enabled: true,
        mode: "connector",
        secretDir: "./secrets/db",
      },
    },
    path.dirname(configPath),
  );
  const { profile } = await collectDatabaseProfile({
    config: configPath,
    system: "adp",
    adapter: async () => ({
      databaseType: "mysql",
      tables: [{ schema: "adp_test", name: "policy_task", columns: [] }],
    }),
  });

  assert.equal(profileConfig.secretFile, path.join(projectRoot, "secrets", "db", "adp.json"));
  assert.equal(resolveExpectedDatabaseSecretPath({ code: "adp" }, path.dirname(configPath), profileConfig), profileConfig.secretFile);
  assert.equal(profile.source.secret.readOnly, true);
  assert.equal(profile.tables[0].name, "policy_task");
});

test("collect database profile rejects private database files outside secrets db", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { collectDatabaseProfile } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-private-path-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "outputs", "adp"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "outputs", "adp", "db.json"),
    JSON.stringify({ metadataFile: "./outputs/adp/metadata.json" }),
    "utf8",
  );
  fs.writeFileSync(path.join(projectRoot, "outputs", "adp", "metadata.json"), JSON.stringify({ tables: [] }), "utf8");
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
      "    databaseProfile:",
      "      enabled: true",
      "      secretFile: ./outputs/adp/db.json",
      "",
    ].join("\n"),
    "utf8",
  );

  await assert.rejects(
    () => collectDatabaseProfile({ config: configPath, system: "adp" }),
    /databaseProfile secret for system adp must resolve to secrets\/db\/adp\.json/,
  );
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

test("collect database profile reuses same database profile cache by default", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { collectDatabaseProfile } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-cache-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({
      type: "mysql",
      database: "adp_test",
      user: "readonly",
      password: "secret",
      readOnly: true,
    }),
    "utf8",
  );
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
      "    databaseProfile:",
      "      enabled: true",
      "      mode: connector",
      "      secretFile: ./secrets/db/adp.json",
      "      includeSchemas:",
      "        - adp_test",
      "",
    ].join("\n"),
    "utf8",
  );
  let calls = 0;
  const adapter = async () => {
    calls += 1;
    return {
      databaseType: "mysql",
      tables: [
        {
          schema: "adp_test",
          name: "policy_task",
          comment: "保单任务",
          columns: [{ name: "id", type: "bigint", comment: "主键" }],
        },
      ],
    };
  };

  const first = await collectDatabaseProfile({ config: configPath, system: "adp", adapter });
  const second = await collectDatabaseProfile({
    config: configPath,
    system: "adp",
    adapter: async () => {
      throw new Error("adapter should not run on cache hit");
    },
  });

  assert.equal(calls, 1);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.cacheStatus.reason, "cache-hit");
  assert.equal(second.profile.source.cache.sha256, first.profile.source.cache.sha256);
});

test("collect database profile refresh flag bypasses same database cache", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { collectDatabaseProfile } = require("./collect-database-profile");
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "system-whitepaper-db-refresh-"));
  fs.mkdirSync(path.join(projectRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "secrets", "db"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "secrets", "db", "adp.json"),
    JSON.stringify({ type: "mysql", database: "adp_test", user: "readonly", password: "secret", readOnly: true }),
    "utf8",
  );
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
      "    databaseProfile:",
      "      enabled: true",
      "      mode: connector",
      "      secretFile: ./secrets/db/adp.json",
      "",
    ].join("\n"),
    "utf8",
  );
  let calls = 0;
  const adapter = async () => {
    calls += 1;
    return {
      databaseType: "mysql",
      tables: [
        {
          schema: "adp_test",
          name: `policy_task_${calls}`,
          comment: "保单任务",
          columns: [{ name: "id", type: "bigint", comment: "主键" }],
        },
      ],
    };
  };

  await collectDatabaseProfile({ config: configPath, system: "adp", adapter });
  const refreshed = await collectDatabaseProfile({
    config: configPath,
    system: "adp",
    adapter,
    "refresh-database-profile": true,
  });

  assert.equal(calls, 2);
  assert.equal(refreshed.reused, false);
  assert.equal(refreshed.cacheStatus.reason, "forced-refresh");
  assert.equal(refreshed.profile.tables[0].name, "policy_task_2");
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
    assertValidDataDictionaryArtifact,
    assertValidEntityModelArtifact,
    buildDatabaseModelArtifacts,
    buildDatabaseModelFromDir,
    inferEntityRelations,
  } = {
    ...require("./check-truth-readiness"),
    ...require("./build-database-model"),
  };
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

  assert.doesNotThrow(() => assertValidDataDictionaryArtifact(result.dataDictionary));
  assert.doesNotThrow(() => assertValidEntityModelArtifact(result.entityModel));
  assert.equal(fs.existsSync(path.join(dir, "data-dictionary.json")), true);
  assert.equal(fs.existsSync(path.join(dir, "entity-model.json")), true);
  assert.equal(result.dataDictionary.sourceArtifacts.databaseProfile.fingerprint.exists, true);
  assert.equal(result.entityModel.sourceArtifacts.databaseProfile.fingerprint.exists, true);
  assert.equal(result.entityModel.sourceArtifacts.dataDictionary.fingerprint.exists, true);
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

test("build database model rejects unsafe database profile before writing derived artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildDatabaseModelArtifacts,
    buildDatabaseModelFromDir,
  } = require("./build-database-model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "database-model-unsafe-"));
  const profile = {
    artifactType: "database-profile",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    source: {
      mode: "connector",
      databaseType: "mysql",
      secret: { type: "mysql", host: "127.0.0.1", password: "[redacted]" },
    },
    safety: { secretRedacted: true },
    tables: [
      {
        schema: "adp_test",
        name: "policy_task",
        comment: "保单任务",
        columns: [{ name: "customer_phone", type: "varchar", comment: "客户手机号" }],
        sampleRows: [{ customer_phone: "13800138000" }],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(profile), "utf8");

  assert.throws(
    () => buildDatabaseModelArtifacts(profile, { generatedAt: "2026-06-03T00:00:00.000Z" }),
    /not safely redacted.*source\.secret\.host.*customer_phone/s,
  );
  assert.throws(
    () => buildDatabaseModelFromDir(dir, { generatedAt: "2026-06-03T00:00:00.000Z" }),
    /not safely redacted.*source\.secret\.host.*customer_phone/s,
  );
  assert.equal(fs.existsSync(path.join(dir, "data-dictionary.json")), false);
  assert.equal(fs.existsSync(path.join(dir, "entity-model.json")), false);
});

test("build database model rejects invalid database profile contract before writing derived artifacts", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildDatabaseModelArtifacts,
    buildDatabaseModelFromDir,
  } = require("./build-database-model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "database-model-invalid-profile-"));
  const profile = {
    artifactType: "entity-model",
    safety: { secretRedacted: true },
    tables: [],
  };
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(profile), "utf8");

  assert.throws(
    () => buildDatabaseModelArtifacts(profile, { generatedAt: "2026-06-03T00:00:00.000Z" }),
    /not a valid database profile artifact.*artifactType must be database-profile/s,
  );
  assert.throws(
    () => buildDatabaseModelFromDir(dir, { generatedAt: "2026-06-03T00:00:00.000Z" }),
    /not a valid database profile artifact.*artifactType must be database-profile/s,
  );
  assert.equal(fs.existsSync(path.join(dir, "data-dictionary.json")), false);
  assert.equal(fs.existsSync(path.join(dir, "entity-model.json")), false);
});

test("build function universe merges UI functions and redacted database entities", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    assertValidFunctionUniverseArtifact,
    buildFunctionUniverseArtifact,
    buildFunctionUniverseFromDir,
    scoreFunctionEntityMatch,
  } = {
    ...require("./check-truth-readiness"),
    ...require("./build-function-universe"),
  };
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
    safety: { secretRedacted: true },
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
      version: 1,
      generatedAt: "2026-06-03T00:00:00.000Z",
      system: { code: "adp", name: "AI保单数据闭环平台" },
      source: { artifact: "data-dictionary.json" },
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
      metrics: {
        entityCount: 1,
        relationCount: 1,
        statusAwareEntityCount: 1,
        sampleBackedEntityCount: 1,
      },
      safety: {
        rawSecretsIncluded: false,
        rawSampleRowsIncluded: false,
        databaseOnlyClaimsRequireUiConfirmation: true,
      },
      sourceArtifacts: {
        databaseProfile: { file: "database-profile.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
        dataDictionary: { file: "data-dictionary.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
      },
    }),
    "utf8",
  );

  const direct = buildFunctionUniverseArtifact({
    evidenceSummary,
    databaseProfile,
    entityModel: JSON.parse(fs.readFileSync(path.join(dir, "entity-model.json"), "utf8")),
  });
  const { outputPath, artifact } = buildFunctionUniverseFromDir(dir);

  assert.doesNotThrow(() => assertValidFunctionUniverseArtifact(artifact));
  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(direct.modules[0].name, "保单任务");
  assert.equal(artifact.sourceArtifacts.evidenceSummary.fingerprint.exists, true);
  assert.equal(artifact.sourceArtifacts.databaseProfile.fingerprint.exists, true);
  assert.equal(artifact.sourceArtifacts.entityModel.fingerprint.exists, true);
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

test("build function universe derives modules and functions from operation spec", () => {
  const { buildFunctionUniverseArtifact } = require("./build-function-universe");
  const { buildVerifiedClaimsArtifact } = require("./build-verified-claims");
  const artifact = buildFunctionUniverseArtifact({
    evidenceSummary: {
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "本地", summary: "旧占位模块" }],
      functions: [],
    },
    operationSpec: {
      systemCode: "adp",
      systemName: "AI保单数据闭环平台",
      testUrl: "https://sit-adp.hzins.com/",
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          businessHint: "配置、查询并执行保司数据对接 AI 任务。",
          list: {
            columns: ["保险公司", "任务类型", "需求状态"],
            queryFields: ["全部", "高风险需关注"],
            rowActions: [],
          },
          screenshots: ["screenshots/task.png"],
        },
        {
          name: "数据与运行观测",
          entry: "左侧「数据与运行观测」",
          businessHint: "查看任务运行指标、异常告警与数据质量监控。",
          list: {
            columns: ["保险公司", "配置质量"],
            queryFields: ["全部"],
            rowActions: [],
          },
          screenshots: ["screenshots/monitor.png"],
        },
      ],
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
      operationSpec: { file: "operation-spec.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
    },
  });

  assert.deepEqual(artifact.modules.map((item) => item.name), ["AI任务管理", "数据与运行观测", "本地"]);
  assert.deepEqual(artifact.functions.map((item) => item.name), ["AI任务管理", "数据与运行观测"]);
  assert.equal(artifact.functions[0].evidenceStrength, "high");
  assert.equal(artifact.functions[0].sources.some((source) => source.type === "screenshot"), true);
  assert.equal(artifact.system.testUrl, "https://sit-adp.hzins.com/");

  const claims = buildVerifiedClaimsArtifact({ functionUniverse: artifact });
  assert.deepEqual(
    claims.claims
      .filter((claim) => claim.type === "function-presence")
      .map((claim) => [claim.subject, claim.status, claim.writable]),
    [
      ["AI任务管理", "confirmed", true],
      ["数据与运行观测", "confirmed", true],
    ],
  );
});

test("build function universe rejects malformed optional database profile before writing artifact", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildFunctionUniverseArtifact,
    buildFunctionUniverseFromDir,
  } = require("./build-function-universe");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "function-universe-bad-db-"));
  const evidenceSummary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务" }],
    functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
  };
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify(evidenceSummary),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "database-profile.json"), "{bad json", "utf8");

  assert.throws(
    () => buildFunctionUniverseFromDir(dir),
    /Database profile is malformed/,
  );
  assert.equal(fs.existsSync(path.join(dir, "function-universe.json")), false);

  const invalidProfile = { artifactType: "entity-model", safety: { secretRedacted: true }, entities: [] };
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(invalidProfile), "utf8");
  assert.throws(
    () => buildFunctionUniverseArtifact({ evidenceSummary, databaseProfile: invalidProfile }),
    /not a valid database profile artifact.*artifactType must be database-profile/s,
  );
  assert.throws(
    () => buildFunctionUniverseFromDir(dir),
    /not a valid database profile artifact.*artifactType must be database-profile/s,
  );
  assert.equal(fs.existsSync(path.join(dir, "function-universe.json")), false);
});

test("build function universe rejects unsafe optional database profile before writing artifact", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildFunctionUniverseArtifact,
    buildFunctionUniverseFromDir,
  } = require("./build-function-universe");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "function-universe-unsafe-db-"));
  const evidenceSummary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务" }],
    functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
  };
  const databaseProfile = {
    artifactType: "database-profile",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    source: {
      mode: "connector",
      databaseType: "mysql",
      secret: { type: "mysql", username: "adp_user", password: "[redacted]" },
    },
    safety: { secretRedacted: true },
    entityCandidates: [{ entity: "AI任务", table: "adp_test.ai_task" }],
    tables: [
      {
        schema: "adp_test",
        name: "ai_task",
        sampleRows: [{ user_email: "agent@example.com" }],
      },
    ],
  };
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), JSON.stringify(evidenceSummary), "utf8");
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(databaseProfile), "utf8");

  assert.throws(
    () => buildFunctionUniverseArtifact({ evidenceSummary, databaseProfile }),
    /not safely redacted.*source\.secret\.username.*user_email/s,
  );
  assert.throws(
    () => buildFunctionUniverseFromDir(dir),
    /not safely redacted.*source\.secret\.username.*user_email/s,
  );
  assert.equal(fs.existsSync(path.join(dir, "function-universe.json")), false);
});

test("build function universe rejects invalid optional entity model before writing artifact", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildFunctionUniverseArtifact,
    buildFunctionUniverseFromDir,
  } = require("./build-function-universe");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "function-universe-bad-entity-model-"));
  const evidenceSummary = {
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "AI任务" }],
    functions: [{ module: "AI任务", name: "任务列表", menuPath: "AI任务 > 任务列表" }],
  };
  const databaseProfile = {
    artifactType: "database-profile",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    safety: { secretRedacted: true },
    entityCandidates: [{ entity: "AI任务", table: "adp_test.ai_task" }],
  };
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), JSON.stringify(evidenceSummary), "utf8");
  fs.writeFileSync(path.join(dir, "database-profile.json"), JSON.stringify(databaseProfile), "utf8");
  fs.writeFileSync(path.join(dir, "entity-model.json"), "{bad json", "utf8");

  assert.throws(
    () => buildFunctionUniverseFromDir(dir),
    /Entity model is malformed/,
  );
  assert.equal(fs.existsSync(path.join(dir, "function-universe.json")), false);

  const invalidEntityModel = {
    artifactType: "entity-model",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    source: { artifact: "data-dictionary.json" },
    entities: [{ entity: "AI任务", table: "adp_test.ai_task" }],
    relations: [],
    metrics: { entityCount: 2, relationCount: 0 },
    safety: {
      rawSecretsIncluded: false,
      rawSampleRowsIncluded: false,
      databaseOnlyClaimsRequireUiConfirmation: true,
    },
    sourceArtifacts: {
      databaseProfile: { file: "database-profile.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
      dataDictionary: { file: "data-dictionary.json", fingerprint: { exists: true, size: 1, sha256: "fixture" } },
    },
  };
  fs.writeFileSync(path.join(dir, "entity-model.json"), JSON.stringify(invalidEntityModel), "utf8");
  assert.throws(
    () => buildFunctionUniverseArtifact({ evidenceSummary, databaseProfile, entityModel: invalidEntityModel }),
    /not a valid entity model artifact.*entity-model\.json metrics\.entityCount must match/s,
  );
  assert.throws(
    () => buildFunctionUniverseFromDir(dir),
    /not a valid entity model artifact.*entity-model\.json metrics\.entityCount must match/s,
  );
  assert.equal(fs.existsSync(path.join(dir, "function-universe.json")), false);
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
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
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
    rules: { noConclusion: true },
    coverage: {
      moduleCount: 1,
      functionCount: 2,
      entityCount: 1,
      linkedFunctionCount: 1,
      entityRelationCount: 1,
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
    },
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
  assert.equal(artifact.sourceArtifacts.functionUniverse.fingerprint.exists, true);
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

test("build verified claims rejects invalid function universe contract before writing artifact", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildVerifiedClaimsArtifact,
    buildVerifiedClaimsFromDir,
  } = require("./build-verified-claims");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-claims-bad-universe-"));
  const functionUniverse = {
    artifactType: "function-universe",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务" }],
    functions: [{ module: "保单任务", name: "任务列表" }],
    entities: [],
    links: [],
    entityRelations: [],
    coverage: {
      moduleCount: 1,
      functionCount: 1,
      entityCount: 0,
      linkedFunctionCount: 0,
      entityRelationCount: 0,
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
    },
    rules: { noConclusion: false },
  };
  fs.writeFileSync(path.join(dir, "function-universe.json"), JSON.stringify(functionUniverse), "utf8");

  assert.throws(
    () => buildVerifiedClaimsArtifact({ functionUniverse }),
    /rules\.noConclusion=true/,
  );
  assert.throws(
    () => buildVerifiedClaimsFromDir(dir),
    /rules\.noConclusion=true/,
  );
  assert.equal(fs.existsSync(path.join(dir, "verified-claims.json")), false);
});

test("build verified claims rejects forged function universe coverage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildVerifiedClaimsArtifact,
    buildVerifiedClaimsFromDir,
  } = require("./build-verified-claims");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verified-claims-forged-universe-"));
  const functionUniverse = {
    artifactType: "function-universe",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务" }],
    functions: [{ module: "保单任务", name: "任务列表" }],
    entities: [],
    links: [],
    entityRelations: [],
    coverage: {
      moduleCount: 1,
      functionCount: 10,
      entityCount: 0,
      linkedFunctionCount: 0,
      entityRelationCount: 0,
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
    },
    rules: { noConclusion: true },
  };
  fs.writeFileSync(path.join(dir, "function-universe.json"), JSON.stringify(functionUniverse), "utf8");

  assert.throws(
    () => buildVerifiedClaimsArtifact({ functionUniverse }),
    /coverage\.functionCount must match the artifact body count/,
  );
  assert.throws(
    () => buildVerifiedClaimsFromDir(dir),
    /coverage\.functionCount must match the artifact body count/,
  );
  assert.equal(fs.existsSync(path.join(dir, "verified-claims.json")), false);
});

test("build verified claims rejects forged function universe link coverage", () => {
  const {
    buildVerifiedClaimsArtifact,
  } = require("./build-verified-claims");
  const functionUniverse = {
    artifactType: "function-universe",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务" }],
    functions: [{ module: "保单任务", name: "任务列表" }],
    entities: [
      {
        name: "保单任务",
        table: "adp_test.policy_task",
        sources: [{ type: "db-table", id: "adp_test.policy_task" }],
      },
    ],
    links: [
      {
        module: "保单任务",
        function: "任务列表",
        entity: "保单任务",
        table: "adp_test.policy_task",
      },
    ],
    entityRelations: [],
    coverage: {
      moduleCount: 1,
      functionCount: 1,
      entityCount: 1,
      linkedFunctionCount: 2,
      entityRelationCount: 0,
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
    },
    rules: { noConclusion: true },
  };

  assert.throws(
    () => buildVerifiedClaimsArtifact({ functionUniverse }),
    /coverage\.linkedFunctionCount must match the artifact body count/,
  );
});

test("build verified claims rejects links without matching function or entity evidence", () => {
  const {
    buildVerifiedClaimsArtifact,
  } = require("./build-verified-claims");
  const functionUniverse = {
    artifactType: "function-universe",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    modules: [{ name: "保单任务" }],
    functions: [{ module: "保单任务", name: "任务列表" }],
    entities: [
      {
        name: "保单任务",
        table: "adp_test.policy_task",
        sources: [{ type: "db-table", id: "adp_test.policy_task" }],
      },
    ],
    links: [
      {
        module: "保单任务",
        function: "不存在的功能",
        entity: "保单任务",
        table: "adp_test.policy_task",
      },
    ],
    entityRelations: [],
    coverage: {
      moduleCount: 1,
      functionCount: 1,
      entityCount: 1,
      linkedFunctionCount: 1,
      entityRelationCount: 0,
    },
    sourceArtifacts: {
      evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
    },
    rules: { noConclusion: true },
  };

  assert.throws(
    () => buildVerifiedClaimsArtifact({ functionUniverse }),
    /links\[0\] must reference an existing function/,
  );
  functionUniverse.links[0].function = "任务列表";
  functionUniverse.links[0].entity = "不存在的实体";
  assert.throws(
    () => buildVerifiedClaimsArtifact({ functionUniverse }),
    /links\[0\] must reference an existing entity/,
  );
});

test("build verified claims never marks database-only claims writable", () => {
  const { claimHasStructuredFunctionEvidence, claimIsWritable } = require("./build-verified-claims");

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
  const screenshotOnlyFunction = {
    type: "function-presence",
    status: "confirmed",
    evidence: {
      actions: [],
      queryFields: [],
      tableColumns: [],
    },
    sources: [
      { type: "ui-function", id: "左侧「AI任务管理」" },
      { type: "screenshot", id: "screenshots/task.png" },
    ],
  };
  assert.equal(claimHasStructuredFunctionEvidence(screenshotOnlyFunction), false);
  assert.equal(claimIsWritable(screenshotOnlyFunction), false);
  assert.equal(
    claimIsWritable({
      ...screenshotOnlyFunction,
      evidence: { ...screenshotOnlyFunction.evidence, tableColumns: ["任务编号"] },
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

function verifiedClaimsFixture(claims = [], overrides = {}) {
  const writableClaimIds = claims
    .filter((claim) => claim?.writable && claim?.id)
    .map((claim) => claim.id);
  const base = {
    artifactType: "verified-claims",
    version: 1,
    claims,
    writableClaimIds,
    rules: {
      lowConfidenceNotWritable: true,
      databaseOnlyNotConfirmed: true,
      databaseOnlyNotWritable: true,
    },
    metrics: {
      claimCount: claims.length,
      writableClaimCount: writableClaimIds.length,
      confirmedCount: claims.filter((claim) => claim.status === "confirmed").length,
      inferredCount: claims.filter((claim) => claim.status === "inferred").length,
      weakCount: claims.filter((claim) => claim.status === "weak").length,
      databaseOnlyClaimCount: 0,
    },
  };
  return {
    ...base,
    ...overrides,
    rules: {
      ...base.rules,
      ...(overrides.rules || {}),
    },
  };
}

function writeVerifiedClaimsFixture(dir, claims = [], overrides = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify(verifiedClaimsFixture(claims, overrides)),
    "utf8",
  );
}

function factCheckReportFixture(overrides = {}) {
  const {
    coveredWritableClaimIds: coveredOverrides,
    missingWritableClaimIds: missingOverrides,
    metrics: metricsOverrides,
    ...restOverrides
  } = overrides;
  const coveredWritableClaimIds = coveredOverrides || ["function:保单任务:任务列表"];
  const missingWritableClaimIds = missingOverrides || [];
  const baseMetrics = {
    claimCount: 1,
    writableClaimCount: 1,
    checkedAssertions: 1,
    supportedAssertions: 1,
    supportedRatio: 1,
    coveredWritableClaimCount: coveredWritableClaimIds.length,
    missingWritableClaimCount: missingWritableClaimIds.length,
    writableClaimCoverageRatio: coveredWritableClaimIds.length + missingWritableClaimIds.length
      ? coveredWritableClaimIds.length / (coveredWritableClaimIds.length + missingWritableClaimIds.length)
      : 1,
    minWritableClaimCoverage: 0.8,
    requiredPlanItemCount: 1,
    coveredPlanItemCount: 1,
    missingPlanItemCount: 0,
    planRequiredCoverageRatio: 1,
    minPlanRequiredCoverage: 0.95,
  };
  return {
    artifactType: "fact-check-report",
    version: 1,
    canFinalize: true,
    failures: [],
    coveredWritableClaimIds,
    missingWritableClaimIds,
    metrics: {
      ...baseMetrics,
      ...(metricsOverrides || {}),
    },
    ...restOverrides,
  };
}

function goldenEvalReportFixture(overrides = {}) {
  const {
    metrics: metricsOverrides,
    thresholds: thresholdOverrides,
    ...restOverrides
  } = overrides;
  const baseMetrics = {
    factCount: 1,
    coveredCount: 1,
    partialCount: 0,
    missingCount: 0,
    overclaimCount: 0,
    coverageRatio: 1,
    criticalFactCount: 1,
    criticalCoveredCount: 1,
    criticalCoverageRatio: 1,
  };
  const baseThresholds = {
    minCoverageRatio: 0.95,
    minCriticalCoverageRatio: 0.8,
    maxOverclaims: 0,
  };
  return {
    artifactType: "golden-eval-report",
    version: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    system: { code: "adp", name: "AI保单数据闭环平台" },
    thresholds: {
      ...baseThresholds,
      ...(thresholdOverrides || {}),
    },
    canPass: true,
    canSubmitReview: true,
    canFinalize: true,
    metrics: {
      ...baseMetrics,
      ...(metricsOverrides || {}),
    },
    results: [],
    overclaims: [],
    failures: [],
    warnings: [],
    blockers: [],
    sourceArtifacts: {},
    ...restOverrides,
  };
}

function narrativeQualityReportFixture(overrides = {}) {
  const baseCounts = { chars: 2000, evidencePages: 1 };
  return {
    artifactType: "narrative-quality-report",
    version: 1,
    canSubmitReview: true,
    failures: [],
    counts: {
      ...baseCounts,
      ...(overrides.counts || {}),
    },
    ...overrides,
  };
}

function qualityReportFixture(overrides = {}) {
  return {
    artifactType: "quality-report",
    version: 1,
    canFinalize: true,
    menuCoverage: 1,
    corePageScreenshotCoverage: 1,
    coreFunctionClassificationCoverage: 1,
    writeOperationSafetyCompliance: 1,
    unverifiedContentLabeling: 1,
    coreConclusionTraceability: 1,
    failures: [],
    ...overrides,
  };
}

function writeQualityReportFixture(dir, overrides = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { buildQualitySourceArtifacts } = require("./check-quality");
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify(qualityReportFixture({
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath: path.join(dir, "evidence.json"),
        evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
        operationSpecPath: path.join(dir, "operation-spec.json"),
        operationGuideGatePath: path.join(dir, "operation-guide-gate.json"),
      }),
      ...overrides,
    })),
    "utf8",
  );
}

function writeOperationSpecFixture(dir, options = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const {
    buildOperationSpec,
    buildOperationSpecSourceArtifacts,
    fingerprintFile,
  } = require("./operation-spec/lib");
  const { buildWorkflowSpecFromDir } = require("./build-workflow-spec");
  const evidencePath = path.join(dir, "evidence.json");
  const evidenceSummaryPath = path.join(dir, "evidence-summary.json");
  const writeValidationPath = path.join(dir, "write-validation-result.json");
  const networkIndexPath = path.join(dir, "network-index.json");
  const operationSpecPath = path.join(dir, "operation-spec.json");
  const operationGuideGatePath = path.join(dir, "operation-guide-gate.json");
  const evidence = fs.existsSync(evidencePath)
    ? JSON.parse(fs.readFileSync(evidencePath, "utf8"))
    : {
        systemInfo: { code: "adp", name: "AI保单数据闭环平台" },
        menuMap: [],
        pageInventory: [],
        actionInventory: [],
        formInventory: [],
        tableInventory: [],
        screenshotIndex: [],
      };
  let injectedObservedFlow = false;
  if (options.withObservedFlow !== false) {
    evidence.pageInventory = Array.isArray(evidence.pageInventory) ? evidence.pageInventory : [];
    evidence.actionInventory = Array.isArray(evidence.actionInventory) ? evidence.actionInventory : [];
    evidence.formInventory = Array.isArray(evidence.formInventory) ? evidence.formInventory : [];
    evidence.screenshotIndex = Array.isArray(evidence.screenshotIndex) ? evidence.screenshotIndex : [];
    const sourcePage =
      evidence.pageInventory.find((page) => page && page.id && !page.sourcePageId && page.type !== "home") ||
      evidence.pageInventory.find((page) => page && page.id) ||
      null;
    const sourcePageId = sourcePage?.id || "workflow-source-page";
    const sourceTitle =
      String(sourcePage?.title || sourcePage?.menuPath || evidence.menuMap?.[0]?.title || "业务记录").trim() ||
      "业务记录";
    const sourceMenuPath =
      String(sourcePage?.menuPath || evidence.menuMap?.[0]?.menuPath || sourceTitle).trim() || sourceTitle;
    const triggerLabel = `新增${sourceTitle}`;
    const containerId = "workflow-form";
    if (!sourcePage) {
      evidence.pageInventory.push({
        id: sourcePageId,
        type: "page",
        title: sourceTitle,
        menuPath: sourceMenuPath,
        screenshot: `${sourceTitle}.png`,
      });
      injectedObservedFlow = true;
    }
    if (!evidence.pageInventory.some((page) => page.id === containerId)) {
      evidence.pageInventory.push({
        id: containerId,
        sourcePageId,
        type: "modal",
        title: triggerLabel,
        menuPath: triggerLabel,
        triggerLabel,
        screenshot: `${triggerLabel}.png`,
        fields: [{ label: sourceTitle }],
        actions: [{ name: "保存", type: "flow-progress", risk: "normal" }],
        triggerActionId: "action-new-task",
        captureKind: "business-flow-surface",
      });
      injectedObservedFlow = true;
    }
    if (!evidence.actionInventory.some((action) => action.id === "action-new-task")) {
      evidence.actionInventory.push({
        id: "action-new-task",
        pageId: sourcePageId,
        name: triggerLabel,
        label: triggerLabel,
        menuPath: sourceMenuPath,
        type: "create",
        risk: "normal",
        classification: "flow-start",
        captureActionClass: "flow-start",
      });
      injectedObservedFlow = true;
    }
    if (!evidence.actionInventory.some((action) => action.pageId === containerId && action.name === "保存")) {
      evidence.actionInventory.push({
        id: "action-workflow-save",
        pageId: containerId,
        name: "保存",
        type: "button",
        risk: "normal",
      });
      injectedObservedFlow = true;
    }
    if (!evidence.formInventory.some((form) => form.pageId === containerId)) {
      evidence.formInventory.push({
        pageId: containerId,
        formName: triggerLabel,
        fields: [{ label: sourceTitle, type: "input", required: true }],
      });
      injectedObservedFlow = true;
    }
    if (!evidence.screenshotIndex.some((shot) => shot.file === `${triggerLabel}.png`)) {
      evidence.screenshotIndex.push({
        id: "workflow-form-shot",
        pageId: containerId,
        file: `${triggerLabel}.png`,
        module: sourceMenuPath,
        function: triggerLabel,
        caption: triggerLabel,
      });
      injectedObservedFlow = true;
    }
  }
  if (injectedObservedFlow || !fs.existsSync(evidencePath)) {
    fs.writeFileSync(evidencePath, JSON.stringify(evidence), "utf8");
  }
  const evidenceSummary = injectedObservedFlow || !fs.existsSync(evidenceSummaryPath)
    ? buildEvidenceSummary(evidence)
    : JSON.parse(fs.readFileSync(evidenceSummaryPath, "utf8"));
  if (injectedObservedFlow || !fs.existsSync(evidenceSummaryPath)) {
    fs.writeFileSync(evidenceSummaryPath, JSON.stringify(evidenceSummary), "utf8");
  }
  const { spec, gate } = buildOperationSpec({
    evidence,
    evidenceSummary,
    writeValidation: fs.existsSync(writeValidationPath)
      ? JSON.parse(fs.readFileSync(writeValidationPath, "utf8"))
      : null,
    networkIndex: fs.existsSync(networkIndexPath)
      ? JSON.parse(fs.readFileSync(networkIndexPath, "utf8"))
      : null,
    system: options.system || { code: "adp", name: "AI保单数据闭环平台", operationGuideMinMenus: 1 },
    sourceArtifacts: buildOperationSpecSourceArtifacts({
      evidencePath,
      evidenceSummaryPath,
      writeValidationPath,
      networkIndexPath,
    }),
    generatedAt: options.generatedAt || "2026-06-03T00:00:00.000Z",
  });
  fs.writeFileSync(operationSpecPath, JSON.stringify(spec), "utf8");
  gate.sourceArtifacts = {
    operationSpec: {
      file: "operation-spec.json",
      status: "ok",
      fingerprint: fingerprintFile(operationSpecPath),
    },
    evidence: spec.sourceArtifacts.evidence,
    evidenceSummary: spec.sourceArtifacts.evidenceSummary,
  };
  fs.writeFileSync(operationGuideGatePath, JSON.stringify(gate), "utf8");
  if (options.withWorkflowSpec !== false) {
    buildWorkflowSpecFromDir(dir, { generatedAt: options.workflowGeneratedAt || "2026-06-03T00:00:30.000Z" });
  }
  return { spec, gate, operationSpecPath, operationGuideGatePath };
}

function truthReadinessReportFixture(dir, overrides = {}) {
  const { buildReadinessSourceArtifacts, loadReadinessInputs } = require("./check-truth-readiness");
  const baseGates = {
    evidence: { pass: true, scorePercent: 100 },
    claims: { pass: true, scorePercent: 100 },
    factCheck: {
      pass: true,
      scorePercent: 100,
      metrics: {
        writableClaimCoverageRatio: 1,
        minWritableClaimCoverage: 0.8,
        missingWritableClaimCount: 0,
      },
    },
    narrative: { pass: true, scorePercent: 100 },
    workflow: { pass: true, scorePercent: 100, metrics: { operationFlowCount: 1, observedWorkflowStepCount: 1 } },
    businessProcess: { pass: true, scorePercent: 100 },
    whitepaperPlan: {
      pass: true,
      scorePercent: 100,
      metrics: {
        planPresent: true,
        requiredItemCount: 1,
        allowedFactCount: 1,
        pendingItemCount: 0,
        planRequiredCoverageRatio: 1,
        minPlanRequiredCoverage: 0.95,
      },
    },
    goldenEval: {
      pass: true,
      required: false,
      available: false,
      scorePercent: 100,
      metrics: {
        coverageRatio: 1,
        criticalCoverageRatio: 1,
        overclaimCount: 0,
      },
    },
    database: { pass: true, available: false, required: false, profileAvailable: false, scorePercent: 0 },
    lineage: { pass: true, scorePercent: 100 },
  };
  const baseReport = {
    artifactType: "truth-readiness-report",
    version: 1,
    threshold: 0.95,
    score: 0.99,
    scorePercent: 99,
    canSubmitReview: true,
    canFinalize: true,
    requirements: { databaseEvidenceRequired: false, goldenEvalRequired: false },
    gates: baseGates,
    blockers: [],
    improvementActions: [],
    sourceArtifacts: buildReadinessSourceArtifacts(loadReadinessInputs(dir)),
    generatedAt: "2026-06-03T00:01:00.000Z",
  };
  return {
    ...baseReport,
    ...overrides,
    requirements: {
      ...baseReport.requirements,
      ...(overrides.requirements || {}),
    },
    gates: {
      ...baseGates,
      ...(overrides.gates || {}),
    },
  };
}

function writeTruthReadinessReportFixture(dir, overrides = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const report = truthReadinessReportFixture(dir, overrides);
  fs.writeFileSync(path.join(dir, "truth-readiness-report.json"), JSON.stringify(report), "utf8");
  return report;
}

test("fact check passes writable claims and allows weak claims only in pending section", () => {
  const {
    buildFactCheckReport,
  } = require("./fact-check-whitepaper");
  const claimsArtifact = verifiedClaimsFixture([
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
  ]);
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

test("fact check allows pending-section subgroup headings but still blocks unknown body headings", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = verifiedClaimsFixture([
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
  ]);
  const pendingMarkdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 任务列表",
    "保单任务模块提供任务列表，用于查看保单任务。",
    "## 6. 待确认事项",
    "### P0 - 阻塞成稿完整性",
    "- status 字段含义仍需结合页面流程确认。",
    "### 模块与功能",
    "- 自动理赔审批仅为待确认事项，不得写为正文结论。",
    "",
  ].join("\n");

  const pendingReport = buildFactCheckReport({ markdown: pendingMarkdown, claimsArtifact });
  assert.equal(pendingReport.canFinalize, true);
  assert.deepEqual(pendingReport.unsupportedHeadings, []);
  assert.equal(pendingReport.pendingReferences.length, 1);

  const bodyMarkdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 自动理赔审批",
    "保单任务模块提供任务列表，用于查看保单任务。",
    "",
  ].join("\n");
  const bodyReport = buildFactCheckReport({ markdown: bodyMarkdown, claimsArtifact });
  assert.equal(bodyReport.canFinalize, false);
  assert.equal(bodyReport.unsupportedHeadings[0].term, "自动理赔审批");
});

test("fact check blocks low writable claim coverage", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = verifiedClaimsFixture([
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
  ]);
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

test("fact check requires contextual support for writable claim coverage", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = verifiedClaimsFixture([
    {
      id: "function:保单任务:任务列表",
      type: "function-presence",
      subject: "任务列表",
      module: "保单任务",
      writable: true,
      status: "confirmed",
      evidence: {
        queryFields: ["保单号"],
        tableColumns: ["任务状态"],
      },
    },
  ]);
  const weakMarkdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 任务列表",
    "任务列表用于查看信息。",
    "",
  ].join("\n");

  const weakReport = buildFactCheckReport({
    markdown: weakMarkdown,
    claimsArtifact,
    minWritableClaimCoverage: 1,
  });

  assert.equal(weakReport.canFinalize, false);
  assert.deepEqual(weakReport.coveredWritableClaimIds, []);
  assert.deepEqual(weakReport.missingWritableClaimIds, ["function:保单任务:任务列表"]);

  const contextualMarkdown = [
    "# AI保单数据闭环平台功能白皮书",
    "### 任务列表",
    "保单任务模块提供任务列表，可结合保单号和任务状态查看保单任务。",
    "",
  ].join("\n");
  const contextualReport = buildFactCheckReport({
    markdown: contextualMarkdown,
    claimsArtifact,
    minWritableClaimCoverage: 1,
  });

  assert.equal(contextualReport.canFinalize, true);
  assert.deepEqual(contextualReport.coveredWritableClaimIds, ["function:保单任务:任务列表"]);
  assert.equal(contextualReport.writableCoverageMatches[0].claimId, "function:保单任务:任务列表");
  assert.ok(contextualReport.writableCoverageMatches[0].matchedContextTerms.includes("保单任务"));
});

test("fact check blocks unknown headings and weak body assertions", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const claimsArtifact = verifiedClaimsFixture([
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
  ]);
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
  const claimsArtifact = verifiedClaimsFixture([
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
  ]);
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
    JSON.stringify(
      verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          writable: true,
          status: "confirmed",
        },
      ]),
    ),
    "utf8",
  );

  const report = runFactCheck({ inputDir: dir });

  assert.equal(report.canFinalize, true);
  assert.equal(report.artifactType, "fact-check-report");
  assert.equal(report.sourceArtifacts.pendingReview.file, "whitepaper.pending-review.md");
  assert.equal(report.sourceArtifacts.pendingReview.fingerprint.exists, true);
  assert.equal(report.sourceArtifacts.claims.file, "verified-claims.json");
  assert.equal(report.sourceArtifacts.claims.fingerprint.exists, true);
  assert.equal(fs.existsSync(path.join(dir, "fact-check-report.json")), true);
  fs.writeFileSync(path.join(dir, "verified-claims.json"), "[]", "utf8");
  assert.throws(
    () => runFactCheck({ inputDir: dir }),
    /Verified claims must be a JSON object/,
  );
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify({
      artifactType: "verified-claims",
      claims: [],
      rules: { lowConfidenceNotWritable: true },
    }),
    "utf8",
  );
  assert.throws(
    () => runFactCheck({ inputDir: dir, outputPath: path.join(dir, "bad-fact-check-report.json") }),
    /boundary rules are incomplete/,
  );
  assert.equal(fs.existsSync(path.join(dir, "bad-fact-check-report.json")), false);
});

test("fact check rejects forged verified claims metrics and writable ids", () => {
  const { buildFactCheckReport } = require("./fact-check-whitepaper");
  const forgedMetrics = verifiedClaimsFixture(
    [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: true,
        status: "confirmed",
      },
    ],
    { metrics: { claimCount: 2 } },
  );
  assert.throws(
    () => buildFactCheckReport({ markdown: "任务列表", claimsArtifact: forgedMetrics }),
    /metrics\.claimCount must match the claims body/,
  );

  const forgedWritableIds = verifiedClaimsFixture(
    [
      {
        id: "function:保单任务:任务列表",
        type: "function-presence",
        subject: "任务列表",
        module: "保单任务",
        writable: false,
        status: "confirmed",
      },
    ],
    { writableClaimIds: ["function:保单任务:任务列表"], metrics: { writableClaimCount: 1 } },
  );
  assert.throws(
    () => buildFactCheckReport({ markdown: "任务列表", claimsArtifact: forgedWritableIds }),
    /writableClaimIds must match writable claims/,
  );
});

test("truth readiness rejects stale fact check source fingerprints", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-stale-fact-check-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });

  const passing = runTruthReadinessCheck({ inputDir: dir });
  assert.equal(passing.canSubmitReview, true);

  fs.appendFileSync(path.join(dir, "whitepaper.pending-review.md"), "\n新增未经 fact-check 的功能结论。", "utf8");
  const stale = runTruthReadinessCheck({ inputDir: dir });
  assert.equal(stale.canSubmitReview, false);
  assert.equal(stale.gates.factCheck.pass, false);
  assert.ok(stale.gates.factCheck.staleSources.some((item) => item.key === "pendingReview"));
  const blocker = stale.blockers.find((item) => item.id === "fact-check.stale-sources");
  assert.ok(blocker);
  assert.deepEqual(blocker.rerunNodes, ["fact-check", "golden-eval", "quality", "truth-readiness"]);
  assert.equal(blocker.quotaImpact, "low");
});

test("truth readiness rejects stale narrative source fingerprints", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildFactCheckSourceArtifacts } = require("./fact-check-whitepaper");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-stale-narrative-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });

  const markdownPath = path.join(dir, "whitepaper.pending-review.md");
  fs.appendFileSync(markdownPath, "\n\n补充新的业务描述。", "utf8");
  const factCheckPath = path.join(dir, "fact-check-report.json");
  const factCheck = JSON.parse(fs.readFileSync(factCheckPath, "utf8"));
  fs.writeFileSync(
    factCheckPath,
    JSON.stringify({
      ...factCheck,
      sourceArtifacts: buildFactCheckSourceArtifacts({
        markdownPath,
        claimsPath: path.join(dir, "verified-claims.json"),
        whitepaperPlanPath: path.join(dir, "whitepaper-plan.json"),
      }),
    }),
    "utf8",
  );

  const stale = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(stale.canSubmitReview, false);
  assert.equal(stale.gates.factCheck.pass, true);
  assert.equal(stale.gates.narrative.pass, false);
  assert.ok(stale.gates.narrative.staleSources.some((item) => item.key === "pendingReview"));
  const blocker = stale.blockers.find((item) => item.id === "narrative.stale-sources");
  assert.ok(blocker);
  assert.deepEqual(blocker.rerunNodes, ["quality", "truth-readiness"]);
  assert.equal(blocker.quotaImpact, "low");
});

test("truth readiness rejects stale workflow spec against current operation spec", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-stale-workflow-spec-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const operationSpecPath = path.join(dir, "operation-spec.json");
  const currentSpec = JSON.parse(fs.readFileSync(operationSpecPath, "utf8"));
  currentSpec.modules[0].flows.push({
    name: "变更后的流程",
    trigger: "新增",
    sourcePage: "AI任务管理",
    status: "partial",
    steps: [{ name: "打开表单", action: "点击新增", fields: ["保险公司"] }],
    reason: "submit-button-not-found",
  });
  currentSpec.metrics.flowCount = Number(currentSpec.metrics.flowCount || 0) + 1;
  fs.writeFileSync(operationSpecPath, JSON.stringify(currentSpec), "utf8");

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.ok(
    report.gates.workflow.failures.some((item) =>
      /workflow-spec\.json source operation-spec\.json fingerprint is stale/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "workflow.lineage-stale"));
});

test("truth readiness rejects stale database truth lineage", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-lineage-db-"));
  writePassingTruthArtifacts(dir, { requireDatabaseEvidence: true });

  const passing = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(passing.canSubmitReview, true);
  assert.equal(passing.gates.lineage.pass, true);

  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      menuInventory: [{ title: "批改任务", status: "visited", url: "/endorsement-task" }],
      pageInventory: [{ id: "endorsement-task", type: "page", screenshot: "screenshots/endorsement.png" }],
      actionInventory: [{ function: "批改任务列表", type: "query" }],
    }),
    "utf8",
  );
  const staleQualityEvidence = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(staleQualityEvidence.canSubmitReview, false);
  assert.equal(staleQualityEvidence.gates.lineage.pass, false);
  assert.ok(staleQualityEvidence.gates.lineage.failures.some((item) => /evidence\.json/.test(item)));
  assert.ok(staleQualityEvidence.blockers.some((item) => item.id === "truth.lineage-stale"));

  fs.writeFileSync(
    path.join(dir, "evidence.json"),
    JSON.stringify({
      menuInventory: [{ title: "保单任务", status: "visited", url: "/policy-task" }],
      pageInventory: [{ id: "policy-task", type: "page", screenshot: "screenshots/task.png" }],
      actionInventory: [{ function: "任务列表", type: "query" }],
    }),
    "utf8",
  );

  fs.writeFileSync(
    path.join(dir, "operation-guide-gate.json"),
    JSON.stringify({
      canComposeGuide: false,
      readinessPercent: 40,
      failures: ["操作指引证据不足"],
    }),
    "utf8",
  );
  const staleOperationGuideGate = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(staleOperationGuideGate.canSubmitReview, false);
  assert.equal(staleOperationGuideGate.gates.lineage.pass, false);
  assert.ok(staleOperationGuideGate.gates.lineage.failures.some((item) => /operation-guide-gate\.json/.test(item)));
  assert.ok(staleOperationGuideGate.blockers.some((item) => item.id === "truth.lineage-stale"));
  fs.unlinkSync(path.join(dir, "operation-guide-gate.json"));

  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "批改任务", entry: "批改任务 > 任务列表" }],
      functions: [
        {
          module: "批改任务",
          name: "批改任务列表",
          menuPath: "批改任务 > 任务列表",
          queryFields: ["批改号"],
          tableColumns: ["批改号", "状态"],
        },
      ],
    }),
    "utf8",
  );
  const staleEvidenceSummary = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(staleEvidenceSummary.canSubmitReview, false);
  assert.equal(staleEvidenceSummary.gates.lineage.pass, false);
  assert.ok(staleEvidenceSummary.gates.lineage.failures.some((item) => /evidence-summary\.json/.test(item)));
  assert.ok(staleEvidenceSummary.blockers.some((item) => item.id === "truth.lineage-stale"));

  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "保单任务", entry: "保单任务 > 任务列表" }],
      functions: [
        {
          module: "保单任务",
          name: "任务列表",
          menuPath: "保单任务 > 任务列表",
          queryFields: ["保单号", "任务状态"],
          tableColumns: ["保单号", "状态"],
          screenshots: [{ id: "shot-1", file: "screenshots/task.png" }],
        },
      ],
    }),
    "utf8",
  );

  fs.unlinkSync(path.join(dir, "database-profile.json"));
  const missingSource = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(missingSource.canSubmitReview, false);
  assert.equal(missingSource.gates.lineage.pass, false);
  assert.ok(missingSource.gates.lineage.failures.some((item) => /database-profile\.json/.test(item) && /no longer exists/.test(item)));
  assert.ok(missingSource.blockers.some((item) => item.id === "truth.lineage-stale"));

  fs.writeFileSync(
    path.join(dir, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp", name: "AI保单数据闭环平台" },
      safety: { secretRedacted: true },
      tables: [
        {
          schema: "adp_test",
          name: "policy_task_changed",
          comment: "保单任务变更",
          columns: [{ name: "id", type: "bigint", comment: "主键", primaryKey: true }],
        },
      ],
    }),
    "utf8",
  );
  const stale = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });
  assert.equal(stale.canSubmitReview, false);
  assert.equal(stale.gates.lineage.pass, false);
  assert.ok(stale.gates.lineage.failures.some((item) => /database-profile\.json/.test(item)));
  assert.ok(stale.blockers.some((item) => item.id === "truth.lineage-stale"));
});

test("truth readiness rejects forged database model artifacts against current profile", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildDatabaseModelFromDir,
    fingerprintFile: fingerprintDatabaseModelFile,
  } = require("./build-database-model");
  const { buildFunctionUniverseFromDir } = require("./build-function-universe");
  const { buildVerifiedClaimsFromDir } = require("./build-verified-claims");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-db-model-current-profile-"));
  fs.writeFileSync(
    path.join(dir, "evidence-summary.json"),
    JSON.stringify({
      system: { code: "adp", name: "AI保单数据闭环平台" },
      modules: [{ name: "保单任务", entry: "保单任务 > 任务列表" }],
      functions: [
        {
          module: "保单任务",
          name: "任务列表",
          menuPath: "保单任务 > 任务列表",
          queryFields: ["保单号", "任务状态"],
          tableColumns: ["保单号", "状态"],
          screenshots: [{ id: "shot-1", file: "screenshots/task.png" }],
        },
      ],
    }),
    "utf8",
  );
  writeQualityReportFixture(dir);
  fs.writeFileSync(
    path.join(dir, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp", name: "AI保单数据闭环平台" },
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
  buildDatabaseModelFromDir(dir, { generatedAt: "2026-06-03T00:00:00.000Z" });
  const dataDictionaryPath = path.join(dir, "data-dictionary.json");
  const entityModelPath = path.join(dir, "entity-model.json");
  const dataDictionary = JSON.parse(fs.readFileSync(dataDictionaryPath, "utf8"));
  const entityModel = JSON.parse(fs.readFileSync(entityModelPath, "utf8"));
  dataDictionary.tables.push({
    table: "adp_test.claim_payment",
    schema: "adp_test",
    name: "claim_payment",
    entity: "赔付审核台账",
    comment: "赔付审核台账",
    rowCount: null,
    columns: [],
    statusFields: [],
    timeFields: [],
    identifierFields: [],
    sensitiveFieldCount: 0,
    sampleRowsIncluded: false,
    sampleFieldNames: [],
    indexes: [],
    foreignKeys: [],
    sources: [{ type: "db-table", id: "adp_test.claim_payment", label: "赔付审核台账" }],
  });
  dataDictionary.metrics.tableCount = dataDictionary.tables.length;
  entityModel.entities.push({
    entity: "赔付审核台账",
    table: "adp_test.claim_payment",
    comment: "赔付审核台账",
    confidence: "medium",
    statusFields: [],
    timeFields: [],
    identifierFields: [],
    evidence: {
      rowCount: null,
      sampleRowsIncluded: false,
      sampleFieldNames: [],
      sensitiveFieldCount: 0,
    },
    sources: [{ type: "db-table", id: "adp_test.claim_payment", label: "赔付审核台账" }],
  });
  entityModel.metrics.entityCount = entityModel.entities.length;
  fs.writeFileSync(dataDictionaryPath, JSON.stringify(dataDictionary), "utf8");
  entityModel.sourceArtifacts.dataDictionary = {
    file: "data-dictionary.json",
    fingerprint: fingerprintDatabaseModelFile(dataDictionaryPath),
  };
  fs.writeFileSync(entityModelPath, JSON.stringify(entityModel), "utf8");
  buildFunctionUniverseFromDir(dir);
  buildVerifiedClaimsFromDir(dir);
  const verifiedClaims = JSON.parse(fs.readFileSync(path.join(dir, "verified-claims.json"), "utf8"));
  const writableClaimLines = verifiedClaims.claims
    .filter((claim) => claim.writable)
    .map((claim) => `${claim.module || claim.subject || ""} ${claim.subject || claim.function || claim.entity || ""} [claim:${claim.id}]`);
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    [passingUiOnlyNarrativeMarkdown(), "", "## 5. 已验证声明索引", ...writableClaimLines].join("\n"),
    "utf8",
  );
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });

  const report = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.claims.pass, true);
  assert.equal(report.gates.lineage.pass, true);
  assert.equal(report.gates.database.pass, false);
  assert.equal(report.gates.database.derivedArtifactContractsPass, false);
  assert.ok(
    report.gates.database.failures.some((item) =>
      /data-dictionary\.json must match deterministic database model recomputation/.test(item),
    ),
  );
  assert.ok(
    report.gates.database.failures.some((item) =>
      /entity-model\.json must match deterministic database model recomputation/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "database.derived-artifact-invalid"));
});

test("truth readiness rejects forged evidence summary against current evidence", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildFunctionUniverseFromDir } = require("./build-function-universe");
  const { buildVerifiedClaimsFromDir } = require("./build-verified-claims");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-evidence-summary-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });

  const evidenceSummaryPath = path.join(dir, "evidence-summary.json");
  const forged = JSON.parse(fs.readFileSync(evidenceSummaryPath, "utf8"));
  forged.modules.push({
    name: "赔付管理",
    entry: "赔付管理 > 赔付审核台账",
    summary: "赔付管理用于处理赔付审核台账。",
  });
  forged.functions.push({
    id: "pay-ledger",
    module: "赔付管理",
    name: "赔付审核台账",
    menuPath: "赔付管理 > 赔付审核台账",
    title: "赔付审核台账",
    url: "/pay-ledger",
    actions: ["查询"],
    queryFields: ["赔付审核台账"],
    tableColumns: ["赔付审核台账", "审核状态"],
    screenshots: [{ id: "pay-ledger-shot", file: "screenshots/pay-ledger.png" }],
    hasContainerEvidence: false,
  });
  fs.writeFileSync(evidenceSummaryPath, JSON.stringify(forged), "utf8");

  buildFunctionUniverseFromDir(dir);
  buildVerifiedClaimsFromDir(dir);
  const verifiedClaims = JSON.parse(fs.readFileSync(path.join(dir, "verified-claims.json"), "utf8"));
  const writableClaimLines = verifiedClaims.claims
    .filter((claim) => claim.writable)
    .map((claim) => `${claim.module || claim.subject || ""} ${claim.subject || claim.function || claim.entity || ""} [claim:${claim.id}]`);
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    [passingUiOnlyNarrativeMarkdown(), "", "## 5. 已验证声明索引", ...writableClaimLines].join("\n"),
    "utf8",
  );
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.claims.pass, true);
  assert.equal(report.gates.factCheck.pass, true);
  assert.equal(report.gates.narrative.pass, true);
  assert.equal(report.gates.lineage.pass, false);
  assert.ok(
    report.gates.lineage.failures.some((item) =>
      /evidence-summary\.json must match deterministic evidence-summary recomputation from current evidence\.json/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "truth.lineage-stale"));
});

test("truth readiness rejects forged function universe against current sources", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const {
    buildSourceArtifacts: buildClaimSourceArtifacts,
    buildVerifiedClaimsArtifact,
  } = require("./build-verified-claims");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-universe-current-sources-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const functionUniversePath = path.join(dir, "function-universe.json");
  const forged = JSON.parse(fs.readFileSync(functionUniversePath, "utf8"));
  forged.modules.push({
    name: "赔付管理",
    entry: "赔付管理 > 赔付审核台账",
    summaryHint: "",
    sources: [{ type: "ui-module", id: "赔付管理 > 赔付审核台账", label: "赔付管理" }],
  });
  forged.functions.push({
    name: "赔付审核台账",
    module: "赔付管理",
    menuPath: "赔付管理 > 赔付审核台账",
    actions: ["查询"],
    queryFields: ["赔付审核台账"],
    tableColumns: ["赔付审核台账", "审核状态"],
    screenshots: [{ id: "pay-ledger-shot", file: "screenshots/pay-ledger.png" }],
    evidenceStrength: "medium",
    sources: [
      { type: "ui-function", id: "赔付管理 > 赔付审核台账", label: "赔付审核台账" },
      { type: "screenshot", id: "pay-ledger-shot", label: "screenshots/pay-ledger.png" },
    ],
  });
  forged.coverage = {
    moduleCount: forged.modules.length,
    functionCount: forged.functions.length,
    entityCount: forged.entities.length,
    linkedFunctionCount: new Set(forged.links.map((item) => `${item.module || ""}::${item.function || ""}`)).size,
    entityRelationCount: forged.entityRelations.length,
  };
  fs.writeFileSync(functionUniversePath, JSON.stringify(forged), "utf8");
  const verifiedClaims = buildVerifiedClaimsArtifact({
    functionUniverse: forged,
    sourceArtifacts: buildClaimSourceArtifacts({ functionUniversePath }),
    generatedAt: "2026-06-03T00:00:30.000Z",
  });
  fs.writeFileSync(path.join(dir, "verified-claims.json"), JSON.stringify(verifiedClaims), "utf8");
  const writableClaimLines = verifiedClaims.claims
    .filter((claim) => claim.writable)
    .map((claim) => `${claim.module || claim.subject || ""} ${claim.subject || claim.function || claim.entity || ""} [claim:${claim.id}]`);
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    [passingUiOnlyNarrativeMarkdown(), "", "## 5. 已验证声明索引", ...writableClaimLines].join("\n"),
    "utf8",
  );
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.claims.pass, true);
  assert.equal(report.gates.lineage.pass, false);
  assert.ok(
    report.gates.lineage.failures.some((item) =>
      /deterministic function-universe recomputation from current evidence-summary\/operation-spec\/database inputs/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "truth.lineage-stale"));
});

test("truth readiness passes only when evidence claims fact-check and narrative gates pass", () => {
  const { buildTruthReadinessReport, normalizeThreshold } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "保单任务",
        entry: "左侧「保单任务」",
        list: { columns: ["保单号"], queryFields: ["保单号"], rowActions: [] },
        flows: [
          {
            name: "新建保单任务",
            trigger: "新增",
            sourcePage: "保单任务",
            status: "partial",
            steps: [{ name: "打开新建表单", action: "点击新增", fields: ["保单号"] }],
            reason: "submit-button-not-found",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = verifiedClaimsFixture(
    [
      {
        id: "function:保单任务:任务列表",
        subject: "任务列表",
        module: "保单任务",
        status: "confirmed",
        writable: true,
      },
      {
        id: "database:policy_task",
        subject: "policy_task",
        module: "保单任务",
        status: "weak",
        writable: false,
        sources: [{ type: "db-table", id: "adp_test.policy_task" }],
      },
    ],
    { metrics: { claimCount: 2, writableClaimCount: 1, confirmedCount: 1, inferredCount: 0, weakCount: 1, databaseOnlyClaimCount: 1 } },
  );
  const businessProcessModel = businessProcessModelFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
  });
  const whitepaperPlan = whitepaperPlanFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
  });
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaims,
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({
        metrics: {
          claimCount: 2,
          writableClaimCount: 1,
        },
      }),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlan },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(normalizeThreshold(95), 0.95);
  assert.equal(report.scorePercent, 100);
  assert.equal(report.canSubmitReview, true);
  assert.equal(report.gates.database.available, false);
  assert.ok(report.improvementActions.some((item) => item.id === "database.optional-profile"));
});

test("truth readiness blocks formal review when operation flows are missing", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture();
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:AI任务管理:任务列表",
          subject: "任务列表",
          module: "AI任务管理",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:AI任务管理:任务列表"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.equal(report.gates.workflow.metrics.operationFlowCount, 0);
  assert.ok(report.blockers.some((item) => item.id === "workflow.operation-flow-missing"));
});

test("truth readiness blocks formal review when observed workflow steps are missing", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
        flows: [
          {
            name: "新建AI任务",
            trigger: "新增",
            steps: [],
            sourcePage: "AI任务管理",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = verifiedClaimsFixture([
    {
      id: "function:AI任务管理:新建AI任务",
      subject: "新建AI任务",
      module: "AI任务管理",
      status: "confirmed",
      writable: true,
    },
  ]);
  const businessProcessModel = businessProcessModelFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
  });
  const whitepaperPlan = whitepaperPlanFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
  });
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaims,
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:AI任务管理:新建AI任务"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlan },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.equal(report.gates.workflow.metrics.observedWorkflowStepCount, 0);
  assert.ok(report.blockers.some((item) => item.id === "workflow.steps-missing"));
});

test("truth readiness accepts current observed workflow evidence", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
        flows: [
          {
            name: "新建AI任务",
            trigger: "新增",
            sourcePage: "AI任务管理",
            status: "partial",
            steps: [
              { name: "打开新建表单", action: "点击新增", fields: ["保险公司"] },
              { name: "填写任务信息", action: "填写表单", fields: ["保险公司"] },
            ],
            reason: "submit-button-not-found",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = verifiedClaimsFixture([
    {
      id: "function:AI任务管理:新建AI任务",
      subject: "新建AI任务",
      module: "AI任务管理",
      status: "confirmed",
      writable: true,
    },
  ]);
  const businessProcessModel = businessProcessModelFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
  });
  const whitepaperPlan = whitepaperPlanFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
  });
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaims,
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:AI任务管理:新建AI任务"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlan },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.workflow.pass, true);
  assert.equal(report.gates.workflow.metrics.operationFlowCount, 1);
  assert.equal(report.gates.workflow.metrics.observedWorkflowStepCount, 2);
  assert.equal(report.canSubmitReview, true);
});

test("V6 workflow gate passes narratable inferred workflows without observed counts", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "费用申请",
        entry: "首页「业务流程」",
        source: "home-overview-card",
        sourceCardTitle: "业务流程",
        surfaceType: "business-flow",
        coreBusinessModule: true,
        businessObject: {
          value: "费用申请",
          confidence: "medium",
          evidence: ["首页流程卡片:业务流程:费用申请"],
        },
        list: { columns: [], queryFields: [], rowActions: [] },
        lifecycleSignals: [],
        qualitySignals: [],
        flows: [
          {
            name: "费用申请",
            trigger: "业务流程",
            status: "inferred-from-home-overview",
            reason: "依据首页流程卡片和截图归纳，未形成已点击菜单或写操作证据。",
            steps: [
              {
                title: "费用申请",
                screenshots: ["screenshots/home.png"],
                validation: {
                  status: "not-executed",
                  source: "home-overview-card",
                },
              },
            ],
          },
        ],
        plannedFlows: [],
        tabs: [],
        screenshots: ["screenshots/home.png"],
        apis: [],
      },
    ],
    metrics: { flowCount: 1, screenshotCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = verifiedClaimsFixture([
    {
      id: "function:费用申请:首页流程卡片",
      subject: "首页流程卡片",
      module: "费用申请",
      status: "confirmed",
      writable: true,
    },
  ]);
  const businessProcessModel = businessProcessModelFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
  });
  const whitepaperPlan = whitepaperPlanFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
  });
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: verifiedClaims },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:首页流程卡片"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlan },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.workflow.pass, true);
  assert.equal(report.gates.workflow.metrics.observedWorkflowCount, 0);
  assert.equal(report.gates.workflow.metrics.inferredWorkflowCount, 1);
  assert.equal(report.gates.workflow.metrics.homeOverviewWorkflowCount, 1);
  assert.equal(report.gates.workflow.metrics.narratableWorkflowCount, 1);
  assert.equal(report.gates.workflow.metrics.observedWorkflowStepCount, 0);
  assert.equal(report.gates.workflow.metrics.inferredWorkflowStepCount, 1);
});

test("business process model default inference is generic for non-ADP systems", () => {
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const model = buildBusinessProcessModel({
    operationSpec: genericOperationSpecFixture(),
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([
      {
        id: "function:费用申请:列表",
        module: "费用申请",
        subject: "费用申请列表",
        status: "confirmed",
        writable: true,
        confidence: "high",
      },
    ]),
    generatedAt: "2026-06-10T00:00:00.000Z",
  });

  const text = JSON.stringify(model);
  assert.equal(model.version, 2);
  assert.doesNotMatch(text, /保司|AI任务|元数据|发布上线|运行观测/);
  assert.ok(model.businessObjects.length >= 1);
  assert.ok(model.moduleResponsibilities.length >= 2);
  assert.ok(
    model.processes.every((processItem) =>
      ["observed", "partially-observed", "inferred", "candidate", "pending"].includes(processItem.status),
    ),
  );
}
);

test("business process model keeps inferred cross-module sequence distinct from observed workflow steps", () => {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const workflowSpec = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-10T00:00:01.000Z",
    sourceArtifacts: {},
  });
  const model = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([]),
    generatedAt: "2026-06-10T00:00:02.000Z",
  });

  const observedSteps = model.processes
    .flatMap((processItem) => processItem.steps || [])
    .filter((step) => step.status === "observed");
  const inferredProcesses = model.processes.filter((processItem) =>
    ["inferred", "partially-observed"].includes(processItem.status),
  );
  assert.ok(observedSteps.length >= 1);
  assert.ok(inferredProcesses.every((processItem) => processItem.boundary));
});

test("V6 business process keeps homepage workflow steps inferred", () => {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = operationSpecFixture({
    systemCode: "finance",
    systemName: "财务费用系统",
    testUrl: "https://finance.example.test/",
    navigation: [],
    modules: [
      {
        name: "费用申请",
        entry: "首页「业务流程」",
        source: "home-overview-card",
        sourceCardTitle: "业务流程",
        surfaceType: "business-flow",
        coreBusinessModule: true,
        businessHint: "员工提交费用报销申请。",
        businessObject: {
          value: "费用申请",
          confidence: "medium",
          evidence: ["首页流程卡片:业务流程:费用申请"],
        },
        list: { columns: [], queryFields: [], filters: [], enumOptions: {}, rowActions: [] },
        lifecycleSignals: [],
        qualitySignals: [],
        flows: [
          {
            name: "费用申请",
            trigger: "业务流程",
            status: "inferred-from-home-overview",
            reason: "依据首页流程卡片和截图归纳，未形成已点击菜单或写操作证据。",
            steps: [{ title: "费用申请", screenshots: ["screenshots/home.png"] }],
          },
        ],
        plannedFlows: [],
        tabs: [],
        screenshots: ["screenshots/home.png"],
        apis: [],
      },
    ],
    metrics: { navigationCount: 0, flowCount: 1, screenshotCount: 1 },
  });
  const workflowSpec = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-11T00:00:00.000Z",
  });
  const model = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary: evidenceSummaryFixtureForOperation(operationSpec),
    verifiedClaims: verifiedClaimsFixture([]),
    generatedAt: "2026-06-11T00:00:01.000Z",
  });

  const steps = model.processes.flatMap((processItem) => processItem.steps || []);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].status, "inferred");
  assert.match(steps[0].reasoning, /inferred workflow|首页流程卡片|推理/);
  assert.ok(steps[0].boundary);
  assert.equal(model.processes[0].status, "inferred");
  assert.doesNotMatch(model.processes[0].reasoning, /observed workflow/);
  assert.match(model.processes[0].reasoning, /inferred workflow|流程推理/);
  assert.ok(model.processes[0].boundary);
});

test("business process domain profile applies only when explicitly supplied", () => {
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const evidenceSummary = genericEvidenceSummaryFixture();
  const baseModel = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary,
    verifiedClaims: verifiedClaimsFixture([]),
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const profiledModel = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary,
    verifiedClaims: verifiedClaimsFixture([]),
    domainProfile: {
      artifactType: "business-process-domain-profile",
      version: 1,
      profileId: "finance-expense",
      labels: {
        "work-item": "费用申请单",
        "validate-or-check": "预算校验",
      },
    },
    generatedAt: "2026-06-10T00:00:00.000Z",
  });

  assert.doesNotMatch(JSON.stringify(baseModel), /费用申请单|预算校验/);
  assert.match(JSON.stringify(profiledModel), /费用申请单|预算校验/);
  assert.equal(profiledModel.derivation.profileId, "finance-expense");
});

test("truth readiness blocks forged current business process model", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = genericEvidenceSummaryFixture();
  const verifiedClaims = verifiedClaimsFixture([
    {
      id: "function:费用申请:列表",
      module: "费用申请",
      subject: "费用申请列表",
      status: "confirmed",
      writable: true,
      confidence: "high",
    },
  ]);
  const currentModel = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const forgedModel = {
    ...currentModel,
    processes: [
      {
        ...(currentModel.processes[0] || {
          id: "process:forged",
          steps: [],
          source: [],
          evidence: [],
        }),
        name: "手工伪造的已验证自动闭环",
        status: "observed",
      },
    ],
  };
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: verifiedClaims },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:列表"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: forgedModel },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.businessProcess.pass, false);
  assert.ok(report.blockers.some((item) => item.id === "business-process.forged-model"));
});

test("truth readiness does not treat domain profile id as source evidence for default vocabulary", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const { buildBusinessProcessModel, hashBusinessProcessContent } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = genericEvidenceSummaryFixture();
  const verifiedClaims = verifiedClaimsFixture([]);
  const model = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const leakedModel = {
    ...model,
    derivation: { ...model.derivation, profileId: "adp-AI任务" },
    businessObjects: [
      {
        ...model.businessObjects[0],
        name: "AI任务配置",
      },
      ...model.businessObjects.slice(1),
    ],
  };
  leakedModel.derivation.contentHash = hashBusinessProcessContent(leakedModel);
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: verifiedClaims },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: [] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: leakedModel },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.businessProcess.metrics.defaultDomainLeakCount, 1);
  assert.ok(report.blockers.some((item) => item.id === "business-process.default-domain-leak"));
});

test("whitepaper plan builder creates generic required items and pending boundaries", () => {
  const {
    assertValidWhitepaperPlanArtifact,
    buildWhitepaperPlan,
  } = require("./build-whitepaper-plan");
  const input = whitepaperPlanFixtureInputs();
  const plan = buildWhitepaperPlan({
    ...input,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });

  assert.equal(plan.artifactType, "whitepaper-plan");
  assert.equal(plan.version, 1);
  assert.ok(plan.chapters.some((chapter) => chapter.chapter === 4));
  assert.ok(plan.requiredItems.some((item) => item.claimId === "function:费用申请:费用申请列表"));
  assert.ok(plan.requiredItems.some((item) => item.chapter === 4 && /流程|状态|费用申请/.test(item.text)));
  assert.ok(plan.pendingItems.some((item) => /预算明细表/.test(item.text)));
  assert.equal(
    plan.requiredItems.some((item) => item.claimId === "database:budget_detail"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(plan), /保司|AI任务|元数据|发布上线|运行观测/);
  assertValidWhitepaperPlanArtifact(plan);
});

test("whitepaper plan validator rejects missing hash and forbidden secret-like content", () => {
  const {
    assertValidWhitepaperPlanArtifact,
    buildWhitepaperPlan,
  } = require("./build-whitepaper-plan");
  const plan = buildWhitepaperPlan({
    ...whitepaperPlanFixtureInputs(),
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  assert.throws(
    () => assertValidWhitepaperPlanArtifact({ ...plan, derivation: { ...plan.derivation, contentHash: "" } }),
    /contentHash/,
  );
  assert.throws(
    () => assertValidWhitepaperPlanArtifact({
      ...plan,
      allowedFacts: [
        ...plan.allowedFacts,
        { id: "bad-secret", text: "mysql://user:password@example/db", source: [], evidence: [] },
      ],
    }),
    /forbidden secret|connection-like|URL/i,
  );
});

test("phase3b prompt inlines whitepaper plan as primary writing contract", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildWhitepaperPlan } = require("./build-whitepaper-plan");
  const { buildPhase3bPrompt } = require("./narrative/phase3b");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3b-whitepaper-plan-"));
  const input = whitepaperPlanFixtureInputs();
  const plan = buildWhitepaperPlan({
    ...input,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  fs.writeFileSync(path.join(dir, "whitepaper-plan.json"), JSON.stringify(plan), "utf8");

  const prompt = buildPhase3bPrompt({
    outputPath: path.join(dir, "whitepaper.pending-review.md"),
    evidenceSummary: input.evidenceSummary,
    operationSpec: input.operationSpec,
    businessProcessModel: input.businessProcessModel,
    verifiedClaims: input.verifiedClaims,
    whitepaperPlanPath: path.join(dir, "whitepaper-plan.json"),
    systemCode: "generic-finance",
    systemName: "费用与预算管理系统",
  });

  assert.match(prompt, /whitepaper-plan/);
  assert.match(prompt, /最高优先级|主写作合同|primary writing contract/i);
  assert.match(prompt, /费用申请列表/);
  assert.ok(prompt.indexOf("whitepaper-plan") < prompt.indexOf("business-process-model"));
  assert.doesNotMatch(prompt, /\[claim:database:budget_detail]/);
});

test("fact check reports missing required whitepaper plan items", () => {
  const {
    buildFactCheckReport,
  } = require("./fact-check-whitepaper");
  const { buildWhitepaperPlan } = require("./build-whitepaper-plan");
  const input = whitepaperPlanFixtureInputs();
  const plan = buildWhitepaperPlan({
    ...input,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const report = buildFactCheckReport({
    markdown: [
      "# 费用与预算管理系统白皮书",
      "## 1. 系统定位",
      "系统用于费用管理。",
      "",
    ].join("\n"),
    claimsArtifact: input.verifiedClaims,
    whitepaperPlan: plan,
    minPlanRequiredCoverage: 1,
  });

  assert.equal(report.canFinalize, false);
  assert.ok(report.missingPlanItemIds.length >= 1);
  assert.equal(report.metrics.planRequiredCoverageRatio < 1, true);
  assert.ok(report.failures.some((item) => /Whitepaper plan required item coverage/.test(item)));
});

test("truth readiness blocks missing whitepaper plan for formal review", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const input = whitepaperPlanFixtureInputs();
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: input.verifiedClaims },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:费用申请列表"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: input.operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: input.workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: input.evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: input.businessProcessModel },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.whitepaperPlan.pass, false);
  assert.ok(report.blockers.some((item) => item.id === "whitepaper-plan.spec-missing"));
});

test("truth readiness blocks forged whitepaper plan content", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const { buildWhitepaperPlan } = require("./build-whitepaper-plan");
  const input = whitepaperPlanFixtureInputs();
  const plan = buildWhitepaperPlan({
    ...input,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const forgedPlan = {
    ...plan,
    requiredItems: [
      ...plan.requiredItems,
      {
        id: "plan:forged:auto-approval",
        chapter: 4,
        status: "observed",
        text: "系统已验证自动审批费用申请。",
        terms: ["自动审批费用申请"],
        source: [{ artifact: "manual", pointer: "/" }],
        evidence: [{ kind: "manual", label: "manual", value: "manual" }],
      },
    ],
  };
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: input.verifiedClaims },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:费用申请列表"] }),
    },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: input.operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: input.workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: input.evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: input.businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: forgedPlan },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.whitepaperPlan.pass, false);
  assert.ok(report.blockers.some((item) => item.id === "whitepaper-plan.forged-plan"));
});

test("truth readiness requires real database profile when database evidence is mandatory", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "保单任务",
        entry: "左侧「保单任务」",
        list: { columns: ["保单号"], queryFields: ["保单号"], rowActions: [] },
        flows: [
          {
            name: "新建保单任务",
            trigger: "新增",
            sourcePage: "保单任务",
            status: "partial",
            steps: [{ name: "打开新建表单", action: "点击新增", fields: ["保单号"] }],
            reason: "submit-button-not-found",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const evidenceSummary = evidenceSummaryFixtureForOperation(operationSpec);
  const verifiedClaims = verifiedClaimsFixture([
    {
      id: "function:保单任务:任务列表",
      subject: "任务列表",
      module: "保单任务",
      status: "confirmed",
      writable: true,
    },
  ]);
  const businessProcessModel = businessProcessModelFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
  });
  const whitepaperPlan = whitepaperPlanFixtureForReadiness({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    businessProcessModel,
  });
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaims,
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: businessProcessModel },
    whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlan },
    entityModel: {
      file: "entity-model.json",
      status: "ok",
      value: {
        artifactType: "entity-model",
        version: 1,
        generatedAt: "2026-06-03T00:00:00.000Z",
        source: { artifact: "data-dictionary.json" },
        entities: [
          { entity: "保单任务", table: "adp_test.policy_task", evidence: { sampleRowsIncluded: true } },
          { entity: "保单", table: "adp_test.policy" },
        ],
        relations: [{ from: "adp_test.policy_task", to: "adp_test.policy", type: "foreign-key" }],
        metrics: { entityCount: 2, relationCount: 1, sampleBackedEntityCount: 1 },
        safety: {
          rawSecretsIncluded: false,
          rawSampleRowsIncluded: false,
          databaseOnlyClaimsRequireUiConfirmation: true,
        },
        sourceArtifacts: {
          databaseProfile: { file: "database-profile.json", fingerprint: { exists: false, size: 0, sha256: "" } },
          dataDictionary: { file: "data-dictionary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
        },
      },
    },
    dataDictionary: {
      file: "data-dictionary.json",
      status: "ok",
      value: {
        artifactType: "data-dictionary",
        version: 1,
        generatedAt: "2026-06-03T00:00:00.000Z",
        source: { artifact: "database-profile.json" },
        tables: [
          { table: "adp_test.policy_task", name: "policy_task" },
          { table: "adp_test.policy", name: "policy" },
        ],
        columns: [
          { table: "adp_test.policy_task", name: "id" },
          { table: "adp_test.policy_task", name: "policy_id" },
          { table: "adp_test.policy_task", name: "status" },
          { table: "adp_test.policy_task", name: "created_time" },
          { table: "adp_test.policy", name: "id" },
          { table: "adp_test.policy", name: "policy_no" },
          { table: "adp_test.policy", name: "status" },
          { table: "adp_test.policy", name: "updated_time" },
        ],
        metrics: { tableCount: 2, columnCount: 8 },
        safety: {
          rawSecretsIncluded: false,
          rawSampleRowsIncluded: false,
          sourceMustBeRedactedDatabaseProfile: true,
        },
        sourceArtifacts: {
          databaseProfile: { file: "database-profile.json", fingerprint: { exists: false, size: 0, sha256: "" } },
        },
      },
    },
  };

  const optionalReport = buildTruthReadinessReport({ artifacts, threshold: 95 });
  assert.equal(optionalReport.gates.database.available, true);
  assert.equal(optionalReport.gates.database.profileAvailable, false);
  assert.equal(optionalReport.canSubmitReview, true);

  const requiredReport = buildTruthReadinessReport({
    artifacts,
    threshold: 95,
    requireDatabaseEvidence: true,
    expectedSystem: { code: "adp" },
  });
  assert.equal(requiredReport.gates.database.available, true);
  assert.equal(requiredReport.gates.database.profileAvailable, false);
  assert.equal(requiredReport.gates.database.pass, false);
  assert.equal(requiredReport.canSubmitReview, false);
  assert.ok(requiredReport.blockers.some((item) => item.id === "database.required-profile-missing"));

  const wrongSystemProfileReport = buildTruthReadinessReport({
    artifacts: {
      ...artifacts,
      databaseProfile: {
        file: "database-profile.json",
        status: "ok",
        value: {
          artifactType: "database-profile",
          system: { code: "other" },
          tables: [],
          safety: { secretRedacted: true },
        },
      },
    },
    threshold: 95,
    requireDatabaseEvidence: true,
    expectedSystem: { code: "adp" },
  });
  assert.equal(wrongSystemProfileReport.gates.database.profileArtifactValid, true);
  assert.equal(wrongSystemProfileReport.gates.database.profileAvailable, false);
  assert.equal(wrongSystemProfileReport.canSubmitReview, false);
  assert.match(wrongSystemProfileReport.gates.database.failures.join("\n"), /belongs to other, expected adp/);

  const validProfileReport = buildTruthReadinessReport({
    artifacts: {
      ...artifacts,
      databaseProfile: {
        file: "database-profile.json",
        status: "ok",
        value: {
          artifactType: "database-profile",
          system: { code: "adp" },
          tables: [],
          safety: { secretRedacted: true },
        },
      },
    },
    threshold: 95,
    requireDatabaseEvidence: true,
    expectedSystem: { code: "adp" },
  });
  assert.equal(validProfileReport.gates.database.profileAvailable, true);
  assert.equal(validProfileReport.gates.database.enhancementPass, false);
  assert.equal(validProfileReport.canSubmitReview, false);
  assert.ok(validProfileReport.blockers.some((item) => item.id === "database.enhancement-incomplete"));
});

test("golden eval readiness is optional when no report is configured", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-golden-optional-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const report = runTruthReadinessCheck({ inputDir: dir, threshold: 95 });

  assert.equal(report.gates.goldenEval.pass, true);
  assert.equal(report.gates.goldenEval.required, false);
  assert.equal(report.gates.goldenEval.available, false);
  assert.equal(report.canSubmitReview, true);
});

test("golden eval readiness blocks when required report is missing", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const input = whitepaperPlanFixtureInputs();
  const report = buildTruthReadinessReport({
    threshold: 95,
    requireGoldenEval: true,
    artifacts: {
      quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
      claims: { file: "verified-claims.json", status: "ok", value: input.verifiedClaims },
      factCheck: {
        file: "fact-check-report.json",
        status: "ok",
        value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:费用申请列表"] }),
      },
      narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
      operationSpec: { file: "operation-spec.json", status: "ok", value: input.operationSpec },
      workflowSpec: { file: "workflow-spec.json", status: "ok", value: input.workflowSpec },
      evidenceSummary: { file: "evidence-summary.json", status: "ok", value: input.evidenceSummary },
      businessProcessModel: { file: "business-process-model.json", status: "ok", value: input.businessProcessModel },
      whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlanFixtureForReadiness(input) },
    },
  });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.goldenEval.pass, false);
  assert.equal(report.gates.goldenEval.required, true);
  assert.ok(report.blockers.some((item) => item.id === "golden-eval.report-missing"));
});

test("golden eval readiness blocks stale markdown source fingerprints", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildGoldenEvalSourceArtifacts } = require("./run-golden-eval");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-golden-stale-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const goldenFactsPath = path.join(dir, "adp-golden-facts.json");
  fs.writeFileSync(
    goldenFactsPath,
    JSON.stringify({
      artifactType: "golden-facts",
      version: 1,
      facts: [{ id: "adp:positioning", priority: "P0", match: { all: ["保单任务"] } }],
    }),
    "utf8",
  );
  const markdownPath = path.join(dir, "whitepaper.pending-review.md");
  fs.writeFileSync(
    path.join(dir, "golden-eval-report.json"),
    JSON.stringify(
      goldenEvalReportFixture({
        sourceArtifacts: buildGoldenEvalSourceArtifacts({
          markdownPath,
          goldenFactsPath,
          factCheckPath: path.join(dir, "fact-check-report.json"),
        }),
      }),
    ),
    "utf8",
  );
  fs.appendFileSync(markdownPath, "\n补充导致 golden eval 过期的内容。", "utf8");

  const report = runTruthReadinessCheck({ inputDir: dir, requireGoldenEval: true });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.goldenEval.pass, false);
  assert.ok(report.gates.goldenEval.staleSources.some((item) => item.key === "markdown"));
  assert.ok(report.blockers.some((item) => item.id === "golden-eval.stale-sources"));
});

test("golden eval readiness blocks overclaims", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const input = whitepaperPlanFixtureInputs();
  const report = buildTruthReadinessReport({
    threshold: 95,
    requireGoldenEval: true,
    artifacts: {
      quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
      claims: { file: "verified-claims.json", status: "ok", value: input.verifiedClaims },
      factCheck: {
        file: "fact-check-report.json",
        status: "ok",
        value: factCheckReportFixture({ coveredWritableClaimIds: ["function:费用申请:费用申请列表"] }),
      },
      narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
      operationSpec: { file: "operation-spec.json", status: "ok", value: input.operationSpec },
      workflowSpec: { file: "workflow-spec.json", status: "ok", value: input.workflowSpec },
      evidenceSummary: { file: "evidence-summary.json", status: "ok", value: input.evidenceSummary },
      businessProcessModel: { file: "business-process-model.json", status: "ok", value: input.businessProcessModel },
      whitepaperPlan: { file: "whitepaper-plan.json", status: "ok", value: whitepaperPlanFixtureForReadiness(input) },
      goldenEval: {
        file: "golden-eval-report.json",
        status: "ok",
        value: goldenEvalReportFixture({
          canPass: false,
          metrics: { overclaimCount: 1 },
          overclaims: [{ factId: "adp:boundary", pattern: "HiAgent" }],
          failures: ["Golden Eval overclaims 1 exceeds 0."],
        }),
      },
    },
  });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.goldenEval.pass, false);
  assert.equal(report.gates.goldenEval.metrics.overclaimCount, 1);
  assert.ok(report.blockers.some((item) => item.id === "golden-eval.overclaim"));
});

test("truth readiness requires database evidence to complete the enhancement chain", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-db-enhancement-chain-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  fs.writeFileSync(
    path.join(dir, "database-profile.json"),
    JSON.stringify({
      artifactType: "database-profile",
      system: { code: "adp", name: "AI保单数据闭环平台" },
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
      safety: { secretRedacted: true },
    }),
    "utf8",
  );

  const report = runTruthReadinessCheck({
    inputDir: dir,
    requireDatabaseEvidence: true,
    systemCode: "adp",
  });

  assert.equal(report.gates.database.profileAvailable, true);
  assert.equal(report.gates.database.enhancementPass, false);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.blockers.some((item) => item.id === "database.enhancement-incomplete"));
  assert.ok(
    report.gates.database.enhancementFailures.some((item) =>
      /data-dictionary\.json must be generated/.test(item),
    ),
  );
});

test("truth readiness rejects malformed database-derived truth artifacts", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
    dataDictionary: {
      file: "data-dictionary.json",
      status: "ok",
      value: {
        artifactType: "data-dictionary",
        version: 1,
        generatedAt: "2026-06-03T00:00:00.000Z",
        source: { artifact: "database-profile.json" },
        tables: [],
        columns: [],
        metrics: { tableCount: 0, columnCount: 8 },
        safety: {
          rawSecretsIncluded: false,
          rawSampleRowsIncluded: false,
          sourceMustBeRedactedDatabaseProfile: true,
        },
        sourceArtifacts: {
          databaseProfile: { file: "database-profile.json", fingerprint: { exists: false, size: 0, sha256: "" } },
        },
      },
    },
    entityModel: {
      file: "entity-model.json",
      status: "ok",
      value: {
        artifactType: "entity-model",
        version: 1,
        generatedAt: "2026-06-03T00:00:00.000Z",
        source: { artifact: "data-dictionary.json" },
        entities: [],
        relations: [],
        metrics: { entityCount: 2, relationCount: 0 },
        safety: {
          rawSecretsIncluded: false,
          rawSampleRowsIncluded: false,
          databaseOnlyClaimsRequireUiConfirmation: true,
        },
        sourceArtifacts: {
          databaseProfile: { file: "database-profile.json", fingerprint: { exists: false, size: 0, sha256: "" } },
          dataDictionary: { file: "data-dictionary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
        },
      },
    },
    functionUniverse: {
      file: "function-universe.json",
      status: "ok",
      value: {
        artifactType: "function-universe",
        version: 1,
        generatedAt: "2026-06-03T00:00:00.000Z",
        modules: [],
        functions: [],
        entities: [],
        links: [],
        entityRelations: [],
        coverage: { moduleCount: 0, functionCount: 0, entityCount: 10, linkedFunctionCount: 0, entityRelationCount: 0 },
        rules: { noConclusion: true },
        sourceArtifacts: {
          evidenceSummary: { file: "evidence-summary.json", fingerprint: { exists: false, size: 0, sha256: "" } },
        },
      },
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.database.pass, false);
  assert.equal(report.gates.database.available, false);
  assert.equal(report.gates.database.metrics.columnCount, 0);
  assert.equal(report.gates.database.metrics.entityCount, 0);
  assert.equal(report.gates.database.derivedArtifactContractsPass, false);
  assert.ok(report.blockers.some((item) => item.id === "database.derived-artifact-invalid"));
  assert.ok(
    report.gates.database.contractFailures.some((item) =>
      /metrics\.columnCount must match the artifact body count/.test(item),
    ),
  );
  assert.ok(
    report.gates.database.contractFailures.some((item) =>
      /coverage\.entityCount must match the artifact body count/.test(item),
    ),
  );
});

test("truth readiness rejects invalid database-derived artifact files", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-invalid-db-derived-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  fs.writeFileSync(path.join(dir, "data-dictionary.json"), "{bad json", "utf8");

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.database.pass, false);
  assert.equal(report.gates.database.derivedArtifactContractsPass, false);
  assert.equal(report.gates.database.metrics.dataDictionaryStatus, "invalid");
  assert.ok(report.blockers.some((item) => item.id === "database.derived-artifact-invalid"));
  assert.ok(report.gates.database.failures.some((item) => /data-dictionary\.json is invalid/.test(item)));
});

test("truth readiness config system requires database evidence when database profile is enabled", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-config-db-required-"));
  const outputRoot = path.join(dir, "custom-outputs");
  const systemOutput = path.join(outputRoot, "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  const configPath = path.join(dir, "systems.local.yaml");
  fs.writeFileSync(
    configPath,
    [
      "runtime:",
      "  outputDir: custom-outputs",
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
  writePassingTruthArtifacts(systemOutput, { databaseProfile: false });
  fs.rmSync(path.join(systemOutput, "database-profile.json"), { force: true });

  const report = runTruthReadinessCheck({
    configPath,
    system: "adp",
  });

  assert.equal(report.requirements.databaseEvidenceRequired, true);
  assert.equal(report.gates.database.required, true);
  assert.equal(report.gates.database.profileAvailable, false);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.blockers.some((item) => item.id === "database.required-profile-missing"));
});

test("truth readiness rejects unsafe database profile evidence", () => {
  const { buildTruthReadinessReport, scanDatabaseProfileSafety } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
    databaseProfile: {
      file: "database-profile.json",
      status: "ok",
      value: {
        artifactType: "database-profile",
        system: { code: "adp" },
        source: {
          mode: "connector",
          secret: {
            type: "mysql",
            host: "127.0.0.1",
            password: "[redacted]",
          },
        },
        safety: { secretRedacted: true },
        tables: [
          {
            name: "policy_task",
            sampleRows: [
              { id: 1, customer_phone: "13800138000", status: "DONE" },
              { id: 2, customer_phone: "1***0", status: "DONE" },
              { id: 3, customer_phone: "1***0", status: "DONE" },
              { id: 4, customer_phone: "1***0", status: "DONE" },
            ],
          },
        ],
      },
    },
  };

  const safety = scanDatabaseProfileSafety(artifacts.databaseProfile.value);
  const report = buildTruthReadinessReport({
    artifacts,
    threshold: 95,
    requireDatabaseEvidence: true,
    expectedSystem: { code: "adp" },
  });

  assert.equal(safety.pass, false);
  assert.equal(report.gates.database.pass, false);
  assert.equal(report.gates.database.profileAvailable, false);
  assert.equal(report.gates.database.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.blockers.some((item) => item.id === "database.profile-unsafe"));
  assert.match(report.gates.database.failures.join("\n"), /source\.secret\.host is not redacted/);
  assert.match(report.gates.database.failures.join("\n"), /customer_phone contains an unredacted sensitive value/);
  assert.match(report.gates.database.failures.join("\n"), /includes 4 sample rows/);
});

test("truth readiness blocks missing writable claims and writes report", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-readiness-"));
  writeQualityReportFixture(dir);
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify(
      verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: false,
        },
      ]),
    ),
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

test("truth readiness rejects invalid verified claims artifact contract", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
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
        metrics: { claimCount: 1, writableClaimCount: 1, confirmedCount: 1, inferredCount: 0, weakCount: 0 },
        writableClaimIds: ["function:保单任务:任务列表"],
      },
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.claims.pass, false);
  assert.equal(report.gates.claims.artifactContractValid, false);
  assert.equal(report.gates.claims.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.claims.failures.some((item) => /artifactType/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "claims.invalid-artifact"));
});

test("truth readiness rejects forged verified claims artifact metrics", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture(
        [
          {
            id: "function:保单任务:任务列表",
            subject: "任务列表",
            module: "保单任务",
            status: "confirmed",
            writable: true,
          },
        ],
        { metrics: { claimCount: 2 } },
      ),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.claims.pass, false);
  assert.equal(report.gates.claims.artifactContractValid, false);
  assert.equal(report.gates.claims.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.claims.failures.some((item) => /metrics\.claimCount must match/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "claims.invalid-artifact"));
});

test("truth readiness rejects forged verified claims against current function universe", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildSourceArtifacts: buildClaimSourceArtifacts } = require("./build-verified-claims");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-claims-current-universe-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const functionUniversePath = path.join(dir, "function-universe.json");
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify(verifiedClaimsFixture(
      [
        {
          id: "function:赔付管理:赔付审核台账",
          subject: "赔付审核台账",
          module: "赔付管理",
          function: "赔付审核台账",
          status: "confirmed",
          writable: true,
        },
      ],
      {
        sourceArtifacts: buildClaimSourceArtifacts({ functionUniversePath }),
      },
    )),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.claims.pass, false);
  assert.equal(report.gates.claims.artifactContractValid, false);
  assert.ok(
    report.gates.claims.failures.some((item) =>
      /deterministic verified-claims recomputation from current function-universe\.json/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "claims.invalid-artifact"));
});

test("truth readiness rejects invalid quality report artifact contract", () => {
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
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.evidence.pass, false);
  assert.equal(report.gates.evidence.artifactContractValid, false);
  assert.equal(report.gates.evidence.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.evidence.failures.some((item) => /artifactType/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "evidence.invalid-artifact"));
});

test("truth readiness rejects forged quality reports against current evidence", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildQualitySourceArtifacts } = require("./check-quality");
  const { buildBusinessProcessModelFromDir } = require("./build-business-process-model");
  const { buildWhitepaperPlanFromDir } = require("./build-whitepaper-plan");
  const { runNarrativeCheck } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-quality-current-evidence-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const evidencePath = path.join(dir, "evidence.json");
  const evidenceSummaryPath = path.join(dir, "evidence-summary.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify({
      menuMap: [{ title: "保单任务", menuPath: "保单任务 > 任务列表", url: "/task", status: "observed" }],
      pageInventory: [],
      actionInventory: [],
      blockedItems: [],
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify(qualityReportFixture({
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath,
        evidenceSummaryPath,
        operationSpecPath: path.join(dir, "operation-spec.json"),
        operationGuideGatePath: path.join(dir, "operation-guide-gate.json"),
      }),
    })),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.evidence.pass, false);
  assert.equal(report.gates.evidence.artifactContractValid, false);
  assert.ok(
    report.gates.evidence.failures.some((item) =>
      /deterministic quality recomputation from current evidence\/evidence-summary\/operation-spec inputs/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "evidence.invalid-artifact"));
});

test("truth readiness rejects forged operation spec evidence artifacts", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const forgedSpec = operationSpecFixture({ metrics: { flowCount: 5 } });
  const artifacts = {
    quality: { status: "ok", file: "quality-report.json", value: qualityReportFixture() },
    operationSpec: { status: "ok", file: "operation-spec.json", value: forgedSpec, fingerprint: { exists: true, size: 1, sha256: "spec" } },
    operationGuideGate: { status: "missing", file: "operation-guide-gate.json", value: null, fingerprint: { exists: false } },
    claims: {
      status: "ok",
      file: "verified-claims.json",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      status: "ok",
      file: "fact-check-report.json",
      value: factCheckReportFixture(),
    },
    narrative: {
      status: "ok",
      file: "narrative-quality-report.json",
      value: narrativeQualityReportFixture(),
    },
    databaseProfile: { status: "missing", file: "database-profile.json", value: null },
    dataDictionary: { status: "missing", file: "data-dictionary.json", value: null },
    entityModel: { status: "missing", file: "entity-model.json", value: null },
    functionUniverse: { status: "missing", file: "function-universe.json", value: null },
    evidenceSummary: { status: "missing", file: "evidence-summary.json", value: null },
    pendingReview: { status: "ok", file: "whitepaper.pending-review.md", value: null },
  };
  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });
  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.evidence.artifactContractValid, false);
  assert.ok(report.gates.evidence.failures.some((item) => /operation-spec\.json metrics\.flowCount/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "evidence.invalid-artifact"));
});

test("truth readiness rejects forged operation spec against current evidence", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildQualitySourceArtifacts } = require("./check-quality");
  const { runFactCheck } = require("./fact-check-whitepaper");
  const { runNarrativeCheck } = require("./check-narrative");
  const { buildBusinessProcessModelFromDir } = require("./build-business-process-model");
  const { buildWhitepaperPlanFromDir } = require("./build-whitepaper-plan");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-operation-spec-current-evidence-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const evidencePath = path.join(dir, "evidence.json");
  const evidenceSummaryPath = path.join(dir, "evidence-summary.json");
  const operationSpecPath = path.join(dir, "operation-spec.json");
  const operationGuideGatePath = path.join(dir, "operation-guide-gate.json");
  writeOperationSpecFixture(dir);
  buildBusinessProcessModelFromDir(dir, { generatedAt: "2026-06-03T00:00:40.000Z" });
  buildWhitepaperPlanFromDir(dir, { generatedAt: "2026-06-03T00:00:45.000Z" });
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify(qualityReportFixture({
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath,
        evidenceSummaryPath,
        operationSpecPath,
        operationGuideGatePath,
      }),
    })),
    "utf8",
  );
  const passing = runTruthReadinessCheck({ inputDir: dir });
  assert.equal(passing.canSubmitReview, true);
  assert.equal(passing.gates.lineage.pass, true);

  const forged = JSON.parse(fs.readFileSync(operationSpecPath, "utf8"));
  forged.modules[0].list.columns.push("伪造赔付审核字段");
  fs.writeFileSync(operationSpecPath, JSON.stringify(forged), "utf8");
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify(qualityReportFixture({
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath,
        evidenceSummaryPath,
        operationSpecPath,
        operationGuideGatePath,
      }),
    })),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.evidence.pass, true);
  assert.equal(report.gates.lineage.pass, false);
  assert.ok(
    report.gates.lineage.failures.some((item) =>
      /operation-spec\.json must match deterministic operation-spec recomputation from current evidence\/evidence-summary\/write-validation\/network inputs/.test(item),
    ),
  );
  const blocker = report.blockers.find((item) => item.id === "truth.lineage-stale");
  assert.ok(blocker);
  assert.ok(blocker.rerunNodes.includes("build-spec"));
  assert.ok(blocker.rerunNodes.includes("compose-guide"));
});

test("truth readiness rejects forged operation guide gate against current spec", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildQualitySourceArtifacts } = require("./check-quality");
  const {
    buildOperationSpec,
    buildOperationSpecSourceArtifacts,
    fingerprintFile,
  } = require("./operation-spec/lib");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-operation-guide-gate-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  const evidencePath = path.join(dir, "evidence.json");
  const operationSpecPath = path.join(dir, "operation-spec.json");
  const operationGuideGatePath = path.join(dir, "operation-guide-gate.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const { spec } = buildOperationSpec({
    evidence,
    system: { code: "adp", name: "AI保单数据闭环平台" },
    sourceArtifacts: buildOperationSpecSourceArtifacts({ evidencePath }),
  });
  fs.writeFileSync(operationSpecPath, JSON.stringify(spec), "utf8");
  const forgedGate = {
    artifactType: "operation-guide-gate",
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    canComposeGuide: true,
    readinessPercent: 100,
    failures: [],
    checks: [
      { id: "business-modules", pass: true, actual: 1, expected: 1 },
      { id: "module-surface", pass: true, actual: 1, expected: 1 },
      { id: "spec-size", pass: true, actual: 1, expected: 51200 },
    ],
    counts: {
      modules: spec.metrics.moduleCount,
      modulesWithSurface: spec.metrics.moduleCount,
      specBytes: 1,
    },
    sourceArtifacts: {
      operationSpec: {
        file: "operation-spec.json",
        status: "ok",
        fingerprint: fingerprintFile(operationSpecPath),
      },
    },
  };
  fs.writeFileSync(operationGuideGatePath, JSON.stringify(forgedGate), "utf8");
  fs.writeFileSync(
    path.join(dir, "quality-report.json"),
    JSON.stringify(qualityReportFixture({
      sourceArtifacts: buildQualitySourceArtifacts({
        evidencePath,
        operationSpecPath,
        operationGuideGatePath,
      }),
    })),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.evidence.pass, true);
  assert.equal(report.gates.lineage.pass, false);
  assert.ok(
    report.gates.lineage.failures.some((item) =>
      /operation-guide-gate\.json must match deterministic operation-guide gate recomputation from current operation-spec\.json/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "truth.lineage-stale"));
});

test("truth readiness rejects invalid fact-check report artifact contract", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
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
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.factCheck.pass, false);
  assert.equal(report.gates.factCheck.artifactContractValid, false);
  assert.equal(report.gates.factCheck.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.factCheck.failures.some((item) => /artifactType/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "fact-check.invalid-artifact"));
});

test("truth readiness rejects forged fact-check coverage metrics", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
        {
          id: "function:保单任务:任务详情",
          subject: "任务详情",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({
        canFinalize: true,
        missingWritableClaimIds: ["function:保单任务:任务详情"],
        metrics: {
          claimCount: 2,
          writableClaimCount: 2,
          checkedAssertions: 1,
          supportedAssertions: 1,
          supportedRatio: 1,
          coveredWritableClaimCount: 1,
          missingWritableClaimCount: 1,
          writableClaimCoverageRatio: 1,
          minWritableClaimCoverage: 0.8,
        },
      }),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.factCheck.pass, false);
  assert.equal(report.gates.factCheck.artifactContractValid, false);
  assert.equal(report.gates.factCheck.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.factCheck.failures.some((item) => /writableClaimCoverageRatio must match/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "fact-check.invalid-artifact"));
});

test("truth readiness rejects fact-check reports not matching current verified claims", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
        {
          id: "function:保单任务:任务详情",
          subject: "任务详情",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({
        canFinalize: true,
        coveredWritableClaimIds: ["function:保单任务:任务列表"],
        missingWritableClaimIds: [],
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
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.factCheck.pass, false);
  assert.equal(report.gates.factCheck.artifactContractValid, false);
  assert.equal(report.gates.factCheck.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.factCheck.failures.some((item) => /current verified-claims\.json/.test(item)));
  assert.ok(report.gates.factCheck.failures.some((item) => /metrics\.missingWritableClaimCount must match/.test(item)));
  assert.ok(report.gates.factCheck.failures.some((item) => /missingWritableClaimIds must match/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "fact-check.invalid-artifact"));
});

test("truth readiness rejects forged fact-check reports against current markdown", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildFactCheckSourceArtifacts } = require("./fact-check-whitepaper");
  const { buildNarrativeSourceArtifacts } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-fact-current-md-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify(verifiedClaimsFixture([
      {
        id: "function:赔付管理:赔付审核台账",
        subject: "赔付审核台账",
        module: "赔付管理",
        function: "赔付审核台账",
        status: "confirmed",
        writable: true,
      },
    ])),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "whitepaper.pending-review.md"),
    "# AI保单数据闭环平台功能白皮书\n\n本文只描述系统总体定位。",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "fact-check-report.json"),
    JSON.stringify(factCheckReportFixture({
      coveredWritableClaimIds: ["function:赔付管理:赔付审核台账"],
      missingWritableClaimIds: [],
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
      sourceArtifacts: buildFactCheckSourceArtifacts({
        markdownPath: path.join(dir, "whitepaper.pending-review.md"),
        claimsPath: path.join(dir, "verified-claims.json"),
      }),
    })),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-quality-report.json"),
    JSON.stringify(narrativeQualityReportFixture({
      sourceArtifacts: buildNarrativeSourceArtifacts({
        markdownPath: path.join(dir, "whitepaper.pending-review.md"),
        evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
        operationSpecPath: path.join(dir, "operation-spec.json"),
        businessProcessModelPath: path.join(dir, "business-process-model.json"),
      }),
    })),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.factCheck.pass, false);
  assert.equal(report.gates.factCheck.artifactContractValid, false);
  assert.ok(
    report.gates.factCheck.failures.some((item) =>
      /deterministic fact-check recomputation from current whitepaper\.pending-review\.md/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "fact-check.invalid-artifact"));
});

test("truth readiness rejects invalid narrative quality report artifact contract", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: { canSubmitReview: true, failures: [], counts: { chars: 2000, evidencePages: 1 } },
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.narrative.pass, false);
  assert.equal(report.gates.narrative.artifactContractValid, false);
  assert.equal(report.gates.narrative.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.narrative.failures.some((item) => /artifactType/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "narrative.invalid-artifact"));
});

test("truth readiness rejects forged narrative quality pass state", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture({
        canSubmitReview: true,
        failures: ["正文仍缺少业务流程。"],
        counts: { chars: 0, evidencePages: 1 },
      }),
    },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.narrative.pass, false);
  assert.equal(report.gates.narrative.artifactContractValid, false);
  assert.equal(report.gates.narrative.scorePercent, 0);
  assert.equal(report.canSubmitReview, false);
  assert.ok(report.gates.narrative.failures.some((item) => /zero failures/.test(item)));
  assert.ok(report.blockers.some((item) => item.id === "narrative.invalid-artifact"));
});

test("truth readiness rejects forged narrative reports against current markdown", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildFactCheckSourceArtifacts, runFactCheck } = require("./fact-check-whitepaper");
  const { buildNarrativeSourceArtifacts } = require("./check-narrative");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-forged-narrative-current-md-"));
  writePassingTruthArtifacts(dir, { databaseProfile: false });
  runFactCheck({ inputDir: dir });
  fs.writeFileSync(
    path.join(dir, "fact-check-report.json"),
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(path.join(dir, "fact-check-report.json"), "utf8")),
      sourceArtifacts: buildFactCheckSourceArtifacts({
        markdownPath: path.join(dir, "whitepaper.pending-review.md"),
        claimsPath: path.join(dir, "verified-claims.json"),
        whitepaperPlanPath: path.join(dir, "whitepaper-plan.json"),
      }),
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "narrative-quality-report.json"),
    JSON.stringify(narrativeQualityReportFixture({
      canSubmitReview: true,
      failures: [],
      counts: { chars: 1, evidencePages: 999 },
      sourceArtifacts: buildNarrativeSourceArtifacts({
        markdownPath: path.join(dir, "whitepaper.pending-review.md"),
        evidenceSummaryPath: path.join(dir, "evidence-summary.json"),
        operationSpecPath: path.join(dir, "operation-spec.json"),
        businessProcessModelPath: path.join(dir, "business-process-model.json"),
        whitepaperPlanPath: path.join(dir, "whitepaper-plan.json"),
      }),
    })),
    "utf8",
  );

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.narrative.pass, false);
  assert.equal(report.gates.narrative.artifactContractValid, false);
  assert.ok(
    report.gates.narrative.failures.some((item) =>
      /deterministic narrative quality recomputation from current whitepaper\.pending-review\.md/.test(item),
    ),
  );
  assert.ok(report.blockers.some((item) => item.id === "narrative.invalid-artifact"));
});

test("truth readiness report artifact contract rejects forged pass state", () => {
  const { assertValidTruthReadinessReportArtifact } = require("./check-truth-readiness");
  const validReport = truthReadinessReportFixture(__dirname);
  assert.doesNotThrow(() => assertValidTruthReadinessReportArtifact(validReport));

  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        blockers: [{ id: "truth.score-below-threshold" }],
      }),
    /zero blockers/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        score: 0.94,
        scorePercent: 94,
      }),
    /score >= threshold/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        gates: {
          ...validReport.gates,
          factCheck: { ...validReport.gates.factCheck, pass: false },
        },
      }),
    /gates\.factCheck\.pass=true/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        gates: {
          ...validReport.gates,
          workflow: undefined,
        },
      }),
    /gates\.workflow must be a JSON object/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        canSubmitReview: false,
        canFinalize: true,
      }),
    /canFinalize=true requires canSubmitReview=true/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        scorePercent: 100,
      }),
    /scorePercent must match score/,
  );
  assert.throws(
    () =>
      assertValidTruthReadinessReportArtifact({
        ...validReport,
        requirements: { databaseEvidenceRequired: true },
        gates: {
          ...validReport.gates,
          database: {
            ...validReport.gates.database,
            required: true,
            profileAvailable: false,
          },
        },
      }),
    /requires profileAvailable database evidence/,
  );
});

test("truth readiness blocks incomplete verified claim boundary rules", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const artifacts = {
    quality: {
      file: "quality-report.json",
      status: "ok",
      value: qualityReportFixture(),
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
      value: factCheckReportFixture(),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
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
      value: qualityReportFixture(),
    },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:保单任务:任务列表",
          subject: "任务列表",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
        {
          id: "function:保单任务:任务详情",
          subject: "任务详情",
          module: "保单任务",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: {
      file: "fact-check-report.json",
      status: "ok",
      value: factCheckReportFixture({
        canFinalize: false,
        failures: ["Writable claim coverage is below the required threshold."],
        coveredWritableClaimIds: ["function:保单任务:任务列表"],
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
      }),
    },
    narrative: {
      file: "narrative-quality-report.json",
      status: "ok",
      value: narrativeQualityReportFixture(),
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

test("golden eval scores covered partial missing and overclaim facts", () => {
  const { buildGoldenEvalReport } = require("./run-golden-eval");
  const goldenFacts = {
    artifactType: "golden-facts",
    version: 1,
    systemCode: "adp",
    facts: [
      {
        id: "adp:positioning:insurer-data-loop",
        category: "positioning",
        priority: "P0",
        statement: "平台面向保司数据对接闭环。",
        match: {
          all: ["保司", "数据", "闭环"],
        },
      },
      {
        id: "adp:workflow:main-loop",
        category: "workflow",
        priority: "P0",
        statement: "主流程覆盖定义参数、需求输出、用例执行、验收确认、发布开启、定时拉保司数据、写核心、数据监控。",
        match: {
          groups: [
            ["定义参数"],
            ["需求输出"],
            ["用例执行"],
            ["验收确认"],
            ["发布开启"],
            ["定时拉保司数据", "拉取保司数据"],
            ["写核心"],
            ["数据监控"],
          ],
        },
      },
      {
        id: "adp:boundary:hiagent",
        category: "boundary",
        priority: "P1",
        statement: "HiAgent 负责需求和测试类生成，不直接调保司或写核心。",
        match: {
          all: ["HiAgent"],
          groups: [
            ["需求生成", "需求类生成"],
            ["测试生成", "测试类生成"],
            ["不直接调保司", "不负责调保司"],
            ["不直接写核心", "不负责写核心"],
          ],
        },
        forbiddenClaims: [
          {
            pattern: "HiAgent.{0,16}(直接)?(调用|调).{0,8}保司",
            message: "HiAgent 不应被描述为直接调用保司。",
          },
        ],
      },
    ],
  };
  const markdown = [
    "# AI保单数据闭环平台功能白皮书",
    "平台用于保司数据对接闭环。",
    "主流程为：定义参数 -> 需求输出 -> 用例执行 -> 验收确认。",
    "文档错误地声称 HiAgent 直接调用保司完成数据拉取。",
  ].join("\n");

  const report = buildGoldenEvalReport({
    goldenFacts,
    markdown,
    generatedAt: "2026-06-06T00:00:00.000Z",
    minCoverageRatio: 0.95,
  });

  assert.equal(report.artifactType, "golden-eval-report");
  assert.equal(report.canPass, false);
  assert.equal(report.metrics.factCount, 3);
  assert.equal(report.metrics.coveredCount, 1);
  assert.equal(report.metrics.partialCount, 1);
  assert.equal(report.metrics.missingCount, 0);
  assert.equal(report.metrics.overclaimCount, 1);
  assert.equal(report.results.find((item) => item.id === "adp:positioning:insurer-data-loop").status, "covered");
  assert.equal(report.results.find((item) => item.id === "adp:workflow:main-loop").status, "partial");
  assert.equal(report.results.find((item) => item.id === "adp:boundary:hiagent").status, "overclaim");
  assert.match(report.failures.join("\n"), /Golden Eval coverage/);
  assert.match(report.overclaims[0].message, /HiAgent/);
});

test("golden eval writes report with source fingerprints", () => {
  const { runGoldenEval } = require("./run-golden-eval");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-eval-"));
  const goldenFactsPath = path.join(dir, "adp-golden-facts.json");
  const markdownPath = path.join(dir, "whitepaper.pending-review.md");
  const outputPath = path.join(dir, "golden-eval-report.json");
  fs.writeFileSync(
    goldenFactsPath,
    JSON.stringify({
      artifactType: "golden-facts",
      version: 1,
      systemCode: "adp",
      facts: [
        {
          id: "adp:value:shorten-implementation",
          category: "value",
          priority: "P0",
          statement: "平台将保司接入周期从约 4 天缩短到约半天。",
          match: {
            all: ["4天", "半天"],
            groups: [["缩短", "提效"]],
          },
        },
      ],
    }),
    "utf8",
  );
  fs.writeFileSync(markdownPath, "平台把保司接入周期从约4天缩短到约半天，形成明显提效。", "utf8");

  const report = runGoldenEval({
    inputDir: dir,
    goldenFactsPath,
    markdownPath,
    outputPath,
    generatedAt: "2026-06-06T00:00:00.000Z",
    minCoverageRatio: 0.95,
  });

  assert.equal(report.canPass, true);
  assert.equal(report.metrics.coverageRatio, 1);
  assert.equal(fs.existsSync(outputPath), true);
  const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(written.sourceArtifacts.markdown.file, "whitepaper.pending-review.md");
  assert.equal(written.sourceArtifacts.goldenFacts.file, "adp-golden-facts.json");
  assert.match(written.sourceArtifacts.markdown.fingerprint.sha256, /^[a-f0-9]{64}$/);
});

test("golden eval treats vague noun mentions as partial not covered", () => {
  const { buildGoldenEvalReport } = require("./run-golden-eval");
  const report = buildGoldenEvalReport({
    goldenFacts: {
      artifactType: "golden-facts",
      version: 1,
      systemCode: "adp",
      facts: [
        {
          id: "adp:module:release",
          category: "module_responsibility",
          priority: "P0",
          statement: "AI发布管理需要关联验收确认后的发布开启。",
          match: {
            all: ["AI发布管理"],
            groups: [
              ["验收确认"],
              ["发布开启"],
            ],
          },
        },
      ],
    },
    markdown: "系统包含 AI发布管理、AI任务管理、数据监控等模块。",
    minCoverageRatio: 0.95,
    minCriticalCoverageRatio: 0.8,
  });

  assert.equal(report.results[0].status, "partial");
  assert.equal(report.metrics.coveredCount, 0);
  assert.equal(report.metrics.partialCount, 1);
  assert.equal(report.canPass, false);
  assert.match(report.results[0].missingTerms.join(" "), /验收确认/);
});

test("golden eval demotes fully matched facts when forbidden claim is present", () => {
  const { buildGoldenEvalReport } = require("./run-golden-eval");
  const report = buildGoldenEvalReport({
    goldenFacts: {
      artifactType: "golden-facts",
      version: 1,
      facts: [
        {
          id: "adp:boundary:hiagent-covered-overclaim",
          category: "external_boundary",
          priority: "P0",
          statement: "HiAgent 负责需求和测试类生成，不直接调保司或写核心。",
          match: {
            all: ["HiAgent"],
            groups: [["需求生成"], ["测试生成"], ["不直接调保司"], ["不直接写核心"]],
          },
          forbiddenClaims: [
            {
              pattern: "HiAgent.{0,16}(执行|负责).{0,8}(保司调用|核心写入)",
              message: "HiAgent 不应被写成执行保司调用或核心写入。",
            },
          ],
        },
      ],
    },
    markdown: "HiAgent 负责需求生成、测试生成，不直接调保司、不直接写核心；同时错误写成 HiAgent 负责保司调用。",
    minCoverageRatio: 0.1,
    minCriticalCoverageRatio: 0.1,
    maxOverclaims: 0,
  });

  assert.equal(report.results[0].status, "overclaim");
  assert.equal(report.metrics.coveredCount, 0);
  assert.equal(report.metrics.overclaimCount, 1);
  assert.equal(report.canPass, false);
});

test("golden eval does not cover facts from scattered document-level terms", () => {
  const { buildGoldenEvalReport } = require("./run-golden-eval");
  const report = buildGoldenEvalReport({
    goldenFacts: {
      artifactType: "golden-facts",
      version: 1,
      facts: [
        {
          id: "adp:workflow:write-core",
          category: "workflow",
          priority: "P0",
          statement: "平台拉取保司数据后写入核心系统。",
          match: {
            groups: [["平台"], ["保司数据"], ["写核心", "写入核心", "核心系统"]],
          },
        },
      ],
    },
    markdown: ["平台提供任务管理。", "页面展示保司数据字段。", "另一个章节提到核心系统边界。"].join("\n"),
    minCoverageRatio: 0.95,
    minCriticalCoverageRatio: 0.8,
  });

  assert.equal(report.results[0].status, "partial");
  assert.equal(report.metrics.coveredCount, 0);
  assert.match(report.results[0].missingTerms.join(" "), /同一证据窗口/);
});

test("golden eval forbidden claims match whitespace variants", () => {
  const { buildGoldenEvalReport } = require("./run-golden-eval");
  const report = buildGoldenEvalReport({
    goldenFacts: {
      artifactType: "golden-facts",
      version: 1,
      facts: [
        {
          id: "adp:value:no-fixed-sla",
          category: "business_value",
          priority: "P0",
          statement: "ADP 接入效率不能被写成固定 SLA。",
          match: {
            groups: [["接入效率"]],
          },
          forbiddenClaims: [
            {
              pattern: "固定SLA",
              message: "不能写成固定 SLA。",
            },
          ],
        },
      ],
    },
    markdown: "文档声称接入效率具备固定 SLA。",
    minCoverageRatio: 0.1,
    minCriticalCoverageRatio: 0.1,
  });

  assert.equal(report.results[0].status, "overclaim");
  assert.equal(report.metrics.overclaimCount, 1);
  assert.match(report.overclaims[0].message, /固定 SLA/);
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
    "scripts/approval-guard.js",
    "scripts/build-database-model.js",
    "scripts/build-function-universe.js",
    "scripts/build-workflow-spec.js",
    "scripts/build-verified-claims.js",
    "scripts/check-agent-isolation.js",
    "scripts/quality-gate-auto.js",
    "scripts/check-batch-acceptance.js",
    "scripts/check-delivery-readiness.js",
    "scripts/check-real-run-readiness.js",
    "scripts/check-truth-readiness.js",
    "scripts/fact-check-whitepaper.js",
    "scripts/system-whitepaper-lib.js",
    "scripts/collect-database-profile.js",
    "scripts/doctor.js",
    "scripts/init-local-config.js",
    "scripts/prepare-agent-worktrees.js",
    "scripts/run-whitepaper-batch.js",
    "scripts/run-whitepaper-pipeline.js",
    "scripts/run-phase3b.js",
    "scripts/repair-artifacts.js",
    "scripts/run-batch-repair-queue.js",
    "scripts/run-repair-follow-up-loop.js",
    "scripts/run-golden-eval.js",
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

test("package manifest covers script entrypoints and excludes private assets", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const repoRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const files = new Set(packageJson.files || []);

  for (const requiredPath of [
    "SKILL.md",
    "agents/",
    "docs/narrative-guide.md",
    "scripts/build-business-process-model.js",
    "scripts/build-whitepaper-plan.js",
    "scripts/business-process/",
    "scripts/build-database-model.js",
    "scripts/build-function-universe.js",
    "scripts/build-workflow-spec.js",
    "scripts/build-verified-claims.js",
    "scripts/check-agent-isolation.js",
    "scripts/quality-gate-auto.js",
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
    "scripts/repair-artifacts.js",
    "scripts/run-batch-repair-queue.js",
    "scripts/run-repair-follow-up-loop.js",
    "scripts/run-golden-eval.js",
    "scripts/run-local-e2e-smoke.js",
    "scripts/system-whitepaper.test.js",
    "scripts/local-dashboard/",
  ]) {
    assert.ok(files.has(requiredPath), `${requiredPath} must remain in package.json files`);
  }

  const packageScriptEntrypoints = Object.values(packageJson.scripts || {})
    .flatMap((command) =>
      [...String(command).matchAll(/(?:^|\s)node\s+(scripts\/[^\s]+)/g)].map((match) =>
        match[1].replace(/\\/g, "/"),
      ),
    );
  for (const scriptPath of packageScriptEntrypoints) {
    const packaged = files.has(scriptPath) || [...files].some((entry) => entry.endsWith("/") && scriptPath.startsWith(entry));
    assert.ok(packaged, `${scriptPath} is referenced by package.json scripts`);
  }

  for (const forbiddenPath of [
    "node_modules/",
    "secrets/",
    "outputs/",
    "config/",
    ".npm-cache/",
    ".tmp/",
    "docs/",
    "scripts/",
    "docs/CODEX-INTEGRATION.md",
    "docs/CURSOR-TOKEN-OPTIMIZATION.md",
    "docs/OPERATION-GUIDE-OPTIMIZATION-PLAN.md",
    "docs/PILOT-ROADMAP.md",
    "docs/UNATTENDED-PIPELINE-ROADMAP.md",
    "docs/SCRIPTS-DEVELOPER-NOTES.md",
    "scripts/README.md",
  ]) {
    assert.equal(files.has(forbiddenPath), false, `${forbiddenPath} should not be listed in package.json files`);
  }
});

test("packaged entrypoints load from the source checkout", () => {
  for (const relativePath of [
    "./build-business-process-model",
    "./build-whitepaper-plan",
    "./build-database-model",
    "./build-function-universe",
    "./build-workflow-spec",
    "./build-verified-claims",
    "./check-agent-isolation",
    "./check-batch-acceptance",
    "./check-delivery-readiness",
    "./check-real-run-readiness",
    "./check-truth-readiness",
    "./fact-check-whitepaper",
    "./system-whitepaper-lib",
    "./collect-database-profile",
    "./doctor",
    "./init-local-config",
    "./sync-systems-registry",
    "./run-phase3b",
    "./run-golden-eval",
    "./run-whitepaper-batch",
    "./run-whitepaper-pipeline",
    "./local-dashboard/server",
  ]) {
    assert.doesNotThrow(() => require(relativePath), `${relativePath} should load`);
  }
});
