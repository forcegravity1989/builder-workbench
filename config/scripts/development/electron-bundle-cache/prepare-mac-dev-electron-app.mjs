import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import {
  DEV_BUNDLE_MARKER_FILENAME,
  getDevBundleProcessTable,
  isDevBundleInUse,
  selectStaleDevBundleDirs
} from './dev-electron-bundle-cache.mjs'
import {
  DEV_BUNDLE_ID,
  getDevBundlePlistPatches,
  getDevHelperPlistPatches
} from './dev-electron-bundle-identity.mjs'
import { copyPrivateTree } from '../../artifact-storage/reflink-copy/space-sharing-copy.mjs'
import { buildDevSwiftCliHelpers } from '../../native-build/macos/swift-cli-helper-macos.mjs'

function setPlistValue(plistPath, key, value) {
  execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plistPath])
}

function sanitizeMacAppBundleName(value) {
  return (
    Array.from(value, (char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 || char === '/' || char === '\\' ? '-' : char
    })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Orca'
  )
}

function pruneStaleDevBundles(distDir) {
  const root = path.dirname(distDir)
  let bundles
  try {
    bundles = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const dir = path.join(root, entry.name)
        return {
          dir,
          hasMarker: existsSync(path.join(dir, DEV_BUNDLE_MARKER_FILENAME)),
          mtimeMs: getMtimeMs(dir)
        }
      })
  } catch {
    return
  }
  if (bundles.length <= 1) {
    return
  }
  const processTable = getDevBundleProcessTable()
  if (processTable === null) {
    return
  }
  const stale = selectStaleDevBundleDirs({
    bundles,
    currentDir: distDir,
    processTable,
    nowMs: Date.now()
  })
  for (const dir of stale) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
}

