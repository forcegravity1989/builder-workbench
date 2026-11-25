import type { RuntimeCapability } from '../../../shared/protocol-version'
import type { TerminalStreamFrame } from '../../../shared/terminal-stream-protocol'
import type { PairingRpcContext } from './core'
import type {
  RuntimeAccessMode,
  RuntimeTeamBinding
} from '../../../shared/runtime-session-contracts'

export type RpcDispatchStreamingOptions = {
  authenticatedCallerFingerprint?: string
  connectionId?: string
  signal?: AbortSignal
  clientId?: string
  pairedDeviceId?: string
  pairedDeviceName?: string
  accessMode?: RuntimeAccessMode
  teamBinding?: RuntimeTeamBinding
  clientKind?: 'mobile' | 'runtime'
  clientCapabilities?: readonly RuntimeCapability[]
  updateClientCapabilities?: (capabilities: readonly RuntimeCapability[]) => void
  pairing?: PairingRpcContext
  sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  registerBinaryStreamHandler?: (
    streamId: number,
    handler: (frame: TerminalStreamFrame) => void
  ) => () => void
  registerBinaryMessageHandler?: (
    handler: (bytes: Uint8Array<ArrayBufferLike>) => void
  ) => () => void
}
