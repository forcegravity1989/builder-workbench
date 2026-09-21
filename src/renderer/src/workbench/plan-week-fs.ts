import { joinFsPath } from './project-charter'

export function planningRoot(workspacePath: string): string {
  return joinFsPath(joinFsPath(workspacePath, '.bw'), 'planning')
}

export function planningFilePath(workspacePath: string, version: string): string {
  return joinFsPath(joinFsPath(planningRoot(workspacePath), version), 'data.json')
}

export async function listPlanningVersions(
  workspacePath: string
): Promise<{ version: string; mtimeMs: number }[]> {
  const root = planningRoot(workspacePath)
  if (!(await window.api.fs.pathExists({ filePath: root }))) {
    return []
  }
  const entries = await window.api.fs.readDir({ dirPath: root })
  const stamps: { version: string; mtimeMs: number }[] = []
  for (const entry of entries) {
    if (
      !entry.isDirectory ||
      entry.name === '.local' ||
      entry.name === 'template' ||
      entry.name.startsWith('.')
    ) {
      continue
    }
    const dataFile = joinFsPath(joinFsPath(root, entry.name), 'data.json')
    if (!(await window.api.fs.pathExists({ filePath: dataFile }))) {
      continue
    }
    const stat = await window.api.fs.stat({ filePath: dataFile })
    stamps.push({ version: entry.name, mtimeMs: stat.mtime })
  }
  return stamps
}

export async function ensurePlanningFile(filePath: string): Promise<void> {
  const versionDir = parentDir(filePath)
  const planningDir = parentDir(versionDir)
  const bwDir = parentDir(planningDir)
  for (const dir of [bwDir, planningDir, versionDir]) {
    if (dir && !(await window.api.fs.pathExists({ filePath: dir }))) {
      await window.api.fs.createDir({ dirPath: dir })
    }
  }
}

export function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx <= 0 ? '' : filePath.slice(0, idx)
}
