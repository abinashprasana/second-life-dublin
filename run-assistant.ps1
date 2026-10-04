param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $PythonPath) {
    $venvPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    if (Test-Path -LiteralPath $venvPython) { $PythonPath = $venvPython }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { $PythonPath = (Get-Command python).Source }
    else { throw 'Python was not found. Pass -PythonPath with the path to your Python executable.' }
}
$localDependencies = @('.assistant-deps', '.deps') | ForEach-Object { Join-Path $PSScriptRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
if ($localDependencies.Count -gt 0) { $env:PYTHONPATH = ($localDependencies -join ';') + ';' + $env:PYTHONPATH }
Write-Host 'Opening the local service at http://127.0.0.1:8765. Keep this terminal running.'
& $PythonPath -m src.assistant_api
