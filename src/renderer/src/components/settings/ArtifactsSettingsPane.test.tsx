// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareListEntry } from '../../../../shared/workbench/share'

const mocks = vi.hoisted(() => ({
  state: { isWebClient: false },
  entries: [] as unknown[],
  confirm: vi.fn(async () => true),
  removeShare: vi.fn(async (_sourceKey: string) => ({ ok: true, value: null })),
  reportShareFailure: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/web-client-location', () => ({
  isWebClientLocation: () => mocks.state.isWebClient
}))

vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => mocks.confirm
}))

vi.mock('../artifacts/share-server-client', () => ({
  listShares: async () => mocks.entries,
  removeShare: mocks.removeShare
}))

vi.mock('../artifacts/artifact-publish-flow', () => ({
  reportShareFailure: mocks.reportShareFailure
}))

import { ArtifactsSettingsPane } from './ArtifactsSettingsPane'

const sharedEntry: ShareListEntry = {
  id: 'share-1',
  url: 'http://shares.example/s/share-1',
  expiresAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  sourceKey: '/repo/report.html'
}

describe('ArtifactsSettingsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.isWebClient = false
    mocks.entries = []
    mocks.confirm.mockResolvedValue(true)
    mocks.removeShare.mockResolvedValue({ ok: true, value: null })
  })

  afterEach(cleanup)

  it('explains the complete sharing workflow', () => {
    render(<ArtifactsSettingsPane />)

    expect(screen.getByText('How to use Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Choose a file to share')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Open an HTML or Markdown file and select Share as artifact, or ask an agent to share it.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Copy the public link')).toBeInTheDocument()
    expect(screen.getByText('Update or remove the link')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Reopen the same file and use Share as artifact to publish new content over the same link.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Manage it in Orca')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign in to Orca' })).not.toBeInTheDocument()
  })

  it('lists files shared from this computer and deletes a link after confirmation', async () => {
    const user = userEvent.setup()
    mocks.entries = [sharedEntry]
    render(<ArtifactsSettingsPane />)

    expect(await screen.findByText('report.html')).toBeInTheDocument()
    expect(screen.getByText('http://shares.example/s/share-1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.removeShare).toHaveBeenCalledWith('/repo/report.html')
    expect(
      await screen.findByText(
        'No shared files yet. Open an HTML or Markdown file and choose Share as artifact.'
      )
    ).toBeInTheDocument()
  })

  it('keeps the shared-files list on the host device for web clients', () => {
    mocks.state.isWebClient = true
    render(<ArtifactsSettingsPane />)

    expect(
      screen.getByText(
        'Desktop only. Open Settings → Artifacts on the host device to see and delete your shared links.'
      )
    ).toBeInTheDocument()
  })
})
