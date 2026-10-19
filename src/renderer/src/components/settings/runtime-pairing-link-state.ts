import { parsePairingCode } from '../../../../shared/pairing'
import {
  RuntimePairingLinkReferenceSchema,
  type RuntimePairingLinkReference
} from '../../../../shared/runtime-access-grants'
import type { RuntimePairingReach } from '../../../../shared/runtime-pairing-reach'

export const RUNTIME_PAIRING_LOOPBACK_ADDRESS = '127.0.0.1'

export type RuntimePairingIntent = 'another' | 'local' | 'custom'

// Why: only "This computer only" declines off-host reach. Custom is the SSH-tunnel/reverse-proxy field, so
// even a loopback-looking custom address (`127.0.0.1:8443`) needs the listener open behind the tunnel.
export function runtimePairingReachForIntent(intent: RuntimePairingIntent): RuntimePairingReach {
  return intent === 'local' ? 'this-computer' : 'network'
}

export type RuntimePairingUrlGeneratorProps = {
  framed?: boolean
  showHeader?: boolean
  showGeneratorForm?: boolean
}

// Why: pairing tokens remain in the main-process registry, so the last link can
// survive settings navigation without writing credential material to storage.
export const runtimePairingLinkCache: {
  selectedAddress: string
  customAddress: string
  intent: RuntimePairingIntent
  generatedAddress: string | null
  runtimePairingUrl: string | null
  webClientUrl: string | null
  runtimePairingDeviceId: string | null
} = {
  selectedAddress: '',
  customAddress: '',
  intent: 'another',
  generatedAddress: null,
  runtimePairingUrl: null,
  webClientUrl: null,
  runtimePairingDeviceId: null
}

const STORAGE_KEY = 'orca.runtime-pairing-link-reference.v1'

export function loadRuntimePairingLinkReference(): RuntimePairingLinkReference | null {
  try {
    const parsed = RuntimePairingLinkReferenceSchema.safeParse(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function clearGeneratedRuntimePairingLink(forgetReference = true): void {
  if (forgetReference) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // In-memory recall remains available when profile storage cannot be written.
    }
  }

  runtimePairingLinkCache.runtimePairingUrl = null
  runtimePairingLinkCache.webClientUrl = null
  runtimePairingLinkCache.runtimePairingDeviceId = null
  runtimePairingLinkCache.generatedAddress = null
}

export function cacheGeneratedRuntimePairingLink(args: {
  address: string
  intent: RuntimePairingIntent
  pairingUrl: string
  webClientUrl: string | null
  deviceId: string
}): void {
  runtimePairingLinkCache.runtimePairingUrl = args.pairingUrl
  runtimePairingLinkCache.webClientUrl = args.webClientUrl
  runtimePairingLinkCache.runtimePairingDeviceId = args.deviceId
  runtimePairingLinkCache.generatedAddress = args.address
  const offer = parsePairingCode(args.pairingUrl)
  if (!offer) {
    return
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        deviceId: args.deviceId,
        endpoint: offer.endpoint,
        publicKeyB64: offer.publicKeyB64,
        address: args.address,
        intent: args.intent,
        webClientAvailable: args.webClientUrl !== null
      } satisfies RuntimePairingLinkReference)
    )
  } catch {
    // Keep the generated link usable in this window if profile storage is unavailable.
  }
}

export function selectRuntimePairingIntent(
  intent: RuntimePairingIntent,
  networkInterfaces: { address: string }[],
  customAddress: string
): string {
  runtimePairingLinkCache.intent = intent
  const selectedAddress =
    intent === 'local'
      ? RUNTIME_PAIRING_LOOPBACK_ADDRESS
      : intent === 'another'
        ? (networkInterfaces[0]?.address ?? '')
        : customAddress
  runtimePairingLinkCache.selectedAddress = selectedAddress
  return selectedAddress
}
