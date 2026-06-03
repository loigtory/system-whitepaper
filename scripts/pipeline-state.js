const fs = require("node:fs");
const path = require("node:path");

const PHASES = [
  { id: "prepare", label: "准备" },
  { id: "evidence", label: "取证" },
  { id: "truth", label: "真相" },
  { id: "compose", label: "成稿" },
  { id: "approve", label: "审定" },
];

const NODES = [
  { id: "sync", phase: "prepare", label: "同步" },
  { id: "session", phase: "prepare", label: "登录" },
  { id: "collect", phase: "evidence", label: "页面" },
  { id: "inspect", phase: "evidence", label: "弹窗" },
  { id: "validate-write", phase: "evidence", label: "试业务操作" },
  { id: "db-profile", phase: "truth", label: "库表画像" },
  { id: "truth-universe", phase: "truth", label: "功能宇宙" },
  { id: "truth-claims", phase: "truth", label: "可信断言" },
  { id: "build-spec", phase: "compose", label: "整理规格" },
  { id: "compose-guide", phase: "compose", label: "操作指引" },
  { id: "draft", phase: "compose", label: "底稿" },
  { id: "summary", phase: "compose", label: "摘要" },
  { id: "narrative", phase: "compose", label: "写稿" },
  { id: "fact-check", phase: "compose", label: "事实核验" },
  { id: "quality", phase: "compose", label: "质检" },
  { id: "review", phase: "approve", label: "审阅" },
];

function nowIso() {
  return new Date().toISOString();
}

