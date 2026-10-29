import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SystemTrayModule from './system-tray'

const {
  attentionImage,
  baseMacImage,
  composeAttentionMock,
  createAppIconImageMock,
  createFromPathMock,
  menuFromTemplateMock,
  resizedImage,
  retinaMacImage,
  trayInstances
} = vi.hoisted(() => {
  const makeImage = (name: string) => ({
    name,
    addRepresentation: vi.fn(),
    getScaleFactors: vi.fn(() => [1, 2]),
    getSize: vi.fn(() => ({ width: 16, height: 16 })),
    setTemplateImage: vi.fn(),
    toDataURL: vi.fn(() => `data:image/png;base64,${name}`)
  })
  return {
    attentionImage: makeImage('attention'),
    baseMacImage: makeImage('mac-base'),
    composeAttentionMock: vi.fn(),
    createAppIconImageMock: vi.fn(),
    createFromPathMock: vi.fn(),
    menuFromTemplateMock: vi.fn((template: unknown) => ({ template })),
    resizedImage: makeImage('windows'),
    retinaMacImage: makeImage('mac-retina'),
    trayInstances: [] as FakeTray[]
  }
})

class FakeTray {
  setToolTip = vi.fn()
  setTitle = vi.fn()
  setContextMenu = vi.fn()
  setImage = vi.fn()
  on = vi.fn()
  destroy = vi.fn()
  isDestroyed = vi.fn(() => false)
  constructor(public readonly image: unknown) {
    trayInstances.push(this)
  }
}

vi.mock('electron', () => ({
  Tray: FakeTray,
  Menu: { buildFromTemplate: menuFromTemplateMock },
  nativeImage: { createFromPath: createFromPathMock }
}))

vi.mock('../../../resources/tray/workbench.png?asset&asarUnpack', () => ({
  default: '/assets/workbench.png'
}))

vi.mock('../../../resources/tray/workbench@2x.png?asset&asarUnpack', () => ({
  default: '/assets/workbench@2x.png'
}))

vi.mock('../app-icon', () => ({
  createAppIconImage: createAppIconImageMock
}))

vi.mock('./tray-attention-icon', () => ({
  composeTrayAttentionIcon: composeAttentionMock
}))

type TrayModule = typeof SystemTrayModule
type MenuItem = { label?: string; type?: string; click?: () => void }

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

async function loadModule(): Promise<TrayModule> {
  vi.resetModules()
  return import('./system-tray')
}

function createOptions(
  overrides: { isDevInstance?: boolean; devInstanceLabel?: string | null } = {}
) {
  return {
    appIcon: 'classic',
    isDevInstance: overrides.isDevInstance ?? false,
    devInstanceLabel: overrides.devInstanceLabel ?? null,
    onOpen: vi.fn(),
    onOpenSettings: vi.fn(),
    onCheckForUpdates: vi.fn(),
    onQuit: vi.fn()
  }
}

function builtMenuItems(): MenuItem[] {
  return menuFromTemplateMock.mock.calls.at(-1)?.[0] as MenuItem[]
}

// Why: tray image/tooltip writes are deferred off the caller's stack to keep the
// NSStatusItem scene update out of AppKit's dispatch; run the pending turn.
function flushTraySceneMutation(): void {
  vi.advanceTimersByTime(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  trayInstances.length = 0
  menuFromTemplateMock.mockClear()
  composeAttentionMock.mockReset().mockReturnValue(attentionImage)
  createAppIconImageMock.mockReset()
  createAppIconImageMock.mockReturnValue({ resize: vi.fn(() => resizedImage) })
  createFromPathMock.mockReset()
  createFromPathMock.mockImplementation((path: string) =>
    path.includes('@2x') ? retinaMacImage : baseMacImage
  )
  for (const image of [baseMacImage, retinaMacImage, attentionImage]) {
    image.addRepresentation.mockClear()
    image.getScaleFactors.mockReset().mockReturnValue([1, 2])
    image.getSize.mockReset().mockReturnValue({ width: 16, height: 16 })
    image.setTemplateImage.mockClear()
    image.toDataURL.mockClear().mockReturnValue(`data:image/png;base64,${image.name}`)
  }
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createSystemTray', () => {
  it('keeps the Windows icon, Open/Quit menu, and left-click behavior', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()
    const options = createOptions()

    createSystemTray(options)

    expect(trayInstances).toHaveLength(1)
    expect(trayInstances[0].image).toBe(resizedImage)
    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Workbench')
    expect(builtMenuItems().map((item) => item.label)).toEqual(['Open Orca', undefined, 'Quit'])
    const clickHandler = trayInstances[0].on.mock.calls.find((call) => call[0] === 'click')?.[1]
    expect(clickHandler).toBeTypeOf('function')

    builtMenuItems()[0].click?.()
    ;(clickHandler as () => void)()
    builtMenuItems()[2].click?.()
    expect(options.onOpen).toHaveBeenCalledTimes(2)
    expect(options.onQuit).toHaveBeenCalledOnce()
  })

  it('creates a macOS product status item with the full native menu', async () => {
    setPlatform('darwin')
    const { createSystemTray } = await loadModule()
    const options = createOptions()

    createSystemTray(options)

    expect(trayInstances).toHaveLength(1)
    expect(trayInstances[0].image).toBe(baseMacImage)
    expect(baseMacImage.setTemplateImage).toHaveBeenCalledWith(false)
    expect(baseMacImage.addRepresentation).toHaveBeenCalledWith({
      scaleFactor: 2,
      dataURL: 'data:image/png;base64,mac-retina'
    })
    expect(builtMenuItems().map((item) => item.label)).toEqual([
      'Open Orca',
      undefined,
      'Settings',
      'Check for Updates...',
      undefined,
      'Quit'
    ])
    expect(trayInstances[0].on).not.toHaveBeenCalled()

    for (const [label, callback] of [
      ['Open Orca', options.onOpen],
      ['Settings', options.onOpenSettings],
      ['Check for Updates...', options.onCheckForUpdates],
      ['Quit', options.onQuit]
    ] as const) {
      builtMenuItems()
        .find((item) => item.label === label)
        ?.click?.()
      expect(callback).toHaveBeenCalledOnce()
    }
  })

  it('does not create a blank macOS item when the product asset fails to load', async () => {
    setPlatform('darwin')
    baseMacImage.getSize.mockReturnValue({ width: 0, height: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createSystemTray } = await loadModule()

    expect(createSystemTray(createOptions())).toBeNull()
    expect(trayInstances).toHaveLength(0)
    expect(warn).toHaveBeenCalledWith('[system-tray] macOS menu bar icon could not be loaded')
  })

  it('is idempotent and remains disabled on Linux', async () => {
    setPlatform('darwin')
    const { createSystemTray } = await loadModule()
    const options = createOptions()
    expect(createSystemTray(options)).toBe(createSystemTray(options))
    expect(trayInstances).toHaveLength(1)

    setPlatform('linux')
    const linuxModule = await loadModule()
    expect(linuxModule.createSystemTray(options)).toBeNull()
  })
})

