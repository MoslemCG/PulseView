param([switch]$VerifyOnly)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$version=(Get-Content (Join-Path $root 'package.json') -Raw|ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid package version.'}
$target=[IO.Path]::GetFullPath((Join-Path $root 'out/build/ninja-release/bin'))
$outRoot=[IO.Path]::GetFullPath((Join-Path $root 'out'))+[IO.Path]::DirectorySeparatorChar
if(-not $target.StartsWith($outRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe runtime destination.'}
$work=Join-Path $root ('out/local-release/'+$version+'/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force|Out-Null
$base="https://github.com/MoslemCG/PulseView/releases/download/v$version"
$zip=Join-Path $work 'PulseView-Portable-x64.zip'
$sums=Join-Path $work 'SHA256SUMS.txt'
Invoke-WebRequest "$base/PulseView-Portable-x64.zip" -OutFile $zip
Invoke-WebRequest "$base/SHA256SUMS.txt" -OutFile $sums
$line=@(Get-Content $sums|Where-Object {$_ -match '^([A-Fa-f0-9]{64})\s+\*?PulseView-Portable-x64\.zip$'})
if($line.Count -ne 1){throw 'Portable checksum is missing or ambiguous.'}
$expected=($line[0] -split '\s+')[0].ToLowerInvariant()
if((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected){throw 'Downloaded release checksum mismatch.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
try{
 foreach($entry in $archive.Entries){
  $name=$entry.FullName.Replace('\','/')
  if(-not $name.StartsWith('PulseView/') -or $name -match '(^|/)\.\.(/|$)|:|^/'){throw 'Unsafe archive entry.'}
 }
}finally{$archive.Dispose()}
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $work 'expanded')
$source=Join-Path $work 'expanded/PulseView'
$exe=Join-Path $source 'PulseView.exe'
if((Get-Item $exe).VersionInfo.ProductVersion -cne $version){throw 'Release executable version mismatch.'}
$uiVersion=Get-Content (Join-Path $source 'ui/core/version.js') -Raw
if($uiVersion -notmatch ([regex]::Escape("'$version'"))){throw 'Release UI version mismatch.'}
foreach($required in @('ui/index.html','msvcp140.dll','vcruntime140.dll','START-HERE.txt')){
 if(-not(Test-Path -LiteralPath (Join-Path $source $required))){throw "Incomplete release: $required"}
}
$files=@(Get-ChildItem -LiteralPath $source -Recurse -File)
function Assert-IdenticalRuntime {
 foreach($file in $files){
  $relative=[IO.Path]::GetRelativePath($source,$file.FullName)
  $installed=Join-Path $target $relative
  if(-not(Test-Path -LiteralPath $installed) -or (Get-FileHash -LiteralPath $installed).Hash -cne (Get-FileHash -LiteralPath $file.FullName).Hash){throw "Installed release differs: $relative"}
 }
 $sourceUi=@(Get-ChildItem -LiteralPath (Join-Path $source 'ui') -Recurse -File)
 $targetUi=@(Get-ChildItem -LiteralPath (Join-Path $target 'ui') -Recurse -File)
 if($sourceUi.Count -ne $targetUi.Count){throw 'Installed UI contains extra files.'}
}
if(-not $VerifyOnly){
 if(Get-Process -Name PulseView -ErrorAction SilentlyContinue){throw 'Close PulseView normally, then rerun. No files were replaced.'}
 if(Test-Path -LiteralPath $target){
  if(Get-ChildItem -LiteralPath $target -Recurse -Attributes ReparsePoint){throw 'Runtime contains a linked path; refusing replacement.'}
 }
 $backup=Join-Path $root ('.local/runtime-backups/'+(Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
 New-Item -ItemType Directory -Path $backup -Force|Out-Null
 if(Test-Path -LiteralPath $target){
  Get-ChildItem -LiteralPath $target -Force|Copy-Item -Destination $backup -Recurse -Force
 }
 $targetUi=[IO.Path]::GetFullPath((Join-Path $target 'ui'))
 if(-not $targetUi.StartsWith($outRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe UI replacement path.'}
 # Backup is complete before replacing the UI tree, including obsolete assets.
 try{
  if(Test-Path -LiteralPath $targetUi){Remove-Item -LiteralPath $targetUi -Recurse -Force}
  New-Item -ItemType Directory -Path $target -Force|Out-Null
  Get-ChildItem -LiteralPath $source -Force|Copy-Item -Destination $target -Recurse -Force
  Assert-IdenticalRuntime
 }catch{
  if(Test-Path -LiteralPath $targetUi){Remove-Item -LiteralPath $targetUi -Recurse -Force}
  Get-ChildItem -LiteralPath $backup -Force|Copy-Item -Destination $target -Recurse -Force
  throw
 }
 Write-Host "Previous runtime backed up to $backup"
}
Assert-IdenticalRuntime
@{version=$version;release="v$version";archiveSha256=$expected;verifiedFiles=$files.Count;target=$target}|ConvertTo-Json|Set-Content (Join-Path $root 'out/local-release/installed.json') -Encoding utf8
Write-Host "Verified PulseView ${version}: all $($files.Count) distributed files match the published GitHub release."
