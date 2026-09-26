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
  const tab = useAppStore((state) => session ? state.unifiedTabsByWorktree[session.worktreeId]?.find(
    (item) => item.id === session.tabId) : undefined)
  const terminal = useAppStore((state) => session?.kind === 'terminal' ? state.tabsByWorktree[session.worktreeId]?.find(
    (item) => item.id === session.tabId) : undefined)
  const visible = session?.kind === 'terminal' ? Boolean(terminal) : tab?.contentType === 'agent-session'
  const portals = useMemo(() => visible && session?.kind === 'terminal' && session.paneKey && host ? [{
    slotId: 'bw-cycle', requestToken: `bw-cycle:${session.paneKey}`, target: host,
    worktreeId: session.worktreeId, tabId: session.tabId, paneKey: session.paneKey, active: true
  }] : [], [session, host, visible])
  useLayoutEffect(() => {
    setActivityTerminalPortals(portals)
    return () => setActivityTerminalPortals([])
  }, [portals])
  useEffect(() => {
    if (portals.length) {window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))}
  }, [portals])
  return <div className="chat-session-host" ref={setHost}>
    {visible && session?.kind === 'structured' && tab && isAgentSessionHandleProvider(tab.agentSessionAgent) &&
      <NativeChatView mode="structured" tabId={tab.id} sessionId={tab.entityId}
        agent={tab.agentSessionAgent} isVisible isFocusedGroup target={cycleRuntimeTarget(session)} />}
    {!visible && <div className="chat-session-empty">{session ? '会话未打开，请从历史中恢复' : '选择历史会话，或新建本周会话'}</div>}
  </div>
}
