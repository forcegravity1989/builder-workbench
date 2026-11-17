import type { CycleTaskRead, CycleTaskReference } from '../version-cycle/ports'
import { issueReadState } from '../version-acceptance/acceptance-issue-annotations'
import { taskKey } from './feature-model'

export function unfinishedTaskLabel(
  references: CycleTaskReference[],
  reads: CycleTaskRead[] | null
) {
  const byKey = new Map(reads?.map((read) => [taskKey(read.reference), read]))
  const states = references.map((reference) => issueReadState(byKey.get(taskKey(reference))))
  const unfinished = states.filter((state) => state === 'open').length
  const unknown = states.filter((state) => state === 'unknown').length
  if (!unknown) {
    return `未完成 ${unfinished} 项`
  }
  return unfinished
    ? `已知未完成 ${unfinished} 项，另有 ${unknown} 项状态待确认`
    : '未完成数量待确认'
}
