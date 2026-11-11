import { createHash } from 'node:crypto'
import { gitExecFileAsync } from '../git/runner'
import { readGitBlobAtOidPath } from '../git/source-control/git-blob-read'
import {
  PlanningMaterialSchema,
  type PlanningMaterial
} from '../../shared/workbench/version-planning-material'
import { MaterialVersion } from '../../shared/workbench/version-material-common'
import { versionFlowBranch } from '../../shared/workbench/version-workspace-prepare'
import {
  MILESTONES_PATH,
  MilestoneMaterialSchema,
  emptyMilestones,
  upgradeMilestoneMaterial,
  type MilestoneSnapshot
} from '../../shared/workbench/project-milestones'

export async function readMilestoneSnapshot(
  repoPath: string,
  head: string,
  options: { wslDistro?: string },
  started: Set<string>
) {
  const refs = new Map(
    (
      await gitExecFileAsync(
        [
          'for-each-ref',
          '--format=%(refname) %(objectname)',
          'refs/heads/bw/',
          'refs/remotes/origin/bw/'
        ],
        { ...options, cwd: repoPath }
      )
    ).stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim().split(' ') as [string, string])
  )
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
  async function preparedVersion(version: string, cycleId: string): Promise<boolean> {
    if (started.has(version)) return true
    const flow = versionFlowBranch(version, 'plan')
    for (const ref of flow ? [`refs/heads/${flow}`, `refs/remotes/origin/${flow}`] : []) {
      const oid = refs.get(ref)
      if (!oid) continue
      const prior = await readGitBlobAtOidPath(
        repoPath,
        oid,
        `.bw/planning/${version}/data.json`,
        options
      )
      if (prior.failed) throw new Error('未能核对版本计划来源，不能判为尚未开始')
      if (!prior.exists || prior.isBinary) continue
      const parsed = PlanningMaterialSchema.safeParse(JSON.parse(prior.content))
      // A retained native plan ref survives worktree removal; names alone never prove identity.
      if (parsed.success && parsed.data.version === version && parsed.data.cycleId === cycleId)
        return true
    }
    return false
  }
  for (const path of files) {
    const blob = await readGitBlobAtOidPath(repoPath, head, path, options)
    if (blob.failed || blob.isBinary || !blob.exists) {
      throw new Error(`未读到规划材料：${path}`)
    }
    const raw = blob.content.replace(/\r\n/g, '\n')
    contents.set(path, raw)
    hash.update(JSON.stringify([path, raw]))
    if (path === MILESTONES_PATH) {
      try {
        snapshot.material = MilestoneMaterialSchema.parse(upgradeMilestoneMaterial(JSON.parse(raw)))
      } catch {
        throw new Error(
          `${MILESTONES_PATH} 的格式无法读取，原文件未改动。请核对里程碑、特性和版本排期后刷新。`
        )
      }
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
      const prepared = await preparedVersion(version, plan.cycleId)
      snapshot.versions.push({
        version,
        cycleId: plan.cycleId,
        ...(plan.timeWindow ? { timeWindow: plan.timeWindow } : {}),
        started:
          prepared ||
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
  const registeredVersions = snapshot.versions
  snapshot.registeredVersions = registeredVersions
  if (snapshot.material.versionPlans) {
    snapshot.versions = []
    for (const planned of snapshot.material.versionPlans) {
      const version = registeredVersions.find((v) => v.cycleId === planned.cycleId)
      const named = registeredVersions.find(
        (v) => v.version.toLowerCase() === planned.version.toLowerCase()
      )
      if (
        (version && version.version !== planned.version) ||
        (named && named.cycleId !== planned.cycleId)
      ) {
        snapshot.problems.push(`${planned.version}：里程碑规划与版本计划身份不一致，请核对材料`)
        continue
      }
      try {
        const scheduled = {
          ...planned,
          started: version?.started ?? (await preparedVersion(planned.version, planned.cycleId))
        }
        snapshot.versions.push(scheduled)
        if (!version) registeredVersions.push(scheduled)
      } catch (error) {
        snapshot.problems.push(
          `${planned.version}：${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }
  snapshot.revision = hash.digest('hex')
  snapshot.versions.sort(
    (a, b) =>
      (a.timeWindow?.start ?? '9999').localeCompare(b.timeWindow?.start ?? '9999') ||
      a.version.localeCompare(b.version)
  )
  return { snapshot, plans, contents, registeredVersions }
}
