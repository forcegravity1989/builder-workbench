import { lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  validatePlanningVersion,
  VersionDocumentError,
  type VersionWorkflow
} from '../../shared/workbench/version-document'

export function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

async function inspectPath(path: string, directory: boolean): Promise<boolean> {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) {
      throw new VersionDocumentError(
        'unsafe-path',
        `Material path is not a regular ${directory ? 'directory' : 'file'}: ${path}`
      )
    }
    return true
  } catch (error) {
    if (isMissingFile(error)) {
      return false
    }
    throw error
  }
}

/** No directories are created when listing or reading materials. */
export async function resolveVersionPlanningRoot(
  trustedWorkspacePath: string,
  createDirectories = false,
  version?: string
): Promise<string> {
  if (version !== undefined) {
    validatePlanningVersion(version)
  }
  if (!isAbsolute(trustedWorkspacePath)) {
    throw new VersionDocumentError(
      'unsafe-path',
      'The registered workspace must have an absolute path'
    )
  }
  let path = await realpath(trustedWorkspacePath)
  await inspectPath(path, true)
  for (const segment of ['.bw', 'planning', ...(version === undefined ? [] : [version])]) {
    path = join(path, segment)
    if (!(await inspectPath(path, true)) && createDirectories) {
      try {
        await mkdir(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error
        }
      }
      await inspectPath(path, true)
    }
  }
  return path
}

/** The runtime must authorize this root from the native project/host/worktree before calling. */
export async function resolveVersionDocumentPath(
  trustedWorkspacePath: string,
  workflow: VersionWorkflow,
  version: string,
  createDirectories = false
): Promise<string> {
  validatePlanningVersion(version)
  if (workflow !== 'plan' && workflow !== 'acceptance') {
    throw new VersionDocumentError('unsafe-path', 'Unknown version workflow')
  }
  const path = await resolveVersionPlanningRoot(trustedWorkspacePath, createDirectories, version)
  const file = join(path, workflow === 'plan' ? 'data.json' : 'acceptance.json')
  await inspectPath(file, false)
  // proper-lockfile uses a directory beside the document. Never follow a substituted lock path.
  await inspectPath(`${file}.lock`, true)
  return file
}