function createPipelineState(system = {}) {
  const phases = {};
  for (const phase of PHASES) {
    phases[phase.id] = {
      label: phase.label,
      status: "pending",
    };
  }

  const nodes = {};
  for (const node of NODES) {
    nodes[node.id] = {
      phase: node.phase,
      label: node.label,
      status: "pending",
      attempts: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  return recomputePipelineState({
    code: system.code || "",
    name: system.name || "",
    overallStatus: "pending",
    currentPhase: "prepare",
    currentNode: "sync",
    phases,
    nodes,
    review: {
      status: "pending",
      comment: "",
      decision: null,
    },
    artifacts: {
      draft: "whitepaper.draft.md",
      evidenceSummary: "evidence-summary.json",
      databaseProfile: "database-profile.json",
      functionUniverse: "function-universe.json",
      verifiedClaims: "verified-claims.json",
      factCheck: "fact-check-report.json",
      pendingReview: "whitepaper.pending-review.md",
      final: "whitepaper.final.md",
      docx: "",
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function phaseNodeIds(phaseId) {
  return NODES.filter((node) => node.phase === phaseId).map((node) => node.id);
}

function recomputePipelineState(state) {
  const next = clone(state);

  for (const phase of PHASES) {
    const statuses = phaseNodeIds(phase.id).map((nodeId) => next.nodes[nodeId].status);
    if (statuses.every((status) => status === "success" || status === "skipped")) {
      next.phases[phase.id].status = "success";
    } else if (statuses.some((status) => status === "failed" || status === "paused")) {
      next.phases[phase.id].status = "failed";
    } else if (statuses.some((status) => status === "running")) {
      next.phases[phase.id].status = "running";
    } else {
      next.phases[phase.id].status = "pending";
    }
  }

  const failedNode = NODES.find((node) =>
    ["failed", "paused"].includes(next.nodes[node.id].status),
  );
  const runningNode = NODES.find((node) => next.nodes[node.id].status === "running");
  const nextPendingNode = NODES.find((node) => next.nodes[node.id].status === "pending");

  const current = failedNode || runningNode || nextPendingNode || NODES[NODES.length - 1];
  next.currentNode = current.id;
  next.currentPhase = current.phase;

  if (failedNode) {
    next.overallStatus = next.nodes[failedNode.id].status === "paused" ? "paused" : "failed";
  } else if (runningNode) {
    next.overallStatus = "running";
  } else if (nextPendingNode) {
    const pendingBeforeReview = NODES.some(
      (node) => node.id !== "review" && next.nodes[node.id].status === "pending",
    );
    next.overallStatus =
      nextPendingNode.id === "review" && !pendingBeforeReview ? "review-pending" : "pending";
  } else {
    next.overallStatus = next.review.status === "approved" ? "finalized" : "review-pending";
  }

  if (next.overallStatus === "finalized") {
    next.currentPhase = "completed";
    next.currentNode = "end";
  }

  next.updatedAt = nowIso();
  return next;
}

function stopRunningPipelineState(state, message = "用户手动停止") {
  let next = clone(state);
  let changed = false;
  for (const node of NODES) {
    if (next.nodes?.[node.id]?.status === "running") {
      next = updateNodeStatus(next, node.id, "paused", { lastError: message });
      changed = true;
    }
  }
  if (next.overallStatus === "running") {
    next.overallStatus = "paused";
    next.updatedAt = nowIso();
    changed = true;
  }
  return { state: changed ? recomputePipelineState(next) : next, changed };
}

function resetSystemPipelineState(system, systemOutput) {
  const statePath = path.join(systemOutput, "pipeline-state.json");
  const fresh = createPipelineState(system);
  writePipelineState(statePath, fresh);
  return { statePath, state: fresh };
}

function updateNodeStatus(state, nodeId, status, details = {}) {
  if (!state.nodes[nodeId]) {
    throw new Error(`Unknown pipeline node: ${nodeId}`);
  }

  const next = clone(state);
  const node = next.nodes[nodeId];
  node.status = status;

  if (status === "running") {
    node.startedAt = nowIso();
  }

  if (status === "failed") {
    node.attempts += 1;
    node.lastError = details.lastError || details.error || null;
    node.finishedAt = nowIso();
  }

  if (status === "success" || status === "skipped" || status === "paused") {
    node.lastError = details.lastError || null;
    node.finishedAt = nowIso();
  }

  if (details.loginMode) node.loginMode = details.loginMode;
  if (details.durationMs !== undefined) node.durationMs = details.durationMs;

  return recomputePipelineState(next);
}

async function runNodeWithRetry(state, nodeId, operation, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 3);
  const onStateChange =
    typeof options.onStateChange === "function" ? options.onStateChange : () => {};
  let next = state;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    next = updateNodeStatus(next, nodeId, "running");
    onStateChange(next);
    try {
      const value = await operation(attempt);
      next = updateNodeStatus(next, nodeId, "success");
      onStateChange(next);
      return { state: next, result: value };
    } catch (error) {
      lastError = error;
      next = updateNodeStatus(next, nodeId, "failed", {
        lastError: error && error.message ? error.message : String(error),
      });
      onStateChange(next);
      if (attempt < maxAttempts) {
        next.nodes[nodeId].status = "pending";
        next = recomputePipelineState(next);
        onStateChange(next);
      }
    }
  }

  return {
    state: next,
    error: lastError,
  };
}

function writePipelineState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function defaultNodeState(node) {
  return {
    phase: node.phase,
    label: node.label,
    status: "pending",
    attempts: 0,
    lastError: null,
    startedAt: null,
    finishedAt: null,
  };
}

/** Backfill nodes/phases added after an older pipeline-state was saved. */
function migratePipelineState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { state, changed: false };
  }

  let next = clone(state);
  let changed = false;

  if (!next.phases || typeof next.phases !== "object") {
    next.phases = {};
    changed = true;
  }
  for (const phase of PHASES) {
    if (!next.phases[phase.id]) {
      next.phases[phase.id] = { label: phase.label, status: "pending" };
      changed = true;
    } else if (!next.phases[phase.id].label) {
      next.phases[phase.id].label = phase.label;
      changed = true;
    }
  }

  if (!next.nodes || typeof next.nodes !== "object") {
    next.nodes = {};
    changed = true;
  }
  for (const node of NODES) {
    if (!next.nodes[node.id]) {
      next.nodes[node.id] = defaultNodeState(node);
      changed = true;
      continue;
    }
    const entry = next.nodes[node.id];
    if (!entry.phase) {
      entry.phase = node.phase;
      changed = true;
    }
    if (!entry.label) {
      entry.label = node.label;
      changed = true;
    }
    if (entry.status === undefined) {
      entry.status = "pending";
      changed = true;
    }
    if (entry.attempts === undefined) {
      entry.attempts = 0;
      changed = true;
    }
    if (entry.lastError === undefined) {
      entry.lastError = null;
      changed = true;
    }
  }

  if (changed) {
    next = recomputePipelineState(next);
  }

  return { state: next, changed };
}

function readPipelineState(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`pipeline-state.json must be a JSON object: ${filePath}`);
  }
  const { state, changed } = migratePipelineState(raw);
  if (changed && options.persist) {
    writePipelineState(filePath, state);
  }
  return state;
}

