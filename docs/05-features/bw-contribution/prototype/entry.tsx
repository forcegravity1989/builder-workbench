import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { i18n, setRendererUiLanguage } from '@/i18n/i18n'
import { WorkbenchRail } from '@/workbench/WorkbenchRail'
import { TitlebarMainStrip } from '@/app-shell/TitlebarMainStrip'
import type { AppChromeLayout } from '@/app-shell/use-app-chrome-layout'
import { SidebarFeedbackDialog } from '@/components/sidebar/SidebarFeedbackDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import NewWorkspaceComposerCard from '@/components/NewWorkspaceComposerCard'
import { ReviewTools, type ScenarioId } from './ReviewTools'
import { ChatComposer, ChatRow, ChatTranscript } from './ReviewChat'
import { toRuntimeExecutionHostId } from '@/../../shared/execution-host'

const projects = [
  {
    kind: 'project-group',
    id: 'project-group:bw',
    projectGroupId: 'bw',
    displayName: 'Builders Workbench',
    badgeColor: 'var(--muted-foreground)',
    detail: 'builder-workbench',
    parentPath: 'C:/workspaces',
    connectionId: null
  }
]
const hosts = [
  {
    kind: 'ready',
    id: 'setup-local',
    projectId: 'project-group:bw',
    hostId: 'local',
    repoId: 'bw-local',
    label: '处理者本机',
    detail: '已登记 BW 仓',
    path: 'C:/workspaces/builder-workbench'
  },
  {
    kind: 'ready',
    id: 'setup-team',
    projectId: 'project-group:bw',
    hostId: toRuntimeExecutionHostId('bw-demo-dev-w02'),
    repoId: 'bw-team',
    label: '团队开发机 Dev-W02',
    detail: '已配对 BW 执行宿主 · 已授权 · 已登记 BW 仓',
    path: '/srv/workspaces/builder-workbench'
  },
  {
    kind: 'needs-setup',
    id: 'setup-offline',
    projectId: 'project-group:bw',
    hostId: toRuntimeExecutionHostId('bw-demo-dev-w08'),
    label: '团队开发机 Dev-W08',
    detail: '离线',
    isAvailable: false,
    attention: false,
    canSetLocation: false
  }
]
const scenarios = {
  A: {
    name: 'BW 自用',
    project: 'Builders Workbench',
    title: '任务页 · 验收笔记',
    draft: '核对任务筛选，补充验收记录。'
  },
  B: {
    name: '其他项目',
    project: '订单服务',
    title: '订单查询 · 实现草稿',
    draft: '补充订单查询失败路径的处理说明。'
  },
  C: {
    name: '外部渠道',
    project: '维护侧',
    title: '维护工作 · 待分诊',
    draft: '整理本轮产品反馈。'
  }
}
const noop = () => {}
const titlebarLayout = {
  activeView: 'terminal',
  effectiveActiveTabId: null,
  creationLayoutActive: false,
  workspaceChromeActive: true,
  showTitlebarExpandButton: false,
  activeTabCanExpand: false,
  showRightSidebarControls: false,
  rightSidebarOpen: false
} as AppChromeLayout
const feedbackCopy = {
  'auto.components.sidebar.SidebarFeedbackDialog.workbenchDescription':
    '说一句问题或期望，可附已有图片。反馈送到本机改进会话，你可以继续原工作。',
  'auto.components.sidebar.SidebarFeedbackDialog.7a46c228b8': '已交给本机改进会话。'
}
const originalCopy = new Map()
function adaptFeedbackCopy(isCollector) {
  for (const [key, value] of Object.entries(feedbackCopy)) {
    if (!originalCopy.has(key)) {
      originalCopy.set(key, i18n.getResource('zh', 'translation', key))
    }
    i18n.addResource('zh', 'translation', key, isCollector ? value : originalCopy.get(key))
  }
}
const apiBridge = {}
window.api = {
  gh: { viewer: async () => null },
  platform: { get: () => ({ platform: 'win32', osRelease: '演示 Windows', arch: 'x64' }) },
  updater: { getVersion: async () => '演示版本', check: async () => {} },
  feedback: { submit: async (args) => apiBridge.submit(args) },
  shell: { openUrl: async () => {} },
  app: { restart: async () => {}, openCrashReport: async () => {}, showAbout: async () => {} }
}

