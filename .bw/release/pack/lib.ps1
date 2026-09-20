# pack impl. Keep this first line ASCII.
$ErrorActionPreference = 'Stop'
# JSONL 协议（参数解析/版本串规则/协议行）与静默装卸 helper 与验包适配层共用同一份实现。
. (Join-Path $PSScriptRoot '..\protocol.ps1')
. (Join-Path $PSScriptRoot '..\install.ps1')

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

$parsed = Parse-BwArgs $args
$version = $parsed.Version
$root = $parsed.Workdir
$here = $PSScriptRoot
$outDir = Join-Path $root ".bw\release\out\$version"

# 源码身份在开工时记录：revision/dirty 描述 cargo 实际编译的树；结束时复核写入
# source_unchanged。出包中途 HEAD 前进或工作树变化都会使身份失真，消费方必须拒。
# 非 git 工作目录时 revision/dirty 缺省、source_unchanged=false——缺省即 unknown。
$revision = ''
$dirty = $null
$startPorcelain = ''
try {
    $head = (& git -C $root rev-parse HEAD 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $head -match '^[0-9a-f]{40}\z') {
        $startPorcelain = (& git -C $root status --porcelain 2>$null | Out-String).Trim()
        # status 自身失败时不能把 unknown 报成「干净」：只有退出码 0 才落 dirty。
        if ($LASTEXITCODE -eq 0) {
            $revision = $head
            $dirty = ($startPorcelain.Length -gt 0)
        }
    }
} catch { $revision = ''; $dirty = $null; $startPorcelain = '' }

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
$exe = Invoke-BwSilentSetup $setup $verifyDir $issLog
if (-not (Test-Path $exe)) {
    $hint = '静默安装之后没有 bw-dev.exe'
    if (Test-BwClaudeHint $issLog) {
        $hint = '未找到 Claude Code。请先 npm 全局安装 @anthropic-ai/claude-code。'
        Invoke-BwSilentUninstall $verifyDir
        Fail missing_tool $hint
    }
    Invoke-BwSilentUninstall $verifyDir
    Fail pack_failed $hint
}
Invoke-BwSilentUninstall $verifyDir
if (Test-Path (Join-Path $verifyDir 'bw-dev.exe')) {
    Fail pack_failed '校验卸载之后 bw-dev.exe 还在'
}

# 产物身份记录（ADR-0005）：文件名 + SHA-256 + 开工源码身份（revision/dirty）+ 结束时
# 源码未变复核（source_unchanged）+ 时间戳。同份记录落盘产物目录 pack-result.json，
# 发布绑定校验读它，不依赖操作者手工重定向 stdout。
$sha = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLower()
$sourceUnchanged = $false
if ($revision) {
    try {
        $headNow = (& git -C $root rev-parse HEAD 2>$null | Out-String).Trim()
        $porcelainNow = (& git -C $root status --porcelain 2>$null | Out-String).Trim()
        $sourceUnchanged = ($LASTEXITCODE -eq 0 -and $headNow -eq $revision -and $porcelainNow -eq $startPorcelain)
    } catch { $sourceUnchanged = $false }
}
$packedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Write-BwResult -Ok:$true -ArtifactDir $outDir -Artifact $artifactName -Sha256 $sha `
    -Revision $revision -Dirty $dirty -SourceUnchanged $sourceUnchanged -PackedAt $packedAt `
    -PersistTo (Join-Path $outDir 'pack-result.json')
exit 0
