import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ShareError } from './errors.mjs'
import { hashToken, tokenMatchesHash } from './tokens.mjs'

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const STALE_TEMP_MS = 60 * 60 * 1000
const RENAME_ATTEMPTS = 5
const RENAME_RETRY_DELAY_MS = 40

/**
 * @typedef {object} ShareMeta
 * @property {string} id
 * @property {string} fileName
 * @property {string} [title]
 * @property {'text/html'} contentType
 * @property {number} bytes
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string | null} expiresAt
 * @property {string} editTokenHash
 */

/**
 * IDs are 128 bits of randomness encoded as base64url. The link is the only capability a viewer
 * needs, so guessing one must stay infeasible.
 *
 * @param {string} id
 */
export function isValidShareId(id) {
  return SHARE_ID_PATTERN.test(id)
}

/**
 * Annotations live next to the share they belong to and die with it: `removeFiles` deletes this
 * path together with the content and meta, so no orphan annotation file can outlive its share.
 *
 * @param {string} dataDir
 * @param {string} id
 */
export function annotationFilePath(dataDir, id) {
  return path.join(dataDir, `${id}.annotations.json`)
}

/**
 * @param {{ dataDir: string, retentionDays: number, log?: (line: string) => void }} options
 */
export function createShareStore({ dataDir, retentionDays, log = () => {} }) {
  /** @type {Map<string, Promise<void>>} */
  const locks = new Map()

  const contentPath = (id) => path.join(dataDir, `${id}.html`)
  const metaPath = (id) => path.join(dataDir, `${id}.json`)

  async function init() {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 })
  }

  /**
   * @param {import('./payload.mjs').SharePayload} payload
   * @returns {Promise<{ id: string, editToken: string, meta: ShareMeta }>}
   */
  async function create(payload) {
    const id = randomBytes(16).toString('base64url')
    const editToken = randomBytes(32).toString('base64url')
    const now = new Date()
    /** @type {ShareMeta} */
    const meta = {
      id,
      fileName: payload.fileName,
      ...(payload.title ? { title: payload.title } : {}),
      contentType: 'text/html',
      bytes: Buffer.byteLength(payload.content, 'utf8'),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiryFrom(now),
      editTokenHash: hashToken(editToken).toString('hex')
    }
    // Meta first: a crash before the content lands leaves a share that reads as missing and is
    // swept at expiry, instead of an unreferenced content file that nothing would ever clean up.
    await writeFileAtomic(metaPath(id), JSON.stringify(meta, null, 2), log)
    await writeFileAtomic(contentPath(id), payload.content, log)
    return { id, editToken, meta }
  }

  /**
   * @param {string} id
   * @param {string} editToken
   * @param {import('./payload.mjs').SharePayload} payload
   * @returns {Promise<ShareMeta>}
   */
  function update(id, editToken, payload) {
    return withLock(id, async () => {
      const existing = await readMeta(id)
      if (!existing || isExpired(existing)) {
        throw new ShareError(404, 'not_found', 'Share not found.')
      }
      if (!tokenMatchesHash(editToken, existing.editTokenHash)) {
        throw new ShareError(403, 'forbidden', 'Edit token does not match this share.')
      }
      const now = new Date()
      /** @type {ShareMeta} */
      const meta = {
        ...existing,
        fileName: payload.fileName,
        bytes: Buffer.byteLength(payload.content, 'utf8'),
        updatedAt: now.toISOString(),
        expiresAt: expiryFrom(now)
      }
      // PUT replaces the share, so an omitted title clears the old one.
      if (payload.title) {
        meta.title = payload.title
      } else {
        delete meta.title
      }
      // Content first, then metadata. If the second write is lost, a viewer still gets a complete
      // document — `open()` takes the length and the bytes from one fd — and only the display name
      // and the renewed expiry lag, which the next update corrects.
      await writeFileAtomic(contentPath(id), payload.content, log)
      await writeFileAtomic(metaPath(id), JSON.stringify(meta, null, 2), log)
      return meta
    })
  }

  /**
   * @param {string} id
   * @param {string} editToken
   */
  function remove(id, editToken) {
    return withLock(id, async () => {
      const existing = await readMeta(id)
      if (!existing || isExpired(existing)) {
        throw new ShareError(404, 'not_found', 'Share not found.')
      }
      if (!tokenMatchesHash(editToken, existing.editTokenHash)) {
        throw new ShareError(403, 'forbidden', 'Edit token does not match this share.')
      }
      await removeFiles(id)
    })
  }

  /**
   * Same lookup as {@link read}, but hands the content out as a stream so serving a share never
   * loads the whole report into memory.
   *
   * @param {string} id
   * @returns {Promise<{ meta: ShareMeta, size: number, stream: import('node:fs').ReadStream } | null>}
   */
  async function open(id) {
    const meta = await readMeta(id)
    if (!meta || isExpired(meta)) {
      return null
    }
    // Length and body must come from one open file description. A concurrent update renames a new
    // version in; stat-then-open would advertise the old size for the new bytes and the viewer
    // would get a truncated or over-long response.
    let handle
    try {
      handle = await fs.open(contentPath(id), 'r')
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }
      throw error
    }
    let size
    try {
      size = (await handle.stat()).size
    } catch (error) {
      await handle.close()
      throw error
    }
    const stream = handle.createReadStream()
    stream.once('close', () => {
      try {
        handle.close().catch(() => {})
      } catch {
        // The stream already released the handle.
      }
    })
    return { meta, size, stream }
  }

  /**
   * @param {string} id
   * @returns {Promise<{ meta: ShareMeta, content: Buffer } | null>}
   */
  async function read(id) {
    const meta = await readMeta(id)
    if (!meta || isExpired(meta)) {
      return null
    }
    try {
      return { meta, content: await fs.readFile(contentPath(id)) }
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Delete expired shares. Called on startup and hourly by the entry point; a share past its expiry
   * is already unreadable, so the sweep only reclaims disk. Each share is swept under its lock so a
   * concurrent update that renews the expiry cannot be deleted mid-write.
   *
   * @param {Date} [now]
   * @returns {Promise<number>}
   */
  async function sweep(now = new Date()) {
    let names
    try {
      names = await fs.readdir(dataDir)
    } catch (error) {
      if (isMissingFile(error)) {
        return 0
      }
      throw error
    }
    const staleTempBefore = now.getTime() - STALE_TEMP_MS
    let removed = 0
    for (const name of names) {
      if (name.includes('.tmp-')) {
        await removeIfOlderThan(path.join(dataDir, name), staleTempBefore)
        continue
      }
      if (name.endsWith('.annotations.json')) {
        // An annotations file can outlive its share only through the tiny window where a share
        // removal races an annotation write (the stores serialize per file, not across files).
        // Sweep takes such orphans along; a live share keeps its annotations.
        const id = name.slice(0, -'.annotations.json'.length)
        if (isValidShareId(id) && !(await readMeta(id))) {
          await fs.rm(path.join(dataDir, name), { force: true })
        }
        continue
      }
      if (!name.endsWith('.json')) {
        continue
      }
      const id = name.slice(0, -'.json'.length)
      if (!isValidShareId(id)) {
        continue
      }
      const didRemove = await withLock(id, async () => {
        const meta = await readMeta(id)
        if (meta && !isExpired(meta, now)) {
          return false
        }
        await removeFiles(id)
        return true
      })
      if (didRemove) {
        removed += 1
      }
    }
    return removed
  }

  /**
   * @param {string} id
   * @returns {Promise<ShareMeta | null>}
   */
  async function readMeta(id) {
    if (!isValidShareId(id)) {
      return null
    }
    try {
      const raw = await fs.readFile(metaPath(id), 'utf8')
      const parsed = JSON.parse(raw)
      if (!isShareMeta(parsed, id)) {
        return null
      }
      return /** @type {ShareMeta} */ (parsed)
    } catch (error) {
      if (isMissingFile(error) || error instanceof SyntaxError) {
        return null
      }
      throw error
    }
  }

  /**
   * @param {ShareMeta} meta
   * @param {Date} [now]
   */
  function isExpired(meta, now = new Date()) {
    return Boolean(meta.expiresAt) && new Date(meta.expiresAt).getTime() <= now.getTime()
  }

  /** @param {Date} now */
  function expiryFrom(now) {
    if (retentionDays <= 0) {
      return null
    }
    return new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
  }

  /**
   * @param {string} filePath
   * @param {number} cutoff
   */
  async function removeIfOlderThan(filePath, cutoff) {
    try {
      const stats = await fs.stat(filePath)
      if (stats.mtimeMs < cutoff) {
        await fs.rm(filePath, { force: true })
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error
      }
    }
  }

  /** @param {string} id */
  async function removeFiles(id) {
    await fs.rm(contentPath(id), { force: true })
    await fs.rm(metaPath(id), { force: true })
    await fs.rm(annotationFilePath(dataDir, id), { force: true })
  }

  /**
   * Serialize update/remove per id so a concurrent revoke cannot interleave with a content write.
   *
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  async function withLock(key, operation) {
    const previous = locks.get(key) ?? Promise.resolve()
    /** @type {() => void} */
    let release = () => {}
    const gate = new Promise((resolve) => {
      release = () => resolve(undefined)
    })
    const current = previous.then(() => gate)
    locks.set(key, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (locks.get(key) === current) {
        locks.delete(key)
      }
    }
  }

  /**
   * Public meta lookup for routes that authenticate without streaming content: annotation routes
   * check the share still exists (and is unexpired) before touching the annotation file.
   *
   * @param {string} id
   * @returns {Promise<ShareMeta | null>}
   */
  async function meta(id) {
    const found = await readMeta(id)
    if (!found || isExpired(found)) {
      return null
    }
    return found
  }

  return { init, create, update, remove, read, open, sweep, meta }
}

