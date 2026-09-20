# ADR-0005 JSONL 协议的共享实现：参数解析、版本串规则、协议行读写。
# 消费方：pack/lib.ps1（出包）、e2e/run-installer.ps1（验包适配层）。不造第二份。
# 协议行必须是原始 UTF-8 字节：CREATE_NO_WINDOW + 管道 stdout 时 Write-Output 会跟随
# OEM 代码页（中文 Windows 上是 GBK），这里直接写标准输出流。
function Write-BwLine([string]$Line) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Line + "`n"))
    $out = [Console]::OpenStandardOutput()
    $out.Write($bytes, 0, $bytes.Length)
    $out.Flush()
}

function Test-BwVersion([string]$v) {
    if ([string]::IsNullOrWhiteSpace($v)) { return $false }
    # 版本串直接进产物文件名与目录名（ADR-0005 命名规则），只收安全字符。
    # 尾锚用 \z：.NET 的 $ 会放行结尾换行符，带换行的串会漏进路径拼接。
    return $v -match '^[A-Za-z0-9][A-Za-z0-9._+-]*\z'
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
        [Nullable[bool]]$SourceUnchanged,
        [string]$PackedAt,
        [int]$Passed = -1,
        [int]$Total = -1,
        $Cases,
        [string]$PersistTo
    )
    $o = [ordered]@{ v = 1; type = 'result'; ok = $Ok }
    if ($ArtifactDir) { $o.artifact_dir = $ArtifactDir }
    if ($Artifact) { $o.artifact = $Artifact }
    if ($Sha256) { $o.sha256 = $Sha256 }
    if ($Revision) { $o.revision = $Revision }
    if ($null -ne $Dirty) { $o.dirty = [bool]$Dirty }
    if ($null -ne $SourceUnchanged) { $o.source_unchanged = [bool]$SourceUnchanged }
    if ($PackedAt) { $o.packed_at = $PackedAt }
    if ($Passed -ge 0) { $o.passed = $Passed }
    if ($Total -ge 0) { $o.total = $Total }
    if ($null -ne $Cases) { $o.cases = @($Cases) }
    if ($Code) { $o.code = $Code }
    if ($Message) { $o.message = $Message }
    $json = $o | ConvertTo-Json -Compress -Depth 6
    # 出包成功时同份记录落盘到产物目录（pack-result.json），发布绑定校验读它，
    # 不依赖操作者手工重定向 stdout。
    if ($PersistTo) { [IO.File]::WriteAllText($PersistTo, $json, (New-Object Text.UTF8Encoding($false))) }
    Write-BwLine $json
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
        Write-BwResult -Ok:$false -Code bad_args -Message ("「{0}」不像版本号。首字符须是字母或数字，其余只用字母、数字和 . _ + -（版本串直接进产物文件名与目录名），不要空或其他符号。" -f $version)
        exit 2
    }
    $full = [IO.Path]::GetFullPath($workdir)
    if (-not (Test-Path -LiteralPath $full -PathType Container)) {
        Write-BwResult -Ok:$false -Code bad_args -Message ("工作目录不在：{0}" -f $full)
        exit 2
    }
    return @{ Version = $version; Workdir = $full }
}

function Fail {
    param([string]$Code, [string]$Message, [int]$ExitCode = 1)
    Write-BwResult -Ok:$false -Code $Code -Message $Message
    exit $ExitCode
}
