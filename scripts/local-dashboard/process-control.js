const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const PIPELINE_PROCESS_PATTERN =
  /run-whitepaper-batch|run-whitepaper-pipeline|refresh-huntian-cookie|collect-evidence/;

function killProcessTree(pid) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) return false;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(numericPid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return result.status === 0 || result.status === 128;
  }
  try {
    process.kill(numericPid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

function listProjectPipelinePids(projectRoot) {
  const root = path.resolve(String(projectRoot || ""));
  if (!root) return [];
  if (process.platform === "win32") {
    try {
      const script = [
        "$root = $env:WP_ROOT",
        "$procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue",
        "foreach ($p in $procs) {",
        "  if (-not $p.CommandLine) { continue }",
        "  if ($p.CommandLine -notlike \"*$root*\") { continue }",
        "  if ($p.CommandLine -notmatch 'run-whitepaper-batch|run-whitepaper-pipeline|refresh-huntian-cookie|collect-evidence') { continue }",
        "  $p.ProcessId",
        "}",
      ].join("; ");
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        {
          encoding: "utf8",
          windowsHide: true,
          timeout: 15000,
          env: { ...process.env, WP_ROOT: root },
        },
      );
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((line) => Number(String(line).trim()))
            .filter((pid) => pid > 0),
        ),
      ];
    } catch {
      return [];
    }
  }
  return [];
}

function killProjectPipelineProcesses(projectRoot, options = {}) {
  const skipPid = Number(options.skipPid || 0);
  const killed = [];
  for (const pid of listProjectPipelinePids(projectRoot)) {
    if (pid === skipPid) continue;
    if (killProcessTree(pid)) killed.push(pid);
  }
  return killed;
}

module.exports = {
  PIPELINE_PROCESS_PATTERN,
  killProcessTree,
  killProjectPipelineProcesses,
  listProjectPipelinePids,
};
