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

function Invoke-BwSilentUninstall([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return }
    $unins = Get-ChildItem -LiteralPath $dir -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($unins) {
        cmd.exe /c ('start /wait "" "' + $unins.FullName + '" /VERYSILENT /NORESTART') | Out-Null
        Start-Sleep -Seconds 2
    }
    Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}

# 安装器因缺 Claude Code 拒装时，安装日志里有对应文案；给人话提示用。
function Test-BwClaudeHint([string]$log) {
    return ((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -Pattern 'Claude Code' -SimpleMatch -Quiet -ErrorAction SilentlyContinue))
}
