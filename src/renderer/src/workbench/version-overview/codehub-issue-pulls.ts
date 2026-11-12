import type { CodeHubTaskDetail } from '../../../../shared/codehub-tasks'

export function readCodeHubIssuePulls(
  detail: CodeHubTaskDetail
):
  | { kind: 'available'; numbers: number[] }
  | { kind: 'unavailable'; reason: string; numbers: number[] } {
  if (!detail.linkedMergeRequests) {
    return {
      kind: 'unavailable',
      numbers: [],
      reason: 'CodeHub Issue 未返回完整的关联 MR；当前仅可读取显式 MR 链接和原生工作树关联。'
    }
  }
  return {
    kind: 'available',
    numbers: [...new Set(detail.linkedMergeRequests.map((mr) => mr.iid))]
  }
}
