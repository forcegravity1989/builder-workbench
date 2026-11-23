import type { RpcContext } from '../core'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { nativeShareService } from '../../../artifacts/self-hosted-share-runtime'
import {
  ShareListSchema,
  SharePublishSchema,
  ShareSourceSchema
} from '../../../../shared/workbench/share'

/** The per-device upload token is minted and kept by the host device only. */
function requireHostDevice(context: Pick<RpcContext, 'clientKind' | 'clientId'>): void {
  // Why: the desktop renderer reaches these methods over the runtime:call IPC channel with a
  // fixed clientId, while paired web/mobile clients arrive over the RPC server with their
  // pairing token as clientId — the host UI must pass, remote clients must not.
  if (context.clientKind !== undefined && context.clientId !== 'desktop-renderer') {
    throw new Error('Sharing can only be changed on the desktop app on the host device.')
  }
}

export const WORKBENCH_SHARE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.share.publish',
    params: SharePublishSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().publish(params)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.getLink',
    params: ShareSourceSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().getLink(params.sourceKey)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.remove',
    params: ShareSourceSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().remove(params.sourceKey)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.list',
    params: ShareListSchema,
    handler: (_params, context) => {
      requireHostDevice(context)
      return nativeShareService().list()
    }
  })
]
