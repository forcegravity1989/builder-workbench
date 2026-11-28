import { isShareError, ShareError } from './errors.mjs'
import { parseSharePayload } from './payload.mjs'
import { isValidShareId } from './store.mjs'
import { tokenMatches, tokenMatchesHash } from './tokens.mjs'

const RATE_WINDOW_MS = 60_000
/**
 * A decodable body can be larger than the HTML it carries: JSON escaping turns one byte into six
 * (`<`). The cap below bounds what the client may send; the authoritative size check runs on
 * the decoded payload.
 */
const BODY_LIMIT_FACTOR = 6
const JSON_OVERHEAD_BYTES = 1024 * 1024
/** Bodies held in memory at once across all requests, sized for one 200 MiB upload plus a second smaller one. */
const MAX_IN_FLIGHT_BODY_BYTES = 512 * 1024 * 1024
const RATE_MAP_LIMIT = 10_000

/**
 * Shared CSP for share pages. The page keeps inline scripts so reports render, but the opaque
 * sandbox origin keeps it from touching this service's origin or any stored credential.
 */
export const SHARE_PAGE_CSP =
  'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads'

/**
 * CSP for the viewer page. Unlike the sandboxed content, the viewer is trusted service code that
 * talks to the annotation API on this origin, so it gets a normal origin policy instead of the
 * opaque sandbox. Inline script/style come from the server-side template, not user input.
 * frame-ancestors 'none' stops other sites framing the viewer to clickjack an annotation submit;
 * it does not affect the /content iframe the viewer itself embeds (that is governed by frame-src).
 */
export const VIEWER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"

/**
 * Annotation payloads are tiny next to shares. readJsonBody inflates this by the JSON-escape
 * factor plus overhead (so the wire limit lands near 1.4 MiB); the store's per-field limits are
 * the authoritative cap on decoded content.
 */
const ANNOTATION_BODY_LIMIT_BYTES = 64 * 1024

/**
 * @param {object} options
 * @param {ReturnType<import('./store.mjs').createShareStore>} options.store
 * @param {ReturnType<import('./annotations-store.mjs').createAnnotationStore>} options.annotations
 * @param {ReturnType<import('./client-tokens.mjs').createClientTokenStore>} options.clientTokens
 * @param {import('./config.mjs').ShareConfig} options.config
 * @param {string} options.viewerHtml  Template with `__BW_FILE_NAME__` / `__BW_CREATED_AT__` placeholders.
 * @param {string} options.bridgeScript  Element-picking bridge appended to /s/:id/content.
 * @param {(line: string) => void} [options.log]
 * @param {() => number} [options.now]
 */