/**
 * The maxBytes limit is enforced on the decoded payload; this store trusts its caller for that
 * check and only guards the filesystem mechanics. Shared with the client-token registry so both
 * on-disk states survive a power loss the same way.
 *
 * @param {string} filePath
 * @param {string | Buffer} data
 * @param {(line: string) => void} [log]
 */
export async function writeFileAtomic(filePath, data, log = () => {}) {
  const tmp = `${filePath}.tmp-${randomBytes(8).toString('hex')}`
  try {
    const handle = await fs.open(tmp, 'w', 0o600)
    try {
      await handle.writeFile(data)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await renameOverTarget(tmp, filePath)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    if (isSharingViolation(error)) {
      // The retry budget is spent, so this is either a reader that outlasted it or a lasting
      // permission problem. Say which file and why: the caller only sees a retryable 503, and
      // without this line the access log is the only trace.
      log(
        `gave up replacing ${path.basename(filePath)} after ${RENAME_ATTEMPTS} attempts: ${
          /** @type {NodeJS.ErrnoException} */ (error).code
        }`
      )
      // The previous version is still complete and consistent, so this is worth retrying.
      throw new ShareError(503, 'busy', 'The file is in use; retry in a moment.')
    }
    throw error
  }
  await syncDirectory(path.dirname(filePath))
}

/**
 * Windows refuses to rename over a file a viewer is still streaming, so a read that overlaps an
 * update would otherwise fail. Linux replaces the inode and readers keep the old one, so this
 * retry only ever costs anything on Windows.
 *
 * @param {string} tmp
 * @param {string} filePath
 */
async function renameOverTarget(tmp, filePath) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fs.rename(tmp, filePath)
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS || !isSharingViolation(error)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS * attempt))
    }
  }
}

