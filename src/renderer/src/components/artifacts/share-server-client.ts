import type { SharePublishResult, ShareResult } from '../../../../shared/workbench/share'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

const LOCAL_RUNTIME = { kind: 'local' } as const

export function publishShare(request: {
  sourceKey: string
  content: string
  fileName: string
  title?: string
}): Promise<ShareResult<SharePublishResult>> {
  return callRuntimeRpc<ShareResult<SharePublishResult>>(
    LOCAL_RUNTIME,
    'workbench.share.publish',
    request
  )
}

export async function getShareLink(sourceKey: string): Promise<string | null> {
  const result = await callRuntimeRpc<ShareResult<{ url: string } | null>>(
    LOCAL_RUNTIME,
    'workbench.share.getLink',
    { sourceKey }
  )
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value?.url ?? null
}

export function removeShare(sourceKey: string): Promise<ShareResult<null>> {
  return callRuntimeRpc<ShareResult<null>>(LOCAL_RUNTIME, 'workbench.share.remove', { sourceKey })
}
