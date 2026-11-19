import type { MilestoneDraft } from '../../shared/monica/project-milestones'
import type { readMilestoneSnapshot } from './milestone-snapshot'

type Snapshot = Awaited<ReturnType<typeof readMilestoneSnapshot>>

export function validateMilestoneSubmission(
  committed: Snapshot,
  formal: Snapshot,
  draft: MilestoneDraft,
  started: Set<string>
) {
  const registered = [...committed.registeredVersions, ...formal.registeredVersions]
  for (const old of committed.snapshot.versions) {
    if (!draft.versions.some((v) => v.cycleId === old.cycleId)) {
      throw new Error('此入口不能删除已有项目版本。')
    }
  }
  for (const next of draft.versions) {
    const prior = registered.filter((v) => v.cycleId === next.cycleId)
    if (!prior.length && started.has(next.version)) {
      throw new Error(`${next.version} 已开始计划，请核对并合入该版本材料。`)
    }
    for (const old of prior) {
      if (old.version === next.version) {
        continue
      }
      if (old.version.toLowerCase() === next.version.toLowerCase()) {
        throw new Error('版本改名不能仅改变大小写，请保留实际版本名称。')
      }
      if (old.started || started.has(old.version) || started.has(next.version)) {
        throw new Error(`${old.version} 已开始计划，请在里程碑中保留其版本身份。`)
      }
    }
    if (
      registered.some(
        (v) => v.version.toLowerCase() === next.version.toLowerCase() && v.cycleId !== next.cycleId
      )
    ) {
      throw new Error(`版本 ${next.version} 已存在。`)
    }
  }
}
