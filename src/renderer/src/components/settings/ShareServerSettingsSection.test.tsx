// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { ShareServerSettingsSection } from './ShareServerSettingsSection'

describe('ShareServerSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.isWebClient = false
    mocks.getShareConfig.mockResolvedValue({
      serverUrl: 'http://7.192.170.220:8787',
      uploadTokenSet: true,
      configured: true
    })
  })

  afterEach(cleanup)

  it('loads the saved server address and masks the token', async () => {
    render(<ShareServerSettingsSection />)

    expect(await screen.findByDisplayValue('http://7.192.170.220:8787')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Saved — leave blank to keep it')).toHaveAttribute(
      'type',
      'password'
    )
  })

  it('saves a new server address and token', async () => {
    const user = userEvent.setup()
    mocks.saveShareConfig.mockResolvedValue({
      ok: true,
      value: { serverUrl: 'http://10.0.0.8:8787', uploadTokenSet: true, configured: true }
    })
    render(<ShareServerSettingsSection />)

    const address = await screen.findByDisplayValue('http://7.192.170.220:8787')
    await user.clear(address)
    await user.type(address, 'http://10.0.0.8:8787')
    await user.type(screen.getByPlaceholderText('Saved — leave blank to keep it'), 'secret-token')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(mocks.saveShareConfig).toHaveBeenCalledWith({
        serverUrl: 'http://10.0.0.8:8787',
        uploadToken: 'secret-token'
      })
    )
    expect(screen.getByText('Share settings saved.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://10.0.0.8:8787')).toBeInTheDocument()
    // The token is never read back into the form.
    expect(screen.getByPlaceholderText('Saved — leave blank to keep it')).toHaveValue('')
  })

  it('keeps the stored token when the field is left blank', async () => {
    const user = userEvent.setup()
    mocks.saveShareConfig.mockResolvedValue({
      ok: true,
      value: {
        serverUrl: 'http://7.192.170.220:8787',
        uploadTokenSet: true,
        configured: true
      }
    })
    render(<ShareServerSettingsSection />)

    await screen.findByDisplayValue('http://7.192.170.220:8787')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mocks.saveShareConfig).toHaveBeenCalledWith({
      serverUrl: 'http://7.192.170.220:8787'
    })
  })

  it('clears the stored token explicitly', async () => {
    const user = userEvent.setup()
    mocks.saveShareConfig.mockResolvedValue({
      ok: true,
      value: { serverUrl: 'http://7.192.170.220:8787', uploadTokenSet: false, configured: true }
    })
    render(<ShareServerSettingsSection />)

    await user.click(await screen.findByRole('button', { name: 'Clear token' }))

    expect(mocks.saveShareConfig).toHaveBeenCalledWith({
      serverUrl: 'http://7.192.170.220:8787',
      uploadToken: ''
    })
    expect(screen.getByText('Upload token removed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear token' })).toBeNull()
  })

  it('reports a rejected save inline', async () => {
    const user = userEvent.setup()
    mocks.saveShareConfig.mockResolvedValue({
      ok: false,
      error: { code: 'invalid-config', message: '分享服务地址不是有效的 URL' }
    })
    render(<ShareServerSettingsSection />)

    await screen.findByDisplayValue('http://7.192.170.220:8787')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('The server address must be an http:// or https:// URL.')
    ).toBeInTheDocument()
  })

  it('tests the connection without saving', async () => {
    const user = userEvent.setup()
    mocks.testShareConfig.mockResolvedValue({
      ok: true,
      value: { serverUrl: 'http://7.192.170.220:8787' }
    })
    render(<ShareServerSettingsSection />)

    await user.click(await screen.findByRole('button', { name: 'Test connection' }))

    await waitFor(() =>
      expect(mocks.testShareConfig).toHaveBeenCalledWith({
        serverUrl: 'http://7.192.170.220:8787'
      })
    )
    expect(screen.getByText('Connected to the share server.')).toBeInTheDocument()
    expect(mocks.saveShareConfig).not.toHaveBeenCalled()
  })

  it('shows connection failures', async () => {
    const user = userEvent.setup()
    mocks.testShareConfig.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: '无法连接分享服务：fetch failed' }
    })
    render(<ShareServerSettingsSection />)

    await user.click(await screen.findByRole('button', { name: 'Test connection' }))
    expect(
      await screen.findByText('Could not reach the share server. Check the address and network.')
    ).toBeInTheDocument()
  })

  it('disables the connection test without an address', async () => {
    mocks.getShareConfig.mockResolvedValue({
      serverUrl: '',
      uploadTokenSet: false,
      configured: false
    })
    render(<ShareServerSettingsSection />)

    expect(await screen.findByRole('button', { name: 'Test connection' })).toBeDisabled()
  })
})
