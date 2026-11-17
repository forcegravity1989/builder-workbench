import {
  SHARE_MAX_CONTENT_BYTES,
  shareContentByteLength,
  type SharePublishResult,
  type ShareRecordView,
  type ShareResult
} from '../../shared/workbench/share'
import {
  createShare,
  deleteShare,
  enrollClient,
  ShareServiceError,
  updateShare
} from './self-hosted-share-client'
import {
  createShareTokenStore,
  SHARE_ENROLL_KEY,
  SHARE_SERVER_URL
} from './self-hosted-share-config'
import { createShareRecordStore } from './self-hosted-share-records'

export type ShareService = {
  publish: (request: {
    sourceKey: string
    content: string
    fileName: string
    title?: string
  }) => Promise<ShareResult<SharePublishResult>>
  getLink: (sourceKey: string) => Promise<ShareResult<ShareRecordView | null>>
  remove: (sourceKey: string) => Promise<ShareResult<null>>
  list: () => Promise<ShareResult<(ShareRecordView & { sourceKey: string })[]>>
}

type ShareClientConfig = { serverUrl: string; uploadToken: string; fetchImpl?: typeof fetch }

export function createShareService(options: {
  dataDir: () => string
  serverUrl?: string
  enrollKey?: string
  fetchImpl?: typeof fetch
}): ShareService {
  const tokenStore = createShareTokenStore(options)
  const recordStore = createShareRecordStore(options)
  const serverUrl = options.serverUrl ?? SHARE_SERVER_URL
  const enrollKey = options.enrollKey ?? SHARE_ENROLL_KEY
  let enrollment: Promise<string> | null = null

  function failure(error: unknown): ShareResult<never> {
    if (error instanceof ShareServiceError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { code: 'unknown', message } }
  }

  /** Enroll once per device; a stored token is reused for every later share. */
  function uploadToken(): Promise<string> {
    enrollment ??= (async () => {
      const stored = await tokenStore.read()
      if (stored) {
        return stored
      }
      const issued = await enrollClient({
        serverUrl,
        enrollKey,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      })
      await tokenStore.save(issued.token)
      return issued.token
    })().finally(() => {
      enrollment = null
    })
    return enrollment
  }

  function clientConfig(token: string): ShareClientConfig {
    return {
      serverUrl,
      uploadToken: token,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
    }
  }

  /**
   * Only creating a share needs the per-device upload token. Updates and deletes authenticate
   * with the link's own edit token, so they must keep working even if this device can no longer
   * enroll.
   *
   * A token revoked or wiped on the server should heal itself: drop the stored value, enroll
   * again, and retry the create once.
   */
  async function withUploadToken<T>(
    operation: (config: ShareClientConfig) => Promise<T>
  ): Promise<T> {
    const token = await uploadToken()
    try {
      return await operation(clientConfig(token))
    } catch (error) {
      if (!(error instanceof ShareServiceError) || error.code !== 'unauthorized') {
        throw error
      }
      await tokenStore.save('')
      return operation(clientConfig(await uploadToken()))
    }
  }

  return {
    async publish(request) {
      try {
        const bytes = shareContentByteLength(request.content)
        if (bytes > SHARE_MAX_CONTENT_BYTES) {
          throw new ShareServiceError('too-large', '文件超过 10 MiB，无法分享')
        }
        const payload = {
          content: request.content,
          fileName: request.fileName,
          ...(request.title ? { title: request.title } : {})
        }
        const existing = await recordStore.get(request.sourceKey)
        if (existing) {
          try {
            const updated = await updateShare(
              clientConfig(''),
              existing.id,
              existing.editToken,
              payload
            )
            const record = {
              id: updated.id,
              url: updated.url,
              editToken: existing.editToken,
              expiresAt: updated.expiresAt,
              updatedAt: updated.updatedAt
            }
            await recordStore.put(request.sourceKey, record)
            // Why: only the host may keep the edit token; it must never reach the renderer.
            return { ok: true, value: { ...toView(record), change: 'updated' as const } }
          } catch (error) {
            // A link removed on the server or expired locally should not block a fresh share.
            if (!(error instanceof ShareServiceError) || error.code !== 'not-found') {
              throw error
            }
            await recordStore.remove(request.sourceKey)
          }
        }
        const created = await withUploadToken((config) => createShare(config, payload))
        const record = {
          id: created.id,
          url: created.url,
          editToken: created.editToken,
          expiresAt: created.expiresAt,
          updatedAt: new Date().toISOString()
        }
        await recordStore.put(request.sourceKey, record)
        return { ok: true, value: { ...toView(record), change: 'created' as const } }
      } catch (error) {
        return failure(error)
      }
    },

    async getLink(sourceKey) {
      try {
        const record = await recordStore.get(sourceKey)
        return { ok: true, value: record ? toView(record) : null }
      } catch (error) {
        return failure(error)
      }
    },

    async remove(sourceKey) {
      try {
        const record = await recordStore.get(sourceKey)
        if (record) {
          await deleteShare(clientConfig(''), record.id, record.editToken)
          await recordStore.remove(sourceKey)
        }
        return { ok: true, value: null }
      } catch (error) {
        return failure(error)
      }
    },

    async list() {
      try {
        const entries = await recordStore.list()
        return {
          ok: true,
          value: entries.map(({ sourceKey, record }) => ({ ...toView(record), sourceKey }))
        }
      } catch (error) {
        return failure(error)
      }
    }
  }
}

function toView(record: {
  url: string
  id: string
  expiresAt: string
  updatedAt: string
}): ShareRecordView {
  return {
    id: record.id,
    url: record.url,
    expiresAt: record.expiresAt,
    updatedAt: record.updatedAt
  }
}
