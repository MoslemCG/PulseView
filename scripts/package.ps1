param([ValidateSet('Debug','Release')][string]$Configuration='Release', [string]$BuildDirectory='out/build/windows-x64')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
 $destination=Join-Path $root 'out/package/PulseView'
 $outRoot=[IO.Path]::GetFullPath((Join-Path $root 'out'))+[IO.Path]::DirectorySeparatorChar
 $destination=[IO.Path]::GetFullPath($destination)
 if(-not $destination.StartsWith($outRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe staging destination.'}
 $build=[IO.Path]::GetFullPath((Join-Path $root $BuildDirectory))
 if(-not $build.StartsWith($outRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Build directory must be inside out/.'}
 if(Test-Path $destination){Remove-Item -LiteralPath $destination -Recurse -Force}
 & cmake --install $build --config $Configuration --prefix $destination
 if($LASTEXITCODE -ne 0){throw 'Install/staging failed. Build the project first.'}
 foreach($required in @('PulseView.exe','ui/index.html','ui/core/version.js','msvcp140.dll','vcruntime140.dll','licenses/nlohmann-json/LICENSE.MIT','licenses/WebView2/LICENSE.txt')){
   if(-not(Test-Path (Join-Path $destination $required))){throw "Missing packaged file: $required"}
 }
 $version=(Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
 if((Get-Item (Join-Path $destination 'PulseView.exe')).VersionInfo.ProductVersion -ne $version){throw 'Executable version does not match package.json.'}
 @"
PulseView $version - Windows 11 x64

Run PulseView.exe. Keep the ui folder and DLLs beside it.
No Visual Studio, CMake or Node installation is required.
Microsoft WebView2 Evergreen Runtime is required; Windows 11 usually includes it.
If missing, use the Setup edition or obtain WebView2 from:
https://developer.microsoft.com/microsoft-edge/webview2/

Your presets and settings are stored in %LOCALAPPDATA%\PulseView.
See the installed version in the footer or Help > About PulseView.
"@ | Set-Content (Join-Path $destination 'START-HERE.txt') -Encoding utf8
 $zip=Join-Path $root 'out/PulseView-Portable-x64.zip'
 Compress-Archive -Path $destination -DestinationPath $zip -Force
 Write-Host "Application package: $zip"
 Write-Host 'App-local MSVC runtime included. WebView2 Evergreen Runtime is required.'
}finally{Pop-Location}