describe('dev instance indicator', () => {
  it('marks the macOS status item as DEV while preserving the product image', async () => {
    setPlatform('darwin')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions({ isDevInstance: true, devInstanceLabel: 'my-branch' }))

    expect(trayInstances[0].image).toBe(baseMacImage)
    expect(trayInstances[0].setTitle).toHaveBeenCalledWith('DEV')
    expect(builtMenuItems()[0]).toMatchObject({
      label: 'Workbench DEV (my-branch)',
      enabled: false
    })
  })

  it('omits the label suffix when the dev instance has none', async () => {
    setPlatform('darwin')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions({ isDevInstance: true }))

    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Workbench DEV')
    expect(builtMenuItems()[0]).toMatchObject({ label: 'Workbench DEV', enabled: false })
  })

  it('keeps the DEV marker in the tooltip across the attention toggle', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions({ isDevInstance: true, devInstanceLabel: 'my-branch' }))
    const created = trayInstances[0]
    created.setToolTip.mockClear()

    setTrayAttention(true)
    flushTraySceneMutation()
    expect(created.setToolTip).toHaveBeenCalledWith('Workbench DEV (my-branch) - activity waiting')
    setTrayAttention(false)
    flushTraySceneMutation()
    expect(created.setToolTip).toHaveBeenLastCalledWith('Workbench DEV (my-branch)')
  })

  it('marks the Windows tooltip without badging the icon', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions({ isDevInstance: true, devInstanceLabel: 'my-branch' }))

    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Workbench DEV (my-branch)')
    expect(trayInstances[0].setTitle).not.toHaveBeenCalled()
    expect(builtMenuItems()[0]).toMatchObject({
      label: 'Workbench DEV (my-branch)',
      enabled: false
    })
  })

  it('adds no DEV marker for production instances', async () => {
    setPlatform('darwin')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions())

    expect(trayInstances[0].setTitle).not.toHaveBeenCalled()
    expect(trayInstances[0].image).toBe(baseMacImage)
    expect(builtMenuItems()[0].label).toBe('Open Orca')
  })
})

describe('macOS visibility', () => {
  it('creates and destroys the item as the setting toggles', async () => {
    setPlatform('darwin')
    const { setMacMenuBarIconVisible } = await loadModule()
    const options = createOptions()

    expect(setMacMenuBarIconVisible(false, options)).toBeNull()
    expect(trayInstances).toHaveLength(0)
    expect(setMacMenuBarIconVisible(true, options)).not.toBeNull()
    expect(trayInstances).toHaveLength(1)

    setMacMenuBarIconVisible(false, options)
    setMacMenuBarIconVisible(false, options)
    expect(trayInstances[0].destroy).toHaveBeenCalledOnce()
  })
})

