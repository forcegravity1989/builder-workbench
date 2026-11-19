import type {
  ShareErrorCode,
  ShareListEntry,
  SharePublishResult,
  ShareResult
} from '../../../../shared/workbench/share'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

const LOCAL_RUNTIME = { kind: 'local' } as const

/**
 * A host-side share failure, carrying the code and the message the host chose for it. Callers show
 * the message when the host has something specific to say — an unreadable record index, for
 * instance — and fall back to their own copy otherwise.
 */
export class ShareLinkError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ShareLinkError'
  }
}

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
    throw new ShareLinkError(result.error.code, result.error.message)
  }
  return result.value?.url ?? null
}

export function removeShare(sourceKey: string): Promise<ShareResult<null>> {
  return callRuntimeRpc<ShareResult<null>>(LOCAL_RUNTIME, 'workbench.share.remove', { sourceKey })
}

export async function listShares(): Promise<ShareListEntry[]> {
  const result = await callRuntimeRpc<ShareResult<ShareListEntry[]>>(
    LOCAL_RUNTIME,
    'workbench.share.list',
    {}
  )
  if (!result.ok) {
    throw new ShareLinkError(result.error.code, result.error.message)
  }
  return result.value
}
