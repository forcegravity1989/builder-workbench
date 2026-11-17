import type { Worktree } from '../../../shared/worktree/types'

/**
 * 工作树登记指纹元组（单树）：`id|实例|归档态|绑定原始 JSON`。只用于探测登记
 * 形态变化（供消费方作重读/重算的失效键），不承载展示语义、不是版本号、不落库。
 * 绑定取登记原始值而非归一值：旧字段形态的变化也要能被探测到。跨树聚合语义
 * （是否排序、分组与连接符）属各消费方失效域，不在本函数统一。
 */
export function worktreeFingerprintTuple(worktree: Worktree): string {
  return [
    worktree.id,
    worktree.instanceId ?? '',
    worktree.isArchived ? '1' : '0',
    JSON.stringify(worktree.workbenchVersionBinding ?? null)
  ].join('|')
}
