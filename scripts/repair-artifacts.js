#!/usr/bin/env node

const CLOSURE_TYPE = "batch-repair-closure";
const FOLLOW_UP_TYPE = "batch-repair-follow-up-plan";
const FOLLOW_UP_STATUSES = new Set(["complete", "ready-to-run", "needs-agent-writing", "blocked"]);
const SUPPORTED_FOLLOW_UP_SCRIPTS = new Set(["repair:batch", "batch"]);

function assertJsonObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertBoolean(value, message) {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
}

function assertFiniteNumber(value, message) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(message);
  }
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function assertSummaryEquals(summary, key, expected, fileName) {
  if (numberFrom(summary[key]) !== expected) {
    throw new Error(`${fileName} summary.${key} must equal ${expected}.`);
  }
}

function isLowQuotaAutoRepairCommand(command = {}) {
  return (
    command.canAutoRun === true &&
    command.canRunWithoutAgentWriting === true &&
    command.requiresAgentWriting !== true &&
    command.requiresExplicitQuotaApproval !== true &&
    SUPPORTED_FOLLOW_UP_SCRIPTS.has(command.command?.npmScript)
  );
}

function assertValidRepairClosureArtifact(closure = {}) {
  assertJsonObject(closure, "repair-closure.json must be a JSON object.");
  if (closure.artifactType !== CLOSURE_TYPE) {
    throw new Error(`repair-closure.json artifactType must be ${CLOSURE_TYPE}.`);
  }
  assertFiniteNumber(closure.version, "repair-closure.json version must be numeric.");
  if (!String(closure.generatedAt || "").trim()) {
    throw new Error("repair-closure.json generatedAt must be present.");
  }
  if (!["passed", "blocked"].includes(String(closure.status || ""))) {
    throw new Error("repair-closure.json status must be passed or blocked.");
  }
  assertFiniteNumber(closure.targetTruthScorePercent, "repair-closure.json targetTruthScorePercent must be numeric.");
  assertBoolean(closure.canSubmitAll, "repair-closure.json canSubmitAll must be a boolean.");
  assertBoolean(closure.repairQueueEmpty, "repair-closure.json repairQueueEmpty must be a boolean.");
  assertBoolean(closure.diagnosisAvailable, "repair-closure.json diagnosisAvailable must be a boolean.");
  assertBoolean(closure.repairQueueAvailable, "repair-closure.json repairQueueAvailable must be a boolean.");
  assertArray(closure.failedGroups, "repair-closure.json failedGroups must be an array.");
  assertArray(closure.pendingGroups, "repair-closure.json pendingGroups must be an array.");
  assertArray(closure.blockers, "repair-closure.json blockers must be an array.");
  assertJsonObject(closure.diagnosis, "repair-closure.json diagnosis must be a JSON object.");
  assertJsonObject(closure.diagnosis.summary, "repair-closure.json diagnosis.summary must be a JSON object.");
  assertJsonObject(closure.repairQueue, "repair-closure.json repairQueue must be a JSON object.");
  assertJsonObject(closure.repairQueue.summary, "repair-closure.json repairQueue.summary must be a JSON object.");

  if (closure.status !== "passed") return;

  if (closure.canSubmitAll !== true) {
    throw new Error("repair-closure.json status=passed requires canSubmitAll=true.");
  }
  if (closure.repairQueueEmpty !== true) {
    throw new Error("repair-closure.json status=passed requires repairQueueEmpty=true.");
  }
  if (closure.diagnosisAvailable !== true || closure.repairQueueAvailable !== true) {
    throw new Error("repair-closure.json status=passed requires diagnosis and repair queue artifacts.");
  }
  if (closure.failedGroups.length > 0 || closure.pendingGroups.length > 0 || closure.blockers.length > 0) {
    throw new Error("repair-closure.json status=passed requires zero failed groups, pending groups, and blockers.");
  }

  const diagnosisSummary = closure.diagnosis.summary;
  const targetTruthScore = numberFrom(closure.targetTruthScorePercent);
  if (
    numberFrom(diagnosisSummary.total) <= 0 ||
    numberFrom(diagnosisSummary.ready) !== numberFrom(diagnosisSummary.total) ||
    numberFrom(diagnosisSummary.blocked) !== 0 ||
    numberFrom(diagnosisSummary.belowTarget) !== 0 ||
    numberFrom(diagnosisSummary.missingWritableClaims) !== 0
  ) {
    throw new Error("repair-closure.json status=passed requires all diagnosis systems ready with no truth gaps.");
  }
  if (
    diagnosisSummary.minTruthScore !== undefined &&
    numberFrom(diagnosisSummary.minTruthScore) < targetTruthScore
  ) {
    throw new Error("repair-closure.json status=passed requires minTruthScore to meet the target.");
  }

  const repairQueueSummary = closure.repairQueue.summary;
  assertSummaryEquals(repairQueueSummary, "total", 0, "repair-closure.json");
  assertSummaryEquals(repairQueueSummary, "blocked", 0, "repair-closure.json");
  assertSummaryEquals(repairQueueSummary, "requiresAgentWriting", 0, "repair-closure.json");
}

