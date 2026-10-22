#ifndef AppVersion
  #error AppVersion must be supplied by build-installer.ps1
#endif
#ifndef StageDir
  #error StageDir is required
#endif
#ifndef DepsDir
  #error DepsDir is required
#endif
#ifndef OutputPath
  #error OutputPath is required
#endif

[Setup]
AppId={{CCDAA2BA-A3C5-40C6-A48E-FEB101B6040D}
AppName=PulseView
AppVersion={#AppVersion}
AppVerName=PulseView {#AppVersion}
AppPublisher=PulseView contributors
AppPublisherURL=https://github.com/MoslemCG/PulseView
AppSupportURL=https://github.com/MoslemCG/PulseView/issues
AppUpdatesURL=https://github.com/MoslemCG/PulseView/releases
DefaultDirName={localappdata}\Programs\PulseView
DefaultGroupName=PulseView
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
MinVersion=10.0.22000
OutputDir={#OutputPath}
OutputBaseFilename=PulseView-Setup-x64
SetupIconFile=..\..\native\app.ico
UninstallDisplayIcon={app}\PulseView.exe
LicenseFile={#StageDir}\LICENSE
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#DepsDir}\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{group}\PulseView"; Filename: "{app}\PulseView.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\PulseView"; Filename: "{app}\PulseView.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\PulseView.exe"; Description: "Launch PulseView"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2(): Boolean;
var
  Version: String;
begin
  Result := (RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
  if not Result then
    Result := (RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  if not HasWebView2() then begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      Result := 'Could not start Microsoft WebView2 setup. Install WebView2 and try again.'
    else if not HasWebView2() then
      Result := 'Microsoft WebView2 is required. Connect to the Internet, install WebView2, then run PulseView Setup again.';
  end;
end;