function App() {
  const [which, setWhich] = useState<ScenarioId>('A')
  const [pane, setPane] = useState('work')
  const [drafts, setDrafts] = useState(
    Object.fromEntries(Object.entries(scenarios).map(([key, value]) => [key, value.draft]))
  )
  const [reports, setReports] = useState({})
  const [errorNext, setErrorNext] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [host, setHost] = useState(null)
  const [project, setProject] = useState('project-group:bw')
  const [workspaceName, setWorkspaceName] = useState('issue-d01')
  const [quickAgent, setQuickAgent] = useState(null)
  const [advanced, setAdvanced] = useState(false)
  const [workerNote, setWorkerNote] = useState('')
  const [parentWorktree, setParentWorktree] = useState(null)
  const [workMessages, setWorkMessages] = useState({})
  const [dark, setDark] = useState(false)
  const [grabResult, setGrabResult] = useState('')
  const [grabStatus, setGrabStatus] = useState('')
  const grabApi = useRef(null)
  const activateGrab = async () => {
    try {
      if (!grabApi.current) {
        const { getGlobalApi, init } = await import('react-grab')
        const api = getGlobalApi() ?? init({ freezeReactUpdates: false })
        api.setOptions({ freezeReactUpdates: false })
        api.registerPlugin({
          name: 'bw-review-evidence',
          hooks: {
            onElementSelect: async (element) => {
              const context = await api.getStackContext(element)
              if (context) {
                setGrabResult(context)
                setGrabStatus('已读取元素上下文。可复制后粘贴进反馈。')
              }
            },
            onCopySuccess: (_elements, content) => {
              setGrabResult(content)
              setGrabStatus('已复制元素上下文，可粘贴进反馈。')
            },
            onCopyError: () => setGrabStatus('未能复制。可重试，也可直接填写反馈。')
          }
        })
        grabApi.current = api
      }
      grabApi.current.activate()

      setGrabStatus('悬停实际组件，按 Ctrl+C 启动复制，或使用 React Grab 自己的选取。Esc 退出。')
    } catch {
      setGrabStatus('当前浏览器无法启用开发采集，可直接打开反馈。')
    }
  }
  const openFeedback = () => {
    adaptFeedbackCopy(true)
    setFeedbackOpen(true)
  }
  const report = reports[which]
  const scene = scenarios[which]
  const transition = (patch) =>
    setReports((current) => ({ ...current, [which]: { ...current[which], ...patch } }))
  const note = (text, attachments = 0) =>
    transition({ text, attachments, stage: 'collected', additional: [] })
  apiBridge.submit = async (args) => {
    if (errorNext) {
      setErrorNext(false)
      return { ok: false, error: '演示发送失败，内容仍在表单中。' }
    }
    if (feedbackOpen) {
      note(args.feedback, args.images?.length ?? 0)
    }
    return { ok: true, imagesDelivered: true }
  }
  const ask = () => {
    if (report?.stage === 'collected') {
      transition({ stage: 'waiting' })
    } else if (report?.stage === 'working') {
      transition({ stage: 'review' })
    }
  }
  const replySend = () => {
    if (!reply.trim() || !report) {
      return
    }
    const next = {
      additional: [...report.additional, reply.trim()],
      stage: report.stage === 'waiting' ? 'issue' : report.stage
    }
    if (report.stage === 'waiting' && which === 'A') {
      Object.assign(next, { stage: 'working', worker: makeWorker(hosts[0]) })
    }
    transition(next)
    setReply('')
  }
  const switchScenario = (id: ScenarioId) => {
    setWhich(id)
    setPane('work')
    setReply('')
    setHost(null)
  }
  const locations = hosts.find((option) => option.id === host)
  const makeWorker = (location) => ({
    ...location,
    agent: quickAgent,
    workspaceId: `${location.hostId}:bw:issue-d01`,
    branch: `codex/${workspaceName}`,
    workspacePath:
      location.hostId === 'local'
        ? `C:/workspaces/.orca/worktrees/builder-workbench/${workspaceName}`
        : `/srv/workspaces/.orca/worktrees/builder-workbench/${workspaceName}`
  })
  const receiveWorkspace = () => {
    if (locations?.kind !== 'ready') {
      return
    }
    transition({ stage: 'working', worker: makeWorker(locations) })
    setPane('chat')
  }
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <ReviewTools
          which={which}
          scenarioNames={{ A: scenarios.A.name, B: scenarios.B.name, C: scenarios.C.name }}
          projectName={scene.project}
          workerLabel={report?.worker?.label}
          workspaceOpen={pane === 'workspace'}
          feedbackOpen={feedbackOpen}
          errorNext={errorNext}
          grabStatus={grabStatus}
          grabResult={grabResult}
          onScenarioChange={switchScenario}
          onExternalIntake={() => {
            note('群空间反馈已人工转入：清除 BW 任务筛选后仍然只有两条。')
            setPane('chat')
          }}
          onActivateGrab={activateGrab}
          onAdvance={ask}
          onFailureChange={setErrorNext}
          onToggleTheme={() => {
            document.documentElement.classList.toggle('dark', !dark)
            setDark(!dark)
          }}
          onReset={() => {
            setReports((old) => ({ ...old, [which]: undefined }))
            setDrafts((old) => ({ ...old, [which]: scene.draft }))
            switchScenario(which)
          }}
        />

        <div className="flex min-h-[80vh]">
          <WorkbenchRail />
          <main className="min-w-0 flex-1">
            {which !== 'C' && (
              <div className="titlebar flex items-center border-b border-border px-4 py-2">
                <TitlebarMainStrip layout={titlebarLayout} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openFeedback}
                      data-testid="canvas-feedback"
                    >
                      反馈 BW
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>反馈当前 BW 使用问题</TooltipContent>
                </Tooltip>
              </div>
            )}
            <nav
              className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2"
              aria-label="工作区回看"
            >
              <Button
                variant={pane === 'work' ? 'secondary' : 'ghost'}
                size="sm"
                aria-current={pane === 'work' ? 'page' : undefined}
                data-testid="back-work"
                onClick={() => setPane('work')}
              >
                原工作
              </Button>
              {report && (
                <Button
                  variant={pane === 'chat' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-current={pane === 'chat' ? 'page' : undefined}
                  data-testid="open-collector"
                  onClick={() => setPane('chat')}
                >
                  改进会话{['waiting', 'review'].includes(report.stage) ? ' · 待回应' : ''}
                </Button>
              )}
              {['issue', 'working', 'review', 'confirmed'].includes(report?.stage) && (
                <Button
                  variant={pane === 'issue' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-current={pane === 'issue' ? 'page' : undefined}
                  data-testid="open-issue"
                  onClick={() => setPane('issue')}
                >
                  查看 Issue
                </Button>
              )}
            </nav>
            <div className="mx-auto max-w-4xl px-4 py-6">
              {pane === 'work' && (
                <section>
                  <h1 className="mb-2 text-xl font-semibold">{scene.title}</h1>
                  <p className="mb-4 text-muted-foreground">{scene.project} · 原工作区</p>
                  <ChatTranscript>
                    <ChatRow
                      id="original-status"
                      text="当前会话保留了原项目的上下文，你可以继续处理本次工作。"
                    />
                    {(workMessages[which] || []).map((text, index) => (
                      <ChatRow key={index} id={`work-${index}`} role="user" text={text} />
                    ))}
                  </ChatTranscript>
                  <div className="mt-5" data-testid="original-draft">
                    <ChatComposer
                      scope={`original-${which}`}
                      value={drafts[which]}
                      onChange={(value) => setDrafts((old) => ({ ...old, [which]: value }))}
                      onSend={() => {
                        if (!drafts[which].trim()) {
                          return
                        }
                        setWorkMessages((old) => ({
                          ...old,
                          [which]: [...(old[which] || []), drafts[which]]
                        }))
                        setDrafts((old) => ({ ...old, [which]: '' }))
                      }}
                    />
                  </div>
                </section>
              )}
              {pane === 'chat' && report && (
                <section data-testid="collector">
                  <h1 className="text-xl font-semibold">改进会话</h1>
                  <p className="mb-5 text-muted-foreground">
                    {which === 'C' ? '维护者本机' : '报告者本机'} ·
                    C:/workspaces/bw-feedback（演示非 Git 目录） · 独立原生会话
                  </p>
                  <ChatTranscript>
                    <ChatRow id="original" role="user" text={report.text} />
                    <ChatRow
                      id="received"
                      text={`收到来自 ${scene.project} 的反馈。我会核对既有问题和行为；你可以继续原工作。${report.attachments ? ` 演示收到图片附件 ${report.attachments} 张。` : ''}`}
                    />
                    {report.stage === 'waiting' && (
                      <ChatRow
                        id="question"
                        text="我查到清除筛选后应恢复完整列表。这个问题发生在任务屏，还是在另一个列表？"
                      />
                    )}
                    {report.additional.map((text, index) => (
                      <ChatRow key={index} id={`answer-${index}`} role="user" text={text} />
                    ))}
                    {report.worker && (
                      <ChatRow
                        id="receipt"
                        text={`派工回执 · ${report.worker.label} · ${report.worker.workspacePath} · ${report.worker.branch} · ${report.worker.workspaceId}。${report.worker.hostId === 'local' ? '按本机智能体配置启动。' : '远端使用终端会话。'}`}
                      />
                    )}
                    {report.stage === 'review' && (
                      <ChatRow id="ready" text="Worker 返回同路径的基线与修复记录。" />
                    )}
                    {report.stage === 'confirmed' && (
                      <ChatRow
                        id="confirmed"
                        text="已记录你读过演示证据。真实验收、Issue 与 PR 后续仍沿原生授权处理。"
                      />
                    )}
                  </ChatTranscript>
                  {report.stage === 'review' && (
                    <div className="mt-5">
                      <Button data-testid="open-check" onClick={() => setPane('check')}>
                        查看交付证据
                      </Button>
                    </div>
                  )}
                  <div className="mt-5">
                    <ChatComposer value={reply} onChange={setReply} onSend={replySend} />
                  </div>
                </section>
              )}
              {pane === 'issue' && report && (
                <section data-testid="issue">
                  <h1 className="text-xl font-semibold">Issue #D01 · 清除筛选后恢复完整列表</h1>
                  <p className="mb-5 text-muted-foreground">Builders Workbench · 演示 Issue</p>
                  <ChatTranscript>
                    <ChatRow id="issue-description" text={report.text} />
                  </ChatTranscript>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!report.worker && (
                      <Button
                        data-testid="open-workspace"
                        onClick={() => {
                          setHost('setup-local')
                          setPane('workspace')
                        }}
                      >
                        为 Issue 开始工作区
                      </Button>
                    )}
                    {report.worker && (
                      <Button data-testid="open-receipt" onClick={() => setPane('chat')}>
                        查看派工回执
                      </Button>
                    )}
                  </div>
                </section>
              )}
              {pane === 'workspace' && (
                <section data-testid="workspace">
                  <h1 className="text-xl font-semibold">新建工作区</h1>
                  <p className="mb-5 text-muted-foreground">
                    关联 BW Issue #D01。反馈来源与执行宿主分别选择；不会共享发起人的机器。
                  </p>
                  <NewWorkspaceComposerCard
                    quickAgent={quickAgent}
                    onQuickAgentChange={setQuickAgent}
                    eligibleRepos={[]}
                    repoId={locations?.repoId || 'bw-local'}
                    projectOptions={projects}
                    selectedProjectId={project}
                    selectedRepoIsGit
                    onRepoChange={noop}
                    onProjectChange={setProject}
                    primaryActionLabel="创建关联工作区并派工"
                    name={workspaceName}
                    onNameValueChange={setWorkspaceName}
                    onSmartGitHubItemSelect={noop}
                    onSmartGitLabItemSelect={noop}
                    onSmartBranchSelect={noop}
                    onSmartLinearIssueSelect={noop}
                    smartNameSelection={null}
                    onClearSmartNameSelection={noop}
                    canReuseSelectedBranch={false}
                    reuseSelectedBranch={false}
                    onReuseSelectedBranchChange={noop}
                    forkPushWarning={null}
                    detectedAgentIds={null}
                    onOpenAgentSettings={noop}
                    advancedOpen={advanced}
                    onToggleAdvanced={() => setAdvanced(!advanced)}
                    parentWorktreeId={parentWorktree}
                    onParentWorktreeIdChange={setParentWorktree}
                    createDisabled={
                      !locations || locations.kind !== 'ready' || !workspaceName.trim()
                    }
                    projectError={null}
                    creating={false}
                    onCreate={receiveWorkspace}
                    note={workerNote}
                    onNoteChange={setWorkerNote}
                    setupConfig={null}
                    requiresExplicitSetupChoice={false}
                    setupDecision={null}
                    onSetupDecisionChange={noop}
                    setupAgentStartupPolicy="start-immediately"
                    onSetupAgentStartupPolicyChange={noop}
                    shouldWaitForSetupCheck={false}
                    resolvedSetupDecision={null}
                    createError={null}
                    selectedRepoConnectionId={null}
                    selectedRepoSshStatus={null}
                    selectedRepoRequiresConnection={false}
                    selectedRepoConnectInProgress={false}
                    onConnectSelectedRepo={async () => {}}
                    canUseSparseCheckout={false}
                    sparsePresets={[]}
                    sparseSelectedPresetId={null}
                    onSparseSelectPreset={noop}
                    branchNameOverride={undefined}
                    onBranchNameOverrideChange={noop}
                    branchesEnabled={false}
                    setupControlsEnabled={false}
                    sparseControlsEnabled={false}
                    projectHostSetupOptions={hosts}
                    selectedProjectHostSetupId={host}
                    onProjectHostSetupChange={setHost}
                    showAddProjectButton={false}
                  />
                  <Button variant="ghost" onClick={() => setPane('issue')}>
                    取消
                  </Button>
                </section>
              )}
              {pane === 'check' && report && (
                <section data-testid="check">
                  <h1 className="mb-2 text-xl font-semibold">交付证据</h1>
                  <ChatTranscript>
                    <ChatRow
                      id="baseline"
                      text="**基线证据（演示）**：选中待处理筛选，列表为 2 条。清除筛选后仍为 2 条。"
                    />
                    <ChatRow
                      id="fixed"
                      text="**修复证据（演示）**：选中后为 2 条。清除后恢复全部 6 条。"
                    />
                  </ChatTranscript>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      data-testid="confirm"
                      onClick={() => {
                        transition({ stage: 'confirmed' })
                        setPane('chat')
                      }}
                    >
                      确认已看懂记录
                    </Button>
                    <Button
                      variant="outline"
                      data-testid="rework"
                      onClick={() => {
                        transition({ stage: 'working' })
                        setPane('chat')
                      }}
                    >
                      退回修复
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </main>
        </div>
        <SidebarFeedbackDialog
          open={feedbackOpen}
          onOpenChange={(open) => {
            setFeedbackOpen(open)
            if (!open) {
              adaptFeedbackCopy(false)
            }
          }}
        />
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
void setRendererUiLanguage('zh').finally(() =>
  createRoot(document.getElementById('root')).render(<App />)
)
