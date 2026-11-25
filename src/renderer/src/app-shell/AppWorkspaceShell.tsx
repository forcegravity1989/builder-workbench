import { memo, Suspense, useCallback, useRef } from 'react'
import { lazyWithRetry as lazy } from '@/app-shell/startup/lazy-with-retry'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store/index'
import { usePluginViewCaptureStore } from '@/store/plugins/capture/plugin-view-capture'
import { useBotShareReceiveRequest } from '@/components/bots/sharing/bot-share-receive-open'
import { useHandToBotRequest } from '@/components/bots/hand-to-bot/hand-to-bot-open'
import { pendingCreationOpensNativeChat } from '@/lib/workspace/creation/pending-worktree-creation'
import { showsFloatingRightSidebarToggle } from '@/components/right-sidebar/visibility/right-sidebar-visibility'
import { WorktreeSidebar } from './WorktreeSidebar'
import { AppRail } from '../components/app-rail/AppRail'
import RightSidebar from '../components/right-sidebar/RightSidebar'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import { FloatingTerminalToggleButton } from '../components/floating-terminal/trigger/FloatingTerminalToggleButton'
import { TerminalWorkbenchContainer } from '../components/terminal/workbench/TerminalWorkbenchContainer'
import type { VirtualizedScrollAnchor } from '../lib/list-interaction/virtualized-scrolling/useVirtualizedScrollAnchor'
import { TitlebarLeftControls } from './chrome/TitlebarLeftControls'
import { AppShellLeftColumn } from './chrome/AppShellLeftColumn'
import { RightSidebarToggle } from './chrome/RightSidebarToggle'
import { TitlebarMainStrip } from './chrome/TitlebarMainStrip'
import type { AppChromeLayout } from './chrome/use-app-chrome-layout'
import type { FloatingWorkspacePanelState } from '../components/floating-terminal/workspace/use-floating-workspace-panel'
import { isWorkbenchShell } from '../workbench/is-workbench-shell'
import { MilestoneVersionOrigin } from '../workbench/milestone-version-origin'
import { TeamHostSyncOnStart } from '../workbench/TeamHostSyncOnStart'
import { useProjectPage } from '../workbench/project-page-state'
import { PrReviewNotifications } from '../workbench/pr-review-notifications/PrReviewNotifications'
import { CycleWorkspaceProvider } from '../workbench/version-cycle/CycleWorkspaceProvider'
import { useCycleWorkspace } from '../workbench/version-cycle/cycle-workspace-context'
import { usePlanColumnResize } from '../workbench/use-plan-column-resize'
import { useMetricsWorkspaceOpen } from '../workbench/metrics-workspace-open'
import { useMetricsBandResize } from '../workbench/use-metrics-band-resize'
import { WorkbenchRail } from '../workbench/WorkbenchRail'
import { WorkbenchWorkspaceChoiceDialog } from '../workbench/WorkbenchWorkspaceChoiceDialog'
import { WorkbenchVersionBindingDialog } from '../workbench/version-tree-bind-dialog'

// Skips the shell render each workspace switch causes; its props only change on toggle.
const MemoFloatingTerminalToggleButton = memo(FloatingTerminalToggleButton)

const Landing = lazy(() => import('../components/onboarding/landing/Landing'))
const WorktreeCreationPanel = lazy(
  () => import('../components/worktree-creation/WorktreeCreationPanel')
)
const PendingNativeChatCreation = lazy(
  () => import('../components/worktree-creation/PendingNativeChatCreation')
)
const TaskPage = lazy(() => import('../components/task-page/TaskPage'))
const AutomationsPage = lazy(() => import('../components/automations/AutomationsPage'))
const ActivityPrototypePage = lazy(() => import('../components/activity/ActivityPrototypePage'))
const Settings = lazy(() => import('../components/settings/Settings'))
const SkillsPage = lazy(() => import('../components/skills/SkillsPage'))
const ArtifactsPage = lazy(() => import('../components/artifacts/ArtifactsPage'))
const WorkspaceSpacePage = lazy(() => import('../components/workspace-space/WorkspaceSpacePage'))
const MobilePage = lazy(() => import('../components/mobile/MobilePage'))
const HandToBotFlow = lazy(() =>
  import('../components/bots/hand-to-bot/HandToBotFlow').then((module) => ({
    default: module.HandToBotFlow
  }))
)
const BotTemplatesDialog = lazy(() => import('../components/bots/templates/BotTemplatesDialog'))
const BotShareReceiveFlow = lazy(() =>
  import('../components/bots/sharing/BotShareReceiveFlow').then((module) => ({
    default: module.BotShareReceiveFlow
  }))
)
const GitHubInstallMount = lazy(() =>
  import('../components/bots/github/GitHubInstallMount').then((module) => ({
    default: module.GitHubInstallMount
  }))
)
const Terminal = lazy(() => import('../components/terminal/workbench/Terminal'))
const OverviewPage = lazy(() =>
  import('../workbench/OverviewPage').then((module) => ({ default: module.OverviewPage }))
)
const VersionOverviewPage = lazy(() =>
  import('../workbench/version-overview-page').then((module) => ({
    default: module.VersionOverviewPage
  }))
)
const ProjectWallPage = lazy(() =>
  import('../workbench/ProjectWallPage').then((module) => ({ default: module.ProjectWallPage }))
)
const KnowledgePage = lazy(() =>
  import('../workbench/KnowledgePage').then((module) => ({ default: module.KnowledgePage }))
)
const CycleWorkspacePage = lazy(() =>
  import('../workbench/CycleWorkspacePage').then((module) => ({
    default: module.CycleWorkspacePage
  }))
)
const MetricsWorkspaceBoard = lazy(() =>
  import('../workbench/metrics-workspace-board').then((module) => ({
    default: module.MetricsWorkspaceBoard
  }))
)

