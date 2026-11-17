import type { RpcContext } from '../core'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { nativeShareService } from '../../../artifacts/self-hosted-share-runtime'
import { SharePublishSchema, ShareSourceSchema } from '../../../../shared/workbench/share'

/** The per-device upload token is minted and kept by the host device only. */
function requireHostDevice(context: Pick<RpcContext, 'clientKind'>): void {
  if (context.clientKind !== undefined) {
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
    handler: (params) => nativeShareService().getLink(params.sourceKey)
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.remove',
    params: ShareSourceSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().remove(params.sourceKey)
    }
  })
]
