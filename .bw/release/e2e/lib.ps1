# e2e impl. Keep this first line ASCII.
$ErrorActionPreference = 'Stop'
# CREATE_NO_WINDOW + piped stdout: Write-Output follows the OEM code page (GBK on
# Chinese Windows). Protocol lines must be raw UTF-8 bytes (ADR-0005).
function Write-BwLine([string]$Line) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Line + "`n"))
    $out = [Console]::OpenStandardOutput()
    $out.Write($bytes, 0, $bytes.Length)
    $out.Flush()
}

function Test-BwVersion([string]$v) {
    if ([string]::IsNullOrWhiteSpace($v)) { return $false }
    if ($v.Contains('(') -or $v.Contains('\') -or $v.Contains('/')) { return $false }
    return $true
}

function Write-BwProgress {
    param([string]$Phase, [string]$Message)
    $o = [ordered]@{ v = 1; type = 'progress'; phase = $Phase; message = $Message }
    Write-BwLine ($o | ConvertTo-Json -Compress)
}

function Write-BwResult {
    param(
        [bool]$Ok,
        [string]$Code,
        [string]$Message,
        [int]$Passed = -1,
        [int]$Total = -1,
        $Cases
    )
    $o = [ordered]@{ v = 1; type = 'result'; ok = $Ok }
    if ($Code) { $o.code = $Code }
    if ($Message) { $o.message = $Message }
    if ($Passed -ge 0) { $o.passed = $Passed }
    if ($Total -ge 0) { $o.total = $Total }
    if ($null -ne $Cases) { $o.cases = @($Cases) }
    Write-BwLine ($o | ConvertTo-Json -Compress -Depth 6)
}

function Parse-BwArgs {
    param([string[]]$Argv)
    $version = $null
    $workdir = $null
    for ($i = 0; $i -lt $Argv.Count; $i++) {
        if ($Argv[$i] -eq '--version' -and $i + 1 -lt $Argv.Count) { $version = $Argv[++$i]; continue }
        if ($Argv[$i] -eq '--workdir' -and $i + 1 -lt $Argv.Count) { $workdir = $Argv[++$i]; continue }
    }
    if (-not $version -or -not $workdir) {
        Write-BwResult -Ok:$false -Code bad_args -Message '参数只要 --version 和 --workdir'
        exit 2
    }
    if (-not (Test-BwVersion $version)) {
        Write-BwResult -Ok:$false -Code bad_args -Message ("「{0}」不像版本号。不要空、不要带括号或路径分隔符。" -f $version)
        exit 2
    }
    $full = [IO.Path]::GetFullPath($workdir)
    if (-not (Test-Path -LiteralPath $full -PathType Container)) {
        Write-BwResult -Ok:$false -Code bad_args -Message ("工作目录不在：{0}" -f $full)
        exit 2
    }
    return @{ Version = $version; Workdir = $full }
}

$parsed = Parse-BwArgs $args
$version = $parsed.Version
$root = $parsed.Workdir
$artifactDir = Join-Path $root ".bw\release\out\$version"
$names = @('shell_launches', 'cu_settings', 'cu_onboard')
$cases = [System.Collections.Generic.List[object]]::new()
$proc = $null
$installDir = Join-Path $env:TEMP "bw-e2e-$version"
$deskName = "bw-e2e-$version"
$hDesk = [IntPtr]::Zero
$port = 0
$launched = $false
$logFile = $null
$exe = $null

function Add-Case($name, $ok, $msg) {
    $cases.Add([ordered]@{ name = $name; ok = [bool]$ok; message = $msg })
}

function Finish([string]$code, [string]$msg) {
    $passed = @($cases | Where-Object { $_.ok }).Count
    if (($passed -eq $names.Count) -and ($names.Count -gt 0)) {
        Write-BwResult -Ok:$true -Passed $passed -Total $names.Count -Cases $cases
        exit 0
    }
    Write-BwResult -Ok:$false -Code $code -Message $msg -Passed $passed -Total $names.Count -Cases $cases
    exit 1
}

function Skip-Rest($fromIdx, $why) {
    for ($i = $fromIdx; $i -lt $names.Count; $i++) {
        Add-Case $names[$i] $false ("未跑：" + $why)
    }
}

function Invoke-SilentSetup([string]$setupExe, [string]$dir, [string]$log) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $setupCmd = 'start /wait "" "' + $setupExe + '" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES /DIR="' + $dir + '" /LOG="' + $log + '"'
    cmd.exe /c $setupCmd | Out-Null
    $got = Join-Path $dir 'bw-dev.exe'
    if (-not (Test-Path $got)) {
        for ($w = 0; $w -lt 40; $w++) {
            Start-Sleep -Milliseconds 250
            if (Test-Path $got) { break }
        }
    }
    return $got
}

function Invoke-SilentUninstall([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return }
    $unins = Get-ChildItem -LiteralPath $dir -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($unins) {
        cmd.exe /c ('start /wait "" "' + $unins.FullName + '" /VERYSILENT /NORESTART') | Out-Null
        Start-Sleep -Seconds 2
    }
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}

$isoCs = @'
using System;
using System.Runtime.InteropServices;
public static class BwIsoDesk {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateDesktop(string n, IntPtr a, IntPtr b, int f, uint access, IntPtr sa);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr OpenDesktop(string n, int f, bool inherit, uint access);
  [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll")] public static extern IntPtr GetEnvironmentStrings();
  [DllImport("kernel32.dll")] public static extern bool FreeEnvironmentStrings(IntPtr env);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2;
    public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId;
  }
  public const uint GENERIC_ALL = 0x10000000;
  public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
  public const int STARTF_USESHOWWINDOW = 1;
  public const short SW_SHOW = 5;
}
'@
Add-Type -TypeDefinition $isoCs

function New-BwEnvBlock([hashtable]$envMap) {
    foreach ($k in $envMap.Keys) { Set-Item -Path "Env:$k" -Value ([string]$envMap[$k]) }
    $sb = New-Object System.Text.StringBuilder
    Get-ChildItem Env: | ForEach-Object {
        [void]$sb.Append($_.Name).Append('=').Append([string]$_.Value).Append([char]0)
    }
    [void]$sb.Append([char]0)
    $chars = $sb.ToString().ToCharArray()
    $pin = [Runtime.InteropServices.GCHandle]::Alloc($chars, [Runtime.InteropServices.GCHandleType]::Pinned)
    return @{ Pin = $pin; Ptr = [Runtime.InteropServices.Marshal]::UnsafeAddrOfPinnedArrayElement($chars, 0) }
}

function Start-BwOnIsolatedDesktop([string]$app, [string]$desk, [hashtable]$envMap) {
    $h = [BwIsoDesk]::OpenDesktop($desk, 0, $false, [BwIsoDesk]::GENERIC_ALL)
    if ($h -eq [IntPtr]::Zero) {
        $h = [BwIsoDesk]::CreateDesktop($desk, [IntPtr]::Zero, [IntPtr]::Zero, 0, [BwIsoDesk]::GENERIC_ALL, [IntPtr]::Zero)
    }
    if ($h -eq [IntPtr]::Zero) { throw 'CreateDesktop failed' }
    $envBlk = New-BwEnvBlock $envMap
    $si = New-Object BwIsoDesk+STARTUPINFO
    $si.cb = [Runtime.InteropServices.Marshal]::SizeOf($si)
    $si.lpDesktop = $desk
    $si.dwFlags = [BwIsoDesk]::STARTF_USESHOWWINDOW
    $si.wShowWindow = [BwIsoDesk]::SW_SHOW
    $pi = New-Object BwIsoDesk+PROCESS_INFORMATION
    $quoted = '"' + $app + '"'
    $ok = [BwIsoDesk]::CreateProcess($app, $quoted, [IntPtr]::Zero, [IntPtr]::Zero, $false, [BwIsoDesk]::CREATE_UNICODE_ENVIRONMENT, $envBlk.Ptr, (Split-Path $app), [ref]$si, [ref]$pi)
    $envBlk.Pin.Free()
    if (-not $ok) { throw ("CreateProcess failed win32=" + [Runtime.InteropServices.Marshal]::GetLastWin32Error()) }
    return @{ Pid = $pi.dwProcessId; Desktop = $h }
}

Write-BwProgress -Phase probe -Message ("look " + $artifactDir)
$setup = $null
if (Test-Path -LiteralPath $artifactDir) {
    $setup = Get-ChildItem -LiteralPath $artifactDir -Filter '*Setup*.exe' | Where-Object { $_.Length -gt 0 } | Select-Object -First 1
}
if (-not $setup) {
    Skip-Rest 0 '还没有这个版本的包'
    Finish e2e_failed '还没有这个版本的包'
}

Get-Process -Name bw-dev -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ($_.Path -like '*\bw-e2e-*') } |
    Stop-Process -Force -ErrorAction SilentlyContinue