// A chat-bound creation shows the chat itself, usable before its worktree exists.
function PendingCreationSurface(props: {
  creationId: string
  reserveCollapsedSidebarHeaderSpace: boolean
}): React.JSX.Element {
  const opensChat = useAppStore((s) => {
    const entry = s.pendingWorktreeCreations[props.creationId]
    return entry ? pendingCreationOpensNativeChat(entry) : false
  })
  return opensChat ? <PendingNativeChatCreation {...props} /> : <WorktreeCreationPanel {...props} />
}

function BotShareReceiveMount(): React.JSX.Element | null {
  const request = useBotShareReceiveRequest()
  return request ? (
    <Suspense fallback={null}>
      <BotShareReceiveFlow key={request.key} request={request} />
    </Suspense>
  ) : null
}

function BotTemplatesMount(): React.JSX.Element | null {
  const open = useAppStore((s) => s.activeModal === 'bot-templates')
  return open ? (
    <Suspense fallback={null}>
      <BotTemplatesDialog />
    </Suspense>
  ) : null
}

function HandToBotMount(): React.JSX.Element | null {
  const request = useHandToBotRequest()
  return request ? (
    <Suspense fallback={null}>
      <HandToBotFlow key={request.key} request={request} />
    </Suspense>
  ) : null
}

function ActivePage({ layout }: { layout: AppChromeLayout }): React.JSX.Element {
  const { activeView, hasActiveWorktree, activePendingCreationId, creationLayoutActive } = layout
  const projectPage = useProjectPage()
  const workbenchShell = isWorkbenchShell()
  const activity = workbenchShell ? (
    projectPage?.kind === 'wall' ? (
      <ProjectWallPage />
    ) : projectPage?.kind === 'version-overview' ? (
      <MilestoneVersionOrigin options={projectPage.options}>
        <VersionOverviewPage
          key={JSON.stringify([projectPage.options.repoId, projectPage.options.hostId])}
          options={projectPage.options}
        />
      </MilestoneVersionOrigin>
    ) : (
      <OverviewPage />
    )
  ) : (
    <ActivityPrototypePage />
  )
  return (
    <>
      {activeView === 'settings' ? <Settings /> : null}
      {activeView === 'skills' ? <SkillsPage /> : null}
      {activeView === 'artifacts' && !workbenchShell ? <ArtifactsPage /> : null}
      {activeView === 'tasks' ? <TaskPage /> : null}
      {activeView === 'automations' ? <AutomationsPage /> : null}
      {activeView === 'activity' ? activity : null}
      {activeView === 'space' ? workbenchShell ? <KnowledgePage /> : <WorkspaceSpacePage /> : null}
      {activeView === 'mobile' && !workbenchShell ? <MobilePage /> : null}
      <BotShareReceiveMount />
      <BotTemplatesMount />
      <HandToBotMount />
      <Suspense fallback={null}>
        <GitHubInstallMount />
      </Suspense>
      {activeView === 'terminal' && creationLayoutActive && activePendingCreationId ? (
        <PendingCreationSurface
          creationId={activePendingCreationId}
          reserveCollapsedSidebarHeaderSpace={layout.leftTitlebarChromeLayout.isFloating}
        />
      ) : null}
      {activeView === 'terminal' && !hasActiveWorktree && !creationLayoutActive ? (
        <Landing />
      ) : null}
    </>
  )
}

