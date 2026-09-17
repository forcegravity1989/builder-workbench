$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    # No browser download: these tests attach to the real WebView2 runtime.
    $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    & npm.cmd ci --ignore-scripts --registry=https://registry.npmjs.org
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
