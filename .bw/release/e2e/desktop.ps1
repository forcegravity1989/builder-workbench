param(
    [Parameter(Mandatory=$true)][string]$Exe,
    [Parameter(Mandatory=$true)][string]$OutDir,
    [ValidateSet('core','onboarding')][string]$Scenario = 'core',
    [switch]$WeekPlan,
    [string]$SandboxRoot = '',
    [string]$SandboxRepo = '',
    [string]$SandboxRepoId = ''
)
$ErrorActionPreference = 'Stop'
if ($WeekPlan -and $Scenario -ne 'onboarding') { throw '-WeekPlan extends the onboarding journey only' }
$DesktopMode = if ($env:BW_E2E_DESKTOP) { $env:BW_E2E_DESKTOP } else { 'isolated' }
if ($DesktopMode -notin @('isolated','current')) { throw 'BW_E2E_DESKTOP must be isolated or current (dedicated machine only)' }
$Utf8 = New-Object Text.UTF8Encoding($false)
$Exe = [IO.Path]::GetFullPath($Exe)
$OutDir = [IO.Path]::GetFullPath($OutDir)
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "No executable: $Exe" }
if (-not (Test-Path -LiteralPath $OutDir -PathType Container)) { throw 'The caller must create the output directory' }
if (Test-Path -LiteralPath (Join-Path $OutDir 'result.json')) { throw 'Refusing to overwrite an existing E2E result' }
$RunId = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$RunRoot = Join-Path $TempRoot "bw-verify-$RunId"
$DataRoot = Join-Path $RunRoot 'data'
$Workspace = Join-Path $RunRoot 'workspaces-saved'
$OwnedPid = $null
$DesktopHandle = [IntPtr]::Zero
$Cases = New-Object 'System.Collections.Generic.List[object]'
$Names = if ($Scenario -eq 'core') {
    @('settings-restart-roundtrip')
} elseif ($WeekPlan) {
    @('onboarding-project', 'onboarding-readback', 'onboarding-orca', 'weekplan-automation', 'weekplan-session', 'weekplan-html', 'onboarding-cleanup')
} else {
    @('onboarding-project', 'onboarding-readback', 'onboarding-orca', 'onboarding-cleanup')
}
$Failure = $null
$Code = @'
using System;
using System.Runtime.InteropServices;
public static class BwVerifyDesktop {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, int flags, uint access, IntPtr attrs);
  [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr handle);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb; public string lpReserved, lpDesktop, lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
}
'@
Add-Type -TypeDefinition $Code

function Save-Json($File, $Value) {
    [IO.File]::WriteAllText((Join-Path $OutDir $File), ($Value | ConvertTo-Json -Depth 12), $Utf8)
}

function Stop-OwnedProcess {
    if ($script:OwnedPid) {
        $Process = Get-Process -Id $script:OwnedPid -ErrorAction SilentlyContinue
        if ($Process) {
            # Read back identity before killing. Never enumerate other bw-dev instances.
            if ($Process.Path -ne $Exe) { throw 'Owned PID no longer belongs to this executable' }
            & taskkill.exe /PID "$script:OwnedPid" /T /F 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $script:OwnedPid -ErrorAction SilentlyContinue)) { throw 'Could not stop owned process tree' }
        }
        $script:OwnedPid = $null
    }
}

