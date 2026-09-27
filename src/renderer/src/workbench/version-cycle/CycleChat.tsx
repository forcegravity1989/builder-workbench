import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import NativeChatView from '@/components/native-chat/NativeChatView'
import { setActivityTerminalPortals } from '@/components/activity/activity-terminal-portal'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import { isAgentSessionHandleProvider } from '../../../../shared/agent-session-provider-handle'
import { cycleRuntimeTarget } from './native-cycle-workspace'
import type { CycleSession } from './ports'

/** Displays the selected native binding; history, drafts and process lifetime remain Orca-owned. */
export function CycleChat({ session }: { session: CycleSession | null }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const tab = useAppStore((state) =>
    session
      ? state.unifiedTabsByWorktree[session.worktreeId]?.find((item) => item.id === session.tabId)
      : undefined
  )
  const terminal = useAppStore((state) =>
    session?.kind === 'terminal'
      ? state.tabsByWorktree[session.worktreeId]?.find((item) => item.id === session.tabId)
      : undefined
  )
  const visible =
    session?.kind === 'terminal' ? Boolean(terminal) : tab?.contentType === 'agent-session'
  const portals = useMemo(
    () =>
      visible && session?.kind === 'terminal' && session.paneKey && host
        ? [
            {
              slotId: 'bw-cycle',
              requestToken: `bw-cycle:${session.paneKey}`,
              target: host,
              worktreeId: session.worktreeId,
              tabId: session.tabId,
              paneKey: session.paneKey,
              active: true
            }
          ]
        : [],
    [session, host, visible]
  )
  useLayoutEffect(() => {
    setActivityTerminalPortals(portals)
    return () => setActivityTerminalPortals([])
  }, [portals])
  useEffect(() => {
    if (portals.length) {
      window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
    }
  }, [portals])
  // Why an explicit exited state: a bound session's tab only disappears when Orca closed it
  // (its PTY exited, or the user closed it). Falling back to the unbound empty state hid a
  // resume that died seconds after launch, leaving the column silently blank after a click.
  return (
    <div className="chat-session-host" ref={setHost}>
      {visible &&
        session?.kind === 'structured' &&
        tab &&
        isAgentSessionHandleProvider(tab.agentSessionAgent) && (
          <NativeChatView
            mode="structured"
            tabId={tab.id}
            sessionId={tab.entityId}
            agent={tab.agentSessionAgent}
            isVisible
            isFocusedGroup
            target={cycleRuntimeTarget(session)}
          />
        )}
      {visible &&
        session?.kind === 'structured' &&
        tab &&
        !isAgentSessionHandleProvider(tab.agentSessionAgent) && (
          <div className="chat-session-empty">
            该会话工具不支持在聊天列渲染，请在原生工作区中打开此会话
          </div>
        )}
      {!visible && (
        <div className="chat-session-empty">
          {session
            ? '会话已退出或标签页已关闭，请从下方历史重新打开；若反复退出，请在原生终端手动运行该工具排查'
            : '选择历史会话，或新建本周会话'}
        </div>
      )}
    </div>
  )
}
