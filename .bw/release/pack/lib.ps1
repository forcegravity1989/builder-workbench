# pack impl. Keep this first line ASCII.
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
    # 版本串直接进产物文件名与目录名（ADR-0005 命名规则），只收安全字符。
    return $v -match '^[A-Za-z0-9][A-Za-z0-9._+-]*$'
}

function Write-BwProgress {
    param([string]$Phase, [string]$Message)
    $o = [ordered]@{ v = 1; type = 'progress'; phase = $Phase; message = $Message }
    Write-BwLine ($o | ConvertTo-Json -Compress)
}

function Write-BwResult {
    param(
        [bool]$Ok,
        [string]$ArtifactDir,
        [string]$Code,
        [string]$Message,
        [string]$Artifact,
        [string]$Sha256,
        [string]$Revision,
        [Nullable[bool]]$Dirty,
        [string]$PackedAt
    )
    $o = [ordered]@{ v = 1; type = 'result'; ok = $Ok }
    if ($ArtifactDir) { $o.artifact_dir = $ArtifactDir }
    if ($Artifact) { $o.artifact = $Artifact }
    if ($Sha256) { $o.sha256 = $Sha256 }
    if ($Revision) { $o.revision = $Revision }
    if ($null -ne $Dirty) { $o.dirty = [bool]$Dirty }
    if ($PackedAt) { $o.packed_at = $PackedAt }
    if ($Code) { $o.code = $Code }
    if ($Message) { $o.message = $Message }
    Write-BwLine ($o | ConvertTo-Json -Compress)
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
        Write-BwResult -Ok:$false -Code bad_args -Message ("「{0}」不像版本号。只用字母、数字和 . _ + -（版本串直接进产物文件名与目录名），不要空或其他符号。" -f $version)
        exit 2
    }
    $full = [IO.Path]::GetFullPath($workdir)
    if (-not (Test-Path -LiteralPath $full -PathType Container)) {
        Write-BwResult -Ok:$false -Code bad_args -Message ("工作目录不在：{0}" -f $full)
        exit 2
    }
    return @{ Version = $version; Workdir = $full }
}

function Fail($code, $msg) {
    Write-BwResult -Ok:$false -Code $code -Message $msg
    exit 1
}