type AppWorkspaceShellProps = {
  layout: AppChromeLayout
  floatingWorkspace: FloatingWorkspacePanelState
}

export function AppWorkspaceShell(props: AppWorkspaceShellProps): React.JSX.Element {
  if (!isWorkbenchShell()) {
    return <AppWorkspaceContent {...props} />
  }
  return (
    <CycleWorkspaceProvider>
      <AppWorkspaceContent {...props} />
      <WorkbenchWorkspaceChoiceDialog />
      <WorkbenchVersionBindingDialog />
      <PrReviewNotifications />
      <TeamHostSyncOnStart />
    </CycleWorkspaceProvider>
  )
}

function AppWorkspaceContent(props: AppWorkspaceShellProps): React.JSX.Element {
  const t = useTranslate()
  const { layout, floatingWorkspace } = props
  const cycle = useCycleWorkspace()
  const metricsBoard = useMetricsWorkspaceOpen()
  const metricsOnly = metricsBoard && !cycle
  const band = useMetricsBandResize()
  const resize = usePlanColumnResize(Boolean(cycle?.context.worktreeId))
  const workbenchShell = isWorkbenchShell()
  const titlebarLeftControls = <TitlebarLeftControls layout={layout} />
  const titlebarMainStrip = <TitlebarMainStrip layout={layout} />
  // Keep scroll memory above sidebar view remounts to preserve list position.
  const scrollOffsetRef = useRef(0)
  const scrollAnchorRef = useRef<VirtualizedScrollAnchor>(null)
  const sidebarScrollRefs = { scrollOffsetRef, scrollAnchorRef }
  const { setOpenWithFocus } = floatingWorkspace
  // `orca plugin shot` captures the right sidebar, which the parked launcher floats over.
  const capturingPluginShot = usePluginViewCaptureStore((s) => s.capturing)
  const toggleFloatingWorkspace = useCallback(
    () => setOpenWithFocus((open) => !open),
    [setOpenWithFocus]
  )

  return (
    // Avoid active-worktree reset keys that remount whole surfaces during wake.
    <RecoverableRenderErrorBoundary
      boundaryId="app.workspace-shell"
      surface="workspace-shell"
      resetKey={layout.activeView}
      title={t('auto.App.df1d56bf87', 'The workspace shell hit an error.')}
      description={t(
        'auto.App.8504ddf267',
        'The app is still running. Retry the shell or use the menu to report the crash details.'
      )}
    >
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
        {/* Keep the non-workspace titlebar from spanning the right sidebar. */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Workspace tab groups reach the top; other pages retain the titlebar. */}
          {!layout.leftTitlebarChromeLayout.shouldMount ? (
            <div className="titlebar">
              <div className="flex items-center shrink-0 mr-2">{titlebarLeftControls}</div>
              {titlebarMainStrip}
            </div>
          ) : null}
          <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
            <AppShellLeftColumn
              layout={layout}
              titlebarLeftControls={titlebarLeftControls}
              rail={
                workbenchShell ? (
                  <WorkbenchRail />
                ) : (
                  <AppRail
                    listVisible={layout.showSidebar && layout.sidebarOpen}
                    style={layout.leftSidebarStyle}
                  />
                )
              }
              list={<WorktreeSidebar layout={layout} scrollRefs={sidebarScrollRefs} />}
            />
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              {/* Every page sits under the top bar; window controls and board sheets rely on it. */}
              {layout.stackedSidebarOpen ? (
                <div className="titlebar">{titlebarMainStrip}</div>
              ) : null}
              <div className="relative flex flex-1 min-w-0 min-h-0 overflow-hidden">
                {/* Match the open sidebar header’s alignment to prevent toggle jitter. */}
                {showsFloatingRightSidebarToggle(layout) && (
                  <div
                    className="absolute top-0 z-10 flex h-(--app-header-height) items-center"
                    style={
                      {
                        // Why: --window-controls-width keeps the toggle clear of the fixed window-controls overlay (138px on custom chrome, 0px otherwise); no internal spacer — one would cover the pane-actions Ellipsis button with an unclickable div.
                        right: 'var(--window-controls-width)',
                        WebkitAppRegion: 'no-drag'
                      } as React.CSSProperties
                    }
                  >
                    <RightSidebarToggle />
                  </div>
                )}
                <div
                  className={`relative flex flex-1 min-w-0 min-h-0${metricsOnly ? ' flex-col' : ''}`}
                  ref={resize.bodyRef}
                >
                  <div
                    className={`flex min-w-0 min-h-0 flex-col${cycle && resize.chatCollapsed ? ' absolute inset-y-0 left-0 opacity-0 pointer-events-none' : ' relative'}`}
                    inert={!!cycle && resize.chatCollapsed}
                    aria-hidden={!!cycle && resize.chatCollapsed}
                    ref={metricsOnly ? undefined : resize.chatColRef}
                    style={
                      cycle
                        ? cycle.context.worktreeId
                          ? undefined
                          : { display: 'none' }
                        : { flex: 1, width: metricsOnly ? 'auto' : '100%', minWidth: 0 }
                    }
                  >
                    {layout.shouldMountTerminalWorkbench ? (
                      <TerminalWorkbenchContainer
                        isVisible={
                          layout.terminalWorkbenchVisible && !(cycle && resize.chatCollapsed)
                        }
                      >
                        <Suspense fallback={null}>
                          <RecoverableRenderErrorBoundary
                            boundaryId="terminal.workbench"
                            surface="terminal-workbench"
                            resetKey="terminal"
                            title={t(
                              'auto.App.5a9519aef0',
                              'The workspace workbench hit an error.'
                            )}
                            description={t(
                              'auto.App.98d4ea2823',
                              'Terminal, browser, or editor rendering failed in this workspace. Retry to remount it.'
                            )}
                          >
                            <Terminal reserveClosedExplorerToggleSpace={!cycle && !metricsBoard} />
                          </RecoverableRenderErrorBoundary>
                        </Suspense>
                      </TerminalWorkbenchContainer>
                    ) : null}
                    <Suspense fallback={null}>
                      <RecoverableRenderErrorBoundary
                        boundaryId={`page.${layout.activeView}`}
                        surface="page"
                        resetKey={layout.activeView}
                        title={t('auto.App.b7a714db1e', 'This page hit an error.')}
                        description={t(
                          'auto.App.03a14f6b5b',
                          'Retry the page or navigate to another Orca surface.'
                        )}
                      >
                        <ActivePage layout={layout} />
                      </RecoverableRenderErrorBoundary>
                    </Suspense>
                  </div>
                  {cycle || metricsBoard ? (
                    <>
                      {cycle && !resize.chatCollapsed ? (
                        <div
                          className="vc-split"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={t(
                            'auto.app.shell.AppWorkspaceShell.e82b94df8a',
                            '调整左右栏宽度'
                          )}
                          onMouseDown={resize.onResizeStart}
                        />
                      ) : null}
                      {metricsOnly ? (
                        <div
                          className="vc-split vc-split-row"
                          role="separator"
                          aria-orientation="horizontal"
                          aria-label={t(
                            'auto.app.shell.AppWorkspaceShell.5920545322',
                            '调整上下栏高度'
                          )}
                          onMouseDown={band.onResizeStart}
                        />
                      ) : null}
                      <Suspense fallback={null}>
                        <div
                          className={`vc-board-slot${layout.workspaceChromeActive ? ' vc-board-slot-terminal' : ''}${metricsOnly ? ' vc-metrics-preview' : ''}`}
                          style={
                            metricsOnly ? { height: `calc(${band.ratio * 100}% - 6px)` } : undefined
                          }
                        >
                          {layout.workspaceChromeActive && !metricsOnly ? (
                            <div className="vc-board-titlebar">
                              {!layout.rightSidebarOpen ? (
                                <div className="vc-board-titlebar-controls-space" />
                              ) : null}
                            </div>
                          ) : null}
                          {cycle ? <CycleWorkspacePage /> : <MetricsWorkspaceBoard />}
                        </div>
                      </Suspense>
                    </>
                  ) : null}
                </div>
                {floatingWorkspace.showToggleButton && !capturingPluginShot ? (
                  <MemoFloatingTerminalToggleButton
                    open={floatingWorkspace.open}
                    onToggle={toggleFloatingWorkspace}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {/* Retain the shell for stable layout while heavy panels disconnect; tasks can unmount it. */}
        {layout.showRightSidebarControls ? (
          <RecoverableRenderErrorBoundary
            boundaryId="right-sidebar"
            surface="right-sidebar"
            resetKey={
              layout.rightSidebarTab === 'explorer'
                ? `${layout.rightSidebarTab}:${layout.rightSidebarExplorerView}`
                : layout.rightSidebarTab
            }
            title={t('auto.App.ed6b168d00', 'The right sidebar hit an error.')}
            description={t(
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
