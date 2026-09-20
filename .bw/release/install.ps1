# 静默装/卸共享 helper（ADR-0005）。出包的「静默装校验」相与 installer 验包用例
# （e2e/installer.ps1）共用同一份实现，不造第二套装卸逻辑。
# /VERYSILENT + cmd start /wait：不弹向导、不抢前台、装完即返回。
function Invoke-BwSilentSetup([string]$setupExe, [string]$dir, [string]$log) {
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

# 运行静默卸载并区分两段结果：卸载器自己是否清干净（判据）、强删是否兜底成功
# （仅清理用，不算判据——否则「能卸干净」的证明被强删掩盖）。residue 记录卸载器
# 没清掉的明细：Defender 实时扫描会短暂锁住新装文件，Inno 静默卸载跳过且不重试。
# 返回 [ordered]@{ uninstallerClean; forcedCleanup; residue }；调用方必须捕获返回值，
# 否则哈希表会进 stdout 污染 JSONL 协议流。
function Invoke-BwSilentUninstall([string]$dir) {
    $r = [ordered]@{ uninstallerClean = $false; forcedCleanup = $false; residue = @() }
    if (-not (Test-Path -LiteralPath $dir)) { $r.uninstallerClean = $true; $r.forcedCleanup = $true; return $r }
    $unins = Get-ChildItem -LiteralPath $dir -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($unins) {
        cmd.exe /c ('start /wait "" "' + $unins.FullName + '" /VERYSILENT /NORESTART') | Out-Null
        # Inno 卸载器会复制到临时目录再自跑，start /wait 返回不等于卸完：条件读回等待。
        # 上限 120s——Defender 实时扫描与低内存会显著拖慢自拷贝清理。
        $deadline = (Get-Date).AddSeconds(120)
        while ((Test-Path -LiteralPath $dir) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    }
    $r.uninstallerClean = -not (Test-Path -LiteralPath $dir)
    if ($r.uninstallerClean) {
        $r.forcedCleanup = $true
    } else {
        $prefixLen = $dir.TrimEnd('\').Length
        $r.residue = @(Get-ChildItem -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue |
                ForEach-Object { $_.FullName.Substring([Math]::Min($prefixLen, $_.FullName.Length)) })
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        $r.forcedCleanup = -not (Test-Path -LiteralPath $dir)
    }
    return $r
}

# 安装器因缺 Claude Code 拒装时，安装日志里有对应文案；给人话提示用。
function Test-BwClaudeHint([string]$log) {
    return ((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -Pattern 'Claude Code' -SimpleMatch -Quiet -ErrorAction SilentlyContinue))
}
