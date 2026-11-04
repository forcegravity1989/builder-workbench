import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import menuBarIconPath from '../../../resources/tray/workbench.png?asset&asarUnpack'
import menuBarIconRetinaPath from '../../../resources/tray/workbench@2x.png?asset&asarUnpack'
import { deferAppKitSceneMutation } from '../appkit-scene-mutation'
import { createAppIconImage } from '../app-icon'
import { translateMain } from '../i18n/main-i18n'
import { quitAndStopAllSessionsMenuText } from '../menu/app-menu-quit-item'
import { composeTrayAttentionIcon } from './tray-attention-icon'

export type SystemTrayOptions = {
  /** App icon id from settings; the tray reuses the app icon image. */
  appIcon: unknown
  /** True for dev/unpackaged instances; shows a DEV marker on the tray. */
  isDevInstance: boolean
  /** Worktree/branch label identifying the dev instance, when known. */
  devInstanceLabel: string | null
  /** Restore + show + focus the main window (recreating it if needed). */
  onOpen: () => void
  /** Restore the main window and open its Settings surface. */
  onOpenSettings: () => void
  /** Run the existing user-initiated update check. */
  onCheckForUpdates: () => void
  /** Caller must mark quit intent; serve-mode user Quit may close only desktop windows. */
  onQuit: () => void
  /** Confirm, then quit with every terminal session stopped; omitted where the item must not show (serve mode). */
  onQuitAndStopAllSessions?: () => void
}

// Keep a live reference or Electron GC removes the tray icon.
let tray: Tray | null = null
let trayOptions: SystemTrayOptions | null = null

// Cache the plain icon so attention changes do not reload the app PNG.
let baseTrayImage: NativeImage | null = null

// Remember attention before deferred tray creation so its first image is current.
let attentionActive = false

// Why: dev instances share the production icon, so remember dev-ness
// at module scope; tooltip rebuilds (attention on/off) must keep the marker.
let devIndicator: { label: string | null } | null = null

// Why: multiple dev instances can run side by side (one per worktree); the
// tooltip carries the worktree/branch label so hovering tells them apart.
function baseTooltip(): string {
  if (!devIndicator) {
    return 'Workbench'
  }
  return devIndicator.label ? `Workbench DEV (${devIndicator.label})` : 'Workbench DEV'
}

// Downscale the app image for Windows' 16px notification-area slot.
const TRAY_ICON_SIZE = 16

function applyTrayImage(): void {
  if (!tray || tray.isDestroyed() || !baseTrayImage) {
    return
  }

  if (process.platform === 'darwin') {
    if (attentionActive) {
      try {
        const attentionImage = composeTrayAttentionIcon(baseTrayImage)
        if (baseTrayImage.getScaleFactors().includes(2)) {
          // Why: toBitmap reads only the 1x pixels, so rebuild the @2x
          // representation or the glyph blurs on Retina during attention.
          const retinaAttentionImage = composeTrayAttentionIcon(baseTrayImage, 2)
          attentionImage.addRepresentation({
            scaleFactor: 2,
            dataURL: retinaAttentionImage.toDataURL()
          })
        }
        attentionImage.setTemplateImage(false)
        tray.setImage(attentionImage)
        tray.setToolTip(
          `${baseTooltip()} - ${translateMain('tray.activityWaitingSuffix', 'activity waiting')}`
        )
        return
      } catch (error) {
        // Why: this path runs inside unguarded callbacks (the notification bell), so a NativeImage failure must degrade to the
        // plain product icon rather than throw an uncaught exception into them.
        console.warn('[system-tray] macOS attention icon failed; showing plain icon', error)
      }
    }

    baseTrayImage.setTemplateImage(false)
    tray.setImage(baseTrayImage)
    tray.setToolTip(baseTooltip())
    return
  }

  tray.setImage(attentionActive ? composeTrayAttentionIcon(baseTrayImage) : baseTrayImage)
}

// Coalesce repaint bursts and read current state in the deferred turn so dropped schedules cannot apply stale icons.
let trayImageRepaintPending = false

// NSStatusItem scene writes inside AppKit callouts deadlock main; defer them to a fresh turn.
function scheduleTrayImage(): void {
  if (trayImageRepaintPending) {
    return
  }
  trayImageRepaintPending = true
  deferAppKitSceneMutation(() => {
    trayImageRepaintPending = false
    applyTrayImage()
  })
}

