import type { GitHubWorkItem } from './work-item-types'

/** 批量读回的行：与单条 gh 读回同形状（repoId 由 renderer 按解析到的登记行回填）。 */
export type WorkItemsBatchEntry = Omit<GitHubWorkItem, 'repoId'>

export type WorkItemsBatchResult = {
  items: WorkItemsBatchEntry[]
  /** 查询失败原因；失败是返回值不是异常，调用方回落单条读或如实呈现。 */
  error?: string
}

/**
 * web 表面未接入批量读取时的如实失败原因（ISSUE_STATES_WEB_UNAVAILABLE 同
 * 口径）：文案属 BW 中文产品面，常量放 shared 供 web shim 引用；范围装载收到
 * 该错误后按组回落既有单条读，不装绿。
 */
export const WORK_ITEMS_BATCH_WEB_UNAVAILABLE = 'web 环境未接入工作项批量读取'
