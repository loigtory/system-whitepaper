#Requires -Version 5.1
param(
  [int]$Port = 3920,
  [string]$HostName = "127.0.0.1",
  [int]$WaitSeconds = 20
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DashboardScript = Join-Path $ProjectRoot "scripts\local-dashboard\server.js"
$ConfigPath = Join-Path $ProjectRoot "config\systems.local.yaml"
$DashboardUrl = "http://${HostName}:$Port/"
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()

function Write-Step([string]$Message) {
  Write-Host "[whitepaper-dashboard] $Message"
}

function Stop-ProjectServices {
  $stopped = @()

  $listeners = Get-NetTCPConnection -LocalAddress $HostName -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $listeners) {
    $processId = $conn.OwningProcess
    if (-not $processId) { continue }
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      $stopped += "port $Port pid=$processId"
    }
  }

  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  foreach ($proc in $nodeProcesses) {
    $cmd = [string]$proc.CommandLine
    if (-not $cmd) { continue }
    $cmdLower = $cmd.ToLowerInvariant()
    if ($cmdLower -notlike "*$ProjectRootLower*") { continue }
    $isDashboard = $cmdLower -like "*local-dashboard\server.js*" -or $cmdLower -like "*local-dashboard/server.js*"
    $isPipeline = $cmdLower -like "*run-whitepaper-pipeline.js*"
    if (-not $isDashboard -and -not $isPipeline) { continue }
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    $label = if ($isDashboard) { "dashboard" } else { "pipeline" }
    $stopped += "$label pid=$($proc.ProcessId)"
  }

  if ($stopped.Count -gt 0) {
    Write-Step ("stopped: " + ($stopped -join "; "))
    Start-Sleep -Milliseconds 500
  } else {
    Write-Step "no old service found"
  }
}

function Test-DashboardReady {
  try {
    $response = Invoke-WebRequest -Uri $DashboardUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-DashboardProcess {
  if (-not (Test-Path $DashboardScript)) {
    throw "dashboard script not found: $DashboardScript"
  }
  if (-not (Test-Path $ConfigPath)) {
    throw "config not found: $ConfigPath"
  }

  $nodeCmd = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $nodeCmd) {
    throw "node not found in PATH"
  }

  $nodeArgs = @(
    $DashboardScript,
    "--config",
    $ConfigPath,
    "--port",
    "$Port",
    "--host",
    $HostName
  )

  Start-Process -FilePath $nodeCmd -ArgumentList $nodeArgs -WorkingDirectory $ProjectRoot -WindowStyle Minimized | Out-Null
  Write-Step "dashboard started in minimized window"
}

Set-Location $ProjectRoot
Write-Step "project: $ProjectRoot"
Stop-ProjectServices
Start-DashboardProcess

$ready = $false
for ($i = 1; $i -le $WaitSeconds; $i++) {
  if (Test-DashboardReady) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  throw "dashboard not ready within ${WaitSeconds}s"
}

Start-Process $DashboardUrl | Out-Null
Write-Step "browser opened: $DashboardUrl"
Write-Step "to stop: close the minimized node window, or run this launcher again"
