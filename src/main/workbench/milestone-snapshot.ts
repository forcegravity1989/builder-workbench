import { createHash } from 'node:crypto'
import { gitExecFileAsync } from '../git/runner'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../shared/workbench/version-planning-material'
import { MaterialVersion } from '../../shared/workbench/version-material-common'
import {
  MILESTONES_PATH,
  MilestoneMaterialSchema,
  emptyMilestones,
  type MilestoneSnapshot
} from '../../shared/workbench/project-milestones'

export async function readMilestoneSnapshot(
  repoPath: string,
  head: string,
  options: { wslDistro?: string },
  started: Set<string>
) {
  const files = (
    await gitExecFileAsync(
      ['ls-tree', '-r', '-z', '--name-only', head, '--', '.bw/planning', MILESTONES_PATH],
      { ...options, cwd: repoPath }
    )
  ).stdout
    .split('\0')
    .filter((p) => p === MILESTONES_PATH || /^\.bw\/planning\/[^/]+\/data\.json$/.test(p))
    .sort()
  const contents = new Map<string, string>()
  const plans = new Map<string, PlanningMaterial>()
  const snapshot: MilestoneSnapshot = {
    head,
    revision: '',
    material: emptyMilestones(),
    versions: [],
    problems: []
  }
  const hash = createHash('sha256')
  for (const path of files) {
    const blob = await readGitBlobAtOidPath(repoPath, head, path, options)
    if (blob.failed || blob.isBinary || !blob.exists) {
      throw new Error(`未读到规划材料：${path}`)
    }
    const raw = blob.content.replace(/\r\n/g, '\n')
    contents.set(path, raw)
    hash.update(JSON.stringify([path, raw]))
    if (path === MILESTONES_PATH) {
      snapshot.material = MilestoneMaterialSchema.parse(JSON.parse(raw))
      continue
    }
    const version = path.split('/')[2]
    try {
      MaterialVersion.parse(version)
      const plan = PlanningMaterialSchema.parse(JSON.parse(raw))
      if (plan.version !== version || plans.has(plan.cycleId)) {
        throw new Error('版本目录、身份不一致或重复')
      }
      plans.set(plan.cycleId, plan)
      snapshot.versions.push({
        version,
        cycleId: plan.cycleId,
        ...(plan.timeWindow ? { timeWindow: plan.timeWindow } : {}),
        started:
          started.has(version) ||
          Boolean(
            plan.goals.length ||
            plan.tasks.length ||
            plan.minutes ||
            plan.workflow ||
            plan.summary.progress ||
            plan.summary.risks
          )
      })
    } catch (error) {
      snapshot.problems.push(
        `${version}：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  snapshot.revision = hash.digest('hex')
  snapshot.versions.sort(
    (a, b) =>
      (a.timeWindow?.start ?? '9999').localeCompare(b.timeWindow?.start ?? '9999') ||
      a.version.localeCompare(b.version)
  )
  return { snapshot, plans, contents }
}