export function createRequestHandler({
  store,
  annotations,
  clientTokens,
  config,
  viewerHtml,
  bridgeScript,
  log = console.log,
  now = Date.now
}) {
  const allowWrite = createRateLimiter({ limit: config.rateLimitPerMinute, now })
  const bodyBudget = createBodyBudget(MAX_IN_FLIGHT_BODY_BYTES)

  return function handle(req, res) {
    const startedAt = process.hrtime.bigint()
    let route = 'unknown'
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      const bytes = Number(res.getHeader('content-length') ?? 0)
      log(
        `${res.statusCode} ${req.method ?? 'GET'} ${route} ${elapsedMs.toFixed(1)}ms ${bytes}B ${clientIp(req, config)}`
      )
    })
    handleRequest(req, res)
      .catch((error) => {
        sendError(res, error, log)
        // Errors before the body is consumed (413, 429) leave inbound bytes unread. Without
        // draining, closing the socket resets the connection and the client loses the response.
        req.resume()
      })
      .catch((error) => {
        log(`failed to send response: ${String(error)}`)
        res.destroy()
      })

    async function handleRequest(request, response) {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const pathname = url.pathname
      const method = request.method ?? 'GET'

      if (pathname === '/healthz') {
        route = '/healthz'
        if (method !== 'GET' && method !== 'HEAD') {
          throw methodNotAllowed('GET, HEAD')
        }
        sendJson(response, 200, { status: 'ok', time: new Date(now()).toISOString() }, method)
        return
      }

      if (pathname === '/api/client-tokens') {
        route = '/api/client-tokens'
        if (method !== 'POST') {
          throw methodNotAllowed('POST')
        }
        if (!allowWrite(clientIp(request, config))) {
          throw new ShareError(429, 'rate_limited', 'Too many writes; retry in a minute.')
        }
        requireEnrollKey(request, config)
        sendJson(response, 201, await clientTokens.issue())
        return
      }

      if (pathname === '/api/shares') {
        route = '/api/shares'
        if (method !== 'POST') {
          throw methodNotAllowed('POST')
        }
        if (!allowWrite(clientIp(request, config))) {
          throw new ShareError(429, 'rate_limited', 'Too many writes; retry in a minute.')
        }
        requireUploadToken(request, config, clientTokens)
        const payload = parseSharePayload(
          await readJsonBody(request, config.maxBytes, bodyBudget),
          config.maxBytes
        )
        const created = await store.create(payload)
        const url = shareLink(request, config, created.id)
        sendJson(response, 201, {
          id: created.id,
          url,
          editToken: created.editToken,
          expiresAt: created.meta.expiresAt
        })
        return
      }

      const apiShare = pathname.match(/^\/api\/shares\/([^/]+)$/)
      if (apiShare) {
        const id = apiShare[1]
        route = '/api/shares/:id'
        if (method !== 'PUT' && method !== 'DELETE') {
          throw methodNotAllowed('PUT, DELETE')
        }
        if (!allowWrite(clientIp(request, config))) {
          throw new ShareError(429, 'rate_limited', 'Too many writes; retry in a minute.')
        }
        if (!isValidShareId(id)) {
          throw new ShareError(404, 'not_found', 'Share not found.')
        }
        const editToken = headerValue(request.headers['x-edit-token'])
        if (!editToken) {
          throw new ShareError(403, 'forbidden', 'Missing x-edit-token header.')
        }
        if (method === 'DELETE') {
          await store.remove(id, editToken)
          writeHeaders(response, 204, { 'cache-control': 'no-store' })
          response.end()
          return
        }
        const payload = parseSharePayload(
          await readJsonBody(request, config.maxBytes, bodyBudget),
          config.maxBytes
        )
        const meta = await store.update(id, editToken, payload)
        sendJson(response, 200, {
          id: meta.id,
          url: shareLink(request, config, meta.id),
          expiresAt: meta.expiresAt,
          updatedAt: meta.updatedAt
        })
        return
      }

      const apiAnnotations = pathname.match(/^\/api\/shares\/([^/]+)\/annotations$/)
      if (apiAnnotations) {
        const id = apiAnnotations[1]
        route = '/api/shares/:id/annotations'
        if (method !== 'GET' && method !== 'POST') {
          throw methodNotAllowed('GET, POST')
        }
        if (!isValidShareId(id) || !(await store.meta(id))) {
          throw new ShareError(404, 'not_found', 'Share not found.')
        }
        if (method === 'GET') {
          sendJson(response, 200, { items: await annotations.list(id) }, method)
          return
        }
        if (!allowWrite(clientIp(request, config))) {
          throw new ShareError(429, 'rate_limited', 'Too many writes; retry in a minute.')
        }
        // Sandboxed share content cannot send this content type without a CORS preflight (which
        // this API never allows), so requiring it keeps untrusted shared pages from writing
        // annotations to their own share while the same-origin viewer keeps working.
        const contentType = headerValue(request.headers['content-type'])
          .split(';')[0]
          .trim()
          .toLowerCase()
        if (contentType !== 'application/json') {
          throw new ShareError(415, 'unsupported_media_type', 'Use content-type: application/json.')
        }
        const input = await readJsonBody(request, ANNOTATION_BODY_LIMIT_BYTES, bodyBudget)
        const created = await annotations.add(id, input)
        sendJson(response, 201, created, method)
        return
      }

      const apiAnnotation = pathname.match(/^\/api\/shares\/([^/]+)\/annotations\/([^/]+)$/)
      if (apiAnnotation) {
        const id = apiAnnotation[1]
        const annotationId = apiAnnotation[2]
        route = '/api/shares/:id/annotations/:annotationId'
        if (method !== 'DELETE') {
          throw methodNotAllowed('DELETE')
        }
        const shareMeta = isValidShareId(id) ? await store.meta(id) : null
        if (!shareMeta) {
          throw new ShareError(404, 'not_found', 'Share not found.')
        }
        if (!allowWrite(clientIp(request, config))) {
          throw new ShareError(429, 'rate_limited', 'Too many writes; retry in a minute.')
        }
        const editToken = headerValue(request.headers['x-edit-token'])
        if (editToken) {
          // Share owner: the edit token authorizes deleting any annotation on this share.
          if (!tokenMatchesHash(editToken, shareMeta.editTokenHash)) {
            throw new ShareError(403, 'forbidden', 'Edit token does not match this share.')
          }
          await annotations.removeAny(id, annotationId)
        } else {
          const deleteToken = headerValue(request.headers['x-delete-token'])
          if (!deleteToken) {
            throw new ShareError(
              403,
              'forbidden',
              'Missing x-delete-token (author) or x-edit-token (owner) header.'
            )
          }
          await annotations.removeByAuthor(id, annotationId, deleteToken)
        }
        writeHeaders(response, 204, { 'cache-control': 'no-store' })
        response.end()
        return
      }

      const rawShare = pathname.match(/^\/s\/([^/]+)\/raw$/)
      if (rawShare) {
        route = '/s/:id/raw'
        if (method !== 'GET' && method !== 'HEAD') {
          throw methodNotAllowed('GET, HEAD')
        }
        const share = isValidShareId(rawShare[1]) ? await store.open(rawShare[1]) : null
        if (!share) {
          sendNotFoundPage(response, method)
          return
        }
        sendShareContent(response, method, share, null, log)
        return
      }

      const contentShare = pathname.match(/^\/s\/([^/]+)\/content$/)
      if (contentShare) {
        route = '/s/:id/content'
        if (method !== 'GET' && method !== 'HEAD') {
          throw methodNotAllowed('GET, HEAD')
        }
        const share = isValidShareId(contentShare[1]) ? await store.open(contentShare[1]) : null
        if (!share) {
          sendNotFoundPage(response, method)
          return
        }
        // The bridge rides after the original bytes. Documents without </body> still execute a
        // trailing script tag; documents whose own CSP blocks it degrade to page-level annotations
        // (the viewer detects the missing handshake and says so).
        sendShareContent(
          response,
          method,
          share,
          Buffer.from(`<script>${bridgeScript}</script>`, 'utf8'),
          log
        )
        return
      }

      const viewShare = pathname.match(/^\/s\/([^/]+)$/)
      if (viewShare) {
        route = '/s/:id'
        if (method !== 'GET' && method !== 'HEAD') {
          throw methodNotAllowed('GET, HEAD')
        }
        const meta = isValidShareId(viewShare[1]) ? await store.meta(viewShare[1]) : null
        if (!meta) {
          sendNotFoundPage(response, method)
          return
        }
        const body = Buffer.from(
          viewerHtml
            // Function replacements keep `$&`-style patterns in the escaped file name literal.
            .replaceAll('__BW_FILE_NAME__', () => escapeHtml(meta.fileName))
            .replaceAll('__BW_CREATED_AT__', () => escapeHtml(meta.createdAt)),
          'utf8'
        )
        writeHeaders(response, 200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(body.length),
          'content-security-policy': VIEWER_CSP,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'cache-control': 'no-store'
        })
        response.end(method === 'HEAD' ? undefined : body)
        return
      }

      throw new ShareError(404, 'not_found', 'Unknown route.')
    }
  }
}

