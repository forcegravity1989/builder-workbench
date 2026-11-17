import type { ShareErrorCode } from '../../shared/workbench/share'

export class ShareServiceError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ShareServiceError'
  }
}

export type ShareClientConfig = {
  serverUrl: string
  uploadToken: string
  /** Test seam; production uses the global fetch. */
  fetchImpl?: typeof fetch
}

type ShareCreateResponse = {
  id: string
  url: string
  editToken: string
  expiresAt: string
}

type ShareUpdateResponse = {
  id: string
  url: string
  expiresAt: string
  updatedAt: string
}

const REQUEST_TIMEOUT_MS = 30_000

function requestUrl(base: string, path: string): string {
  return `${base}${path}`
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    const code = typeof body.error?.code === 'string' ? body.error.code : ''
    const message = typeof body.error?.message === 'string' ? body.error.message : ''
    return `${code} ${message}`.trim()
  } catch {
    return ''
  }
}

function mapStatus(status: number, detail: string): ShareServiceError {
  if (status === 401) {
    return new ShareServiceError('unauthorized', '分享服务拒绝了本机凭据')
  }
  // The service answers 403 only when the x-edit-token does not belong to the record.
  if (status === 403) {
    return new ShareServiceError('forbidden', '本机记录无法更新该分享链接，链接可能已不属于此设备')
  }
  if (status === 413) {
    return new ShareServiceError('too-large', '文件超过分享服务的单份上限（10 MiB）')
  }
  if (status === 429) {
    return new ShareServiceError('rate-limited', '上传太频繁，请稍后再试')
  }
  if (status === 415) {
    return new ShareServiceError('unsupported', '分享服务只接受 HTML 内容')
  }
  if (status === 404) {
    return new ShareServiceError('not-found', '分享链接不存在或已过期')
  }
  if (status === 503 && detail.includes('busy')) {
    return new ShareServiceError('busy', '分享服务正忙，请稍后再试')
  }
  return new ShareServiceError('server', `分享服务返回 ${status}${detail ? `：${detail}` : ''}`)
}

/**
 * Mint a per-device upload token. The service returns the plaintext exactly once; the caller
 * persists it and never exposes it to the renderer.
 */
export async function enrollClient(config: {
  serverUrl: string
  enrollKey: string
  fetchImpl?: typeof fetch
}): Promise<{ token: string; createdAt: string }> {
  const fetchImpl = config.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(requestUrl(config.serverUrl, '/api/client-tokens'), {
      method: 'POST',
      headers: { 'x-enroll-key': config.enrollKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ShareServiceError('network', `无法连接分享服务：${reason}`)
  }
  if (!response.ok) {
    throw mapStatus(response.status, await readErrorBody(response))
  }
  const body = (await response.json()) as { token?: unknown; createdAt?: unknown }
  if (typeof body.token !== 'string' || body.token.trim() === '') {
    throw new ShareServiceError('server', '分享服务未返回有效的本机凭据')
  }
  return {
    token: body.token,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString()
  }
}

async function requestJson<T>(
  config: ShareClientConfig,
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
): Promise<T> {
  const fetchImpl = config.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(requestUrl(config.serverUrl, path), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ShareServiceError('network', `无法连接分享服务：${reason}`)
  }
  if (!response.ok) {
    throw mapStatus(response.status, await readErrorBody(response))
  }
  return (await response.json()) as T
}

export async function checkShareService(config: ShareClientConfig): Promise<void> {
  const fetchImpl = config.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(requestUrl(config.serverUrl, '/healthz'), {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ShareServiceError('network', `无法连接分享服务：${reason}`)
  }
  if (!response.ok) {
    throw mapStatus(response.status, '')
  }
}

export function createShare(
  config: ShareClientConfig,
  payload: { content: string; fileName: string; title?: string }
): Promise<ShareCreateResponse> {
  return requestJson<ShareCreateResponse>(config, '/api/shares', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.uploadToken ? { 'x-upload-token': config.uploadToken } : {})
    },
    body: JSON.stringify(payload)
  })
}

export function updateShare(
  config: ShareClientConfig,
  id: string,
  editToken: string,
  payload: { content: string; fileName: string; title?: string }
): Promise<ShareUpdateResponse> {
  return requestJson<ShareUpdateResponse>(config, `/api/shares/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-edit-token': editToken },
    body: JSON.stringify(payload)
  })
}

export async function deleteShare(
  config: ShareClientConfig,
  id: string,
  editToken: string
): Promise<void> {
  const fetchImpl = config.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(
      requestUrl(config.serverUrl, `/api/shares/${encodeURIComponent(id)}`),
      {
        method: 'DELETE',
        headers: { 'x-edit-token': editToken },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ShareServiceError('network', `无法连接分享服务：${reason}`)
  }
  if (!response.ok && response.status !== 404) {
    throw mapStatus(response.status, await readErrorBody(response))
  }
}
