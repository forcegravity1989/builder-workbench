; ──────────────────────────────────────────────────────────────────────────
; Builders' Workbench · MVP 包（0.1.0-mvp，替 V3 0.3.0-v3）
; ──────────────────────────────────────────────────────────────────────────
; 正源：.bw/release/pack/BuildersWorkbench-MVP.iss
; 不要手跑 ISCC。用仓根：
;   .bw\release\pack\pack.cmd --version 0.1.0-mvp --workdir <仓根绝对路径>
;
; AppId 复用 V3 的 GUID —— 同 GUID + 同目录 = 装 MVP 自动卸 V3（升级替换）。
; 出包走 pack.cmd（预检 → cargo release → 拷 dll → ISCC → 静默装校验再卸）。
; Source 相对 .bw/release/pack/ 往上三级到仓根。产物落 .bw/release/out/<version>/。
; ──────────────────────────────────────────────────────────────────────────

#define MyAppName "Builders' Workbench"
#ifndef MyAppVersion
#define MyAppVersion "0.1.0-mvp"
#endif
#ifndef BwOutputDir
#define BwOutputDir "out"
#endif
#define MyAppExeName "bw-dev.exe"
#define ClaudeExeRel "npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"
#define ClaudeCmdRel "npm\claude.cmd"

; codehub-cli 来源：BW_CODEHUB_CLI_SRC 优先，否则默认 %USERPROFILE%\bin\codehub-cli.exe。
; 编译期判存在：有才带进包，没有就跳过（不阻断，见头注释）。
#define CodehubCliSrc GetEnv("BW_CODEHUB_CLI_SRC")
#if CodehubCliSrc == ""
  #define CodehubCliSrc GetEnv("USERPROFILE") + "\bin\codehub-cli.exe"
#endif

[Setup]
AppId={{8F3C2A91-4B6E-4D17-9C20-B7E1A5D08F42}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=Builders' Workbench
DefaultDirName=D:\BuildersWorkbench
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
OutputDir={#BwOutputDir}
OutputBaseFilename=BuildersWorkbench-MVP-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
ChangesEnvironment=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
; 图标取仓内 crates/app-shell/app.ico（与 bw-dev.exe 嵌的同一份），相对 .iss。
SetupIconFile=..\..\..\crates\app-shell\app.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Messages]
chinesesimplified.FinishedHeadingLabel=装完必做
chinesesimplified.FinishedLabel=请先读完下面几条，再点「完成」。不要只靠记事本。

[Tasks]
Name: "desktopicon"; Description: "创建桌面图标"; GroupDescription: "附加图标:"; Flags: checkedonce

[Files]
; 仓内文件（相对 .iss）：装完说明。图标已在 bw-dev.exe 自身资源（build.rs 嵌）。
Source: "AFTER-INSTALL-MVP.txt"; DestDir: "{app}"; DestName: "装完必做.txt"; Flags: ignoreversion
; cargo 构建产物（相对 .iss，target\release\）。出包人先在仓根 cargo build --release。
Source: "..\..\..\target\release\bw-dev.exe"; DestDir: "{app}"; Flags: ignoreversion
; WebView2Loader.dll：cargo 依赖 webview2-com-sys 编译时落到带 hash 的 build 子目录
; （target\release\build\webview2-com-sys-*\out\x64\，hash 不稳定）。出包旅程里先
; 把它拷到 target\release\WebView2Loader.dll（稳定路径），这里从那取。
Source: "..\..\..\target\release\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
; codehub-cli：编译期判存在，有才带（来源见 #define CodehubCliSrc）。
#if FileExists(CodehubCliSrc)
Source: "{#CodehubCliSrc}"; DestDir: "{%USERPROFILE}\bin"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
#else
  ; codehub-cli 未找到（找过 BW_CODEHUB_CLI_SRC 与 %USERPROFILE%\bin\codehub-cli.exe），跳过。
  ; 出包机装过 Workbench 默认有；真没有也不阻断打包，Workbench 运行不依赖它进包。
#endif

[Icons]
; 快捷方式用 bw-dev.exe 自身图标（build.rs 已嵌 app.ico）。
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "BW_CLAUDE_BIN"; ValueData: "{code:GetClaudeBin}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{%USERPROFILE}\bin"; Flags: preservestringtype; Check: NeedsAddUserBin

[Run]
Filename: "{cmd}"; Parameters: "/c set ""BW_CLAUDE_BIN={code:GetClaudeBin}"" && start """" ""{app}\{#MyAppExeName}"""; Description: "立即运行 Builders' Workbench"; Flags: nowait postinstall skipifsilent; Check: ClaudeExists

[Code]
var
  AfterMemo: TNewMemo;
  ClaudeSearched: Boolean;
  ClaudeFound: String;

function ClaudeExePath: String;
begin
  Result := ExpandConstant('{userappdata}\{#ClaudeExeRel}');
end;

function ClaudeCmdPath: String;
begin
  Result := ExpandConstant('{userappdata}\{#ClaudeCmdRel}');
end;

{ npm 全局前缀可自定义（npm config get prefix），默认前缀两条路径只是快速通道；
  找不到时用 where 搜 PATH 兜底（claude.exe 优先于 claude.cmd，与原偏好一致）。 }
function FindClaudeOnPath: String;
var
  Tmp, Line: String;
  Lines: TArrayOfString;
  I, Rc: Integer;
begin
  Result := '';
  Tmp := ExpandConstant('{tmp}\bw-where-claude.txt');
  if not Exec(ExpandConstant('{sys}\cmd.exe'),
      '/C where claude.exe claude.cmd > "' + Tmp + '" 2>nul',
      '', SW_HIDE, ewWaitUntilTerminated, Rc) then
    Exit;
  if not LoadStringsFromFile(Tmp, Lines) then
    Exit;
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    Line := Trim(Lines[I]);
    if (Line <> '') and FileExists(Line) then
    begin
      Result := Line;
      Break;
    end;
  end;
end;

{ 解析一次并缓存；返回空串表示本机确实没有 Claude。 }
function ResolveClaudeBin: String;
begin
  if not ClaudeSearched then
  begin
    ClaudeSearched := True;
    if FileExists(ClaudeExePath) then
      ClaudeFound := ClaudeExePath
    else if FileExists(ClaudeCmdPath) then
      ClaudeFound := ClaudeCmdPath
    else
      ClaudeFound := FindClaudeOnPath;
  end;
  Result := ClaudeFound;
end;

function GetClaudeBin(Param: String): String;
begin
  Result := ResolveClaudeBin;
  if Result = '' then
    Result := ClaudeExePath;
end;

function ClaudeExists: Boolean;
begin
  Result := ResolveClaudeBin <> '';
end;

function InitializeSetup: Boolean;
begin
  if not ClaudeExists then
  begin
    MsgBox('未找到 Claude Code。' #13#13
      '请先 npm 全局安装 @anthropic-ai/claude-code，再运行本安装包。' #13#13
      '终端里 claude --version 能过即可。安装器认：' #13#13
      '1. ' + ClaudeExePath + #13
      '2. ' + ClaudeCmdPath + #13
      '3. PATH 里 where 能找到的 claude.exe / claude.cmd（npm 自定义前缀）' #13#13
      '有 cmd、没有 exe 也能装；Workbench 开工会走 cmd.exe /c。', mbError, MB_OK);
    Result := False;
  end
  else
    Result := True;
end;

function NeedsAddUserBin: Boolean;
var
  OrigPath: String;
  BinDir: String;
begin
  BinDir := ExpandConstant('{%USERPROFILE}\bin');
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + LowerCase(BinDir) + ';', ';' + LowerCase(OrigPath) + ';') = 0;
end;

