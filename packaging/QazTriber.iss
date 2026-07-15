#define AppName "QazTriber"
#define AppVersion "1.0.0"
#define AppPublisher "QazTriber"
#define AppExeName "QazTriber.exe"

[Setup]
AppId={{5F498AEF-59DA-484D-92D2-E0D29EC90A22}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
OutputDir=..\release
OutputBaseFilename=QazTriber-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\dist\QazTriber\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительно:"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Открыть QazTriber"; Flags: nowait postinstall skipifsilent