function readPipelineStateSafe(filePath, options = {}) {
  try {
    return readPipelineState(filePath, options);
  } catch {
    return null;
  }
}

function readJsonObjectSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function narrativeArtifactsComplete(systemOutput) {
  const fragmentsPath = path.join(systemOutput, "narrative-fragments.md");
  const pendingPath = path.join(systemOutput, "whitepaper.pending-review.md");
  const usage = readJsonObjectSafe(path.join(systemOutput, "phase3b-usage.json"));
  if (!fs.existsSync(fragmentsPath) || !fs.existsSync(pendingPath)) return false;
  if (!usage || Number(usage.fragmentChars || 0) <= 0) return false;
  return true;
}

function narrativeQualityComplete(systemOutput) {
  const report = readJsonObjectSafe(path.join(systemOutput, "narrative-quality-report.json"));
  return Boolean(report?.canSubmitReview);
}

function factCheckComplete(systemOutput) {
  const report = readJsonObjectSafe(path.join(systemOutput, "fact-check-report.json"));
  return Boolean(report?.canFinalize);
}

function reconcilePipelineStateFromArtifacts(state, systemOutput) {
  if (!state || !systemOutput) return { state, changed: false };
  let next = clone(state);
  let changed = false;

  if (next.nodes?.narrative?.status === "running" && narrativeArtifactsComplete(systemOutput)) {
    next = updateNodeStatus(next, "narrative", "success");
    changed = true;
  }

  if (
    next.nodes?.quality?.status === "running" &&
    narrativeArtifactsComplete(systemOutput) &&
    narrativeQualityComplete(systemOutput)
  ) {
    next = updateNodeStatus(next, "quality", "success");
    changed = true;
  }

  if (
    ["success", "skipped"].includes(next.nodes?.narrative?.status) &&
    next.nodes?.quality?.status === "pending" &&
    narrativeArtifactsComplete(systemOutput) &&
    narrativeQualityComplete(systemOutput)
  ) {
    next = updateNodeStatus(next, "quality", "success");
    changed = true;
  }

  if (
    next.nodes?.["fact-check"]?.status === "running" &&
    narrativeArtifactsComplete(systemOutput) &&
    factCheckComplete(systemOutput)
  ) {
    next = updateNodeStatus(next, "fact-check", "success");
    changed = true;
  }

  if (
    ["success", "skipped"].includes(next.nodes?.narrative?.status) &&
    next.nodes?.["fact-check"]?.status === "pending" &&
    narrativeArtifactsComplete(systemOutput) &&
    factCheckComplete(systemOutput)
  ) {
    next = updateNodeStatus(next, "fact-check", "success");
    changed = true;
  }

  return { state: next, changed };
}

module.exports = {
  NODES,
  PHASES,
  createPipelineState,
  migratePipelineState,
  readPipelineState,
  readPipelineStateSafe,
  recomputePipelineState,
  reconcilePipelineStateFromArtifacts,
  runNodeWithRetry,
  resetSystemPipelineState,
  stopRunningPipelineState,
  updateNodeStatus,
  writePipelineState,
};
