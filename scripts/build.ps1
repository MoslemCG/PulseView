param([ValidateSet('Debug','Release')][string]$Configuration='Release',[switch]$Run,[switch]$Offline)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
 if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { throw 'CMake 3.24+ is required. Install Visual Studio 2022 Desktop development with C++ and CMake tools.' }
 $args=@('--preset','windows-x64')
 if ($Offline) { $args+='-DPULSEVIEW_ALLOW_DOWNLOADS=OFF' }
 & cmake @args
 if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed.' }
 & cmake --build out/build/windows-x64 --config $Configuration --parallel
 if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
 & ctest --test-dir out/build/windows-x64 -C $Configuration --output-on-failure
 if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
 $exe=Join-Path $root "out/build/windows-x64/bin/$Configuration/PulseView.exe"
 Write-Host "Built: $exe"
 if ($Run) { Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) }
} finally { Pop-Location }
