import { randomBytes } from 'node:crypto'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { restrictWindowsPath } from './secure-path-windows-acl'

const pendingWrites = new Map<string, Promise<boolean>>()

/** Atomic secure writes for async callers; ACL completion still precedes publication. */
export function writeSecureJsonFileAsync(targetPath: string, value: unknown): Promise<boolean> {
  const contents = JSON.stringify(value, null, 2)
  const previous = pendingWrites.get(targetPath) ?? Promise.resolve(true)
  const write = previous.catch(() => false).then(() => writeSecureFile(targetPath, contents))
  pendingWrites.set(targetPath, write)
  void write
    .finally(() => {
      if (pendingWrites.get(targetPath) === write) {
        pendingWrites.delete(targetPath)
      }
    })
    .catch(() => {})
  return write
}

async function restrict(path: string, isDirectory: boolean): Promise<boolean> {
  if (process.platform === 'win32') {
    return restrictWindowsPath(path, isDirectory)
  }
  await chmod(path, isDirectory ? 0o700 : 0o600)
  return true
}

async function writeSecureFile(targetPath: string, contents: string): Promise<boolean> {
  const directory = dirname(targetPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await restrict(directory, true)
  const staged = `${targetPath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(staged, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    const stagedRestricted = await restrict(staged, false)
    // A rename on the same volume preserves the protected DACL, as in the sync writer.
    await rename(staged, targetPath)
    const publishedRestricted = await restrict(targetPath, false)
    return stagedRestricted && publishedRestricted
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }
}
