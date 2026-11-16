// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

const mocks = vi.hoisted(() => ({
  getShareConfig: vi.fn(),
  saveShareConfig: vi.fn(),
  testShareConfig: vi.fn(),
  state: { isWebClient: false }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/web-client-location', () => ({
  isWebClientLocation: () => mocks.state.isWebClient
}))

vi.mock('../artifacts/share-server-client', () => ({
  getShareConfig: mocks.getShareConfig,
  saveShareConfig: mocks.saveShareConfig,
  testShareConfig: mocks.testShareConfig
}))

import { ArtifactsSettingsPane } from './ArtifactsSettingsPane'

describe('ArtifactsSettingsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.isWebClient = false
    mocks.getShareConfig.mockResolvedValue({
      serverUrl: '',
      uploadTokenSet: false,
      configured: false
    })
  })

  afterEach(cleanup)

  it('explains the complete sharing workflow', () => {
    render(
      <ArtifactsSettingsPane
        settings={{ ...getDefaultSettings('/tmp'), showArtifactsButton: true }}
        updateSettings={vi.fn()}
      />
    )

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
    // The Artifacts page and CLI still publish through Orca's cloud path and need this grant.
    expect(
      screen.getByRole('switch', { name: 'Allow publishing public artifact links' })
    ).toBeInTheDocument()
  })

  it('controls only sidebar visibility', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn()
    render(
      <ArtifactsSettingsPane
        settings={{ ...getDefaultSettings('/tmp'), showArtifactsButton: false }}
        updateSettings={updateSettings}
      />
    )

    const toggle = screen.getByRole('switch', { name: 'Show Artifacts Button' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(updateSettings).toHaveBeenCalledWith({ showArtifactsButton: true })
  })

  it('includes the self-hosted share server section', async () => {
    render(<ArtifactsSettingsPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />)

    expect(screen.getByText('Share server')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    expect(mocks.getShareConfig).toHaveBeenCalledOnce()
  })

  it('makes the share server read-only on the web client', async () => {
    mocks.state.isWebClient = true
    render(<ArtifactsSettingsPane settings={getDefaultSettings('/tmp')} updateSettings={vi.fn()} />)

    expect(
      (await screen.findAllByText(/Desktop only\. Open Settings → Artifacts on the host device/))
        .length
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull()
  })
})
