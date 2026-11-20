import { z } from 'zod'
import type { RuntimeAccessMode, RuntimeTeamBinding } from './runtime-session-contracts'

export type RuntimeAccessGrant = {
  deviceId: string
  name: string
  createdAt: number
  lastSeenAt: number | null
  accessMode?: RuntimeAccessMode
  teamBinding?: RuntimeTeamBinding
  connected?: boolean
}

export type RuntimeAccessAuditResult = 'allowed' | 'denied' | 'error'

export type RuntimeAccessAuditEntry = {
  at: number
  deviceId: string
  deviceName?: string
  accessMode: 'full' | 'team-read'
  teamGroupId?: string
  memberId?: string
  method: string
  result: RuntimeAccessAuditResult
  requestId?: string
  durationMs?: number
}

// Only public link metadata is retained by the renderer. Credentials stay in DeviceRegistry.
export const RuntimePairingLinkReferenceSchema = z.object({
  version: z.literal(1),
  deviceId: z.string().min(1).max(128),
  endpoint: z.string().min(1).max(4096),
  publicKeyB64: z.string().min(1).max(128),
  address: z.string().min(1).max(4096),
  intent: z.enum(['another', 'local', 'custom']),
  webClientAvailable: z.boolean()
})

export type RuntimePairingLinkReference = z.infer<typeof RuntimePairingLinkReferenceSchema>
export type RuntimePairingLink = {
  pairingUrl: string
  webClientUrl: string | null
  endpoint: string
  deviceId: string
}
