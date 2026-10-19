export type IssueStateEntry = {
  number: number
  /** 原生开/关状态。墙卡口径「关闭即完成」只消费此字段（关闭原因不参与计数，spec 取舍 9）。 */
  state: 'OPEN' | 'CLOSED'
}

export type IssueStatesBatchResult = {
  items: IssueStateEntry[]
  /** 查询失败原因；失败是返回值不是异常，调用方如实呈现「读不到」。 */
  error?: string
}

/**
 * web 表面未接入批量读取时的如实失败原因。文案属 BW 中文产品面（最终显示在
 * 墙卡 Unknown 提示），常量放 shared 供 web shim 引用，避免在 Orca 本地化
 * 审计面内内联中文字面量。
 */
export const ISSUE_STATES_WEB_UNAVAILABLE = 'web 环境未接入 Issue 状态批量读取'
