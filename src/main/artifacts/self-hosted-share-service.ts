import {
  SHARE_MAX_CONTENT_BYTES,
  shareContentByteLength,
  type ShareListEntry,
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
  list: () => Promise<ShareResult<ShareListEntry[]>>
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
    // A raw filesystem or transport error is diagnostics, not copy. The CLI prints the message and
    // the log keeps the stack; the interface maps the code to its own words.
    console.error('Workbench share failed:', error)
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

  /**
   * One operation per file at a time. Two publishes of the same file — the toolbar popover and
   * the editor header, or the page and `orca artifacts share` — would each read "no record yet",
   * each create a link, and the loser's link would survive on the server with no local record and
   * no edit token left to remove it.
   */
  const chains = new Map<string, Promise<unknown>>()

  function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const queued = run.then(
      () => undefined,
      () => undefined
    )
    chains.set(key, queued)
    void queued.then(() => {
      if (chains.get(key) === queued) {
        chains.delete(key)
      }
    })
    return run
  }

  async function publishOnce(request: {
    sourceKey: string
    content: string
    fileName: string
    title?: string
  }): Promise<ShareResult<SharePublishResult>> {
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
            // The service answers null when retention is off; records keep '' for "no expiry" so
            // the stored shape stays a plain string and a reload cannot mistake it for garbage.
            expiresAt: updated.expiresAt ?? '',
            updatedAt: updated.updatedAt
          }
          await recordStore.put(request.sourceKey, record)
          // Why: only the host may keep the edit token; it must never reach the renderer.
          return { ok: true, value: { ...toView(record), change: 'updated' as const } }
        } catch (error) {
          // A link the server no longer knows (404), or one whose edit token this machine no
          // longer holds (403: records restored from backup, copied between machines, or a rebuilt
          // server data directory), must not block a fresh share. Dropping the record is what
          // makes the fallthrough below create a new link instead of failing forever.
          if (
            !(error instanceof ShareServiceError) ||
            (error.code !== 'not-found' && error.code !== 'forbidden')
          ) {
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
        expiresAt: created.expiresAt ?? '',
        updatedAt: new Date().toISOString()
      }
      try {
        await recordStore.put(request.sourceKey, record)
      } catch (error) {
        // The link exists and its edit token dies with the failed write, which would leave a public
        // link nothing in the product can remove. Undo the create; if that fails too, say so where
        // an operator can find it, then report the original failure.
        const undone = await deleteShare(clientConfig(''), created.id, created.editToken).then(
          () => true,
          () => false
        )
        if (!undone) {
          console.error(
            `Share ${created.id} was created but could not be recorded or removed; it needs operator cleanup on the share service`,
            error
          )
        }
        throw error
      }
      return { ok: true, value: { ...toView(record), change: 'created' as const } }
    } catch (error) {
      return failure(error)
    }
  }

  return {
    publish(request) {
      return serialized(request.sourceKey, () => publishOnce(request))
    },

    async getLink(sourceKey) {
      try {
        const record = await recordStore.get(sourceKey)
        return { ok: true, value: record ? toView(record) : null }
      } catch (error) {
        return failure(error)
      }
    },

    remove(sourceKey) {
      return serialized(sourceKey, async () => {
        try {
          const record = await recordStore.get(sourceKey)
          if (!record) {
            return { ok: true, value: null }
          }
          try {
            await deleteShare(clientConfig(''), record.id, record.editToken)
          } catch (error) {
            // The server refuses this machine's edit token, so the link is no longer ours to
            // delete. Keeping the row would leave an entry that can never be removed; drop it and
            // say plainly that the public link may still exist.
            if (!(error instanceof ShareServiceError) || error.code !== 'forbidden') {
              throw error
            }
            await recordStore.remove(sourceKey)
            return {
              ok: false,
              error: {
                code: 'stale-record' as const,
                message:
                  '本机记录已移除，但服务端拒绝了这份编辑令牌，原链接可能仍然存在，需要运维在服务端删除'
              }
            }
          }
          await recordStore.remove(sourceKey)
          return { ok: true, value: null }
        } catch (error) {
          return failure(error)
        }
      })
    },

    async list() {
      try {
        const entries = await recordStore.list()
        const unreadable = recordStore.unreadableIndex()
        if (unreadable && entries.length === 0) {
          // An index we could not read is not the same as an empty one: the links it recorded are
          // still live on the server, so "nothing shared" would be a false all-clear.
          console.error('Workbench share records are unreadable:', unreadable)
          return {
            ok: false,
            error: {
              code: 'records-unreadable' as const,
              message: `本机分享记录无法读取${
                unreadable.archivedAs ? `（已隔离为 ${unreadable.archivedAs}）` : ''
              }，无法确认你分享过哪些文件；这些链接可能仍然有效，重新分享同一文件会建立新链接`
            }
          }
        }
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