Write-BwProgress -Phase install -Message ("silent install " + $installDir)
$issLog = Join-Path $env:TEMP ("bw-e2e-" + $version + "-setup.log")
$exe = Invoke-SilentSetup $setup.FullName $installDir $issLog
if (-not (Test-Path $exe)) {
    $hint = '静默安装之后没有 bw-dev.exe'
    if ((Test-Path $issLog) -and (Select-String -Path $issLog -Pattern 'Claude Code' -SimpleMatch -Quiet -ErrorAction SilentlyContinue)) {
        $hint = '未找到 Claude Code。请先 npm 全局安装 @anthropic-ai/claude-code。'
        Invoke-SilentUninstall $installDir
        Skip-Rest 0 $hint
        Finish missing_tool $hint
    }
    Invoke-SilentUninstall $installDir
    Skip-Rest 0 $hint
    Finish e2e_failed $hint
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$logFile = Join-Path $installDir 'e2e-bw.log'
$dataPlaceholder = Join-Path $installDir 'data\placeholder'
New-Item -ItemType Directory -Force -Path (Split-Path $dataPlaceholder) | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $installDir 'workspaces') | Out-Null

try {
    Write-BwProgress -Phase launch -Message ("isolated desktop port=" + $port)
    $started = Start-BwOnIsolatedDesktop $exe $deskName @{
        BW_VIEW       = 'settings'
        BW_CDP_PORT   = "$port"
        BW_LOG        = $logFile
        BW_DB         = $dataPlaceholder
        BW_WORKSPACES = (Join-Path $installDir 'workspaces')
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port --remote-allow-origins=*"
    }
    $hDesk = $started.Desktop
    $proc = Get-Process -Id $started.Pid -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep -Milliseconds 500
        if ((Test-Path $logFile) -and (Select-String -LiteralPath $logFile -Pattern '\[BW_VIEW\] settings' -Quiet)) {
            $launched = $true
            break
        }
    }
    if (-not $launched) {
        $why = '限定时间内日志没有 [BW_VIEW] settings'
        Add-Case shell_launches $false $why
        Add-Case cu_settings $false ("未跑：" + $why)
        Add-Case cu_onboard $false ("未跑：" + $why)
    } elseif ($proc -and $proc.HasExited) {
        $why = '壳进程在亮屏前退出了'
        Add-Case shell_launches $false $why
        Add-Case cu_settings $false ("未跑：" + $why)
        Add-Case cu_onboard $false ("未跑：" + $why)
        $launched = $false
    } else {
        Add-Case shell_launches $true ''
        Write-BwProgress -Phase probe -Message 'find node / playwright'
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Add-Case cu_settings $false '本机没有 node'
            Add-Case cu_onboard $false '未跑：本机没有 node'
        } else {
            $npmOk = $true
            $npmErr = ''
            Push-Location $PSScriptRoot
            try {
                if (-not (Test-Path 'node_modules\playwright')) {
                    cmd.exe /c "npm install --omit=dev 1>&2"
                    if ($LASTEXITCODE -ne 0) { $npmOk = $false; $npmErr = 'npm install playwright failed' }
                }
            } catch { $npmOk = $false; $npmErr = "$_" }
            finally { Pop-Location }
            if (-not $npmOk) {
                Add-Case cu_settings $false $npmErr
                Add-Case cu_onboard $false ("未跑：" + $npmErr)
            } else {
                $cdpDeadline = (Get-Date).AddSeconds(30)
                while ((Get-Date) -lt $cdpDeadline) {
                    if ($proc -and $proc.HasExited) { break }
                    try {
                        $tcp = New-Object Net.Sockets.TcpClient
                        $tcp.Connect([Net.IPAddress]::Loopback, $port)
                        $tcp.Close()
                        break
                    } catch { Start-Sleep -Milliseconds 250 }
                }
                $shotDir = Join-Path $artifactDir 'e2e-shots'
                function Invoke-Drive($caseName) {
                    Write-BwProgress -Phase $caseName -Message ("CDP " + $caseName)
                    $node = (Get-Command node).Source
                    $errLog = [IO.Path]::GetTempFileName()
                    try {
                        $p = Start-Process -FilePath $node -ArgumentList @(
                            (Join-Path $PSScriptRoot 'drive.mjs'),
                            '--port', "$port",
                            '--shot-dir', $shotDir,
                            '--case', $caseName
                        ) -Wait -PassThru -NoNewWindow -RedirectStandardError $errLog
                        $script:lastDriveOk = ($p.ExitCode -eq 0)
                        $err = ''
                        if (Test-Path -LiteralPath $errLog) {
                            $err = ((Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue) + '').Trim()
                        }
                        $script:lastDriveErr = $err
                    } finally {
                        Remove-Item -LiteralPath $errLog -Force -ErrorAction SilentlyContinue
                    }
                }
                function Drive-FailText($fallback) {
                    if ($script:lastDriveErr) { return $script:lastDriveErr }
                    return $fallback
                }
                Invoke-Drive cu_settings
                if ($script:lastDriveOk) {
                    Add-Case cu_settings $true ''
                    Invoke-Drive cu_onboard
                    if ($script:lastDriveOk) { Add-Case cu_onboard $true '' }
                    else { Add-Case cu_onboard $false (Drive-FailText '接入屏没对上（截图在产物目录 e2e-shots）') }
                } else {
                    Add-Case cu_settings $false (Drive-FailText '设置屏没对上（截图在产物目录 e2e-shots）')
                    Add-Case cu_onboard $false '未跑：上一条失败'
                }
            }
        }
    }
} finally {
    Write-BwProgress -Phase uninstall -Message ("uninstall " + $installDir)
    if ($logFile -and (Test-Path -LiteralPath $logFile)) {
        Copy-Item -LiteralPath $logFile -Destination (Join-Path $artifactDir 'e2e-bw.log') -Force -ErrorAction SilentlyContinue
    }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
    if ($hDesk -ne [IntPtr]::Zero) { [void][BwIsoDesk]::CloseDesktop($hDesk) }
    Invoke-SilentUninstall $installDir
}

$firstFail = $cases | Where-Object { -not $_.ok } | Select-Object -First 1
if ($firstFail) { Finish e2e_failed $firstFail.message }
else { Finish '' '' }
