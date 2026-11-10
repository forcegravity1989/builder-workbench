import { isAbsolute, resolve } from 'node:path'
import type { Store } from '../../persistence'
import { resolveAuthorizedPath } from '../filesystem-auth'

/** A user-named file grants only this read/stat request; other access kinds retain project roots. */
export async function resolveLocalFileRequestPath(
  targetPath: string,
  access: unknown,
  store: Store
): Promise<string> {
  if (
    typeof access !== 'object' ||
    access === null ||
    !('kind' in access) ||
    access.kind !== 'user-file'
  ) {
    return resolveAuthorizedPath(targetPath, store)
  }
  if (typeof targetPath !== 'string' || !isAbsolute(targetPath)) {
    throw new Error('Access denied: a file opened by name needs an absolute path.')
  }
  return resolveAuthorizedPath(targetPath, store).catch(() => resolve(targetPath))
}
