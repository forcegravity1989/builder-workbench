import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import { ShareError } from './errors.mjs'
import { annotationFilePath, isValidShareId, writeFileAtomic } from './store.mjs'
import { hashToken, tokenMatchesHash } from './tokens.mjs'

export const MAX_ANNOTATIONS_PER_SHARE = 500
export const MAX_TEXT_CHARS = 2000
export const MAX_AUTHOR_CHARS = 50
const MAX_SELECTOR_CHARS = 500
const MAX_TARGET_TEXT_CHARS = 200
const ANNOTATION_ID_BYTES = 8

/**
 * @typedef {object} AnnotationTarget
 * @property {string} selector  CSS selector locating the element inside the shared document.
 * @property {string} text  Short text summary of the element, shown when the selector goes stale.
 *   May be empty for elements without text (icon buttons, images, svg); the viewer then shows the
 *   selector instead. The annotation comment itself ({@link Annotation.text}) is never empty.
 * @property {{ x: number, y: number, width: number, height: number }} rect  Position in the
 *   content viewport when the annotation was made.
 */

/**
 * @typedef {object} Annotation
 * @property {string} id
 * @property {string} author
 * @property {string} text
 * @property {string} createdAt
 * @property {AnnotationTarget} [target]  Absent for page-level annotations.
 * @property {string} deleteTokenHash  Never leaves this module; viewers see the plain token once
 *   on creation and the file only ever stores its hash.
 */

/**
 * Annotations are anonymous by design: the author name is free text, and the only capability is a
 * random delete token minted by the viewer page. The store trusts the HTTP layer to have checked
 * the share exists; it guards its own file mechanics and write limits.
 *
 * @param {{ dataDir: string, log?: (line: string) => void }} options
 */
