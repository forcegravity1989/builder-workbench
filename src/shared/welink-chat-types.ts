/**
 * WeLink 项目群 IPC 契约（pr-review-notify 方案一）。
 * main 侧执行 welink-cli（本机登录态），renderer 经 preload 桥调用；
 * 消息字段与 `welink-cli im query-history-message` 的 respData.chatInfo 对齐。
 */

/** 单条群消息；contentType 为 CLI 原值（TEXT_MSG / CARD_MSG / IMAGESPAN_MSG …）。 */
export type WelinkChatMessage = {
  msgId: number
  sender: string
  contentType: string
  content: string
  /** epoch 毫秒。 */
  serverSendTime: number
}

export type WelinkChatHistoryRequest = {
  groupId: string
  /** 拉取条数上限（1–100）。 */
  count?: number
  /** msgId 游标：缺省从最新往回查；给值时按 direction 向旧/向新翻页。 */
  cursor?: number
  /** 0=向旧查（默认），1=向新查。 */
  direction?: 0 | 1
}

export type WelinkChatHistoryResult = {
  /** 按 serverSendTime 升序（CLI 返回为最新在前，服务端已倒序）。 */
  messages: WelinkChatMessage[]
  /** 本页最大 msgId；空结果为 null。 */
  maxMsgId: number | null
  error: string | null
}

export type WelinkChatSendRequest = {
  groupId: string
  text: string
}

export type WelinkChatSendResult = {
  ok: boolean
  error: string | null
}