function Invoke-BwRedirected([string]$Exe, [string[]]$Argv) {
    $outLog = [IO.Path]::GetTempFileName()
    $errLog = [IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $Exe -ArgumentList $Argv -Wait -PassThru -NoNewWindow `
            -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        Get-Content -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue |
            ForEach-Object { [Console]::Error.WriteLine($_) }
        return [int]$p.ExitCode
    } finally {
        Remove-Item -LiteralPath $outLog, $errLog -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-SilentSetup([string]$setupExe, [string]$dir, [string]$log) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $setupCmd = 'start /wait "" "' + $setupExe + '" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES /DIR="' + $dir + '" /LOG="' + $log + '"'
    cmd.exe /c $setupCmd | Out-Null
    $exe = Join-Path $dir 'bw-dev.exe'
    if (-not (Test-Path $exe)) {
        for ($w = 0; $w -lt 40; $w++) {
            Start-Sleep -Milliseconds 250
            if (Test-Path $exe) { break }
        }
    }
    return $exe
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

$parsed = Parse-BwArgs $args
$version = $parsed.Version
$root = $parsed.Workdir
$here = $PSScriptRoot
$outDir = Join-Path $root ".bw\release\out\$version"

Write-BwProgress -Phase probe -Message '在找 cargo / C 工具链 / ISCC.exe'
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Fail missing_tool '本机 PATH 里没有 cargo.exe'
}

$needGnu = @('dlltool.exe', 'x86_64-w64-mingw32-gcc.exe')
$missingGnu = @($needGnu | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) })
$hasCl = [bool](Get-Command cl.exe -ErrorAction SilentlyContinue)
if ($missingGnu -and -not $hasCl) {
    Fail missing_tool ("本机 PATH 里没有 " + ($missingGnu -join '、') + "（MSVC 的 cl.exe 也没有）")
}

$isccCandidates = @(
    (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$iscc = $isccCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $iscc) { Fail missing_tool '本机没有 Inno Setup（ISCC.exe）' }

Write-BwProgress -Phase build -Message 'cargo build --release -p app-shell'
Push-Location $root
try {
    $buildCode = Invoke-BwRedirected cargo @('build', '--release', '-p', 'app-shell')
    if ($buildCode -ne 0) { Fail build_failed "cargo build 退出 $buildCode" }
} finally { Pop-Location }

Write-BwProgress -Phase payload -Message '拷 WebView2Loader.dll 到 target\release'
$dllHits = Get-ChildItem -Path (Join-Path $root 'target\release\build') -Recurse -Filter WebView2Loader.dll -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\out\\x64\\' }
if (-not $dllHits) { Fail pack_failed '编完了但找不到 WebView2Loader.dll（webview2-com-sys 的 x64 产物）' }
Copy-Item -Force $dllHits[0].FullName (Join-Path $root 'target\release\WebView2Loader.dll')

Write-BwProgress -Phase iss -Message "ISCC -> $outDir"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$iss = Join-Path $here 'BuildersWorkbench.iss'
$issCode = Invoke-BwRedirected $iscc @("/DMyAppVersion=$version", "/DBwOutputDir=$outDir", $iss)
if ($issCode -ne 0) { Fail pack_failed "ISCC 退出 $issCode" }
# 产物名由版本串派生（.iss OutputBaseFilename），按精确名取件：手工改名或混入旧名产物都不被本协议接受。
$artifactName = "BuildersWorkbench-$version-Setup.exe"
$setup = Join-Path $outDir $artifactName
if (-not (Test-Path -LiteralPath $setup) -or (Get-Item -LiteralPath $setup).Length -le 0) {
    Fail pack_failed "ISCC 跑完了，$outDir 里没有非空的 $artifactName"
}

Write-BwProgress -Phase verify -Message '静默安装校验后卸载'
$verifyDir = Join-Path $env:TEMP "bw-pack-verify-$version"
$issLog = Join-Path $env:TEMP ("bw-pack-verify-" + $version + "-setup.log")
$exe = Invoke-SilentSetup $setup $verifyDir $issLog
if (-not (Test-Path $exe)) {
    $hint = '静默安装之后没有 bw-dev.exe'
    if ((Test-Path $issLog) -and (Select-String -Path $issLog -Pattern 'Claude Code' -SimpleMatch -Quiet -ErrorAction SilentlyContinue)) {
        $hint = '未找到 Claude Code。请先 npm 全局安装 @anthropic-ai/claude-code。'
        Invoke-SilentUninstall $verifyDir
        Fail missing_tool $hint
    }
    Invoke-SilentUninstall $verifyDir
    Fail pack_failed $hint
}
Invoke-SilentUninstall $verifyDir
if (Test-Path (Join-Path $verifyDir 'bw-dev.exe')) {
    Fail pack_failed '校验卸载之后 bw-dev.exe 还在'
}

# 产物身份记录（ADR-0005）：文件名 + SHA-256 + 构建修订 + dirty + 时间戳，发布绑定校验的来源。
# 非 git 工作目录时 revision/dirty 缺省——缺失即 unknown，消费方不得当作干净。
$sha = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLower()
$revision = ''
$dirty = $null
try {
    $head = (& git -C $root rev-parse HEAD 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $head -match '^[0-9a-f]{40}$') {
        $revision = $head
        $porcelain = (& git -C $root status --porcelain 2>$null | Out-String).Trim()
        $dirty = ($porcelain.Length -gt 0)
    }
} catch { $revision = '' }
$packedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Write-BwResult -Ok:$true -ArtifactDir $outDir -Artifact $artifactName -Sha256 $sha -Revision $revision -Dirty $dirty -PackedAt $packedAt
exit 0
