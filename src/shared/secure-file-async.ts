import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hardenSecureDirectoryOnce } from './secure-file'
import { restrictWindowsPath } from './secure-path-windows-acl'

const pendingWrites = new Map<string, Promise<boolean | undefined>>()

/** Returns undefined if publication is skipped, or whether both file ACL checks succeeded. */
export function writeSecureJsonFileAsync(
  targetPath: string,
  value: unknown,
  canPublish?: () => Promise<boolean>
): Promise<boolean | undefined> {
  const contents = JSON.stringify(value, null, 2)
  const previous = pendingWrites.get(targetPath) ?? Promise.resolve(true)
  const write = previous
    .catch(() => false)
    .then(() => writeSecureFile(targetPath, contents, canPublish))
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

async function restrictFile(path: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return restrictWindowsPath(path, false)
  }
  await chmod(path, 0o600)
  return true
}

async function writeSecureFile(
  targetPath: string,
  contents: string,
  canPublish?: () => Promise<boolean>
): Promise<boolean | undefined> {
  const directory = dirname(targetPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (process.platform === 'win32') {
    hardenSecureDirectoryOnce(directory)
  } else {
    await chmod(directory, 0o700)
  }
  const staged = `${targetPath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  const file = await open(staged, 'wx', 0o600)
  try {
    let stagedRestricted: boolean
    try {
      // Windows ignores the creation mode. Protect the empty file before writing credentials.
      stagedRestricted = await restrictFile(staged)
      await file.writeFile(contents, 'utf8')
    } finally {
      await file.close()
    }
    if (canPublish && !(await canPublish())) {
      await rm(staged, { force: true })
      return undefined
    }
    // A rename on the same volume preserves the protected DACL, as in the sync writer.
    await rename(staged, targetPath)
    const publishedRestricted = await restrictFile(targetPath)
    return stagedRestricted && publishedRestricted
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }
}
