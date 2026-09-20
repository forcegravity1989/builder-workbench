# e2e.cmd 的实现：验包适配层（ADR-0005）。产品「验包」按钮与手动 SOP 同一入口：
# 调统一验证入口跑 installer 套件（注册于 e2e/suites/installer.json），把本次 run 的
# result.json 转译成 JSONL 协议行给 release_ship.rs。不实现第二套用例或装卸逻辑；
# 用例失败、少跑、缺证据的判定全在 verify 入口，本层只搬运与转译。
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\protocol.ps1')

$parsed = Parse-BwArgs $args
$version = $parsed.Version
$root = $parsed.Workdir

$verifyScript = Join-Path $root '.bw\release\verify\verify.mjs'
if (-not (Test-Path -LiteralPath $verifyScript)) {
    Fail e2e_failed "这份代码里没有验证入口 .bw/release/verify/verify.mjs，验包走统一入口，先补齐"
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail missing_tool '本机 PATH 里没有 node.exe' }

Write-BwProgress -Phase verify -Message ("installer 套件：{0}" -f $version)
# verify 的 stdout 逐行转 progress；stderr 并入（EAP 临时放宽，避免 NativeCommandError 打断流）。
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $root
try {
    & $node.Source $verifyScript '--profile' 'installer' '--version' $version 2>&1 |
        ForEach-Object {
            $line = "$_".Trim()
            if ($line) { Write-BwProgress -Phase verify -Message $line }
        }
    $verifyExit = $LASTEXITCODE
} finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
}

# 用 last-run 指针定位本次 run（不假设 out/verify 只有一个目录），读回 result.json 转译。
$pointer = Join-Path $root '.bw\release\out\verify\last-run.txt'
if (-not (Test-Path -LiteralPath $pointer)) { Fail e2e_failed '验证入口没有落下运行记录（last-run.txt 不在）' }
$runId = (Get-Content -LiteralPath $pointer -Raw).Trim()
if ($runId -notmatch '^[A-Za-z0-9.-]+\z') { Fail e2e_failed "运行编号不像路径段：$runId" }
$resultFile = Join-Path $root ".bw\release\out\verify\$runId\result.json"
if (-not (Test-Path -LiteralPath $resultFile)) { Fail e2e_failed "运行 $runId 缺 result.json" }
$result = Get-Content -LiteralPath $resultFile -Raw -Encoding UTF8 | ConvertFrom-Json
$step = @($result.steps | Where-Object { $_.id -eq 'installer' })[0]
if (-not $step) { Fail e2e_failed "本次运行（$runId）没有执行 installer 套件，前置步骤可能失败" }

$cases = @($step.cases | ForEach-Object {
        [ordered]@{ name = $_.id; ok = ($_.status -eq 'passed'); message = "$($_.message)" }
    })
$passed = @($cases | Where-Object { $_.ok }).Count
$total = $cases.Count
if ($verifyExit -eq 0 -and $result.status -eq 'passed' -and $step.status -eq 'passed' -and $total -gt 0 -and $passed -eq $total) {
    Write-BwResult -Ok:$true -Passed $passed -Total $total -Cases $cases
    exit 0
}
$why = if ($step.message) { "$($step.message)" } elseif ($result.status -ne 'passed') { "验证入口整体没过（run $runId）" } else { "验包 $passed/$total" }
Write-BwResult -Ok:$false -Code e2e_failed -Message $why -Passed $passed -Total $total -Cases $cases
exit 1
