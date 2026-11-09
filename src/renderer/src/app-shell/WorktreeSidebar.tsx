import { translate } from '@/i18n/i18n'
import Sidebar from '../components/Sidebar'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import type { VirtualizedScrollAnchor } from '../hooks/useVirtualizedScrollAnchor'
import { isWorkbenchShell } from '../workbench/is-workbench-shell'
import { WORKBENCH_RAIL_WIDTH } from '../workbench/WorkbenchRail'
import type { AppChromeLayout } from './use-app-chrome-layout'

type WorktreeSidebarScrollRefs = {
  scrollOffsetRef: React.MutableRefObject<number>
  scrollAnchorRef: React.MutableRefObject<VirtualizedScrollAnchor>
}

export function WorktreeSidebar({
  layout,
  scrollRefs,
  panelVisible = true
}: {
  layout: AppChromeLayout
  scrollRefs: WorktreeSidebarScrollRefs
  panelVisible?: boolean
}): React.JSX.Element {
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="sidebar.worktrees"
      surface="sidebar"
      resetKey={layout.activeView}
      title={translate('auto.App.1468601e7b', 'The workspace list hit an error.')}
      description={
        layout.leftTitlebarChromeLayout.shouldMount
          ? translate(
              'auto.App.bdc71dddc9',
              'The active workspace remains open. Retry the list or switch views.'
            )
          : translate(
              'auto.App.cba0fafda5',
              'The active page remains open. Retry the list or switch views.'
            )
      }
    >
      <Sidebar
        panelVisible={panelVisible}
        leadingWidth={isWorkbenchShell() ? WORKBENCH_RAIL_WIDTH : 0}
        worktreeScrollOffsetRef={scrollRefs.scrollOffsetRef}
        worktreeScrollAnchorRef={scrollRefs.scrollAnchorRef}
      />
    </RecoverableRenderErrorBoundary>
  )
}
