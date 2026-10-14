import { Suspense, useRef } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { translate } from '@/i18n/i18n'
import Sidebar from '../components/Sidebar'
import RightSidebar from '../components/right-sidebar'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import { FloatingTerminalToggleButton } from '../components/floating-terminal/FloatingTerminalToggleButton'
import { TerminalWorkbenchContainer } from '../components/TerminalWorkbenchContainer'
import type { VirtualizedScrollAnchor } from '../hooks/useVirtualizedScrollAnchor'
import { TitlebarLeftControls } from './TitlebarLeftControls'
import { RightSidebarToggle, TitlebarMainStrip } from './TitlebarMainStrip'
import type { AppChromeLayout } from './use-app-chrome-layout'
import type { FloatingWorkspacePanelState } from './use-floating-workspace-panel'
import { isWorkbenchShell } from '../workbench/is-workbench-shell'
import { useProjectPage } from '../workbench/project-page-state'
import { CycleWorkspaceProvider } from '../workbench/version-cycle/CycleWorkspaceProvider'
import { useCycleWorkspace } from '../workbench/version-cycle/cycle-workspace-context'
import { usePlanColumnResize } from '../workbench/use-plan-column-resize'

const Landing = lazy(() => import('../components/Landing'))
const WorktreeCreationPanel = lazy(
  () => import('../components/worktree-creation/WorktreeCreationPanel')
)
const TaskPage = lazy(() => import('../components/task-page/TaskPage'))
const AutomationsPage = lazy(() => import('../components/automations/AutomationsPage'))
const ActivityPrototypePage = lazy(() => import('../components/activity/ActivityPrototypePage'))
const Settings = lazy(() => import('../components/settings/Settings'))
const SkillsPage = lazy(() => import('../components/skills/SkillsPage'))
const ArtifactsPage = lazy(() => import('../components/artifacts/ArtifactsPage'))
const WorkspaceSpacePage = lazy(() => import('../components/workspace-space/WorkspaceSpacePage'))
const Terminal = lazy(() => import('../components/Terminal'))
const OverviewPage = lazy(() =>
  import('../workbench/OverviewPage').then((m) => ({ default: m.OverviewPage }))
)
const KnowledgePage = lazy(() =>
  import('../workbench/KnowledgePage').then((m) => ({ default: m.KnowledgePage }))
)
const CycleWorkspacePage = lazy(() =>
  import('../workbench/CycleWorkspacePage').then((m) => ({ default: m.CycleWorkspacePage }))
)
const ProjectWallPage = lazy(() =>
  import('../workbench/ProjectWallPage').then((m) => ({ default: m.ProjectWallPage }))
)
const OnboardProjectPage = lazy(() =>
  import('../workbench/OnboardProjectPage').then((m) => ({ default: m.OnboardProjectPage }))
)
const EditCharterPage = lazy(() =>
  import('../workbench/EditCharterPage').then((m) => ({ default: m.EditCharterPage }))
)
const WeeklyReportPage = lazy(() =>
  import('../workbench/weekly-report/WeeklyReportPage').then((m) => ({
    default: m.WeeklyReportPage
  }))
)

type WorktreeSidebarScrollRefs = {
  scrollOffsetRef: React.MutableRefObject<number>
  scrollAnchorRef: React.MutableRefObject<VirtualizedScrollAnchor>
}

function WorktreeSidebar({
  layout,
  scrollRefs
}: {
  layout: AppChromeLayout
  scrollRefs: WorktreeSidebarScrollRefs
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
        worktreeScrollOffsetRef={scrollRefs.scrollOffsetRef}
        worktreeScrollAnchorRef={scrollRefs.scrollAnchorRef}
      />
    </RecoverableRenderErrorBoundary>
  )
}

function ActivePage({ layout }: { layout: AppChromeLayout }): React.JSX.Element {
  const { activeView, activeWorktreeId, activePendingCreationId, creationLayoutActive } = layout
  const projectPage = useProjectPage()
  if (isWorkbenchShell() && activeView === 'activity') {
    if (projectPage?.kind === 'wall') {
      return <ProjectWallPage />
    }
    if (projectPage?.kind === 'onboard') {
      return <OnboardProjectPage options={projectPage.options} />
    }
    if (projectPage?.kind === 'charter') {
      return <EditCharterPage options={projectPage.options} />
    }
    if (projectPage?.kind === 'weekly-report') {
      return <WeeklyReportPage />
    }
  }
  return (
    <>
      {activeView === 'settings' ? <Settings /> : null}
      {activeView === 'skills' ? <SkillsPage /> : null}
      {activeView === 'artifacts' ? isWorkbenchShell() ? null : <ArtifactsPage /> : null}
      {activeView === 'tasks' ? <TaskPage /> : null}
      {activeView === 'automations' ? <AutomationsPage /> : null}
      {activeView === 'activity' ? (
        isWorkbenchShell() ? (
          <OverviewPage />
        ) : (
          <ActivityPrototypePage />
        )
      ) : null}
      {activeView === 'space' ? (
        isWorkbenchShell() ? (
          <KnowledgePage />
        ) : (
          <WorkspaceSpacePage />
        )
      ) : null}
      {activeView === 'terminal' && creationLayoutActive && activePendingCreationId ? (
        <WorktreeCreationPanel
          creationId={activePendingCreationId}
          reserveCollapsedSidebarHeaderSpace={layout.leftTitlebarChromeLayout.isFloating}
        />
      ) : null}
      {activeView === 'terminal' && !activeWorktreeId && !creationLayoutActive ? <Landing /> : null}
    </>
  )
}

