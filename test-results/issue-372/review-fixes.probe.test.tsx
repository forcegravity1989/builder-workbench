// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../src/shared/pairing'
const mocks = vi.hoisted(() => ({ restore: vi.fn(), revoke: vi.fn(), generate: vi.fn(), interfaces: vi.fn() }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/settings/RuntimePairingGeneratorForm', () => ({ RuntimePairingGeneratorForm: (props: any) => <div><output data-testid="address">{props.selectedAddress}</output><output data-testid="link">{props.runtimePairingUrl}</output><button onClick={props.onGenerate}>Generate</button></div> }))
vi.mock('@/components/settings/RuntimeAccessGrantList', () => ({ RuntimeAccessGrantList: (props: any) => <div>{props.grants.map((grant: any) => <button key={grant.deviceId} onClick={() => props.onRevoke(grant)}>Revoke {grant.deviceId}</button>)}</div> }))
import { RuntimePairingUrlGenerator } from '@/components/settings/RuntimePairingUrlGenerator'
import { runtimePairingLinkCache } from '@/components/settings/runtime-pairing-link-state'
const key = 'orca.runtime-pairing-link-reference.v1'
const reference = { version: 1, deviceId: 'saved', endpoint: 'ws://127.0.0.1:6767', publicKeyB64: 'cHVibGlj', address: '127.0.0.1', intent: 'local', webClientAvailable: false }
function linkFor(id = 'saved', endpoint = reference.endpoint) { return { pairingUrl: encodePairingOffer({ v: PAIRING_OFFER_VERSION, endpoint, deviceToken: 'test-only-token', publicKeyB64: reference.publicKeyB64, pairedDeviceId: id, scope: 'runtime' }), deviceId: id, endpoint, webClientUrl: null } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem(key, JSON.stringify(reference))
  Object.assign(runtimePairingLinkCache, { selectedAddress: '', customAddress: '', intent: 'another', generatedAddress: null, runtimePairingUrl: null, webClientUrl: null, runtimePairingDeviceId: null })
  mocks.interfaces.mockResolvedValue({ interfaces: [{ name: 'lan', address: '192.0.2.2' }] })
  mocks.revoke.mockResolvedValue({ revoked: true })
  mocks.generate.mockResolvedValue({ available: true, ...linkFor('new') })
  Object.defineProperty(window, 'api', { configurable: true, value: { mobile: { restoreRuntimePairingUrl: mocks.restore, revokeRuntimeAccess: mocks.revoke, getRuntimePairingUrl: mocks.generate, listNetworkInterfaces: mocks.interfaces, listRuntimeAccessGrants: vi.fn().mockResolvedValue({ grants: ['saved', 'other'].map(deviceId => ({ deviceId, name: deviceId, createdAt: 1, lastSeenAt: null })) }) } } })
})
afterEach(cleanup)
it('revoking another grant does not cancel a delayed recall', async () => {
  const pending = deferred<ReturnType<typeof linkFor>>()
  mocks.restore.mockReturnValue(pending.promise)
  render(<RuntimePairingUrlGenerator />)
  await screen.findByRole('button', { name: 'Revoke other' })
  await act(async () => { screen.getByRole('button', { name: 'Revoke other' }).click() })
  await act(async () => { pending.resolve(linkFor()) })
  expect(screen.getByTestId('link')).toHaveTextContent(linkFor().pairingUrl)
  expect(JSON.parse(localStorage.getItem(key)!).deviceId).toBe('saved')
})
it.each([true, false])('revoking a recalled grant clears its reference before delayed recall (revoked=%s)', async (revoked) => {
  const pending = deferred<ReturnType<typeof linkFor>>()
  mocks.restore.mockReturnValue(pending.promise)
  mocks.revoke.mockResolvedValue({ revoked })
  render(<RuntimePairingUrlGenerator />)
  await screen.findByRole('button', { name: 'Revoke saved' })
  await act(async () => { screen.getByRole('button', { name: 'Revoke saved' }).click() })
  expect(localStorage.getItem(key)).toBeNull()
  await act(async () => { pending.resolve(linkFor()) })
  expect(screen.getByTestId('link')).toBeEmptyDOMElement()
})
it('does not erase a newly generated link when an old revoke finishes late', async () => {
  const pending = deferred<{ revoked: boolean }>()
  mocks.restore.mockResolvedValue(linkFor())
  mocks.revoke.mockReturnValue(pending.promise)
  render(<RuntimePairingUrlGenerator />)
  await waitFor(() => expect(screen.getByTestId('link')).toHaveTextContent(linkFor().pairingUrl))
  await act(async () => { screen.getByRole('button', { name: 'Revoke saved' }).click() })
  await act(async () => { screen.getByRole('button', { name: 'Generate' }).click() })
  await act(async () => { pending.resolve({ revoked: true }) })
  expect(screen.getByTestId('link')).toHaveTextContent(linkFor('new').pairingUrl)
  expect(JSON.parse(localStorage.getItem(key)!).deviceId).toBe('new')
})
it('corrects an unavailable LAN address after delayed recall', async () => {
  localStorage.setItem(key, JSON.stringify({ ...reference, intent: 'another', address: '192.0.2.1', endpoint: 'ws://192.0.2.1:6767' }))
  const pending = deferred<ReturnType<typeof linkFor>>()
  mocks.restore.mockReturnValue(pending.promise)
  render(<RuntimePairingUrlGenerator />)
  await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('192.0.2.2'))
  await act(async () => { pending.resolve(linkFor('saved', 'ws://192.0.2.1:6767')) })
  await waitFor(() => expect(screen.getByTestId('address')).toHaveTextContent('192.0.2.2'))
  expect(runtimePairingLinkCache.generatedAddress).toBe('192.0.2.1')
})

