param([ValidateSet('Debug','Release')][string]$Configuration='Release',[switch]$SafeMode)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$exe=Join-Path $root "out/build/windows-x64/bin/$Configuration/PulseView.exe"
if (-not (Test-Path $exe)) { throw 'Build first: .\scripts\build.ps1 -Configuration Release' }
$args=@(); if($SafeMode){$args+='--safe-mode'}
if($args.Count){Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $args}
else{Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)}
