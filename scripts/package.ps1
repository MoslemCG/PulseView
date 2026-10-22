param([ValidateSet('Debug','Release')][string]$Configuration='Release')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
 $destination=Join-Path $root 'out/package/PulseView'
 if(Test-Path $destination){Remove-Item -LiteralPath $destination -Recurse -Force}
 & cmake --install out/build/windows-x64 --config $Configuration --prefix $destination
 if($LASTEXITCODE -ne 0){throw 'Install/staging failed. Build the project first.'}
 $zip=Join-Path $root 'out/PulseView-Windows-x64.zip'
 Compress-Archive -Path $destination -DestinationPath $zip -Force
 Write-Host "Application package: $zip"
 Write-Host 'End users need WebView2 Evergreen x64 Runtime and the Microsoft Visual C++ x64 redistributable. Neither is silently installed.'
}finally{Pop-Location}