function assertValidRepairFollowUpPlanArtifact(plan = {}) {
  assertJsonObject(plan, "repair-follow-up-plan.json must be a JSON object.");
  if (plan.artifactType !== FOLLOW_UP_TYPE) {
    throw new Error(`repair-follow-up-plan.json artifactType must be ${FOLLOW_UP_TYPE}.`);
  }
  assertFiniteNumber(plan.version, "repair-follow-up-plan.json version must be numeric.");
  if (!String(plan.generatedAt || "").trim()) {
    throw new Error("repair-follow-up-plan.json generatedAt must be present.");
  }
  if (!FOLLOW_UP_STATUSES.has(String(plan.status || ""))) {
    throw new Error("repair-follow-up-plan.json status is not supported.");
  }
  if (!String(plan.nextBestAction || "").trim()) {
    throw new Error("repair-follow-up-plan.json nextBestAction must be present.");
  }
  assertJsonObject(plan.source, "repair-follow-up-plan.json source must be a JSON object.");
  assertJsonObject(plan.policy, "repair-follow-up-plan.json policy must be a JSON object.");
  assertJsonObject(plan.summary, "repair-follow-up-plan.json summary must be a JSON object.");
  assertArray(plan.commands, "repair-follow-up-plan.json commands must be an array.");
  assertArray(plan.queueItems, "repair-follow-up-plan.json queueItems must be an array.");
  assertArray(plan.blockedQueueItems, "repair-follow-up-plan.json blockedQueueItems must be an array.");
  assertArray(plan.blockers, "repair-follow-up-plan.json blockers must be an array.");

  const summary = plan.summary;
  assertSummaryEquals(summary, "commands", plan.commands.length, "repair-follow-up-plan.json");
  assertSummaryEquals(
    summary,
    "lowQuotaCommands",
    plan.commands.filter((command) => command.canRunWithoutAgentWriting === true).length,
    "repair-follow-up-plan.json",
  );
  assertSummaryEquals(
    summary,
    "agentWritingCommands",
    plan.commands.filter((command) => command.requiresAgentWriting === true).length,
    "repair-follow-up-plan.json",
  );
  assertSummaryEquals(summary, "remainingQueueItems", plan.queueItems.length, "repair-follow-up-plan.json");
  assertSummaryEquals(summary, "blockedQueueItems", plan.blockedQueueItems.length, "repair-follow-up-plan.json");

  for (const command of plan.commands) {
    assertJsonObject(command, "repair-follow-up-plan.json commands must contain JSON objects.");
    assertJsonObject(command.command, "repair-follow-up-plan.json commands must contain command objects.");
    if (!SUPPORTED_FOLLOW_UP_SCRIPTS.has(command.command.npmScript)) {
      throw new Error("repair-follow-up-plan.json commands must use a supported follow-up script.");
    }
    if (command.canAutoRun === true && (command.requiresAgentWriting === true || command.requiresExplicitQuotaApproval === true)) {
      throw new Error("repair-follow-up-plan.json auto-runnable commands cannot require agent-writing quota.");
    }
  }

  if (plan.status === "complete") {
    if (plan.source.closureStatus !== "passed") {
      throw new Error("repair-follow-up-plan.json status=complete requires closureStatus=passed.");
    }
    if (
      plan.commands.length > 0 ||
      plan.queueItems.length > 0 ||
      plan.blockedQueueItems.length > 0 ||
      plan.blockers.length > 0 ||
      numberFrom(summary.lowQuotaCommands) > 0 ||
      numberFrom(summary.agentWritingCommands) > 0 ||
      numberFrom(summary.remainingQueueItems) > 0 ||
      numberFrom(summary.blockedQueueItems) > 0
    ) {
      throw new Error("repair-follow-up-plan.json status=complete requires no remaining commands, queue items, or blockers.");
    }
  }

  if (plan.status === "ready-to-run") {
    if (numberFrom(summary.lowQuotaCommands) <= 0) {
      throw new Error("repair-follow-up-plan.json status=ready-to-run requires low-quota commands.");
    }
    if (!plan.commands.some(isLowQuotaAutoRepairCommand)) {
      throw new Error("repair-follow-up-plan.json status=ready-to-run requires an auto-runnable low-quota follow-up command.");
    }
  }

  if (plan.status === "needs-agent-writing") {
    if (numberFrom(summary.lowQuotaCommands) > 0) {
      throw new Error("repair-follow-up-plan.json status=needs-agent-writing cannot contain low-quota commands.");
    }
    if (numberFrom(summary.agentWritingCommands) <= 0) {
      throw new Error("repair-follow-up-plan.json status=needs-agent-writing requires agent-writing commands.");
    }
  }

  if (plan.status === "blocked" && plan.blockers.length === 0 && numberFrom(summary.blockedQueueItems) <= 0) {
    throw new Error("repair-follow-up-plan.json status=blocked requires blockers or blocked queue items.");
  }
}

module.exports = {
  assertValidRepairClosureArtifact,
  assertValidRepairFollowUpPlanArtifact,
  isLowQuotaAutoRepairCommand,
};