/** @param {string} allow */
function methodNotAllowed(allow) {
  return new ShareError(405, 'method_not_allowed', `Use ${allow}.`, { allow })
}

/**
 * Writes are anonymous only on a fresh development instance: a configured static token or any
 * issued per-device token turns the check on. A registry that could not be read turns it *off*
 * instead of open — the enrolled-device set is unknown, so neither "allow" nor "this token is
 * valid" can be concluded.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.mjs').ShareConfig} config
 * @param {ReturnType<import('./client-tokens.mjs').createClientTokenStore>} clientTokens
 */
function requireUploadToken(req, config, clientTokens) {
  const provided = headerValue(req.headers['x-upload-token'])
  // A configured static token is verifiable without the registry, so it keeps working.
  if (tokenMatches(provided, config.uploadToken)) {
    return
  }
  if (clientTokens.isDegraded()) {
    throw new ShareError(
      503,
      'registry_unavailable',
      'Device registry is unreadable; uploads are refused until an operator restores or removes it.'
    )
  }
  if (!config.uploadToken && clientTokens.size() === 0) {
    return
  }
  if (clientTokens.matches(provided)) {
    return
  }
  throw new ShareError(401, 'unauthorized', 'Missing or invalid x-upload-token header.')
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.mjs').ShareConfig} config
 */
function requireEnrollKey(req, config) {
  const provided = headerValue(req.headers['x-enroll-key'])
  if (!tokenMatches(provided, config.enrollKey)) {
    throw new ShareError(401, 'unauthorized', 'Missing or invalid x-enroll-key header.')
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} maxBytes
 * @param {ReturnType<typeof createBodyBudget>} budget
 * @returns {Promise<unknown>}
 */
function readJsonBody(req, maxBytes, budget) {
  const limit = maxBytes * BODY_LIMIT_FACTOR + JSON_OVERHEAD_BYTES
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    req.resume()
    return Promise.reject(tooLarge())
  }
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    let held = 0
    let settled = false
    const settle = (error, value) => {
      if (settled) {
        return
      }
      settled = true
      budget.release(held)
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    req.on('data', (chunk) => {
      if (settled) {
        return
      }
      size += chunk.length
      if (size > limit) {
        settle(tooLarge())
        return
      }
      if (!budget.reserve(chunk.length)) {
        settle(new ShareError(503, 'busy', 'Too many uploads in flight; retry shortly.'))
        return
      }
      held += chunk.length
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) {
        return
      }
      let body
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        settle(new ShareError(400, 'bad_request', 'Request body must be valid JSON.'))
        return
      }
      settle(null, body)
    })
    req.on('error', (error) => settle(error))
  })
}

