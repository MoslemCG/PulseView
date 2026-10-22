# Run on a disposable Windows 11 / Server 2025 CI machine, never a user's install.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP){throw 'This install/uninstall smoke is GitHub-CI-only.'}
$target=Join-Path $env:RUNNER_TEMP 'PulseView-install-smoke'
if(Test-Path $target){throw 'Smoke destination already exists; refusing to alter it.'}
$installer=Join-Path $root 'out/PulseView-Setup-x64.exe'
$log=Join-Path $env:RUNNER_TEMP 'PulseView-install.log'
$p=Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$target`"","/LOG=`"$log`"") -Wait -PassThru -WindowStyle Hidden
if($p.ExitCode -ne 0){Get-Content $log -ErrorAction SilentlyContinue;throw "Setup failed: $($p.ExitCode)"}
$version=(Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
foreach($file in @('PulseView.exe','ui/index.html','ui/core/version.js','msvcp140.dll','vcruntime140.dll','unins000.exe')){
  if(-not(Test-Path (Join-Path $target $file))){throw "Installed file missing: $file"}
}
if((Get-Item (Join-Path $target 'PulseView.exe')).VersionInfo.ProductVersion -ne $version){throw 'Installed version mismatch.'}
# Verify uninstall leaves user data outside the installation untouched.
$data=Join-Path $env:LOCALAPPDATA 'PulseView'
New-Item -ItemType Directory -Path $data -Force | Out-Null
$marker=Join-Path $data 'installer-smoke-preserve.txt'
if(Test-Path $marker){throw 'Unexpected pre-existing marker.'}
'synthetic CI preservation check'|Set-Content $marker
$p=Start-Process -FilePath (Join-Path $target 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru -WindowStyle Hidden
if($p.ExitCode -ne 0){throw 'Uninstall failed.'}
if(Test-Path (Join-Path $target 'PulseView.exe')){throw 'Uninstall left executable behind.'}
if(-not(Test-Path $marker)){throw 'Uninstall removed user data.'}
Write-Host "Installer smoke passed for $version; install, version and uninstall/data preservation verified."
