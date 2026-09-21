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

# 运行静默卸载并区分结果语义（两个调用方——出包校验相与 E2E 验包用例——消费同一份）：
#   uninstallerClean  卸载器自己清走目录（最干净）
#   emptyDirectoryLeft 卸载器清走全部文件、仅剩目录壳（含空子目录；Windows
#                     delete-pending：Defender 等持句柄的文件删除后进入挂起态，
#                     枚举不可见，目录壳要等句柄关闭才可删，Inno 不重试）
#   residue           文件级残留明细（递归只数文件；目录壳归空壳档不算内容残留）；
#                     枚举报错不丢已见明细，按是否出过错置 residueUnknown——
#                     「枚举不了」不得当「空」
#   forcedCleanup     兜底强删（含对目录壳的有界重试）后目录已消失
# 返回 [ordered] 哈希表；调用方必须捕获返回值，否则会进 stdout 污染 JSONL 协议流。
function Invoke-BwSilentUninstall([string]$dir) {
    $r = [ordered]@{ uninstallerClean = $false; emptyDirectoryLeft = $false; forcedCleanup = $false; residue = @(); residueUnknown = $false }
    if (-not (Test-Path -LiteralPath $dir)) { $r.uninstallerClean = $true; $r.forcedCleanup = $true; return $r }
    $unins = Get-ChildItem -LiteralPath $dir -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($unins) {
        cmd.exe /c ('start /wait "" "' + $unins.FullName + '" /VERYSILENT /NORESTART') | Out-Null
        # Inno 卸载器会复制到临时目录再自跑，start /wait 返回不等于卸完：条件读回等待。
        # 上限 120s；无文件可数（空壳）连续 10s 即提前收敛（句柄关闭前目录删不掉，
        # 再等不会变化，交给兜底有界重试）。
        $deadline = (Get-Date).AddSeconds(120)
        $emptySince = $null
        while ((Test-Path -LiteralPath $dir) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
            $hasFiles = Get-ChildItem -LiteralPath $dir -Recurse -Force -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($null -eq $hasFiles) {
                if (-not $emptySince) { $emptySince = Get-Date }
                elseif (((Get-Date) - $emptySince).TotalSeconds -ge 10) { break }
            } else { $emptySince = $null }
        }
    }
    $r.uninstallerClean = -not (Test-Path -LiteralPath $dir)
    if ($r.uninstallerClean) { $r.forcedCleanup = $true; return $r }
    # 枚举与判定之间卸载器收尾可能刚把目录删掉：出错先复核存在性，
    # 目录已消失=最干净结局，不得误记成 unknown。
    $ev = $null
    $prefixLen = $dir.TrimEnd('\').Length
    $r.residue = @(Get-ChildItem -LiteralPath $dir -Recurse -Force -File -ErrorAction SilentlyContinue -ErrorVariable ev |
            ForEach-Object { $_.FullName.Substring([Math]::Min($prefixLen, $_.FullName.Length)) })
    if (-not (Test-Path -LiteralPath $dir)) {
        $r.uninstallerClean = $true; $r.forcedCleanup = $true; $r.residue = @(); $r.residueUnknown = $false
        return $r
    }
    if ($ev) { $r.residueUnknown = $true }
    $r.emptyDirectoryLeft = (-not $r.residueUnknown) -and ($r.residue.Count -eq 0)
    # 兜底强删：delete-pending 的目录壳此刻可能仍删不掉，有界重试 60s（句柄关闭即成功）。
    $retryDeadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $retryDeadline) {
        if (-not (Test-Path -LiteralPath $dir)) { break }
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    $r.forcedCleanup = -not (Test-Path -LiteralPath $dir)
    return $r
}

# 安装器因缺 Claude Code 拒装时，安装日志里有对应文案；给人话提示用。
function Test-BwClaudeHint([string]$log) {
    return ((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -Pattern 'Claude Code' -SimpleMatch -Quiet -ErrorAction SilentlyContinue))
}
