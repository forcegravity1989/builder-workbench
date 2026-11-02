/** Build, hash and install probe share this manifest; order determines the hash. Keep erasable-only TypeScript:
 * Node build scripts import via type stripping, which rejects enums, namespaces and parameter properties. */
// Bun-era slots only: kept so a client can still launch one for rollback (design D7.1 R5).
export const ORCAD_BUN_RUNTIME_FILENAME = 'bun-runtime'
export const ORCAD_WINDOWS_BUN_RUNTIME_FILENAME = 'bun-runtime.exe'
export const ORCAD_BUILD_TARGET_FILENAME = '.build-target'
export const ORCAD_WINDOWS_PROCESS_TREE_FILENAME = 'windows-process-tree.node'
/** native/windows-security: secure-file ACLs without spawning icacls. */
export const ORCAD_WINDOWS_SECURITY_FILENAME = 'windows-security.node'
/** native/windows-cli-launcher: cmd.exe and .ps1 shims cannot carry every argv intact. */
export const ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME = 'bin/orca.exe'

export function orcadBunRuntimeFilename(target: string): string {
  return isWindowsTarget(target) ? ORCAD_WINDOWS_BUN_RUNTIME_FILENAME : ORCAD_BUN_RUNTIME_FILENAME
}

function isWindowsTarget(target: string): boolean {
  return target === 'win32' || target.startsWith('win32-')
}

/** A Node slot's server target (e.g. linux-x64-musl); `.build-target` would mark it as Bun. */
export const ORCAD_SERVER_TARGET_FILENAME = '.server-target'

/** The pinned Node executableSha256 enters the version hash here. Never ship .build-target in Node slots:
 * Bun-era selectors exit 78 without bun-runtime (design D7.1 R5). */
export const ORCAD_NODE_RUNTIME_MARKER_FILENAME = '.runtime-node'
/** Beside the slot dirs and shared across Orca versions (design D2): `runtimes/node-<sha256>/bin/node`. */
export const ORCAD_RUNTIMES_DIRNAME = 'runtimes'
export const ORCAD_NODE_RUNTIME_DIR_PREFIX = 'node-'
export const ORCAD_NODE_RUNTIME_POSIX_EXECUTABLE = 'bin/node'
// Upstream's own name and layout: renaming node.exe is the masquerading pattern EDR scores.
export const ORCAD_NODE_RUNTIME_WINDOWS_EXECUTABLE = 'node.exe'

export function orcadNodeRuntimeExecutable(target: string): string {
  return isWindowsTarget(target)
    ? ORCAD_NODE_RUNTIME_WINDOWS_EXECUTABLE
    : ORCAD_NODE_RUNTIME_POSIX_EXECUTABLE
}

/** Slot-relative path segments of the runtime a slot's marker names. */
export function orcadNodeRuntimeRelativePath(target: string, executableSha256: string): string[] {
  return [
    '..',
    ORCAD_RUNTIMES_DIRNAME,
    `${ORCAD_NODE_RUNTIME_DIR_PREFIX}${executableSha256}`,
    ...orcadNodeRuntimeExecutable(target).split('/')
  ]
}

/** N-API level the slot addons are built for; equals SLOT_NAPI_VERSION in the prebuild script. */
export const ORCAD_ADDON_NAPI_VERSION = 8

export const ORCAD_NODE_PTY_DIR = 'node_modules/node-pty'
export const ORCAD_CLI_ENTRY_FILENAME = 'out/cli/index.js'
export const ORCAD_CLI_PACKAGE_FILENAME = 'out/package.json'
// Test files and sources stay out; these are every module the runtime path requires.
export const ORCAD_NODE_PTY_JS_ARTIFACTS = [
  'package.json',
  'lib/conpty_console_list_agent.js',
  'lib/eventEmitter2.js',
  'lib/index.js',
  'lib/interfaces.js',
  'lib/shared/conout.js',
  'lib/terminal.js',
  'lib/types.js',
  'lib/unixTerminal.js',
  'lib/utils.js',
  'lib/windowsConoutConnection.js',
  'lib/windowsPtyAgent.js',
  'lib/windowsTerminal.js',
  'lib/worker/conoutSocketWorker.js'
].map((file) => `${ORCAD_NODE_PTY_DIR}/${file}`)

