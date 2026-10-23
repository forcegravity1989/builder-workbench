import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { emptyGoalResult } from './acceptance-model'

type GoalResult = AcceptanceMaterial['results'][number]

/**
 * CAS 冲突的字段归属合并（2026-10-23 拍板：会中静默合并，不弹人工核对）。
 * 模型通道被 acceptance-human-guard 挡在人字段之外，人与模型字段天然不重叠：
 * 模型字段（候选、包、部署、报告登记、readings、taskSnapshot、阶段）取远端
 * ——本地快照更新在合并瞬间随远端，靠下次 Issue 读回/刷新自愈；人字段（结论、
 * note、下一步、Issue 备注与遗留标记、纪要）保留本地相对 base 的改动。纪要按
 * 整节比较，人编辑过就整节保留（SOP：保留人工已改条目，模型草稿可再生成）。
 * base 缺失（如杀进程恢复的本机脏草稿再遇冲突）时调用方不走本函数，退回人工
 * 处置提示——那种草稿分不清哪些是人改的，自动合并可能吞掉人的输入。
 */
const same = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

function mergeResult(
  base: GoalResult | undefined,
  local: GoalResult,
  remote: GoalResult
): GoalResult {
  // base 行缺失（本地刚建行即遇冲突）时用空行作基线：note/nextStep 的默认空串
  // 不算「人改过」，避免盖掉远端另一会话写入的非空值。
  const baseline = base ?? emptyGoalResult(local.goalId)
  let merged = { ...remote }
  if (!same(local.decision, baseline.decision)) {
    merged = { ...merged, decision: local.decision }
  }
  if (!same(local.note, baseline.note)) {
    merged = { ...merged, note: local.note }
  }
  if (!same(local.nextStep, baseline.nextStep)) {
    merged = { ...merged, nextStep: local.nextStep }
  }
  if (!same(local.issueNotes, baseline.issueNotes)) {
    merged = { ...merged, issueNotes: local.issueNotes }
  }
  if (!same(local.issueMarks, baseline.issueMarks)) {
    merged = { ...merged, issueMarks: local.issueMarks }
  }
  return merged
}

export function mergeAcceptanceMaterial(
  base: AcceptanceMaterial,
  local: AcceptanceMaterial,
  remote: AcceptanceMaterial
): AcceptanceMaterial {
  const merged: AcceptanceMaterial = { ...remote }
  if (!same(local.minutes, base.minutes)) {
    merged.minutes = local.minutes
  }
  const baseResults = new Map(base.results.map((item) => [item.goalId, item]))
  const localResults = new Map(local.results.map((item) => [item.goalId, item]))
  const results = remote.results.map((item) => {
    const localItem = localResults.get(item.goalId)
    return localItem ? mergeResult(baseResults.get(item.goalId), localItem, item) : item
  })
  // 本地独有行区别对待：本地新建的、或人刚落过值的，不能随合并丢掉；base 里
  // 就有且人字段没动过的行是远端有意删除的（模型可删无人工值的行），尊重删除。
  for (const item of local.results) {
    if (remote.results.some((remoteItem) => remoteItem.goalId === item.goalId)) {
      continue
    }
    const baseItem = baseResults.get(item.goalId)
    const touched =
      !baseItem ||
      !same(item.decision, baseItem.decision) ||
      !same(item.note, baseItem.note) ||
      !same(item.nextStep, baseItem.nextStep) ||
      !same(item.issueNotes, baseItem.issueNotes) ||
      !same(item.issueMarks, baseItem.issueMarks)
    if (touched) {
      results.push(item)
    }
  }
  merged.results = results
  return merged
}