describe('setTrayAttention', () => {
  it('preserves the Windows attention swap behavior', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    flushTraySceneMutation()
    expect(composeAttentionMock).toHaveBeenCalledWith(resizedImage)
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
    setTrayAttention(false)
    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenLastCalledWith(resizedImage)
  })

  it('preserves the product image at both macOS scales when adding and clearing attention', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()
    created.setToolTip.mockClear()

    setTrayAttention(true)
    flushTraySceneMutation()
    expect(composeAttentionMock).toHaveBeenCalledWith(baseMacImage)
    // Why: the attention image is rebuilt from 1x pixels, so the @2x
    // representation must be re-added or the glyph blurs on Retina.
    expect(composeAttentionMock).toHaveBeenCalledWith(baseMacImage, 2)
    expect(attentionImage.addRepresentation).toHaveBeenCalledWith({
      scaleFactor: 2,
      dataURL: 'data:image/png;base64,attention'
    })
    expect(attentionImage.setTemplateImage).toHaveBeenCalledWith(false)
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
    expect(created.setToolTip).toHaveBeenCalledWith('Workbench - activity waiting')

    setTrayAttention(false)
    flushTraySceneMutation()
    expect(baseMacImage.setTemplateImage).toHaveBeenLastCalledWith(false)
    expect(created.setImage).toHaveBeenLastCalledWith(baseMacImage)
    expect(created.setToolTip).toHaveBeenLastCalledWith('Workbench')
  })

  it('reflects attention requested before deferred macOS creation', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    setTrayAttention(true)
    createSystemTray(createOptions())

    expect(trayInstances[0].setImage).toHaveBeenCalledWith(attentionImage)
  })

  it('ignores repeated same-state attention calls', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    setTrayAttention(true)
    flushTraySceneMutation()

    expect(created.setImage).toHaveBeenCalledTimes(1)
  })

  it('never touches the NSStatusItem scene inside the caller stack', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()
    created.setToolTip.mockClear()

    // Why: show/restore call this from AppKit's window-state dispatch; a scene
    // update sent there self-deadlocks the main thread on macOS 26.
    setTrayAttention(true)
    expect(created.setImage).not.toHaveBeenCalled()
    expect(created.setToolTip).not.toHaveBeenCalled()

    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
  })

  it('collapses a burst of toggles into one deferred repaint', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    setTrayAttention(false)
    setTrayAttention(true)
    flushTraySceneMutation()

    expect(created.setImage).toHaveBeenCalledTimes(1)
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
  })

  it('still dedupes after the deferred repaint has run', async () => {
    setPlatform('darwin')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    flushTraySceneMutation()
    setTrayAttention(true)
    flushTraySceneMutation()

    expect(created.setImage).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the tray is destroyed before the deferred repaint runs', async () => {
    setPlatform('darwin')
    const { createSystemTray, destroySystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    destroySystemTray()

    expect(() => flushTraySceneMutation()).not.toThrow()
    expect(created.setImage).not.toHaveBeenCalled()
  })

  it('keeps a pending attention dot across a macOS hide/show toggle', async () => {
    setPlatform('darwin')
    const { setMacMenuBarIconVisible, setTrayAttention } = await loadModule()
    const options = createOptions()
    setMacMenuBarIconVisible(true, options)
    setTrayAttention(true)

    setMacMenuBarIconVisible(false, options)
    setMacMenuBarIconVisible(true, options)

    expect(trayInstances).toHaveLength(2)
    expect(trayInstances[1].setImage).toHaveBeenCalledWith(attentionImage)
  })
})

describe('destroySystemTray', () => {
  it('destroys the macOS status item idempotently', async () => {
    setPlatform('darwin')
    const { createSystemTray, destroySystemTray } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]

    destroySystemTray()
    destroySystemTray()

    expect(created.destroy).toHaveBeenCalledOnce()
  })
})

describe('macOS hardening', () => {
  it('warns but still creates the item when only the @2x asset fails to load', async () => {
    setPlatform('darwin')
    retinaMacImage.getSize.mockReturnValue({ width: 0, height: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createSystemTray } = await loadModule()

    expect(createSystemTray(createOptions())).not.toBeNull()
    expect(trayInstances).toHaveLength(1)
    expect(baseMacImage.addRepresentation).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[system-tray] macOS retina menu bar icon could not be loaded'
    )
  })

  it('degrades to the plain icon instead of throwing when attention composition fails', async () => {
    setPlatform('darwin')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()
    composeAttentionMock.mockImplementationOnce(() => {
      throw new Error('native image failure')
    })

    setTrayAttention(true)
    expect(() => flushTraySceneMutation()).not.toThrow()
    expect(created.setImage).toHaveBeenLastCalledWith(baseMacImage)
    expect(created.setToolTip).toHaveBeenLastCalledWith('Workbench')
    expect(warn).toHaveBeenCalledWith(
      '[system-tray] macOS attention icon failed; showing plain icon',
      expect.any(Error)
    )
  })

  it('contains a throwing menu-item callback instead of crashing', async () => {
    setPlatform('darwin')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createSystemTray } = await loadModule()
    const options = createOptions()
    options.onOpenSettings.mockImplementation(() => {
      throw new Error('boom')
    })
    createSystemTray(options)

    const settingsItem = builtMenuItems().find((item) => item.label === 'Settings')
    expect(() => settingsItem?.click?.()).not.toThrow()
    expect(error).toHaveBeenCalledWith('[system-tray] menu action failed', expect.any(Error))
  })
})