/** The prebuild slot's files (config/scripts/orcad-prebuild-slot-contents.mjs), relative to build/Release. */
export function orcadNodePtySlotFiles(target: string): string[] {
  if (isWindowsTarget(target)) {
    return [
      'conpty.node',
      'conpty_console_list.node',
      'conpty/conpty.dll',
      'conpty/OpenConsole.exe',
      // node-pty's winpty backend, which it selects below Windows build 18309.
      'pty.node',
      'winpty.dll',
      'winpty-agent.exe'
    ]
  }
  return target.startsWith('darwin-') ? ['pty.node', 'spawn-helper'] : ['pty.node']
}

export function orcadNodePtyNativeArtifacts(target: string): string[] {
  return orcadNodePtySlotFiles(target).map((file) => `${ORCAD_NODE_PTY_DIR}/build/Release/${file}`)
}

export const ORCAD_PARCEL_WATCHER_ENTRY = 'node_modules/@parcel/watcher/index.js'
export const ORCAD_PARCEL_WATCHER_NATIVE = 'node_modules/@parcel/watcher/watcher.node'
export const ORCAD_EMOJI_SHORTCODE_DATASET =
  'node_modules/emojibase-data/en/shortcodes/emojibase.json'
// linear-sdk.ts loads it through createRequire, which the server bundle cannot follow.
export const ORCAD_LINEAR_SDK_ENTRY = 'node_modules/@linear/sdk/index.js'

