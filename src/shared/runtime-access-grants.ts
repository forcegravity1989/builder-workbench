import { z } from 'zod'

export type RuntimeAccessGrant = {
  deviceId: string
  name: string
  createdAt: number
  lastSeenAt: number | null
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