export function prepareMacDevElectronApp(repoRoot) {
  if (process.platform !== 'darwin') {
    return
  }

  const sourceAppPath = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'Electron.app')
  const electronPackagePath = path.join(repoRoot, 'node_modules', 'electron', 'package.json')
  if (!existsSync(sourceAppPath)) {
    return
  }

  let electronVersion = null
  try {
    electronVersion = JSON.parse(readFileSync(electronPackagePath, 'utf8')).version ?? null
  } catch {}

  const title = process.env.ORCA_DEV_DOCK_TITLE || 'Orca: dev'
  const identityKey = process.env.ORCA_DEV_INSTANCE_KEY || repoRoot
  // v11 stabilizes Info.plist/cdhash; ignored stale marker fields permit schema narrowing without another bump.
  const bundleLayoutVersion = 'stable-cdhash-dock-name-from-bundle-dir-v11'
  const hash = createHash('sha1')
    .update(
      `${sourceAppPath}\0${electronVersion ?? ''}\0${title}\0${identityKey}\0${bundleLayoutVersion}`
    )
    .digest('hex')
    .slice(0, 12)
  const distDir = path.join(repoRoot, 'out', 'electron-dev', hash)
  // Dock uses .app directory display name outside code signature, preserving per-branch label without varying cdhash.
  const appBundleName = `${sanitizeMacAppBundleName(title)}.app`
  const appPath = path.join(distDir, appBundleName)
  const markerPath = path.join(distDir, DEV_BUNDLE_MARKER_FILENAME)
  // Use one dev bundle ID for shared notification permission/settings entry. Concurrent instances may lose clicks routed to other instance; unknown IDs are dropped.
  const bundleId = DEV_BUNDLE_ID
  process.env.ORCA_DEV_MACOS_BUNDLE_ID = bundleId
  // Include patch values in reuse marker; layout version alone can reuse stale app identity.
  const expectedMarker = JSON.stringify(
    {
      title,
      appBundleName,
      bundleId,
      sourceAppPath,
      electronVersion,
      bundleLayoutVersion,
      plistPatches: [...getDevBundlePlistPatches(), ...getDevHelperPlistPatches()]
    },
    null,
    2
  )
  const executablePath = path.join(appPath, 'Contents', 'MacOS', 'Electron')
  // Require Chromium resources to avoid blank crash; optional swiftc keyboard helper only degrades keyboard behavior when absent.
  const chromiumResourcePath = path.join(
    appPath,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Resources',
    'icudtl.dat'
  )
  const requiredResourcePaths = [
    chromiumResourcePath,
    path.join(appPath, 'Contents', 'MacOS', 'orca-keyboard-layout'),
    path.join(appPath, 'Contents', 'MacOS', 'orca-process-footprint')
  ]

  function copiedAppIsUsable() {
    if (!existsSync(markerPath) || !existsSync(appPath)) {
      return false
    }
    try {
      if (readFileSync(markerPath, 'utf8') !== expectedMarker) {
        return false
      }
    } catch {
      return false
    }
    // Interrupted copy may leave marker/executable but omit Chromium resources, causing blank crash.
    return (
      existsSync(executablePath) &&
      requiredResourcePaths.every((resourcePath) => existsSync(resourcePath))
    )
  }

  if (copiedAppIsUsable()) {
    pruneStaleDevBundles(distDir)
    process.env.ELECTRON_EXEC_PATH = executablePath
    return
  }

  // Never delete live bundle on unsigned cache miss: re-copy would remove running app mid-session; reuse its current tree.
  const rebuildProcessTable = getDevBundleProcessTable()
  if (
    rebuildProcessTable !== null &&
    isDevBundleInUse(distDir, rebuildProcessTable) &&
    // Reject live-looking broken bundle despite orphan crashpad PID; test required Chromium resources only, not optional swiftc helper, to avoid deleting usable app.
    existsSync(executablePath) &&
    existsSync(chromiumResourcePath)
  ) {
    console.warn(
      `[orca-dev] Another dev instance is running from this bundle; reusing it instead of rebuilding. Quit the other instance (or delete ${distDir}) to force a rebuild.`
    )
    process.env.ELECTRON_EXEC_PATH = executablePath
    return
  }

  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })
  // Clone ~280MB bundle first; only plist/helper/signature bytes vary per branch/version.
  copyPrivateTree(sourceAppPath, appPath)
  restoreElectronFrameworkSymlinks(appPath)

  const plistPath = path.join(appPath, 'Contents', 'Info.plist')
  const helperPlistPath = path.join(
    appPath,
    'Contents',
    'Frameworks',
    'Electron Helper.app',
    'Contents',
    'Info.plist'
  )
  // Keep Info.plist values constant: branch-varying sealed bytes change cdhash and trigger Keychain prompts. Put branch label in .app directory name outside signature.
  for (const { key, value } of getDevBundlePlistPatches()) {
    setPlistValue(plistPath, key, value)
  }
  for (const { key, value } of getDevHelperPlistPatches()) {
    setPlistValue(helperPlistPath, key, value)
  }

  // Bundle notification helper with dev signing ID because macOS keys authorization by it; without swiftc use delivery-probe fallback.
  try {
    execFileSync(
      process.execPath,
      [
        path.join(
          repoRoot,
          'config',
          'scripts',
          'native-build',
          'macos',
          'build-notification-status-macos.mjs'
        ),
        '--bundle-id',
        bundleId,
        '--single-arch',
        '--output',
        path.join(appPath, 'Contents', 'MacOS', 'orca-notification-status')
      ],
      { stdio: 'inherit' }
    )
  } catch (error) {
    console.warn(
      `[orca-dev] notification-status helper build failed (permission card falls back to probes): ${error?.message ?? error}`
    )
  }

  buildDevSwiftCliHelpers(path.join(appPath, 'Contents', 'MacOS'))

  // Re-sign after copy/plist edits or macOS rejects notification registration (UNErrorDomain 1); signing failure stays nonfatal for dev.
  let signed = true
  try {
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])
  } catch (error) {
    signed = false
    console.warn(
      `[orca-dev] ad-hoc codesign failed (dev notifications will not deliver): ${error?.message ?? error}`
    )
  }
  // Write reuse marker only after signing: otherwise unsigned cache permanently loses notifications/stable Keychain identity; retry copying next launch instead.
  if (signed) {
    writeFileSync(markerPath, expectedMarker, 'utf8')
  }
  pruneStaleDevBundles(distDir)
  process.env.ELECTRON_EXEC_PATH = executablePath
}

function isSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink()
  } catch {
    return false
  }
}

function ensureRelativeSymlink(linkPath, target) {
  if (isSymlink(linkPath)) {
    try {
      if (readlinkSync(linkPath) === target) {
        return
      }
    } catch {}
  }

  const targetPath = path.join(path.dirname(linkPath), target)
  if (!existsSync(targetPath)) {
    return
  }

  rmSync(linkPath, { recursive: true, force: true })
  symlinkSync(target, linkPath)
}

function restoreElectronFrameworkSymlinks(appPath) {
  const frameworkPath = path.join(appPath, 'Contents', 'Frameworks', 'Electron Framework.framework')
  const versionsPath = path.join(frameworkPath, 'Versions')
  if (!existsSync(path.join(versionsPath, 'A'))) {
    return
  }

  // Restore flattened relative framework symlinks after copy so Chromium finds canonical bundle resources.
  ensureRelativeSymlink(path.join(versionsPath, 'Current'), 'A')
  for (const entry of ['Electron Framework', 'Resources', 'Libraries', 'Helpers']) {
    ensureRelativeSymlink(path.join(frameworkPath, entry), `Versions/Current/${entry}`)
  }
}

function getMtimeMs(filePath) {
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}
