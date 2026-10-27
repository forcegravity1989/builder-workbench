import type { RuntimeRepoSearchRefs } from '../runtime-worktree-contracts'
import { branchFullRef } from './branch-ref'

/**
 * 分支 ref 复用匹配（G2 F8 提共享）：main 的版本准备编排与 renderer 的固定树
 * ensure 曾各自维护同一逻辑；提为单一实现，语义=「核对来源再采用」——不能
 * 完整确认（截断/缺明细）即 unverifiable，多个远端同名即 ambiguous，由调用方
 * 按各自错误口径如实报因。本地同名分支优先（正是创建要复用的检出）。
 */
export type ReusableBranchRefMatch =
  | { kind: 'ref'; refName: string }
  | { kind: 'unverifiable' }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

export function matchReusableBranchRef(
  result: RuntimeRepoSearchRefs,
  branch: string
): ReusableBranchRefMatch {
  if (result.truncated || (result.refs.length > 0 && !result.refDetails)) {
    return { kind: 'unverifiable' }
  }
  const details = result.refDetails ?? []
  const local = details.find(
    (ref) =>
      ref.localBranchName === ref.refName &&
      [branch, `heads/${branch}`, branchFullRef(branch)].includes(ref.refName)
  )
  if (local) {
    return { kind: 'ref', refName: local.refName }
  }
  const matching = details.filter((ref) => ref.localBranchName === branch)
  if (matching.length > 1) {
    return { kind: 'ambiguous' }
  }
  const first = matching[0]
  return first ? { kind: 'ref', refName: first.refName } : { kind: 'none' }
}