// CloudDragon loads the original package lazily; the same list drives staging and remote install hashes.
export const ORCAD_PLAYWRIGHT_VERSION = '1.64.1'
export const ORCAD_PLAYWRIGHT_PACKAGE_FILES = [
  ...['channelSessions', 'cli', 'minimist', 'output', 'program', 'registry', 'session'].map(
    (name) => `lib/tools/cli-client/${name}.js`
  ),
  ...['bootstrap.js', 'coreBundle.js', 'package.js', 'webp_codec.wasm', 'xdg-open'].map(
    (file) => `lib/${file}`
  ),
  ...['serverRegistry.js', 'utilsBundle.js'].flatMap((file) => [
    `lib/${file}`,
    `lib/${file}.LICENSE`
  ]),
  'LICENSE',
  'NOTICE',
  'README.md',
  'ThirdPartyNotices.txt',
  'browsers.json',
  'cli.js',
  'index.d.ts',
  'index.js',
  'index.mjs',
  'package.json',
  ...['chrome_beta', 'chrome_stable', 'msedge_beta', 'msedge_dev', 'msedge_stable'].flatMap(
    (channel) =>
      ['linux.sh', 'mac.sh', 'win.ps1'].map((platform) => `bin/reinstall_${channel}_${platform}`)
  ),
  ...['cliDaemon.js', 'dashboardApp.js', 'mcp.js', 'oopBrowserDownload.js'].map(
    (file) => `lib/entry/${file}`
  ),
  ...['protocol.d.ts', 'structs.d.ts', 'types.d.ts'].map((file) => `types/${file}`),
  'bin/install_media_pack.ps1',
  'bin/install_webkit_wsl.ps1',
  'lib/server/chromium/appIcon.png',
  'lib/server/electron/loader.js',
  'lib/tools/cli-client/help.json',
  'lib/tools/dashboard/appIcon.png',
  'lib/tools/skills/playwright-cli/SKILL.md',
  'lib/tools/skills/playwright-cli/references/element-attributes.md',
  'lib/tools/skills/playwright-cli/references/playwright-tests.md',
  'lib/tools/skills/playwright-cli/references/pr-attachments.md',
  'lib/tools/skills/playwright-cli/references/request-mocking.md',
  'lib/tools/skills/playwright-cli/references/running-code.md',
  'lib/tools/skills/playwright-cli/references/session-management.md',
  'lib/tools/skills/playwright-cli/references/storage-state.md',
  'lib/tools/skills/playwright-cli/references/test-generation.md',
  'lib/tools/skills/playwright-cli/references/tracing.md',
  'lib/tools/skills/playwright-cli/references/video-recording.md',
  'lib/tools/skills/playwright-component-testing/SKILL.md',
  'lib/tools/skills/playwright-component-testing/references/gallery-spec.md',
  'lib/tools/skills/playwright-component-testing/references/migration.md',
  'lib/tools/skills/playwright-component-testing/references/react.md',
  'lib/tools/skills/playwright-component-testing/references/typing.md',
  'lib/tools/skills/playwright-component-testing/references/vue.md',
  'lib/tools/skills/playwright-trace/SKILL.md',
  'lib/tools/utils/extension.js',
  'lib/tools/utils/socketConnection.js',
  'lib/vite/dashboard/assets/codeMirrorModule--QdMvsKi.css',
  'lib/vite/dashboard/assets/codeMirrorModule-CQ8RZGBm.js',
  'lib/vite/dashboard/assets/codicon-DCmgc-ay.ttf',
  'lib/vite/dashboard/assets/firefox-1bWoP6pv.svg',
  'lib/vite/dashboard/assets/firefox-beta-k3eOH_eK.svg',
  'lib/vite/dashboard/assets/firefox-nightly-Cp5nfeDT.svg',
  'lib/vite/dashboard/assets/index-AwgwcYie.css',
  'lib/vite/dashboard/assets/index-hRvO4yU2.js',
  'lib/vite/dashboard/assets/safari-na3_-uQk.svg',
  'lib/vite/dashboard/index.html',
  'lib/vite/dashboard/playwright-logo.svg',
  'lib/vite/htmlReport/index.html',
  'lib/vite/htmlReport/report.css',
  'lib/vite/htmlReport/report.js',
  'lib/vite/recorder/assets/codeMirrorModule--QdMvsKi.css',
  'lib/vite/recorder/assets/codeMirrorModule-DK72OMRi.js',
  'lib/vite/recorder/assets/codicon-DCmgc-ay.ttf',
  'lib/vite/recorder/assets/index-BZpYJZ-P.css',
  'lib/vite/recorder/assets/index-Cn0mmDuv.js',
  'lib/vite/recorder/index.html',
  'lib/vite/recorder/playwright-logo.svg',
  'lib/vite/traceViewer/assets/codeMirrorModule-BEB2e8M3.js',
  'lib/vite/traceViewer/assets/defaultSettingsView-D-g2vrvf.js',
  'lib/vite/traceViewer/assets/urlMatch-L3liM589.js',
  'lib/vite/traceViewer/assets/xtermModule-B794rD2Z.js',
  'lib/vite/traceViewer/codeMirrorModule.-QdMvsKi.css',
  'lib/vite/traceViewer/codicon.DCmgc-ay.ttf',
  'lib/vite/traceViewer/defaultSettingsView.C8BeHuxd.css',
  'lib/vite/traceViewer/index.B_TqY17P.css',
  'lib/vite/traceViewer/index.html',
  'lib/vite/traceViewer/index.oNry3Hjv.js',
  'lib/vite/traceViewer/manifest.webmanifest',
  'lib/vite/traceViewer/playwright-logo.svg',
  'lib/vite/traceViewer/snapshot.B_Jk1wbt.js',
  'lib/vite/traceViewer/snapshot.html',
  'lib/vite/traceViewer/sw.bundle.js',
  'lib/vite/traceViewer/uiMode.CYwC_gH1.js',
  'lib/vite/traceViewer/uiMode.CyMfwkXJ.css',
  'lib/vite/traceViewer/uiMode.html',
  'lib/vite/traceViewer/xtermModule.kHJ-D0s7.css',
  'lib/webp_codec.LICENSE'
].sort()

export const ORCAD_PLAYWRIGHT_ARTIFACTS = ORCAD_PLAYWRIGHT_PACKAGE_FILES.map(
  (file) => `node_modules/playwright-core/${file}`
)

export const ORCAD_VERSION = '0.1.0'
export const ORCAD_LAUNCHER_FILENAME = 'orcad.js'
export const ORCAD_SERVER_ENTRY_FILENAME = 'orcad-server.js'

