// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  getShareConfig: vi.fn(),
  getPublishedLink: vi.fn(),
  copyLink: vi.fn(),
  openLink: vi.fn(),
  publish: vi.fn(),
  openPopover: null as ((open: boolean) => void) | null
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      openSettingsPage: mocks.openSettingsPage,
      openSettingsTarget: mocks.openSettingsTarget
    })
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    onOpenChange
  }: {
    children: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => {
    mocks.openPopover = onOpenChange ?? null
    return <>{children}</>
  },
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <span onClick={() => mocks.openPopover?.(true)}>{children}</span>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('./share-server-client', () => ({
  getShareConfig: mocks.getShareConfig
}))
vi.mock('./artifact-publish-flow', () => ({
  publishArtifactFromSurface: mocks.publish
}))
vi.mock('./artifact-published-link-client', () => ({
  getPublishedArtifactLink: mocks.getPublishedLink
}))
vi.mock('./artifact-link-actions', () => ({
  copyArtifactLink: mocks.copyLink,
  openArtifactInBrowser: mocks.openLink
}))

import { ArtifactPublishButton } from './ArtifactPublishButton'

const configured = {
  serverUrl: 'http://7.192.170.220:8787',
  uploadTokenSet: true,
  configured: true
}

describe('ArtifactPublishButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getShareConfig.mockResolvedValue(configured)
    mocks.publish.mockResolvedValue({
      id: 'share-a',
      url: 'https://share.example.com/s/share-a',
      expiresAt: '2026-12-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      change: 'created'
    })
    mocks.getPublishedLink.mockResolvedValue(null)
    mocks.copyLink.mockResolvedValue(true)
    mocks.openPopover = null
  })

  afterEach(cleanup)

  it('requires explicit confirmation before publishing', async () => {
    const user = userEvent.setup()
    const createRequest = vi.fn()
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={createRequest} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(mocks.publish).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Generate link' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(createRequest))
    expect(screen.getByText('https://share.example.com/s/share-a')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update shared content' })).toBeInTheDocument()
  })

  it('routes an unconfigured share server to Artifacts settings', async () => {
    const user = userEvent.setup()
    mocks.getShareConfig.mockResolvedValue({
      serverUrl: '',
      uploadTokenSet: false,
      configured: false
    })
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(await screen.findByText('Share server is not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate link' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Open share settings' }))
    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({ pane: 'artifacts', repoId: null })
    expect(mocks.openSettingsPage).toHaveBeenCalledOnce()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('offers retry when the share settings cannot be read', async () => {
    const user = userEvent.setup()
    mocks.getShareConfig.mockRejectedValueOnce(new Error('rpc down'))
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(await screen.findByText('Could not read the share server settings.')).toBeInTheDocument()

    mocks.getShareConfig.mockResolvedValue(configured)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Generate link' })).toBeInTheDocument()
  })

  it('shows and manages an existing public link', async () => {
    const user = userEvent.setup()
    const createRequest = vi.fn()
    mocks.getPublishedLink.mockResolvedValue('http://7.192.170.220:8787/s/share-a')
    mocks.publish.mockResolvedValue({
      id: 'share-a',
      url: 'http://7.192.170.220:8787/s/share-a',
      expiresAt: '2026-12-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      change: 'updated'
    })

    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={createRequest} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(await screen.findByText('http://7.192.170.220:8787/s/share-a')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(mocks.copyLink).toHaveBeenCalledWith('http://7.192.170.220:8787/s/share-a', {
      showSuccessToast: false
    })

    await user.click(screen.getByRole('button', { name: 'Update shared content' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(createRequest))
  })

  it('re-reads the share settings when the popover reopens', async () => {
    const user = userEvent.setup()
    mocks.getShareConfig.mockResolvedValueOnce({
      serverUrl: '',
      uploadTokenSet: false,
      configured: false
    })
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(await screen.findByText('Share server is not configured')).toBeInTheDocument()

    // The settings pane stays mounted while hidden, so reopening must pick up a saved server.
    mocks.getShareConfig.mockResolvedValue(configured)
    mocks.openPopover?.(false)
    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))

    expect(await screen.findByRole('button', { name: 'Generate link' })).toBeInTheDocument()
    expect(mocks.getShareConfig).toHaveBeenCalledTimes(2)
  })

  it('looks up a persisted link only after the popover opens', async () => {
    const user = userEvent.setup()
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    expect(mocks.getPublishedLink).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))

    await waitFor(() => expect(mocks.getPublishedLink).toHaveBeenCalledOnce())
  })

  it('offers retry when the existing-link lookup fails', async () => {
    const user = userEvent.setup()
    mocks.getPublishedLink.mockRejectedValueOnce(new Error('index unreadable'))
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    expect(await screen.findByText('Could not check for an existing link.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.getPublishedLink).toHaveBeenCalledTimes(2))
  })

  it('does not start copy feedback after the panel unmounts', async () => {
    const user = userEvent.setup()
    let finishCopy: ((copied: boolean) => void) | undefined
    mocks.getPublishedLink.mockResolvedValue('http://7.192.170.220:8787/s/share-a')
    mocks.copyLink.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishCopy = resolve
      })
    )
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const view = render(
      <ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    await user.click(await screen.findByRole('button', { name: 'Copy link' }))

    view.unmount()
    finishCopy?.(true)
    await Promise.resolve()

    expect(timeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1_500)
  })
})
