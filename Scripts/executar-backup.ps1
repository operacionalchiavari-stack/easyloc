param([string]$Node = 'node')
$ErrorActionPreference = 'Stop'
$backupRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $backupRoot
& $Node (Join-Path $PSScriptRoot 'backup-operacional.cjs')
exit $LASTEXITCODE