// Equals FOREIGN_SQLITE_READER_ENTRY_FILENAME; that module is not loadable under type stripping.
export const ORCAD_FOREIGN_SQLITE_READER_ENTRY = 'foreign-sqlite-reader-entry.js'
/** Worker thread that runs workspace port detection's probe commands off the event loop. */
export const ORCAD_PORT_SCAN_COMMAND_WORKER_ENTRY = 'port-scan-command-worker-entry.js'
// Equals AI_VAULT_SERVICE_ENTRY_FILENAME: the forked child that lists agent sessions.
export const ORCAD_SESSION_SCANNER_SERVICE_ENTRY = 'session-scanner-service-entry.js'
// Equals COMPUTER_SIDECAR_ENTRY_FILENAME, and the desktop's out/main entry name.
export const ORCAD_COMPUTER_SIDECAR_ENTRY = 'computer-sidecar.js'
/** Plain scripts, one copy for every target: each platform's sidecar runs only its own. */
export const ORCAD_COMPUTER_USE_RUNTIME_ARTIFACTS = [
  'computer-use-linux/runtime.py',
  'computer-use-windows/runtime.ps1'
] as const

// Kept here because build-orcad.mjs imports this manifest directly under Node type stripping.
export const ORCAD_RIPGREP_ARTIFACTS = [
  'ripgrep/linux-x64/rg',
  'ripgrep/linux-arm64/rg',
  'ripgrep/darwin-x64/rg',
  'ripgrep/darwin-arm64/rg',
  'ripgrep/win32-x64/rg.exe',
  'ripgrep/win32-arm64/rg.exe'
] as const

/** Only the target's own ripgrep ships (design D2); both libcs share one static build. */
export function orcadRipgrepArtifact(target: string): string {
  const [platform, arch] = target.split('-')
  const artifact = ORCAD_RIPGREP_ARTIFACTS.find((candidate) =>
    candidate.startsWith(`ripgrep/${platform}-${arch}/`)
  )
  if (!artifact) {
    throw new Error(`orcad ships no ripgrep for ${target}`)
  }
  return artifact
}

/** Packaging-only references; deployed slots still contain their own verified binary. */
export function orcadTemplatePackagedRipgrep(
  schemaVersion: number,
  target: string,
  reference: unknown
): string | null {
  if (reference === undefined) {
    return null
  }
  if (schemaVersion !== 4 || reference !== true || target.startsWith('darwin-')) {
    throw new Error(`Invalid packaged ripgrep reference for ${target}`)
  }
  return orcadRipgrepArtifact(target)
}

export const ORCAD_RIPGREP_LICENSE_ARTIFACTS = [
  'ripgrep/licenses/JEMALLOC-COPYING',
  'ripgrep/licenses/LICENSE-MIT',
  'ripgrep/licenses/LLVM-LIBUNWIND-LICENSE.TXT',
  'ripgrep/licenses/MUSL-COPYRIGHT',
  'ripgrep/licenses/PCRE2-LICENCE.md',
  'ripgrep/licenses/README.md',
  'ripgrep/licenses/RUST-CRATE-NOTICES.txt',
  'ripgrep/licenses/SLJIT-LICENSE',
  'ripgrep/licenses/UNLICENSE'
] as const

/** The skill plugin native-chat agents load by path; mirrors resources/native-chat-visuals. */
export const ORCAD_NATIVE_CHAT_VISUALS_ARTIFACTS = [
  'native-chat-visuals/.claude-plugin/plugin.json',
  'native-chat-visuals/skills/orca-chat-visuals/SKILL.md'
] as const

/** Code-unit order: page asset lists feed the install hash, so they must not depend on locale. */
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type OrcadArtifact = {
  filename: string
  /** Missing optional agent-browser means no headless browser, not a torn install; the remote probe must allow it. */
  optional?: boolean
}

