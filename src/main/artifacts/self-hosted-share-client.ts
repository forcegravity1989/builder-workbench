import type { ShareErrorCode } from '../../shared/workbench/share'
import { cancelUnreadResponseBody } from '../lib/unread-response-body'

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
  /** Null when the service runs with retention disabled (`BW_SHARE_RETENTION_DAYS=0`). */
  expiresAt: string | null
}

type ShareUpdateResponse = {
  id: string
  url: string
  expiresAt: string | null
  updatedAt: string
}

const REQUEST_TIMEOUT_MS = 30_000

/**
 * `services/bw-share/src/errors.mjs` declares these codes part of the service contract, so the
 * code decides the mapping and the status is only a fallback for a body we could not parse — an
 * HTML 413 from a reverse proxy in front of the service, for instance.
 */
const CODE_BY_SERVICE_CODE: Record<string, ShareErrorCode> = {
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  not_found: 'not-found',
  too_large: 'too-large',
  unsupported_media_type: 'unsupported',
  rate_limited: 'rate-limited',
  busy: 'busy'
}

const CODE_BY_STATUS: Record<number, ShareErrorCode> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  413: 'too-large',
  415: 'unsupported',
  429: 'rate-limited',
  503: 'busy'
}

const MESSAGE_BY_CODE: Partial<Record<ShareErrorCode, string>> = {
  unauthorized: '分享服务拒绝了本机凭据',
  forbidden: '本机记录无法更新该分享链接，链接可能已不属于此设备',
  'not-found': '分享链接不存在或已过期',
  'too-large': '文件超过分享服务的单份上限',
  unsupported: '分享服务只接受 HTML 内容',
  'rate-limited': '上传太频繁，请稍后再试',
  busy: '分享服务正忙，请稍后再试'
}

const ENROLLMENT_FULL_MESSAGE = '分享服务的设备登记已满，需要运维处理后才会恢复'

const REGISTRY_UNAVAILABLE_MESSAGE =
  '分享服务读不出设备凭据记录，已拒绝新建分享，需要运维在服务端恢复或删除该文件后重启'

function requestUrl(base: string, path: string): string {
  return `${base}${path}`
}

function toShareError(status: number, serviceCode: string, message: string): ShareServiceError {
  // Two refusals that retrying cannot clear. They get their own codes so the interface can say
  // "an operator has to fix this" instead of borrowing the retryable busy copy; the message here is
  // what the CLI prints and what lands in the diagnostics log.
  if (serviceCode === 'enrollment_full') {
    return new ShareServiceError('enrollment-full', ENROLLMENT_FULL_MESSAGE)
  }
  if (serviceCode === 'registry_unavailable') {
    return new ShareServiceError('registry-unavailable', REGISTRY_UNAVAILABLE_MESSAGE)
  }
  const code = CODE_BY_SERVICE_CODE[serviceCode] ?? CODE_BY_STATUS[status]
  if (!code) {
    return new ShareServiceError('server', `分享服务返回 ${status}${message ? `：${message}` : ''}`)
  }
  return new ShareServiceError(code, MESSAGE_BY_CODE[code] ?? `分享服务返回 ${status}`)
}

/** Drains the body on every path: an unread body can take the whole process down (orca#8695). */
async function readErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    return {
      code: typeof body.error?.code === 'string' ? body.error.code : '',
      message: typeof body.error?.message === 'string' ? body.error.message : ''
    }
  } catch {
    await cancelUnreadResponseBody(response)
    return { code: '', message: '' }
  }
}

async function toShareErrorFrom(response: Response): Promise<ShareServiceError> {
  const { code, message } = await readErrorBody(response)
  return toShareError(response.status, code, message)
}

function toNetworkError(error: unknown): ShareServiceError {
  const reason = error instanceof Error ? error.message : String(error)
  return new ShareServiceError('network', `无法连接分享服务：${reason}`)
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
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(requestUrl(config.serverUrl, '/api/client-tokens'), {
      method: 'POST',
      headers: { 'x-enroll-key': config.enrollKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw toNetworkError(error)
  }
  if (!response.ok) {
    throw await toShareErrorFrom(response)
  }
  let body: { token?: unknown; createdAt?: unknown } | null
  try {
    body = (await response.json()) as { token?: unknown; createdAt?: unknown }
  } catch {
    await cancelUnreadResponseBody(response)
    body = null
  }
  if (!body || typeof body.token !== 'string' || body.token.trim() === '') {
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
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(requestUrl(config.serverUrl, path), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw toNetworkError(error)
  }
  if (!response.ok) {
    throw await toShareErrorFrom(response)
  }
  try {
    return (await response.json()) as T
  } catch {
    await cancelUnreadResponseBody(response)
    throw new ShareServiceError('server', '分享服务返回了无法解析的结果')
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
  const fetchImpl = config.fetchImpl ?? globalThis.fetch
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
    throw toNetworkError(error)
  }
  // A 404 means the link is already gone, which is what the caller wanted; every other failure
  // keeps the local record so the removal can be retried.
  if (response.ok || response.status === 404) {
    await cancelUnreadResponseBody(response)
    return
  }
  throw await toShareErrorFrom(response)
}