procedure InitializeWizard;
begin
  AfterMemo := TNewMemo.Create(WizardForm);
  AfterMemo.Parent := WizardForm.FinishedPage;
  AfterMemo.Left := WizardForm.FinishedLabel.Left;
  AfterMemo.Top := WizardForm.FinishedLabel.Top;
  AfterMemo.Width := WizardForm.FinishedLabel.Width;
  AfterMemo.Height := WizardForm.RunList.Top - AfterMemo.Top - ScaleY(8);
  AfterMemo.ReadOnly := True;
  AfterMemo.ScrollBars := ssVertical;
  AfterMemo.WordWrap := True;
  WizardForm.FinishedLabel.Visible := False;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedHeadingLabel.Caption := '装完必做';
    { 正文写在脚本里（Unicode 编译），不要 LoadFromFile 读 UTF-8。 }
    AfterMemo.Lines.Text :=
      'Builders'' Workbench（MVP）已装到本机。装完请先做这几步，再新建项目。' #13#10#13#10
      '1. 关掉本安装向导，从开始菜单打开「Builders'' Workbench」' #13#10
      '   （刚写入的环境变量，安装器里点「立即运行」有时带不上；开始菜单重开最稳。）' #13#10#13#10
      '2. CodeHub 登录（token，管列仓 / 开 Issue / 采指标，不管 clone）' #13#10
      '   codehub-cli -H open auth login --token <你的 token>' #13#10
      '   黄区另登：-H yellow' #13#10#13#10
      '3. SSH 公钥（clone / push 走 SSH，不走 token/HTTP）' #13#10
      '   在 CodeHub 账户里配好本机公钥。' #13#10
      '   clone 主机是 szv-open.codehub.huawei.com:2222' #13#10
      '   （和 API 主机 open.codehub.huawei.com 不是同一个，别混。）' #13#10#13#10
      '4. claude 网关' #13#10
      '   本机能跑 claude --version，且 ~/.claude.json 已指向可用网关。' #13#10
      '   安装器认 claude.exe 或 %APPDATA%\npm\claude.cmd，并写入 BW_CLAUDE_BIN。' #13#10#13#10
      '程序目录：你选的安装路径（默认 D:\BuildersWorkbench）' #13#10
      '数据与资产：D:\builders-workbench\data\（注册表/设置/会话/技能摊）' #13#10
      '工作区：D:\builders-workbench\workspaces\（项目 clone 与 worktree）' #13#10
      '（D 盘不在的机器退回 %APPDATA%\BuildersWorkbench\）' #13#10
      'codehub-cli：%USERPROFILE%\bin\codehub-cli.exe（卸载 Workbench 时不会删它）';
  end;
end;