/** @returns {ShareError} */
function tooLarge() {
  return new ShareError(413, 'too_large', 'Request body is too large.')
}

/**
 * @param {number} limit
 */
function createBodyBudget(limit) {
  let inflight = 0
  return {
    /** @param {number} bytes */
    reserve(bytes) {
      if (inflight + bytes > limit) {
        return false
      }
      inflight += bytes
      return true
    },
    /** @param {number} bytes */
    release(bytes) {
      inflight = Math.max(0, inflight - bytes)
    }
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.mjs').ShareConfig} config
 * @param {string} id
 */
function shareLink(req, config, id) {
  return `${resolveBaseUrl(req, config)}/s/${id}`
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.mjs').ShareConfig} config
 */
function resolveBaseUrl(req, config) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl
  }
  const forwardedProto = config.trustProxy ? firstHeader(req.headers['x-forwarded-proto']) : ''
  const proto = forwardedProto || (req.socket.encrypted ? 'https' : 'http')
  const forwardedHost = config.trustProxy ? firstHeader(req.headers['x-forwarded-host']) : ''
  const host = forwardedHost || firstHeader(req.headers.host) || 'localhost'
  return `${proto}://${host}`
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('./config.mjs').ShareConfig} config
 */
function clientIp(req, config) {
  if (config.trustProxy) {
    // A trusted proxy appends the peer it actually saw, so only the rightmost entry is one a
    // client cannot write itself. Taking the leftmost would let any caller rotate the rate-limit
    // key by spoofing X-Forwarded-For.
    const forwarded = lastHeader(req.headers['x-forwarded-for'])
    if (forwarded) {
      return forwarded
    }
  }
  return req.socket.remoteAddress ?? 'unknown'
}

/**
 * @param {string | string[] | undefined} value
 */
function headerValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value ?? ''
}

