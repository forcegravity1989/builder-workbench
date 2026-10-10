import { AgentHibernationGate } from '../components/AgentHibernationGate'
import { AiVaultTabTitleSyncGate } from '../components/AiVaultTabTitleSyncGate'
import RetainedAgentsSyncGate from '../components/dashboard/RetainedAgentsSyncGate'
import { WorkspacePortScanner } from '../components/ports/WorkspacePortScanner'
import { MacosTccPromptNoticeHost } from '../hooks/MacosTccPromptNoticeHost'
import { useAppStore } from '../store'
import { StructuredAgentSessionStatusBridge } from '../components/native-chat/StructuredAgentSessionStatusBridge'

/**
 * App-level gates that render nothing. Each lives here rather than inside the surface that
 * needs it so its high-churn store subscriptions stay out of the App render tree.
 */
export function AppBackgroundServices(): React.JSX.Element {
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)

  return (
    <>
      <WorkspacePortScanner enabled={workspaceSessionReady} />
      {/* Why: plugin language-pack discovery must not re-render the App shell. */}
      <MacosTccPromptNoticeHost />
      {/* Why: leaf-mounted retention sync keeps agent-status subscriptions out of the App render tree. */}
      <RetainedAgentsSyncGate />
      <AiVaultTabTitleSyncGate />
      <AgentHibernationGate />
      <StructuredAgentSessionStatusBridge />
    </>
  )
}
