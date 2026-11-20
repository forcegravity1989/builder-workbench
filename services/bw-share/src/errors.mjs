/**
 * An error that maps directly to an HTTP response. Codes are part of the service contract: the
 * Workbench client switches on them, so renaming one is a protocol change.
 */
export class ShareError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {Record<string, string>} [headers]  Extra response headers, e.g. Allow on 405.
   */
  constructor(status, code, message, headers = {}) {
    super(message)
    this.name = 'ShareError'
    this.status = status
    this.code = code
    this.headers = headers
  }
}

/** @returns {boolean} */
export function isShareError(value) {
  return value instanceof ShareError
}
