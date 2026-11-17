import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ShareError } from './errors.mjs'

const REGISTRY_VERSION = 1
const TOKEN_BYTES = 32
/** Upper bound so a misbehaving client cannot grow the registry without limit. */
const MAX_TOKENS = 5000

/** @param {string} token */
export function hashClientToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Per-device upload tokens issued on demand. Only hashes are stored, and the plaintext is
 * returned exactly once, mirroring how share edit tokens are handled.
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
  let writeChain = Promise.resolve()

  async function init() {
    try {
      const raw = await readFile(registryPath, 'utf8')
      const parsed = JSON.parse(raw)
      const entries = Array.isArray(parsed?.tokens) ? parsed.tokens : []
      tokens = new Map(
        entries
          .filter((entry) => typeof entry?.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash))
          .map((entry) => [
            entry.hash,
            typeof entry.createdAt === 'string' ? entry.createdAt : new Date(now()).toISOString()
          ])
      )
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
        return
      }
      log(
        `ignoring unreadable client token registry: ${error instanceof Error ? error.message : String(error)}`
      )
      try {
        await rename(registryPath, `${registryPath}.corrupt-${Date.now()}`)
      } catch (renameError) {
        log(`could not quarantine client token registry: ${String(renameError)}`)
      }
    }
  }

  /** @param {string} token */
  function matches(token) {
    if (typeof token !== 'string' || token.length === 0) {
      return false
    }
    return tokens.has(hashClientToken(token))
  }

  async function issue() {
    if (tokens.size >= MAX_TOKENS) {
      throw new ShareError(503, 'busy', 'Client token registry is full; contact the operator.')
    }
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    const createdAt = new Date(now()).toISOString()
    tokens.set(hashClientToken(token), createdAt)
    const snapshot = tokens
    const run = writeChain.then(async () => {
      const entries = [...snapshot].map(([hash, issuedAt]) => ({ hash, createdAt: issuedAt }))
      await mkdir(dataDir, { recursive: true, mode: 0o700 })
      const temp = `${registryPath}.tmp`
      await writeFile(
        temp,
        `${JSON.stringify({ version: REGISTRY_VERSION, tokens: entries }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 }
      )
      await rename(temp, registryPath)
    })
    writeChain = run.catch(() => undefined)
    await run
    return { token, createdAt }
  }

  return {
    init,
    matches,
    issue,
    size: () => tokens.size
  }
}
