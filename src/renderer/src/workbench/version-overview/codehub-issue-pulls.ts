import type { CycleTaskSnapshot } from '../version-cycle/ports'

/** Internal CLI adapter point. Missing reverse lookup is not evidence of no MRs. */
export function readCodeHubIssuePulls(_task: CycleTaskSnapshot): {
  kind: 'unavailable'
  reason: string
  numbers: number[]
} {
  return {
    kind: 'unavailable',
    numbers: [],
    reason: 'CodeHub Issue→MR 反查尚未接入；当前仅可读取显式 MR 链接和原生关联。'
  }
}
