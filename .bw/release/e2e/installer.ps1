# 用例六件事：
# 1. 保护规则：候选包（出包产物）能静默装、装出来的真壳能完成设置保存重启读回往返、
#    能卸干净。与源码级 desktop-core 套件的分工：那边证明源码构建的行为，这边证明
#    「用户拿到的安装包」同一行为成立；断言同级（读回），不做弱导航版。
# 2. 环境与数据：Windows、out/<version>/ 下已出包（pack.cmd 产物 + pack-result.json）、
#    WebView2 运行时、Playwright 按锁文件就绪（verify installer profile 前置步骤保证）。
# 3. 真实动作：静默装到本次专属临时目录 → desktop.ps1 以装出的 bw-dev.exe 跑 core 场景
#    （设置保存 → 杀壳 → 重启）→ 静默卸载。
# 4. 独立读回：被测 setup 文件现场算 SHA-256，与 pack-result.json 记录比对（有记录时）；
#    往返断言由 core.mjs 读回 settings.toml 与重启界面；卸载后递归枚举读回：目录消失
#    或仅剩空目录壳（delete-pending 时序，如实记录）算清干净，内容级残留即失败。
# 5. 证据：setup-identity.json（被测包身份）、install.log、desktop/ 子目录（core 场景
#    全部证据）、uninstall-readback.json。
# 6. 清理：只卸/只删本次安装目录（临时目录名含本次 GUID）；desktop.ps1 自清其进程与目录。
param(
    [Parameter(Mandatory=$true)][string]$Version,
    [Parameter(Mandatory=$true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\install.ps1')
$Utf8 = New-Object Text.UTF8Encoding($false)
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$OutDir = [IO.Path]::GetFullPath($OutDir)
if (-not (Test-Path -LiteralPath $OutDir -PathType Container)) { throw 'The caller must create the output directory' }
if (Test-Path -LiteralPath (Join-Path $OutDir 'result.json')) { throw 'Refusing to overwrite an existing E2E result' }

$artifactDir = Join-Path $Root ".bw\release\out\$Version"
$setupName = "BuildersWorkbench-$Version-Setup.exe"
$setup = Join-Path $artifactDir $setupName
$installDir = Join-Path ([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) "bw-installer-e2e-$([Guid]::NewGuid().ToString('N'))"
$Names = @('settings-restart-roundtrip', 'installer-uninstall-clean')
$Cases = New-Object 'System.Collections.Generic.List[object]'
$Failure = $null
$installed = $false

function Save-Json($File, $Value) {
    [IO.File]::WriteAllText((Join-Path $OutDir $File), ($Value | ConvertTo-Json -Depth 12), $Utf8)
}

try {
    if (-not (Test-Path -LiteralPath $setup) -or (Get-Item -LiteralPath $setup).Length -le 0) {
        throw "候选包不在：$setup（先出包：.bw\release\pack\pack.cmd --version $Version --workdir $Root）"
    }
    # 被测包身份：现场算哈希；出包记录在场则逐字比对——验的是「记录里那个包」。
    $setupSha = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLower()
    $identity = [ordered]@{ version = $Version; artifact = $setupName; sha256 = $setupSha; bytes = (Get-Item -LiteralPath $setup).Length }
    $packResultFile = Join-Path $artifactDir 'pack-result.json'
    if (Test-Path -LiteralPath $packResultFile) {
        $packResult = Get-Content -LiteralPath $packResultFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $identity.pack_result = $packResult
        if (-not $packResult.sha256) { throw '出包记录缺 sha256，无法核对被测包身份' }
        if ($packResult.sha256 -ne $setupSha) {
            throw "候选包哈希与出包记录不一致：记录 $($packResult.sha256)，现场 $setupSha"
        }
    }
    Save-Json 'setup-identity.json' $identity

    $installLog = Join-Path $OutDir 'install.log'
    $exe = Invoke-BwSilentSetup $setup $installDir $installLog
    if (-not (Test-Path -LiteralPath $exe)) {
        $hint = '静默安装之后没有 bw-dev.exe'
        if (Test-BwClaudeHint $installLog) { $hint = '未找到 Claude Code。请先 npm 全局安装 @anthropic-ai/claude-code。' }
        throw $hint
    }
    $installed = $true

    # 真壳往返：复用 desktop.ps1 core 场景，-Exe 指向装出来的壳；证据落 desktop/ 子目录。
    $desktopOut = Join-Path $OutDir 'desktop'
    New-Item -ItemType Directory -Force -Path $desktopOut | Out-Null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'desktop.ps1') -Exe $exe -OutDir $desktopOut -Scenario core
    $desktopExit = $LASTEXITCODE
    $desktopResult = Get-Content -LiteralPath (Join-Path $desktopOut 'result.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($c in $desktopResult.cases) {
        $evidence = @('setup-identity.json') + @($c.evidence | ForEach-Object { "desktop/$_" })
        # path/expect 是可选人读字段：desktop.ps1 的 not_run 兜底不带它们，
        # null 会被 verify 判成「出现但非字符串」，只在有值时转发。
        $case = [ordered]@{ id = $c.id; title = $c.title; status = $c.status; message = "$($c.message)"; evidence = $evidence }
        if ($c.path) { $case.path = "$($c.path)" }
        if ($c.expect) { $case.expect = "$($c.expect)" }
        $Cases.Add($case)
    }
    if ($desktopExit -ne 0 -and -not $Failure) { $Failure = "装出的壳往返没过：$($desktopResult.error)" }
} catch {
    if (-not $Failure) { $Failure = $_.Exception.Message }
} finally {
    $removed = $false
    $forced = $false
    $residue = @()
    $emptyShell = $false
    $uninstallError = $null
    if ($installed -or (Test-Path -LiteralPath $installDir)) {
        try {
            # 判据（与出包校验相分层，语义在 helper 注释与 ADR 0005）：卸载器自己清走
            # 全部内容=最干净；仅剩空目录壳（delete-pending）且兜底有界重试清空=算过并
            # 如实记录；内容级残留、目录清不空、枚举不了残留=失败。
            $un = Invoke-BwSilentUninstall $installDir
            $removed = [bool]$un.uninstallerClean
            $forced = [bool]$un.forcedCleanup
            $residue = @($un.residue)
            $emptyShell = [bool]$un.emptyDirectoryLeft
            $residueUnknown = [bool]$un.residueUnknown
            if ($residueUnknown) {
                $uninstallError = '无法枚举安装目录残留，不能证明卸干净'
            } elseif ($residue.Count -gt 0) {
                $uninstallError = "卸载器结束后仍有内容残留（$(if ($forced) { '兜底强删已清' } else { '强删也失败' })）：$($residue -join '、')"
            } elseif (-not $removed -and -not $forced) {
                $uninstallError = "空目录壳在兜底有界重试内仍删不掉（delete-pending 超时）：$installDir"
            }
        } catch { $uninstallError = $_.Exception.Message }
        if ($installed) {
            $status = if ($removed -or ($emptyShell -and $forced)) { 'passed' } else { 'failed' }
            $note = if ($removed) { '' } elseif ($emptyShell -and $forced) { '卸载器清走全部内容；仅剩空目录壳（Windows delete-pending 时序），兜底有界重试清除并读回' } else { "$($uninstallError)" }
            $Cases.Add([ordered]@{
                    id = 'installer-uninstall-clean'; title = '卸载读回：卸载器清走装的全部内容'
                    path = '静默卸载 → 条件读回等待 → 目录与残留递归枚举读回'; expect = '目录消失，或仅剩空目录壳且兜底清空（如实记录）；内容级残留或目录清不空即失败'
                    status = $status; message = $note; evidence = @('uninstall-readback.json')
                })
        }
    }
    Save-Json 'uninstall-readback.json' ([ordered]@{ installDir = $installDir; uninstallerClean = $removed; emptyDirectoryLeft = $emptyShell; forcedCleanup = $forced; residue = $residue; residueUnknown = $residueUnknown; error = $uninstallError })
    foreach ($Name in $Names) {
        if (-not ($Cases | Where-Object { $_.id -eq $Name })) {
            $Cases.Add([ordered]@{ id = $Name; title = $Name; status = 'not_run'; message = $Failure; evidence = @() })
        }
    }
    Save-Json 'result.json' ([ordered]@{ v = 1; cases = @($Cases.ToArray()); error = $Failure })
}
if ($Failure -or ($Cases | Where-Object { $_.status -ne 'passed' })) {
    if ($Failure) { Write-Error $Failure -ErrorAction Continue }
    exit 1
}
exit 0