export const ORCAD_ARTIFACTS: readonly OrcadArtifact[] = [
  { filename: ORCAD_CLI_ENTRY_FILENAME },
  { filename: ORCAD_CLI_PACKAGE_FILENAME },
  { filename: ORCAD_LAUNCHER_FILENAME },
  { filename: ORCAD_SERVER_ENTRY_FILENAME },
  // Forked so a native @parcel/watcher fault kills the child, not the server.
  { filename: 'parcel-watcher-process-entry.js' },
  // Forked so PTYs outlive the runtime process; its absence makes every restart destructive.
  { filename: 'daemon-entry.js' },
  { filename: 'profile-state-writer-worker-entry.js' },
  { filename: 'profile-state-backup-worker-entry.js' },
  { filename: 'command-path-directory-worker-entry.js' },
  // Worker thread that reads other apps' SQLite (the OpenCode binder and history) off the event loop.
  { filename: ORCAD_FOREIGN_SQLITE_READER_ENTRY },
  { filename: ORCAD_PORT_SCAN_COMMAND_WORKER_ENTRY },
  // Forked so transcript parsing stays off the server's event loop; session search stays in-process.
  { filename: ORCAD_SESSION_SCANNER_SERVICE_ENTRY },
  // Account worker threads keep CLI probes and Claude setup off the event loop.
  { filename: 'worker-thread-child-process-entry.js' },
  { filename: 'claude-profile-setup-worker-entry.js' },
  // Dictation loads the recognizer named by orca serve (#31174).
  { filename: 'stt-worker.js' },
  // The forked computer sidecar finds platform runtimes beside itself (#31777).
  { filename: ORCAD_COMPUTER_SIDECAR_ENTRY },
  ...ORCAD_COMPUTER_USE_RUNTIME_ARTIFACTS.map((filename) => ({ filename })),
  // Target-specific even when the JavaScript bundle is shared across packaged slots.
  { filename: ORCAD_SERVER_TARGET_FILENAME },
  // orcad never depends on a host runtime or host-installed native module.
  { filename: ORCAD_NODE_RUNTIME_MARKER_FILENAME },
  { filename: ORCAD_PARCEL_WATCHER_ENTRY },
  { filename: ORCAD_PARCEL_WATCHER_NATIVE },
  { filename: ORCAD_EMOJI_SHORTCODE_DATASET },
  { filename: ORCAD_LINEAR_SDK_ENTRY },
  ...ORCAD_PLAYWRIGHT_ARTIFACTS.map((filename) => ({ filename })),
  ...ORCAD_NODE_PTY_JS_ARTIFACTS.map((filename) => ({ filename })),
  ...ORCAD_RIPGREP_LICENSE_ARTIFACTS.map((filename) => ({ filename })),
  ...ORCAD_NATIVE_CHAT_VISUALS_ARTIFACTS.map((filename) => ({ filename }))
]

/** Written after the artifacts, so it is never an input to its own hash. */
export const ORCAD_VERSION_FILENAME = '.version'
export const ORCAD_TEMPLATE_MANIFEST_FILENAME = 'orcad-template.json'
export const ORCAD_TEMPLATE_TARGETS_DIR = 'targets'

/** Written last by the installer; its absence means a torn install. */
export const ORCAD_INSTALL_COMPLETE_FILENAME = '.install-complete'

/** Slot files in hash order for <os>-<arch>[-<libc>]. */
export function orcadArtifactFilenames(target: string): string[] {
  const filenames = ORCAD_ARTIFACTS.filter((artifact) => !artifact.optional).map(
    (artifact) => artifact.filename
  )
  filenames.push(...orcadNodePtyNativeArtifacts(target), orcadRipgrepArtifact(target))
  if (isWindowsTarget(target)) {
    filenames.push(
      ORCAD_WINDOWS_PROCESS_TREE_FILENAME,
      ORCAD_WINDOWS_SECURITY_FILENAME,
      ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME
    )
  }
  return filenames
}

/** Files shared by every template target; the rest live under `targets/<target>/`. */
export function orcadTemplateCommonFilenames(): string[] {
  const filenames = ORCAD_ARTIFACTS.filter(
    (artifact) =>
      !artifact.optional &&
      artifact.filename !== ORCAD_SERVER_TARGET_FILENAME &&
      artifact.filename !== ORCAD_NODE_RUNTIME_MARKER_FILENAME &&
      artifact.filename !== ORCAD_PARCEL_WATCHER_NATIVE
  ).map((artifact) => artifact.filename)
  return filenames
}

/** Files stored under the template's `targets/<target>/`, at their slot-relative paths. */
export function orcadTemplateTargetFilenames(target: string): string[] {
  const common = new Set(orcadTemplateCommonFilenames())
  return orcadArtifactFilenames(target).filter((filename) => !common.has(filename))
}
