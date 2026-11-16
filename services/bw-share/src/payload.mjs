import { ShareError } from './errors.mjs'

const MAX_FILE_NAME_LENGTH = 255
const MAX_TITLE_LENGTH = 200

/**
 * @typedef {object} SharePayload
 * @property {string} content  HTML source, UTF-8.
 * @property {string} fileName  Display name only; never used as a filesystem path.
 * @property {string} [title]
 */

/**
 * Names end up in a JSON metadata file and, later, in client UI. Reject control characters so a
 * name cannot smuggle line breaks into either.
 *
 * @param {string} value
 */
function hasControlCharacters(value) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code < 32 || code === 127) {
      return true
    }
  }
  return false
}

/**
 * Validate the upload body before anything touches disk. `maxBytes` counts decoded UTF-8 bytes,
 * which is what the client's own preflight check measures.
 *
 * @param {unknown} body
 * @param {number} maxBytes
 * @returns {SharePayload}
 */
export function parseSharePayload(body, maxBytes) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ShareError(400, 'bad_request', 'Request body must be a JSON object.')
  }
  const { content, contentType, fileName, title } = /** @type {Record<string, unknown>} */ (body)
  if (contentType !== undefined && contentType !== 'text/html') {
    throw new ShareError(415, 'unsupported_media_type', 'Only text/html content is accepted.')
  }
  if (typeof content !== 'string' || content.length === 0) {
    throw new ShareError(400, 'bad_request', 'content must be a non-empty string.')
  }
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new ShareError(413, 'too_large', `content exceeds ${maxBytes} bytes.`)
  }
  if (
    typeof fileName !== 'string' ||
    fileName.trim() === '' ||
    fileName.length > MAX_FILE_NAME_LENGTH ||
    hasControlCharacters(fileName)
  ) {
    throw new ShareError(400, 'bad_request', 'fileName must be a printable name up to 255 chars.')
  }
  if (
    title !== undefined &&
    (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH || hasControlCharacters(title))
  ) {
    throw new ShareError(400, 'bad_request', 'title must be a printable string up to 200 chars.')
  }
  return {
    content,
    fileName: fileName.trim(),
    ...(typeof title === 'string' ? { title } : {})
  }
}
