import { z } from 'zod'
import { OptionalString, requiredNumber, requiredString } from './rpc-param-primitives'

export const WorkspacePortScanParams = z.object({
  repoId: OptionalString
})

export const WorkspacePortKillParams = z.object({
  repoId: OptionalString,
  pid: requiredNumber('Missing process id'),
  port: requiredNumber('Missing port')
})

export const WorkspacePortProbePageParams = z.object({
  host: requiredString('Missing host'),
  port: requiredNumber('Missing port'),
  protocol: z.enum(['http', 'https'])
})