/** The left sidebar + titlebar + page/workbench content area + right sidebar. */
export function AppWorkspaceShell(props: {
  layout: AppChromeLayout
  floatingWorkspace: FloatingWorkspacePanelState
}): React.JSX.Element {
  if (!isWorkbenchShell()) {
    return <AppWorkspaceContent {...props} />
  }
  return (
    <CycleWorkspaceProvider>
      <AppWorkspaceContent {...props} />
    </CycleWorkspaceProvider>
  )
}

function AppWorkspaceContent(props: {
  layout: AppChromeLayout
  floatingWorkspace: FloatingWorkspacePanelState
}): React.JSX.Element {
  const { layout, floatingWorkspace } = props
  const cycle = useCycleWorkspace()
  const resize = usePlanColumnResize(Boolean(cycle?.context.worktreeId))
  const titlebarLeftControls = <TitlebarLeftControls layout={layout} />
  const titlebarMainStrip = <TitlebarMainStrip layout={layout} />
  // Why: keep virtualized scroll memory above the sidebar's workspace/landing remount so the left list doesn't restart at scrollTop 0.
  const scrollOffsetRef = useRef(0)
  const scrollAnchorRef = useRef<VirtualizedScrollAnchor>(null)
  const sidebarScrollRefs = { scrollOffsetRef, scrollAnchorRef }

  return (
    // Why: workspace activation is a hot path; activeWorktreeId in reset keys would remount whole surfaces during wake.
    <RecoverableRenderErrorBoundary
      boundaryId="app.workspace-shell"
      surface="workspace-shell"
      resetKey={layout.activeView}
      title={translate('auto.App.df1d56bf87', 'The workspace shell hit an error.')}
      description={translate(
        'auto.App.8504ddf267',
        'The app is still running. Retry the shell or use the menu to report the crash details.'
      )}
    >
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
        {/* Why: keep the non-workspace titlebar inside this left+center wrapper so it doesn't span over the right-sidebar column. */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Why: workspace view drops the full-width titlebar so tab groups extend to the top; settings/landing/tasks keep it. */}
          {!layout.leftTitlebarChromeLayout.shouldMount ? (
            <div className="titlebar">
              <div className="flex items-center shrink-0 mr-2">{titlebarLeftControls}</div>
              {titlebarMainStrip}
            </div>
          ) : null}
          <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
            {layout.showSidebar ? (
              layout.leftTitlebarChromeLayout.shouldMount ? (
                /* Why: when the sidebar is collapsed, take this titlebar-height header out of flex layout so the terminal/editor reclaim the left edge. */
                <div
                  className={`flex min-h-0 flex-col shrink-0${layout.sidebarOpen ? '' : ' relative w-0 overflow-visible'}`}
                >
                  <div
                    // Why: floating titlebar-left occludes the center column's border-l seam; border-r restores that line, w-max sizes it to its own controls.
                    className={`titlebar-left${
                      layout.leftTitlebarChromeLayout.isFloating
                        ? ' titlebar-left-floating absolute top-0 left-0 z-10 w-max border-r border-border'
                        : ''
                    }`}
                    style={
                      // Why: custom sidebar appearances are scoped to the sidebar root; mirror those vars onto the header in the same left-column panel.
                      // Width stays in CSS (width:0; min-width:100%) so this header tracks the sidebar during drag without stretching the column.
                      layout.sidebarOpen ? layout.leftSidebarStyle : undefined
                    }
                  >
                    {titlebarLeftControls}
                  </div>
                  {/* Why: flex-1/min-h-0 slot needed under the fixed 36px header, else the sidebar collapses to content height and loses its scroll viewport. */}
                  <div className="flex min-h-0 flex-1">
                    <WorktreeSidebar layout={layout} scrollRefs={sidebarScrollRefs} />
                  </div>
                </div>
              ) : (
                <WorktreeSidebar layout={layout} scrollRefs={sidebarScrollRefs} />
              )
            ) : null}
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              {layout.stackedSidebarOpen &&
              (isWorkbenchShell() ||
                (layout.activeView !== 'automations' && layout.activeView !== 'artifacts')) ? (
                <div className="titlebar">{titlebarMainStrip}</div>
              ) : null}
              <div className="relative flex flex-1 min-w-0 min-h-0 overflow-hidden">
                {/* Why: match the RightSidebar header's 36px/top-0 so the toggle's vertical center is identical open vs closed — else the icon jitters. */}
                {layout.workspaceChromeActive && !layout.rightSidebarOpen && (
                  <div
                    className="absolute top-0 z-10 flex items-center h-[36px]"
                    style={
                      {
                        // Why: --window-controls-width keeps the toggle clear of the fixed window-controls overlay (138px on custom chrome, 0px otherwise); no internal spacer — one would cover the pane-actions Ellipsis button with an unclickable div.
                        right: 'var(--window-controls-width)',
                        WebkitAppRegion: 'no-drag'
                      } as React.CSSProperties
                    }
                  >
                    {layout.showRightSidebarControls ? <RightSidebarToggle /> : null}
                  </div>
                )}
                <div className="flex flex-1 min-w-0 min-h-0" ref={resize.bodyRef}>
                  <div
                    className="flex min-w-0 min-h-0 flex-col"
                    ref={resize.chatColRef}
                    style={
                      !cycle
                        ? { flex: 1, width: '100%' }
                        : !cycle.context.worktreeId
                          ? { display: 'none' }
                          : undefined
                    }
                  >
                    {layout.shouldMountTerminalWorkbench ? (
                      <TerminalWorkbenchContainer isVisible={layout.terminalWorkbenchVisible}>
                        <Suspense fallback={null}>
                          <RecoverableRenderErrorBoundary
                            boundaryId="terminal.workbench"
                            surface="terminal-workbench"
                            resetKey="terminal"
                            title={translate(
                              'auto.App.5a9519aef0',
                              'The workspace workbench hit an error.'
                            )}
                            description={translate(
                              'auto.App.98d4ea2823',
                              'Terminal, browser, or editor rendering failed in this workspace. Retry to remount it.'
                            )}
                          >
                            <Terminal reserveClosedExplorerToggleSpace={!cycle} />
                          </RecoverableRenderErrorBoundary>
                        </Suspense>
                      </TerminalWorkbenchContainer>
                    ) : null}
                    <Suspense fallback={null}>
                      <RecoverableRenderErrorBoundary
                        boundaryId={`page.${layout.activeView}`}
                        surface="page"
                        resetKey={layout.activeView}
                        title={translate('auto.App.b7a714db1e', 'This page hit an error.')}
                        description={translate(
                          'auto.App.03a14f6b5b',
                          'Retry the page or navigate to another Orca surface.'
                        )}
                      >
                        <ActivePage layout={layout} />
                      </RecoverableRenderErrorBoundary>
                    </Suspense>
                  </div>
                  {cycle && (
                    <>
                      <div
                        className="vc-split"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="调整左右栏宽度"
                        onMouseDown={resize.onResizeStart}
                      />
                      <Suspense fallback={null}>
                        <div
                          className={`vc-board-slot${
                            layout.workspaceChromeActive ? ' vc-board-slot-terminal' : ''
                          }`}
                        >
                          {layout.workspaceChromeActive ? (
                            <div className="vc-board-titlebar" aria-hidden="true">
                              {/* Why: the closed-sidebar reopen toggle and window controls float above this drag band as z-index siblings; Electron drag hit-test respects no-drag only on DOM descendants, so this carve-out keeps them clickable. Mirrors the TabGroupPanel spacer. */}
                              {!layout.rightSidebarOpen ? (
                                <div className="vc-board-titlebar-controls-space" />
                              ) : null}
                            </div>
                          ) : null}
                          <CycleWorkspacePage />
                        </div>
                      </Suspense>
                    </>
                  )}
                </div>
                {floatingWorkspace.showToggleButton ? (
                  <FloatingTerminalToggleButton
                    open={floatingWorkspace.open}
                    onToggle={() => floatingWorkspace.setOpenWithFocus((open) => !open)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {/* Why: keep the shell mounted for layout stability (heavy panels disconnect while closed); unmount on the distraction-free tasks view. */}
        {layout.showRightSidebarControls ? (
          <RecoverableRenderErrorBoundary
            boundaryId="right-sidebar"
            surface="right-sidebar"
            resetKey={
              layout.rightSidebarTab === 'explorer'
                ? `${layout.rightSidebarTab}:${layout.rightSidebarExplorerView}`
                : layout.rightSidebarTab
            }
            title={translate('auto.App.ed6b168d00', 'The right sidebar hit an error.')}
            description={translate(
              'auto.App.8d1e160ed1',
              'Retry the sidebar or switch tabs to reload this surface.'
            )}
          >
            <RightSidebar />
          </RecoverableRenderErrorBoundary>
        ) : null}
      </div>
    </RecoverableRenderErrorBoundary>
  )
}
