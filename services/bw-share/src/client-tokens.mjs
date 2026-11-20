import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ShareError } from './errors.mjs'
import { writeFileAtomic } from './store.mjs'

const REGISTRY_VERSION = 1
const TOKEN_BYTES = 32
/** Upper bound so a misbehaving client cannot grow the registry without limit. */
const MAX_TOKENS = 5000

/** @param {string} token */
export function hashClientToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Per-device upload tokens issued on demand. Only hashes are stored, and the plaintext is returned
 * exactly once, mirroring how share edit tokens are handled.
 *
 * A registry that exists but cannot be trusted — unreadable, truncated, a shape this build does
 * not understand, or one that yields no usable token — puts the store in a degraded state instead
 * of an empty one. Empty would mean "no device has enrolled yet", which opens writes on a service
 * that was authenticated before the restart; issuing a token would rewrite the registry with only
 * that device and silently revoke everybody else. So while degraded, enrollment and device-token
 * uploads are refused and the file is left in place for an operator, who restores it or deletes it
 * to accept the fresh-instance posture deliberately.
 *
 * @param {object} options
 * @param {string} options.dataDir
 * @param {(line: string) => void} [options.log]
 * @param {() => number} [options.now]
 */
export function createClientTokenStore({ dataDir, log = console.log, now = Date.now }) {
  const registryPath = path.join(dataDir, 'client-tokens.json')
  /** @type {Map<string, string>} hash → createdAt */
  let tokens = new Map()
  let degraded = false
  let writeChain = Promise.resolve()

  async function init() {
    let raw
    try {
      raw = await readFile(registryPath, 'utf8')
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return
      }
      degraded = true
      return reportDamaged(`it could not be read: ${describe(error)}`)
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      degraded = true
      return reportDamaged(`it is not valid JSON: ${describe(error)}`)
    }
    if (parsed?.version !== REGISTRY_VERSION || !Array.isArray(parsed.tokens)) {
      degraded = true
      return reportDamaged('it is not a token registry this build understands')
    }
    const entries = parsed.tokens.filter(
      (entry) => typeof entry?.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash)
    )
    if (entries.length === 0) {
      // Present but holding nothing usable is not a fresh instance: no normal path writes an empty
      // token list, so this is a registry somebody emptied or one whose every entry is corrupt.
      // Reading it as "no device has enrolled yet" would reopen anonymous writes on a service that
      // was authenticated before the restart, which is exactly what the degraded state exists to
      // prevent.
      degraded = true
      return reportDamaged(
        parsed.tokens.length === 0
          ? 'it exists but holds no device token'
          : `none of its ${parsed.tokens.length} entries is a usable token hash`
      )
    }
    tokens = new Map(
      entries.map((entry) => [
        entry.hash,
        typeof entry.createdAt === 'string' ? entry.createdAt : new Date(now()).toISOString()
      ])
    )
    if (entries.length !== parsed.tokens.length) {
      log(
        `client token registry held ${parsed.tokens.length - entries.length} unusable entr(ies); ` +
          `the other ${entries.length} still authenticate`
      )
    }
  }

  function reportDamaged(reason) {
    log(
      `client token registry is unusable because ${reason}. It was left in place at ${path.basename(
        registryPath
      )}; creating shares without a static upload token and all enrollment are refused until an ` +
        'operator restores or deletes that file and restarts the service. Deleting it accepts the ' +
        'fresh-instance posture (open writes) on purpose. Updating or deleting an existing share ' +
        'still works: those authenticate with the edit token of that share, not with the registry.'
    )
  }

  /** @param {string} token */
  function matches(token) {
    if (degraded || typeof token !== 'string' || token.length === 0) {
      return false
    }
    return tokens.has(hashClientToken(token))
  }

  function assertUsable() {
    if (degraded) {
      throw new ShareError(
        503,
        'registry_unavailable',
        'Client token registry is unreadable; an operator has to restore or remove it.'
      )
    }
  }

  async function issue() {
    assertUsable()
    if (tokens.size >= MAX_TOKENS) {
      // Its own code: unlike the in-flight body budget, retrying cannot clear this one.
      throw new ShareError(
        503,
        'enrollment_full',
        'Client token registry is full; contact the operator.'
      )
    }
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    const createdAt = new Date(now()).toISOString()
    tokens.set(hashClientToken(token), createdAt)
    const snapshot = tokens
    const run = writeChain.then(async () => {
      const entries = [...snapshot].map(([hash, issuedAt]) => ({ hash, createdAt: issuedAt }))
      await mkdir(dataDir, { recursive: true, mode: 0o700 })
      // Durable, like the shares themselves: a registry that survives a power loss with zero bytes
      // would come back as "unusable" and take every device's write access with it.
      await writeFileAtomic(
        registryPath,
        `${JSON.stringify({ version: REGISTRY_VERSION, tokens: entries }, null, 2)}\n`,
        log
      )
    })
    writeChain = run.catch(() => undefined)
    await run
    return { token, createdAt }
  }

  return {
    init,
    matches,
    issue,
    size: () => tokens.size,
    isDegraded: () => degraded
  }
}

/** @param {unknown} error */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}
