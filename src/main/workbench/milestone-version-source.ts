import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MILESTONES_PATH,
  MilestoneMaterialSchema,
  upgradeMilestoneMaterial
} from '../../shared/workbench/project-milestones'
import { isMissingFile, resolveVersionPlanningRoot } from './version-document-path'

/** Read the adopted roadmap on the material owner, including the existing SSH executor. */
export async function readWorkspaceScheduledVersion(root: string, version: string) {
  let raw: string
  try {
    await resolveVersionPlanningRoot(root)
    const path = join(root, MILESTONES_PATH)
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('里程碑材料必须是工作树内的普通文件')
    }
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined
    }
    throw error
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    throw new Error('里程碑材料无法读取，请核对 .bw/milestones.json；未改动版本计划')
  }
  const material = MilestoneMaterialSchema.safeParse(upgradeMilestoneMaterial(decoded))
  if (!material.success) {
    throw new Error('里程碑材料无法读取，请核对 .bw/milestones.json；未改动版本计划')
  }
  const scheduled = material.data.versionPlans?.find(
    (entry) => entry.version.toLowerCase() === version.toLowerCase()
  )
  if (scheduled && scheduled.version !== version) {
    throw new Error(`里程碑已登记 ${scheduled.version}，请沿用实际版本名称`)
  }
  return scheduled
}
