import { translate } from '@/i18n/i18n'
import Sidebar from '../components/sidebar'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import type { VirtualizedScrollAnchor } from '../lib/list-interaction/virtualized-scrolling/useVirtualizedScrollAnchor'
import { isWorkbenchShell } from '../workbench/is-workbench-shell'
import { WorkbenchSidebarNav } from '../workbench/WorkbenchSidebarNav'
import type { AppChromeLayout } from './chrome/use-app-chrome-layout'

type WorktreeSidebarScrollRefs = {
  scrollOffsetRef: React.MutableRefObject<number>
  scrollAnchorRef: React.MutableRefObject<VirtualizedScrollAnchor>
}

export function WorktreeSidebar({
  layout,
  scrollRefs
}: {
  layout: AppChromeLayout
  scrollRefs: WorktreeSidebarScrollRefs
}): React.JSX.Element {
  const workbenchShell = isWorkbenchShell()
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
        workbenchTitle={workbenchShell ? <WorkbenchSidebarNav /> : undefined}
        worktreeScrollOffsetRef={scrollRefs.scrollOffsetRef}
        worktreeScrollAnchorRef={scrollRefs.scrollAnchorRef}
      />
    </RecoverableRenderErrorBoundary>
  )
}
