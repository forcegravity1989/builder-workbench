import {
  SHARE_MAX_CONTENT_BYTES,
  shareContentByteLength,
  type ShareConfigView,
  type SharePublishResult,
  type ShareRecordView,
  type ShareResult
} from '../../shared/workbench/share'
import {
  checkShareService,
  createShare,
  deleteShare,
  ShareServiceError,
  updateShare
} from './self-hosted-share-client'
import {
  createShareConfigStore,
  normalizeShareServerUrl,
  ShareConfigError,
  shareConfigView
} from './self-hosted-share-config'
import { createShareRecordStore } from './self-hosted-share-records'

export type ShareService = {
  getConfig: () => Promise<ShareConfigView>
  saveConfig: (update: {
    serverUrl: string
    uploadToken?: string
  }) => Promise<ShareResult<ShareConfigView>>
  testConfig: (input: {
    serverUrl: string
    uploadToken?: string
  }) => Promise<ShareResult<{ serverUrl: string }>>
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

export function createShareService(options: {
  dataDir: () => string
  fetchImpl?: typeof fetch
}): ShareService {
  const configStore = createShareConfigStore(options)
  const recordStore = createShareRecordStore(options)

  function failure(error: unknown): ShareResult<never> {
    if (error instanceof ShareServiceError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    if (error instanceof ShareConfigError) {
      return { ok: false, error: { code: 'invalid-config', message: error.message } }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { code: 'unknown', message } }
  }

  async function activeConfig(): Promise<{ serverUrl: string; uploadToken: string }> {
    const config = await configStore.read()
    if (!config.serverUrl) {
      throw new ShareServiceError('not-configured', '尚未配置分享服务地址')
    }
    return config
  }

  return {
    async getConfig() {
      return shareConfigView(await configStore.read())
    },

    async saveConfig(update) {
      try {
        const saved = await configStore.save(update)
        return { ok: true, value: shareConfigView(saved) }
      } catch (error) {
        return failure(error)
      }
    },

    async testConfig(input) {
      try {
        const current = await configStore.read()
        const serverUrl = normalizeShareServerUrl(input.serverUrl)
        if (!serverUrl) {
          throw new ShareServiceError('not-configured', '请先填写分享服务地址')
        }
        await checkShareService({
          serverUrl,
          uploadToken: input.uploadToken?.trim() || current.uploadToken,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
        })
        return { ok: true, value: { serverUrl } }
      } catch (error) {
        return failure(error)
      }
    },

    async publish(request) {
      try {
        const config = await activeConfig()
        const bytes = shareContentByteLength(request.content)
        if (bytes > SHARE_MAX_CONTENT_BYTES) {
          throw new ShareServiceError('too-large', '文件超过 10 MiB，无法分享')
        }
        const clientConfig = {
          serverUrl: config.serverUrl,
          uploadToken: config.uploadToken,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
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
              clientConfig,
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
        const created = await createShare(clientConfig, payload)
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
        const config = await activeConfig()
        const record = await recordStore.get(sourceKey)
        if (record) {
          await deleteShare(
            {
              serverUrl: config.serverUrl,
              uploadToken: config.uploadToken,
              ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
            },
            record.id,
            record.editToken
          )
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
