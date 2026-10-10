// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'

const mocks = vi.hoisted(() => ({
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  appRestart: vi.fn(),
  updaterCheck: vi.fn(),
  useShortcutKeyDetails: vi.fn()
}))

let updateStatus = { state: 'idle' } as const
const roots: Root[] = []

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      openSettingsPage: mocks.openSettingsPage,
      openSettingsTarget: mocks.openSettingsTarget,
      updateStatus
    })
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutKeyDetails: mocks.useShortcutKeyDetails
}))

vi.mock('@/hooks/useMountedRef', () => ({
  useMountedRef: () => ({ current: true })
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({
    children,
    onOpenChange
  }: {
    children: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (
    <>
      <button data-testid="open-menu" onClick={() => onOpenChange?.(true)} />
      {children}
    </>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    disabled,
    onPointerDown,
    onSelect,
    title
  }: {
    children: ReactNode
    disabled?: boolean
    onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
    onSelect?: (event: Event) => void
    title?: string
  }) => (
    <button
      data-testid="menu-item"
      disabled={disabled}
      onClick={() => onSelect?.(new Event('menu.itemSelect'))}
      onPointerDown={onPointerDown}
      title={title}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel
  }: {
    children: ReactNode
    onClick?: (event: React.MouseEvent) => void
    'aria-label'?: string
  }) => (
    <button data-testid="trigger-button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  )
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

function installWindowApi(): void {
  Object.assign(window, {
    api: {
      app: {
        restart: mocks.appRestart
      },
      updater: {
        check: mocks.updaterCheck
      }
    }
  })
}

async function renderMenu(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)

  await act(async () => {
    root.render(<SidebarSettingsHelpMenu />)
  })

  return container
}

function findMenuItem(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-testid="menu-item"]')
  ).find((element) => element.textContent?.includes(label))
  expect(button).toBeDefined()
  return button as HTMLButtonElement
}

describe('SidebarSettingsHelpMenu', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    installWindowApi()
    mocks.useShortcutKeyDetails.mockReturnValue({ keys: ['⌘', ','], doubleTap: false })
    updateStatus = { state: 'idle' }
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
  })

  it('renders the help button with correct aria-label', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Help')
  })

  it('renders the settings button with correct aria-label', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('aria-label="Settings"')
  })

  it('renders the settings button before the help button', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    const settingsIndex = html.indexOf('lucide-settings')
    const helpIndex = html.indexOf('lucide-circle-question-mark')
    expect(settingsIndex).toBeGreaterThanOrEqual(0)
    expect(helpIndex).toBeGreaterThan(settingsIndex)
  })

  it('renders Keyboard Shortcuts menu item', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Keyboard Shortcuts')
  })

  it('renders Restart App by default', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Restart App')
  })

  it('renders Check for Updates menu item', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('Check for Updates')
    expect(html).toMatch(/(⇧\+click|Shift\+click) checks the latest RC/)
    expect(html).toMatch(/(⌘\+click|Ctrl\+click) checks the latest perf build/)
  })

  it('passes update-check modifier options through the updater bridge', async () => {
    const container = await renderMenu()
    const checkButton = findMenuItem(container, 'Check for Updates')
    const primaryModifier = navigator.userAgent.includes('Mac')
      ? { metaKey: true }
      : { ctrlKey: true }

    await act(async () => {
      checkButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, shiftKey: true }))
      checkButton.click()
    })
    await act(async () => {
      checkButton.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, ...primaryModifier })
      )
      checkButton.click()
    })
    await act(async () => {
      checkButton.click()
    })

    expect(mocks.updaterCheck).toHaveBeenNthCalledWith(1, {
      includePrerelease: true,
      includePerfPrerelease: false
    })
    expect(mocks.updaterCheck).toHaveBeenNthCalledWith(2, {
      includePrerelease: false,
      includePerfPrerelease: true
    })
    expect(mocks.updaterCheck).toHaveBeenNthCalledWith(3, {
      includePrerelease: false,
      includePerfPrerelease: false
    })
  })

  it('renders shortcut keys in the settings tooltip', () => {
    const html = renderToStaticMarkup(<SidebarSettingsHelpMenu />)
    expect(html).toContain('⌘')
    expect(html).toContain('>,</span>')
  })
})