/** @param {unknown} error */
function isSharingViolation(error) {
  const code = /** @type {NodeJS.ErrnoException} */ (error)?.code
  return code === 'EPERM' || code === 'EBUSY'
}

/** @param {string} dir */
async function syncDirectory(dir) {
  let handle
  try {
    handle = await fs.open(dir, 'r')
    await handle.sync()
  } catch {
    // Directory fsync is not available on every platform (Windows); the rename is still atomic.
  } finally {
    await handle?.close()
  }
}

/**
 * Metadata that cannot describe a usable share is treated as missing. Why: a half-written or
 * hand-edited `<id>.json` would otherwise reach the edit-token check with no hash to compare (a
 * 500 for the caller) or an unparseable expiry that never compares as past, so the sweep would
 * skip those files forever. As missing, the share answers 404 — which clients already handle by
 * recreating the link — and the sweep reclaims both files.
 *
 * @param {unknown} value
 * @param {string} id
 */
function isShareMeta(value, id) {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const meta = /** @type {Record<string, unknown>} */ (value)
  if (meta.id !== id) {
    return false
  }
  if (typeof meta.editTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.editTokenHash)) {
    return false
  }
  if (typeof meta.fileName !== 'string' || typeof meta.bytes !== 'number') {
    return false
  }
  if (typeof meta.createdAt !== 'string' || typeof meta.updatedAt !== 'string') {
    return false
  }
  if (meta.expiresAt === null) {
    return true
  }
  return typeof meta.expiresAt === 'string' && !Number.isNaN(Date.parse(meta.expiresAt))
}

/** @param {unknown} error */
function isMissingFile(error) {
  return Boolean(error) && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
}
