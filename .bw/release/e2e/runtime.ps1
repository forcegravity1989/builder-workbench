param([switch]$InstallMissing)
$ErrorActionPreference = 'Stop'
# Microsoft documents these two keys for the x64 Evergreen WebView2 runtime.
function Find-Runtime {
    foreach ($Hive in @('HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node', 'HKEY_CURRENT_USER\Software')) {
        $Key = "$Hive\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        $Version = [Microsoft.Win32.Registry]::GetValue($Key, 'pv', $null)
        if ($Version -and $Version -ne '0.0.0.0') { return [ordered]@{ registry = $Key; version = [string]$Version } }
    }
    return $null
}
$Runtime = Find-Runtime
if (-not $Runtime -and $InstallMissing) {
    $Bootstrap = Join-Path ([IO.Path]::GetTempPath()) ('bw-webview-' + [Guid]::NewGuid().ToString('N') + '.exe')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $Bootstrap
        $Signature = Get-AuthenticodeSignature -LiteralPath $Bootstrap
        if ($Signature.Status -ne 'Valid' -or $Signature.SignerCertificate.Subject -notlike '*Microsoft Corporation*') { throw 'WebView2 bootstrapper signature is not valid Microsoft code signing' }
        $Installer = Start-Process -FilePath $Bootstrap -ArgumentList '/silent','/install' -WindowStyle Hidden -PassThru
        if (-not $Installer.WaitForExit(240000)) { throw 'WebView2 installation did not finish within four minutes' }
        if ($Installer.ExitCode -ne 0) { throw "WebView2 bootstrapper exit code: $($Installer.ExitCode)" }
        $Runtime = Find-Runtime
    } finally { if (Test-Path -LiteralPath $Bootstrap) { Remove-Item -LiteralPath $Bootstrap -Force } }
}
if (-not $Runtime) { throw 'WebView2 Runtime is missing. Install the Microsoft Evergreen runtime; Microsoft Edge Stable is not a substitute.' }
$Runtime | ConvertTo-Json -Compress
