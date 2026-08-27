; ──────────────────────────────────────────────────────────────────────────
; Builders' Workbench · MVP 包（0.1.0-mvp，替 V3 0.3.0-v3）
; ──────────────────────────────────────────────────────────────────────────
; 本文件是 BW 出包脚本正源，已入 workbench 仓（packaging/）。用本机 Inno
; Setup 7 的 ISCC 从仓根编译：
;   "<InnoSetup>\ISCC.exe" packaging\BuildersWorkbench-MVP.iss
;
; AppId 复用 V3 的 GUID —— 同 GUID + 同目录 = 装 MVP 自动卸 V3（升级替换）。
;
; ── 出包旅程（出包人照做，只吃「clone + cargo + 装过 buddy」必然有的东西）────
; 1) 构建：在仓根 cargo build --release -p app-shell。出 target\release\bw-dev.exe，
;    build.rs 已把 app.ico 嵌进 exe（GNU 走 windres + 强制收入 resource.o，MSVC
;    走 rc）。可抽验 exe 的 .rsrc 段含 RT_ICON（类型 3），没嵌进去就别出包。
; 2) 把 WebView2Loader.dll 拷到稳定路径（hash 子目录不稳定，.iss 不直接取）：
;      cp target/release/build/webview2-com-sys-*/out/x64/WebView2Loader.dll target/release/
; 3) codehub-cli（可选）：默认从 %USERPROFILE%\bin\codehub-cli.exe 取（装过
;    buddy 就有）；不在就用 BW_CODEHUB_CLI_SRC 环境变量指一个；都没有则告警
;    跳过、不阻断（buddy 运行不依赖它进包——出包机该有就有）。
; 4) 跑 ISCC：cd packaging && "<InnoSetup>\ISCC.exe" BuildersWorkbench-MVP.iss
;    setup.exe 落到 packaging\output\（.gitignore 忽略，不进仓）。
;
; 所有 Source 都走仓内相对路径（..\target\release\ 或同目录），不依赖任何仓外暂存目录。
; ──────────────────────────────────────────────────────────────────────────

#define MyAppName "Builders' Workbench"
#define MyAppVersion "0.1.0-mvp"
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
OutputDir=output
OutputBaseFilename=BuildersWorkbench-MVP-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
ChangesEnvironment=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
; 图标取仓内 crates/app-shell/app.ico（与 bw-dev.exe 嵌的同一份），相对 .iss。
SetupIconFile=..\crates\app-shell\app.ico
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
Source: "..\target\release\bw-dev.exe"; DestDir: "{app}"; Flags: ignoreversion
; WebView2Loader.dll：cargo 依赖 webview2-com-sys 编译时落到带 hash 的 build 子目录
; （target\release\build\webview2-com-sys-*\out\x64\，hash 不稳定）。出包旅程里先
; 把它拷到 target\release\WebView2Loader.dll（稳定路径），这里从那取。
Source: "..\target\release\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
; codehub-cli：编译期判存在，有才带（来源见 #define CodehubCliSrc）。
#if FileExists(CodehubCliSrc)
Source: "{#CodehubCliSrc}"; DestDir: "{%USERPROFILE}\bin"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
#else
  ; codehub-cli 未找到（找过 BW_CODEHUB_CLI_SRC 与 %USERPROFILE%\bin\codehub-cli.exe），跳过。
  ; 出包机装过 buddy 默认有；真没有也不阻断打包，buddy 运行不依赖它进包。
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

function ClaudeExePath: String;
begin
  Result := ExpandConstant('{userappdata}\{#ClaudeExeRel}');
end;

function ClaudeCmdPath: String;
begin
  Result := ExpandConstant('{userappdata}\{#ClaudeCmdRel}');
end;

function GetClaudeBin(Param: String): String;
begin
  if FileExists(ClaudeExePath) then
    Result := ClaudeExePath
  else if FileExists(ClaudeCmdPath) then
    Result := ClaudeCmdPath
  else
    Result := ClaudeExePath;
end;

function ClaudeExists: Boolean;
begin
  Result := FileExists(ClaudeExePath) or FileExists(ClaudeCmdPath);
end;

function InitializeSetup: Boolean;
begin
  if not ClaudeExists then
  begin
    MsgBox('未找到 Claude Code。' #13#13
      '请先 npm 全局安装 @anthropic-ai/claude-code，再运行本安装包。' #13#13
      '终端里 claude --version 能过即可。安装器认：' #13#13
      '1. ' + ClaudeExePath + #13
      '2. ' + ClaudeCmdPath + #13#13
      '有 cmd、没有 exe 也能装；buddy 开工会走 cmd.exe /c。', mbError, MB_OK);
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
      'codehub-cli：%USERPROFILE%\bin\codehub-cli.exe（卸载 buddy 时不会删它）';
  end;
end;
