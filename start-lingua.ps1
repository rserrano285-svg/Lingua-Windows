$ErrorActionPreference = "Stop"
$env:PYTHONDONTWRITEBYTECODE = "1"

$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\pythonw.exe"
if (-not (Test-Path -LiteralPath $python)) {
    $python = Join-Path $projectRoot ".venv\Scripts\python.exe"
}
$appUrl = "http://127.0.0.1:5000/"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Lingua's Python environment is missing. Follow the setup steps in README.md first."
}

$isRunning = $false
try {
    $response = Invoke-WebRequest -Uri $appUrl -TimeoutSec 2 -UseBasicParsing
    $isRunning = $response.Content.Contains("<title>Lingua")
} catch {
    $isRunning = $false
}

if (-not $isRunning) {
    $server = Start-Process `
        -FilePath $python `
        -ArgumentList @("app.py") `
        -WorkingDirectory $projectRoot `
        -PassThru `
        -WindowStyle Hidden

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        if ($server.HasExited) {
            throw "Lingua stopped while starting. Check the server window for the error."
        }

        try {
            $response = Invoke-WebRequest -Uri $appUrl -TimeoutSec 2 -UseBasicParsing
            if ($response.Content.Contains("<title>Lingua")) {
                $isRunning = $true
                break
            }
        } catch {
            $isRunning = $false
        }
    }

    if (-not $isRunning) {
        throw "Lingua did not respond at $appUrl. Check the server window for the error."
    }
}

Start-Process $appUrl