export function createAnnotationStore({ dataDir, log = () => {} }) {
  /** @type {Map<string, Promise<void>>} */
  const locks = new Map()

  /**
   * @param {string} id
   * @returns {Promise<Annotation[]>}
   */
  async function list(id) {
    const file = await readAnnotationsFile(id)
    return (file?.items ?? []).map(toPublicAnnotation)
  }

  /**
   * @param {string} id
   * @param {{ author?: unknown, text?: unknown, target?: unknown }} input
   * @returns {Promise<{ annotation: Omit<Annotation, 'deleteTokenHash'>, deleteToken: string }>}
   */
  function add(id, input) {
    return withLock(id, async () => {
      if (typeof input !== 'object' || input === null) {
        // JSON `null`, an array or a bare primitive must answer 400, not crash on input.text.
        throw new ShareError(400, 'bad_request', 'Annotation body must be a JSON object.')
      }
      const file = (await readAnnotationsFile(id)) ?? { items: [] }
      if (file.items.length >= MAX_ANNOTATIONS_PER_SHARE) {
        throw new ShareError(
          409,
          'annotations_full',
          `This share already has the maximum of ${MAX_ANNOTATIONS_PER_SHARE} annotations.`
        )
      }
      const text = normalizeText(input.text, MAX_TEXT_CHARS, 'text')
      const author = normalizeAuthor(input.author)
      const target = normalizeTarget(input.target)
      const deleteToken = randomBytes(32).toString('base64url')
      /** @type {Annotation} */
      const annotation = {
        id: randomBytes(ANNOTATION_ID_BYTES).toString('hex'),
        author,
        text,
        createdAt: new Date().toISOString(),
        ...(target ? { target } : {}),
        deleteTokenHash: hashToken(deleteToken).toString('hex')
      }
      file.items.push(annotation)
      await writeAnnotationsFile(id, file)
      return { annotation: toPublicAnnotation(annotation), deleteToken }
    })
  }

  /**
   * The author path: the viewer-held delete token must match the stored hash. The share owner
   * (verified by edit token in the HTTP layer) uses {@link removeAny} instead.
   *
   * @param {string} id
   * @param {string} annotationId
   * @param {string} deleteToken
   */
  function removeByAuthor(id, annotationId, deleteToken) {
    return withLock(id, async () => {
      const file = await requireAnnotationsFile(id)
      const annotation = findAnnotation(file, annotationId)
      if (!tokenMatchesHash(deleteToken, annotation.deleteTokenHash)) {
        throw new ShareError(403, 'forbidden', 'Delete token does not match this annotation.')
      }
      await persistRemoval(id, file, annotationId)
    })
  }

  /**
   * @param {string} id
   * @param {string} annotationId
   */
  function removeAny(id, annotationId) {
    return withLock(id, async () => {
      const file = await requireAnnotationsFile(id)
      findAnnotation(file, annotationId)
      await persistRemoval(id, file, annotationId)
    })
  }

  /** @param {string} id @returns {Promise<{ items: Annotation[] } | null>} */
  async function readAnnotationsFile(id) {
    if (!isValidShareId(id)) {
      return null
    }
    try {
      const raw = await fs.readFile(annotationFilePath(dataDir, id), 'utf8')
      const parsed = JSON.parse(raw)
      if (!isAnnotationsFile(parsed)) {
        return null
      }
      return parsed
    } catch (error) {
      if (isMissingFile(error) || error instanceof SyntaxError) {
        return null
      }
      throw error
    }
  }

  /**
   * A damaged annotation file must not brick the share page: reads treat it as empty (viewers see
   * no annotations) and the next successful write replaces it wholesale.
   *
   * @param {string} id
   * @param {{ items: Annotation[] }} file
   */
  function writeAnnotationsFile(id, file) {
    return writeFileAtomic(annotationFilePath(dataDir, id), JSON.stringify(file), log)
  }

  /** @param {string} id @returns {Promise<{ items: Annotation[] }>} */
  async function requireAnnotationsFile(id) {
    const file = await readAnnotationsFile(id)
    if (!file) {
      throw new ShareError(404, 'not_found', 'Annotation not found.')
    }
    return file
  }

  /**
   * @param {{ items: Annotation[] }} file
   * @param {string} annotationId
   * @returns {Annotation}
   */
  function findAnnotation(file, annotationId) {
    const annotation = file.items.find((item) => item.id === annotationId)
    if (!annotation) {
      throw new ShareError(404, 'not_found', 'Annotation not found.')
    }
    return annotation
  }

  /**
   * @param {string} id
   * @param {{ items: Annotation[] }} file
   * @param {string} annotationId
   */
  async function persistRemoval(id, file, annotationId) {
    file.items = file.items.filter((item) => item.id !== annotationId)
    if (file.items.length === 0) {
      // An empty file reads the same as no file, so drop it instead of keeping a zero-item shell.
      await fs.rm(annotationFilePath(dataDir, id), { force: true })
      return
    }
    await writeAnnotationsFile(id, file)
  }

  /**
   * Same serialization shape as the share store: writes for one share never interleave.
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

  return { list, add, removeByAuthor, removeAny }
}

/** @param {Annotation} annotation */
function toPublicAnnotation(annotation) {
  const { deleteTokenHash: _deleteTokenHash, ...publicAnnotation } = annotation
  return publicAnnotation
}

/**
 * @param {unknown} value
 * @param {number} maxChars
 * @param {string} field
 */
function normalizeText(value, maxChars, field) {
  if (typeof value !== 'string') {
    throw new ShareError(400, 'bad_request', `Annotation ${field} must be a string.`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new ShareError(400, 'bad_request', `Annotation ${field} must not be empty.`)
  }
  if (trimmed.length > maxChars) {
    throw new ShareError(
      400,
      'text_too_long',
      `Annotation ${field} exceeds ${maxChars} characters.`
    )
  }
  return trimmed
}

/** @param {unknown} value */
function normalizeAuthor(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return '匿名'
  }
  return normalizeText(value, MAX_AUTHOR_CHARS, 'author')
}

/**
 * The element summary is best-effort: icon buttons, images and svg have no text, so an empty
 * string is valid (the viewer falls back to the selector). The field must still be a present
 * string and stay within the cap — unlike {@link normalizeText} it does not reject emptiness.
 *
 * @param {unknown} value
 */
function normalizeTargetText(value) {
  if (typeof value !== 'string') {
    throw new ShareError(400, 'bad_request', 'Annotation target.text must be a string.')
  }
  const trimmed = value.trim()
  if (trimmed.length > MAX_TARGET_TEXT_CHARS) {
    throw new ShareError(
      400,
      'text_too_long',
      `Annotation target.text exceeds ${MAX_TARGET_TEXT_CHARS} characters.`
    )
  }
  return trimmed
}

/** @param {unknown} value */
function normalizeTarget(value) {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'object') {
    throw new ShareError(400, 'bad_request', 'Annotation target must be an object.')
  }
  const target = /** @type {Record<string, unknown>} */ (value)
  const selector = normalizeText(target.selector, MAX_SELECTOR_CHARS, 'target.selector')
  const text = normalizeTargetText(target.text)
  const rect = target.rect
  if (typeof rect !== 'object' || rect === null) {
    throw new ShareError(400, 'bad_request', 'Annotation target rect must be an object.')
  }
  const { x, y, width, height } = /** @type {Record<string, unknown>} */ (rect)
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new ShareError(400, 'bad_request', 'Annotation target rect must hold finite numbers.')
  }
  return { selector, text, rect: { x, y, width, height } }
}

/** @param {unknown} value */
function isAnnotationsFile(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray(/** @type {*} */ (value).items)
  ) {
    return false
  }
  return /** @type {*} */ (value).items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.author === 'string' &&
      typeof item.text === 'string' &&
      typeof item.createdAt === 'string' &&
      typeof item.deleteTokenHash === 'string'
  )
}

/** @param {unknown} error */
function isMissingFile(error) {
  return Boolean(error) && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
}