/** @param {string | string[] | undefined} value */
function firstHeader(value) {
  return headerValue(value).split(',')[0].trim()
}

/** @param {string | string[] | undefined} value */
function lastHeader(value) {
  return headerValue(value).split(',').at(-1)?.trim() ?? ''
}

/**
 * Headers go through setHeader so the access log can read back content-length after the response
 * finishes; headers passed straight to writeHead are not retained.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, string>} headers
 */
function writeHeaders(res, status, headers) {
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value)
  }
  res.writeHead(status)
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {string} [method]
 * @param {Record<string, string>} [headers]
 */
function sendJson(res, status, body, method, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  writeHeaders(res, status, {
    ...headers,
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store'
  })
  res.end(method === 'HEAD' ? undefined : payload)
}

/**
 * Streams share content with the sandbox CSP. `tail` (the bridge wrapper) is written after the
 * original bytes so the advertised length covers both; HEAD never opens the stream.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {string} method
 * @param {{ size: number, stream: import('node:fs').ReadStream }} share
 * @param {Buffer | null} tail
 * @param {(line: string) => void} log
 */
function sendShareContent(res, method, share, tail, log) {
  const totalLength = share.size + (tail?.length ?? 0)
  writeHeaders(res, 200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(totalLength),
    'content-security-policy': SHARE_PAGE_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store'
  })
  if (method === 'HEAD') {
    share.stream.destroy()
    res.end()
    return
  }
  // Stream the file so a handful of viewers never hold whole reports in memory.
  share.stream.on('error', (error) => {
    log(`failed to stream share: ${error instanceof Error ? error.message : String(error)}`)
    res.destroy()
  })
  // pipe() leaves the source running when the destination closes, so a viewer who closes the
  // tab mid-download would keep the file open until GC. On Windows that held handle makes the
  // next update of this share burn its rename retries and answer 503.
  res.on('close', () => {
    share.stream.destroy()
  })
  if (tail) {
    // Keep the response open past the content so the bridge lands after the original bytes.
    share.stream.pipe(res, { end: false })
    share.stream.on('end', () => {
      res.end(tail)
    })
  } else {
    share.stream.pipe(res)
  }
}

/**
 * The viewer template interpolates share metadata (user-chosen file names) into a trusted
 * same-origin page, so it must never carry markup through.
 *
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} [method]
 */
function sendNotFoundPage(res, method) {
  const body = Buffer.from(
    '<!doctype html><meta charset="utf-8"><title>Not found</title>' +
      '<p>分享链接不存在或已过期。This share link does not exist or has expired.</p>',
    'utf8'
  )
  writeHeaders(res, 404, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(body.length),
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store'
  })
  res.end(method === 'HEAD' ? undefined : body)
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} error
 * @param {(line: string) => void} log
 */
function sendError(res, error, log) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  if (isShareError(error)) {
    sendJson(
      res,
      error.status,
      { error: { code: error.code, message: error.message } },
      undefined,
      error.headers
    )
    return
  }
  log(`unhandled error: ${error instanceof Error ? error.stack : String(error)}`)
  sendJson(res, 500, { error: { code: 'internal', message: 'Internal server error.' } })
}

/**
 * @param {{ limit: number, now: () => number }} options
 */
function createRateLimiter({ limit, now }) {
  /** @type {Map<string, number>} */
  let hits = new Map()
  let windowStart = now()
  return function allow(ip) {
    if (limit <= 0) {
      return true
    }
    const current = now()
    if (current - windowStart >= RATE_WINDOW_MS || hits.size > RATE_MAP_LIMIT) {
      hits = new Map()
      windowStart = current
    }
    const count = (hits.get(ip) ?? 0) + 1
    hits.set(ip, count)
    return count <= limit
  }
}
