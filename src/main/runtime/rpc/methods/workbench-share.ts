import type { RpcContext } from '../core'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { nativeShareService } from '../../../artifacts/self-hosted-share-runtime'
import {
  ShareListSchema,
  SharePublishSchema,
  ShareSourceSchema
} from '../../../../shared/workbench/share'

/** The per-device upload token is minted and kept by the host device only. */
function requireHostDevice({ caller }: Pick<RpcContext, 'caller'>): void {
  if (caller?.kind !== 'desktop' && caller?.kind !== 'local-cli') {
    throw new Error('Sharing can only be changed on the desktop app on the host device.')
  }
}

export const WORKBENCH_SHARE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.share.publish',
    permission: 'workspace',
    params: SharePublishSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().publish(params)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.getLink',
    permission: 'workspace',
    params: ShareSourceSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().getLink(params.sourceKey)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.remove',
    permission: 'workspace',
    params: ShareSourceSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().remove(params.sourceKey)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.list',
    permission: 'workspace',
    params: ShareListSchema,
    handler: (_params, context) => {
      requireHostDevice(context)
      return nativeShareService().list()
    }
  })
]
