import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Hash tokens before comparing so equal-length buffers are always compared and a stored value
 * never leaks the plaintext token.
 *
 * @param {string} token
 */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest()
}

/**
 * @param {string} candidate
 * @param {string} expectedHash  Hex digest produced by `hashToken(...).toString('hex')`.
 */
export function tokenMatchesHash(candidate, expectedHash) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false
  }
  const candidateHash = hashToken(candidate)
  const expected = Buffer.from(expectedHash, 'hex')
  if (expected.length !== candidateHash.length) {
    return false
  }
  return timingSafeEqual(candidateHash, expected)
}

/**
 * @param {string | undefined} candidate
 * @param {string} expected  Plaintext token from configuration.
 */
export function tokenMatches(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length === 0 || expected.length === 0) {
    return false
  }
  return timingSafeEqual(hashToken(candidate), hashToken(expected))
}