function Start-Shell($Phase) {
    $Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $Listener.Start()
    $Port = ([Net.IPEndPoint]$Listener.LocalEndpoint).Port
    $Listener.Stop()
    # Clear inherited deep links, otherwise a developer's shell environment can select another screen.
    foreach ($Key in @('BW_OPEN','BW_PANEL','BW_HELP')) { Remove-Item "Env:$Key" -ErrorAction SilentlyContinue }
    $env:BW_VIEW = if ($Scenario -eq 'core') { 'settings' } else { 'onboard' }
    $env:BW_CDP_PORT = "$Port"
    $env:BW_DB = Join-Path $DataRoot 'placeholder'
    $env:BW_WORKSPACES = Join-Path $RunRoot 'workspaces-initial'
    $env:BW_LOG = Join-Path $OutDir "$Phase-shell.log"
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $RunRoot 'webview'
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$Port"
    $EnvText = ((Get-ChildItem Env: | Sort-Object Name | ForEach-Object { $_.Name + '=' + $_.Value }) -join [char]0) + [char]0 + [char]0
    $EnvPtr = [Runtime.InteropServices.Marshal]::StringToHGlobalUni($EnvText)
    try {
        $Si = New-Object BwVerifyDesktop+STARTUPINFO
        $Si.cb = [Runtime.InteropServices.Marshal]::SizeOf($Si)
        if ($DesktopMode -eq 'isolated') { $Si.lpDesktop = "bw-verify-$RunId" }
        $Pi = New-Object BwVerifyDesktop+PROCESS_INFORMATION
        $Ok = [BwVerifyDesktop]::CreateProcess($Exe, ('"' + $Exe + '"'), [IntPtr]::Zero, [IntPtr]::Zero, $false, 0x400, $EnvPtr, (Split-Path $Exe), [ref]$Si, [ref]$Pi)
        if (-not $Ok) { throw ('CreateProcess failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
        $script:OwnedPid = $Pi.dwProcessId
        [void][BwVerifyDesktop]::CloseHandle($Pi.hThread)
        [void][BwVerifyDesktop]::CloseHandle($Pi.hProcess)
    } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($EnvPtr) }
    $Deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $Deadline) {
        if (-not (Get-Process -Id $script:OwnedPid -ErrorAction SilentlyContinue)) { throw 'Desktop shell exited before CDP became ready' }
        try {
            $Version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
            if ($Version.webSocketDebuggerUrl) { return $Port }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    $AllProcesses = @(Get-CimInstance Win32_Process)
    $TreeIds = @($script:OwnedPid)
    do {
        $Children = @($AllProcesses | Where-Object { $_.ParentProcessId -in $TreeIds -and $_.ProcessId -notin $TreeIds })
        $TreeIds += @($Children | ForEach-Object { $_.ProcessId })
    } while ($Children.Count -gt 0)
    Save-Json 'startup-processes.json' @($AllProcesses | Where-Object { $_.ProcessId -in $TreeIds } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine)
    throw 'CDP readiness deadline exceeded; inspect startup-processes.json and shell logs'
}

try {
    New-Item -ItemType Directory -Path $RunRoot | Out-Null
    [IO.File]::WriteAllText((Join-Path $RunRoot '.owner'), $RunId, $Utf8)
    New-Item -ItemType Directory -Path $DataRoot | Out-Null
    $HashAlgorithm = [Security.Cryptography.SHA256]::Create()
    $ExeStream = [IO.File]::OpenRead($Exe)
    try { $ExeHash = [BitConverter]::ToString($HashAlgorithm.ComputeHash($ExeStream)).Replace('-', '').ToLower() }
    finally { $ExeStream.Dispose(); $HashAlgorithm.Dispose() }
    Save-Json 'subject.json' ([ordered]@{ exe = $Exe; sha256 = $ExeHash; runId = $RunId; desktop = $DesktopMode })
    if ($DesktopMode -eq 'isolated') {
        $DesktopHandle = [BwVerifyDesktop]::CreateDesktop("bw-verify-$RunId", [IntPtr]::Zero, [IntPtr]::Zero, 0, 0x10000000, [IntPtr]::Zero)
        if ($DesktopHandle -eq [IntPtr]::Zero) { throw 'Could not create isolated Windows desktop' }
    }
    if ($Scenario -eq 'onboarding') {
        if (-not $SandboxRoot -or -not $SandboxRepo -or -not $SandboxRepoId) { throw 'onboarding requires SandboxRoot, SandboxRepo and SandboxRepoId' }
        $SandboxRoot = [IO.Path]::GetFullPath($SandboxRoot)
        New-Item -ItemType Directory -Path $SandboxRoot -Force | Out-Null
    }
    $Phases = if ($Scenario -eq 'core') { @('initial','restart') } else { @('initial') }
    foreach ($Phase in $Phases) {
        $Port = Start-Shell $Phase
        if ($Scenario -eq 'core') {
            & node (Join-Path $PSScriptRoot 'core.mjs') --port "$Port" --out $OutDir --data $DataRoot --workspace $Workspace --phase $Phase
        } else {
            $JourneyArgs = @((Join-Path $PSScriptRoot 'journeys/onboarding/onboarding.mjs'), '--port', "$Port", '--out', $OutDir, '--sandbox-root', $SandboxRoot, '--repo', $SandboxRepo, '--repo-id', $SandboxRepoId, '--run-id', $RunId, '--root', (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path)
            if ($WeekPlan) { $JourneyArgs += '--weekplan' }
            & node @JourneyArgs
        }
        $DriveExit = $LASTEXITCODE
        $PhaseResult = Get-Content -LiteralPath (Join-Path $OutDir "$Phase.json") -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($Case in $PhaseResult.cases) { $Cases.Add($Case) }
        Stop-OwnedProcess
        if ($DriveExit -ne 0) { throw "E2E phase failed: $Phase" }
    }
} catch { $Failure = $_.Exception.Message }
finally {
    $Cleaned = $false
    try {
        Stop-OwnedProcess
        if ($DesktopHandle -ne [IntPtr]::Zero) {
            if (-not [BwVerifyDesktop]::CloseDesktop($DesktopHandle)) { throw 'Could not close isolated desktop' }
        }
        if (Test-Path -LiteralPath $RunRoot) {
            $Resolved = [IO.Path]::GetFullPath($RunRoot)
            $AllowedPrefix = $TempRoot.TrimEnd('\') + '\bw-verify-'
            if (-not $Resolved.StartsWith($AllowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup path outside owned temporary root' }
            if ([IO.File]::ReadAllText((Join-Path $Resolved '.owner')) -ne $RunId) { throw 'Cleanup ownership marker mismatch' }
            $CleanupDeadline = (Get-Date).AddSeconds(15)
            while (Test-Path -LiteralPath $Resolved) {
                try { Remove-Item -LiteralPath $Resolved -Recurse -Force }
                catch {
                    # WebView child handles can outlive taskkill briefly. Retry the owned path only.
                    if ((Get-Date) -ge $CleanupDeadline) { throw }
                }
                if ((Get-Date) -ge $CleanupDeadline -and (Test-Path -LiteralPath $Resolved)) { throw 'Temporary directory still exists after cleanup deadline' }
                if (Test-Path -LiteralPath $Resolved) { Start-Sleep -Milliseconds 200 }
            }
        }
        $Cleaned = $true
    } catch { $Failure = "$Failure Cleanup: $($_.Exception.Message)" }
    Save-Json 'cleanup.json' ([ordered]@{ runId = $RunId; cleaned = $Cleaned; ownedProcessStopped = ($null -eq $OwnedPid); temporaryDirectoryRemoved = (-not (Test-Path -LiteralPath $RunRoot)) })
    foreach ($Name in $Names) {
        if (-not ($Cases | Where-Object { $_.id -eq $Name })) {
            $Cases.Add([ordered]@{ id = $Name; title = $Name; status = 'not_run'; message = $Failure; evidence = @() })
        }
    }
    Save-Json 'result.json' ([ordered]@{ v = 1; cases = @($Cases.ToArray()); error = $Failure })
}
if ($Failure) { Write-Error $Failure -ErrorAction Continue; exit 1 }
exit 0
