/**
 * WeLink 项目群 preload 桥（pr-review-notify 方案一）：
 * renderer → main 的 welink-cli IM 收发与登录态读回。
 */
import { ipcRenderer } from 'electron'
import type {
  WelinkChatHistoryRequest,
  WelinkChatHistoryResult,
  WelinkChatSendRequest,
  WelinkChatSendResult
} from '../../shared/welink-chat-types'

export type WelinkChatApi = {
  authStatus(): Promise<boolean>
  history(request: WelinkChatHistoryRequest): Promise<WelinkChatHistoryResult>
  send(request: WelinkChatSendRequest): Promise<WelinkChatSendResult>
}

export const welinkChatApi: WelinkChatApi = {
  authStatus: () => ipcRenderer.invoke('welink-chat:authStatus'),
  history: (request) => ipcRenderer.invoke('welink-chat:history', request),
  send: (request) => ipcRenderer.invoke('welink-chat:send', request)
}
