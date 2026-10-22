param([string]$Compiler='')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $root 'out/package/PulseView'
$deps=Join-Path $root 'out/deps/installer'
New-Item -ItemType Directory -Path $deps -Force | Out-Null
if(-not(Test-Path (Join-Path $stage 'PulseView.exe'))){throw 'Run scripts/package.ps1 first.'}
if(-not $Compiler){
  $known=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
  if(Test-Path $known){$Compiler=$known}else{
    $command=Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if($command){$Compiler=$command.Source}else{throw 'Inno Setup 6 is required to build Setup (not to run PulseView).'}
  }
}
$bootstrap=Join-Path $deps 'MicrosoftEdgeWebview2Setup.exe'
if(-not(Test-Path $bootstrap)){
  Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap
}
$signature=Get-AuthenticodeSignature -LiteralPath $bootstrap
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){
  throw 'WebView2 bootstrapper must have a valid Microsoft signature.'
}
$version=(Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
& $Compiler "/DAppVersion=$version" "/DStageDir=$stage" "/DDepsDir=$deps" "/DOutputPath=$(Join-Path $root 'out')" (Join-Path $PSScriptRoot 'installer/PulseView.iss')
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed.'}
$files=@('PulseView-Setup-x64.exe','PulseView-Portable-x64.zip')
$lines=foreach($name in $files){$hash=Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "out/$name");"$($hash.Hash.ToLowerInvariant())  $name"}
$lines|Set-Content (Join-Path $root 'out/SHA256SUMS.txt') -Encoding ascii
Write-Host "Built PulseView $version Setup, portable ZIP and SHA256SUMS.txt"
