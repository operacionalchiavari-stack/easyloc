param([string]$Horario = '03:00')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskNode = (Get-Command node).Source
$taskLogDir = Join-Path $taskRoot '.backups'
New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
$taskRunner = Join-Path $PSScriptRoot 'executar-backup.ps1'
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $taskRunner + '" -Node "' + $taskNode + '"') -WorkingDirectory $taskRoot
$taskTrigger = New-ScheduledTaskTrigger -Daily -At $Horario
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Acervo - backup operacional verificado' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Force | Out-Null
Write-Output ('Backup diário agendado para ' + $Horario + '. Executa com este usuário conectado; tarefas perdidas iniciam quando possível.')
