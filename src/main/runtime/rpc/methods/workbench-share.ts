import type { RpcContext } from '../core'
import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { nativeShareService } from '../../../artifacts/self-hosted-share-runtime'
import {
  ShareConfigSaveSchema,
  ShareConfigTestSchema,
  SharePublishSchema,
  ShareSourceSchema
} from '../../../../shared/workbench/share'

/** The share server address and upload token belong to the host device that owns them. */
function requireHostDevice(context: Pick<RpcContext, 'clientKind'>): void {
  if (context.clientKind !== undefined) {
    throw new Error('Sharing settings can only be changed on the desktop app on the host device.')
  }
}

export const WORKBENCH_SHARE_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.share.config.get',
    params: null,
    handler: () => nativeShareService().getConfig()
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.config.save',
    params: ShareConfigSaveSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().saveConfig(params)
    }
  }),
  defineWorkbenchMethod({
    name: 'workbench.share.config.test',
    params: ShareConfigTestSchema,
    handler: (params, context) => {
      requireHostDevice(context)
      return nativeShareService().testConfig(params)
    }
  }),
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
