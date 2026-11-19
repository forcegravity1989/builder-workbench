// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublishedLink: vi.fn(),
  copyLink: vi.fn(),
  openLink: vi.fn(),
  publish: vi.fn(),
  remove: vi.fn(),
  reportFailure: vi.fn(),
  openPopover: null as ((open: boolean) => void) | null
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
  removeShare: mocks.remove
}))
vi.mock('./artifact-publish-flow', () => ({
  publishArtifactFromSurface: mocks.publish,
  reportShareFailure: mocks.reportFailure
}))
vi.mock('./artifact-published-link-client', () => ({
  getPublishedArtifactLink: mocks.getPublishedLink
}))
vi.mock('./artifact-link-actions', () => ({
  copyArtifactLink: mocks.copyLink,
  openArtifactInBrowser: mocks.openLink
}))

import { ArtifactPublishButton } from './ArtifactPublishButton'

describe('ArtifactPublishButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.publish.mockResolvedValue({
      id: 'share-a',
      url: 'https://share.example.com/s/share-a',
      expiresAt: '2026-12-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      change: 'created'
    })
    mocks.getPublishedLink.mockResolvedValue(null)
    mocks.copyLink.mockResolvedValue(true)
    mocks.remove.mockResolvedValue({ ok: true, value: null })
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

  it('removes a published link after inline confirmation', async () => {
    const user = userEvent.setup()
    mocks.getPublishedLink.mockResolvedValue('http://7.192.170.220:8787/s/share-a')
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    await user.click(await screen.findByRole('button', { name: 'Remove link' }))
    expect(
      await screen.findByText('Remove this link? Anyone holding it will lose access.')
    ).toBeInTheDocument()
    expect(mocks.remove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Remove link' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('/repo/report.md'))
    expect(await screen.findByRole('button', { name: 'Generate link' })).toBeInTheDocument()
  })

  it('reports a transport failure while removing with user-facing copy', async () => {
    const user = userEvent.setup()
    mocks.getPublishedLink.mockResolvedValue('http://7.192.170.220:8787/s/share-a')
    mocks.remove.mockRejectedValue(new Error('runtime bridge closed'))
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    await user.click(await screen.findByRole('button', { name: 'Remove link' }))
    await user.click(screen.getByRole('button', { name: 'Remove link' }))

    // Not silent, but the notification carries the outcome — never the raw transport exception.
    await waitFor(() =>
      expect(mocks.reportFailure).toHaveBeenCalledWith(
        'unknown',
        'runtime bridge closed',
        'Could not remove the link.'
      )
    )
    // The raw transport text stays a diagnostic argument; the copy the user sees is the title
    // plus the localized description this code maps to.
    expect(mocks.reportFailure.mock.calls[0]?.[2]).toBe('Could not remove the link.')
    expect(await screen.findByText('http://7.192.170.220:8787/s/share-a')).toBeInTheDocument()
  })

  it('stops showing the link once the host reports the record is stale', async () => {
    const user = userEvent.setup()
    mocks.getPublishedLink.mockResolvedValue('http://7.192.170.220:8787/s/share-a')
    // The host removed the local record because the service refused its edit token, so the panel
    // must not keep offering a link this machine can no longer manage.
    mocks.remove.mockResolvedValue({
      ok: false,
      error: { code: 'stale-record', message: '本机记录已移除，原链接可能仍然存在' }
    })
    render(<ArtifactPublishButton sourceKey="/repo/report.md" createRequest={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Share as artifact' }))
    await user.click(await screen.findByRole('button', { name: 'Remove link' }))
    await user.click(screen.getByRole('button', { name: 'Remove link' }))

    await waitFor(() =>
      expect(mocks.reportFailure).toHaveBeenCalledWith(
        'stale-record',
        expect.any(String),
        'Could not remove the link.'
      )
    )
    expect(await screen.findByRole('button', { name: 'Generate link' })).toBeInTheDocument()
    expect(screen.queryByText('http://7.192.170.220:8787/s/share-a')).not.toBeInTheDocument()
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