function createMacMenuBarImage(): NativeImage | null {
  const image = nativeImage.createFromPath(menuBarIconPath)
  const { width, height } = image.getSize()
  if (width <= 0 || height <= 0) {
    console.warn('[system-tray] macOS menu bar icon could not be loaded')
    return null
  }

  const retinaImage = nativeImage.createFromPath(menuBarIconRetinaPath)
  const retinaSize = retinaImage.getSize()
  if (retinaSize.width > 0 && retinaSize.height > 0) {
    try {
      // Import/package the 2x asset explicitly instead of relying on bundler-renamed siblings.
      image.addRepresentation({
        scaleFactor: 2,
        dataURL: retinaImage.toDataURL()
      })
    } catch (error) {
      // Bad 2x data may blur Retina but must not abort tray creation.
      console.warn('[system-tray] macOS retina menu bar icon could not be added', error)
    }
  } else {
    // Report degraded Retina rendering so blurry status icons remain diagnosable.
    console.warn('[system-tray] macOS retina menu bar icon could not be loaded')
  }
  image.setTemplateImage(false)
  return image
}

// Why: Electron Menu/Tray click callbacks are plain event listeners (not
// promise-wrapped like ipcMain.handle), so an uncaught throw here is fatal to
// the main process; contain it to a logged, failed menu action instead.
function safeMenuAction(action: () => void): () => void {
  return () => {
    try {
      action()
    } catch (error) {
      console.error('[system-tray] menu action failed', error)
    }
  }
}

/** Create at most one Windows/macOS tray; Linux has none. */
export function createSystemTray(opts: SystemTrayOptions): Tray | null {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return null
  }
  if (tray && !tray.isDestroyed()) {
    return tray
  }

  devIndicator = opts.isDevInstance ? { label: opts.devInstanceLabel } : null

  if (process.platform === 'darwin') {
    baseTrayImage = createMacMenuBarImage()
    if (!baseTrayImage) {
      return null
    }
  } else {
    baseTrayImage = createAppIconImage(opts.appIcon).resize({
      width: TRAY_ICON_SIZE,
      height: TRAY_ICON_SIZE
    })
  }

  tray = new Tray(baseTrayImage)
  applyTrayImage()

  trayOptions = opts
  tray.setContextMenu(buildTrayMenu(opts))
  if (process.platform === 'win32') {
    tray.setToolTip(baseTooltip())
    // Windows left-click restores the app; macOS uses its attached menu.
    tray.on(
      'click',
      safeMenuAction(() => opts.onOpen())
    )
  } else {
    if (devIndicator) {
      tray.setTitle('DEV')
    }
  }
  return tray
}

function buildTrayMenu(opts: SystemTrayOptions): Menu {
  return Menu.buildFromTemplate([
    ...(devIndicator
      ? ([
          // Label dev trays by worktree/branch to distinguish concurrent instances.
          { label: baseTooltip(), enabled: false },
          { type: 'separator' }
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: translateMain('tray.openOrca', 'Open Orca'),
      click: safeMenuAction(() => opts.onOpen())
    },
    { type: 'separator' },
    // Share app-menu translation keys so tray labels cannot drift.
    ...(process.platform === 'darwin'
      ? ([
          {
            label: translateMain('menu.settings', 'Settings'),
            click: safeMenuAction(() => opts.onOpenSettings())
          },
          {
            label: translateMain('menu.checkForUpdates', 'Check for Updates...'),
            click: safeMenuAction(() => opts.onCheckForUpdates())
          },
          { type: 'separator' }
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    ...(opts.onQuitAndStopAllSessions
      ? ([
          {
            ...quitAndStopAllSessionsMenuText(),
            click: safeMenuAction(opts.onQuitAndStopAllSessions)
          }
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    { label: translateMain('tray.quit', 'Quit'), click: safeMenuAction(() => opts.onQuit()) }
  ])
}

/** Refreshes translated labels without recreating the tray or its actions. */
export function rebuildSystemTrayMenu(): void {
  // Native tray writes must run outside AppKit callbacks.
  deferAppKitSceneMutation(() => {
    if (!tray || tray.isDestroyed() || !trayOptions) {
      return
    }
    tray.setContextMenu(buildTrayMenu(trayOptions))
    applyTrayImage()
  })
}

/** Applies the persisted macOS visibility preference without affecting Windows. */
export function setMacMenuBarIconVisible(visible: boolean, opts: SystemTrayOptions): Tray | null {
  if (process.platform !== 'darwin') {
    return null
  }
  if (!visible) {
    destroySystemTray()
    return null
  }
  return createSystemTray(opts)
}

/** Bell/completion attention survives pre-creation calls; notification/visibility flow clears it on reveal. Safe without a tray. */
export function setTrayAttention(active: boolean): void {
  if (attentionActive === active) {
    return
  }
  // Set dedup state synchronously; defer only native scene writes or rapid show/hide races mis-dedupe.
  attentionActive = active
  scheduleTrayImage()
}

export function destroySystemTray(): void {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
  trayOptions = null
  baseTrayImage = null
  // Notification/visibility flow owns attention; preserve its dot across menu-bar icon hide/show.
}
