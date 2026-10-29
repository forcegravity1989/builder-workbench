/**
 * 项目群面板共享 context（pr-review-notify 方案一）。
 * 面板与按钮共享同一份 useProjectChat 状态；context 避免两处各建一个 hook 实例。
 */
import React from 'react'
import type { useProjectChat } from './use-project-chat'

export type ProjectChatContextValue = ReturnType<typeof useProjectChat>

export const ProjectChatContext = React.createContext<ProjectChatContextValue | null>(null)

export function useProjectChatContext(): ProjectChatContextValue {
  const value = React.useContext(ProjectChatContext)
  if (!value) {
    throw new Error('ProjectChatFloating 内部组件必须在 Provider 内使用')
  }
  return value
}
