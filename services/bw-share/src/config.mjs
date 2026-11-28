import path from 'node:path'

/** Defaults are the documented production posture; every value is overridable by env. */
export const DEFAULT_PORT = 8787
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024
export const DEFAULT_RETENTION_DAYS = 30
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30
/**
 * Enrollment key compiled into the Workbench client. It only keeps unrelated network clients
 * from minting tokens; it is not a secret against anyone who can read this repository.
 */
export const DEFAULT_ENROLL_KEY = 'bwshare-enroll-7d41c9ab6e2f5083'

/**
 * @typedef {object} ShareConfig
 * @property {string} host
 * @property {number} port
 * @property {string} dataDir
 * @property {string} uploadToken  Static upload/admin token; empty disables the check (development only).
 * @property {string} enrollKey  Required by POST /api/client-tokens to mint per-device tokens.
 * @property {string} publicBaseUrl  Empty string derives links from the request Host header.
 * @property {number} maxBytes  Maximum decoded HTML payload size.
 * @property {number} retentionDays  0 keeps links until they are deleted explicitly.
 * @property {number} rateLimitPerMinute  Write requests allowed per source IP; 0 disables.
 * @property {boolean} trustProxy  Read X-Forwarded-* for client IP, scheme and host.
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {ShareConfig}
 */
export function loadConfig(env = process.env) {
  const host = (env.BW_SHARE_HOST ?? '0.0.0.0').trim()
  if (!host) {
    throw new Error('BW_SHARE_HOST must not be empty.')
  }
  const port = readInteger(env.BW_SHARE_PORT, DEFAULT_PORT, 'BW_SHARE_PORT', 0, 65535)
  const dataDir = path.resolve(env.BW_SHARE_DATA_DIR?.trim() || 'data')
  const uploadToken = (env.BW_SHARE_UPLOAD_TOKEN ?? '').trim()
  const enrollKey = (env.BW_SHARE_ENROLL_KEY ?? '').trim() || DEFAULT_ENROLL_KEY
  const publicBaseUrl = normalizeBaseUrl(env.BW_SHARE_PUBLIC_BASE_URL)
  const maxBytes = readInteger(
    env.BW_SHARE_MAX_BYTES,
    DEFAULT_MAX_BYTES,
    'BW_SHARE_MAX_BYTES',
    1024
  )
  const retentionDays = readInteger(
    env.BW_SHARE_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    'BW_SHARE_RETENTION_DAYS',
    0,
    3650
  )
  const rateLimitPerMinute = readInteger(
    env.BW_SHARE_RATE_LIMIT,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
    'BW_SHARE_RATE_LIMIT',
    0,
    100000
  )
  const trustProxy = readBoolean(env.BW_SHARE_TRUST_PROXY)
  return {
    host,
    port,
    dataDir,
    uploadToken,
    enrollKey,
    publicBaseUrl,
    maxBytes,
    retentionDays,
    rateLimitPerMinute,
    trustProxy
  }
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} name
 * @param {number} min
 * @param {number} [max]
 */
function readInteger(raw, fallback, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const value = Number(raw.trim())
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`)
  }
  return value
}

/**
 * @param {string | undefined} raw
 */
function readBoolean(raw) {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '' || value === '0' || value === 'false' || value === 'no') {
    return false
  }
  if (value === '1' || value === 'true' || value === 'yes') {
    return true
  }
  throw new Error('BW_SHARE_TRUST_PROXY must be 0/1, true/false, or yes/no.')
}

/**
 * Links must be absolute so a copied URL works from another machine.
 *
 * @param {string | undefined} raw
 */
function normalizeBaseUrl(raw) {
  const value = (raw ?? '').trim()
  if (!value) {
    return ''
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('BW_SHARE_PUBLIC_BASE_URL must be an absolute http(s) URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BW_SHARE_PUBLIC_BASE_URL must use http or https.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('BW_SHARE_PUBLIC_BASE_URL must not carry credentials, a query, or a fragment.')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}
