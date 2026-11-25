import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getGlobalApi, init } from 'react-grab'
import { setRendererUiLanguage } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import NewWorkspaceComposerCard from '@/components/NewWorkspaceComposerCard'
import { toRuntimeExecutionHostId } from '@/../../shared/execution-host'
import { ChatRow, ChatTranscript } from './ReviewChat'

const issue = 'https://github.com/example/builder-workbench/issues/401'
const repairNote = `拉取最新代码，按项目 workbench-start 处理 Issue ${issue}。`
const collectSkill = 'C:/Users/demo/.claude/skills/improve-workbench/SKILL.md'
const noop = () => {}
const projectId = 'project-group:bw'
const projects = [
  {
    kind: 'project-group',
    id: projectId,
    projectGroupId: 'bw',
    displayName: 'Builders Workbench',
    badgeColor: 'var(--muted-foreground)',
    detail: 'builder-workbench',
    parentPath: 'C:/workspaces',
    connectionId: null
  }
] satisfies NonNullable<React.ComponentProps<typeof NewWorkspaceComposerCard>['projectOptions']>
const hosts = [
  {
    kind: 'ready',
    id: 'setup-local',
    projectId,
    hostId: 'local',
    repoId: 'bw-local',
    label: '本机',
    detail: '已登记 BW 仓',
    path: 'C:/workspaces/builder-workbench'
  },
  {
    kind: 'ready',
    id: 'setup-team',
    projectId,
    hostId: toRuntimeExecutionHostId('bw-demo-dev-w02'),
    repoId: 'bw-team',
    label: '团队开发机 Dev-W02',
    detail: '已配对 · 已授权',
    path: '/srv/workspaces/builder-workbench'
  }
] satisfies NonNullable<
  React.ComponentProps<typeof NewWorkspaceComposerCard>['projectHostSetupOptions']
>

function RepairWorkspace({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCreated: (location: string, note: string) => void
}) {
  type ComposerProps = React.ComponentProps<typeof NewWorkspaceComposerCard>
  const [host, setHost] = useState('setup-local')
  const [name, setName] = useState('issue-401')
  const [note, setNote] = useState(repairNote)
  const [agent, setAgent] = useState<ComposerProps['quickAgent']>(null)
  const [advanced, setAdvanced] = useState(true)
  const [parent, setParent] = useState<string | null>(null)
  const selected = hosts.find((item) => item.id === host)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto" data-testid="repair-workspace">
        <DialogHeader>
          <DialogTitle>新建工作区</DialogTitle>
        </DialogHeader>
        <NewWorkspaceComposerCard
          quickAgent={agent}
          onQuickAgentChange={setAgent}
          eligibleRepos={[]}
          repoId={selected?.repoId || 'bw-local'}
          projectOptions={projects}
          selectedProjectId={projectId}
          selectedRepoIsGit
          onRepoChange={noop}
          onProjectChange={noop}
          primaryActionLabel="创建工作区"
          name={name}
          onNameValueChange={setName}
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
          parentWorktreeId={parent}
          onParentWorktreeIdChange={setParent}
          createDisabled={!selected || !name.trim()}
          projectError={null}
          creating={false}
          onCreate={() => {
            if (selected && name.trim()) {
              onCreated(selected.label, note)
            }
          }}
          note={note}
          onNoteChange={setNote}
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
      </DialogContent>
    </Dialog>
  )
}

function App() {
  const [context, setContext] = useState('')
  const [filtered, setFiltered] = useState(false)
  const collecting = useRef(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [receipt, setReceipt] = useState<{ location: string; note: string } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [captureError, setCaptureError] = useState(false)
  const shortcut = /Mac/.test(navigator.userAgent) ? '⌘C' : 'Ctrl+C'

  useEffect(() => {
    const api = getGlobalApi() ?? init()
    api.setOptions({ freezeReactUpdates: false })
    api.registerPlugin({
      name: 'bw-improvement-assistant',
      actions: [
        {
          id: 'send-to-bw-improvement-assistant',
          label: '交给改进助手',
          onAction: (selection) => {
            if (!selection.enterPromptMode) {
              setCaptureError(true)
              return
            }
            collecting.current = true
            setCaptureError(false)
            selection.enterPromptMode()
          }
        }
      ],
      hooks: {
        onDeactivate: () => {
          collecting.current = false
        },
        onCopySuccess: (_elements, content) => {
          if (collecting.current) {
            collecting.current = false
            setContext(content)
            setReceipt(null)
            setPanelOpen(true)
          }
        },
        onAfterCopy: (_elements, success) => {
          if (collecting.current && !success) {
            collecting.current = false
            setCaptureError(true)
          }
        }
      }
    })
    return () => api.unregisterPlugin('bw-improvement-assistant')
  }, [])

  return (
    <TooltipProvider>
      <header className="border-b border-border bg-card px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <strong>改进助手</strong>
          <span>研发保障 · 局部演示</span>
          <a href="../intent.md">意图</a>
          <a href="../spec.md">规格</a>
          <a href="../STATUS.md">状态</a>
        </div>
        <details>
          <summary>真实组件与拟补接线</summary>
          <p>
            实际加载 React Grab、原生会话消息、新建工作区组件。Skill 准备、会话打开、Issue
            和开工均为演示接线。
          </p>
          <p>
            React Grab
            是开发态工具。本页演示独立会话片段，生产会话载体见规格。未启动模型、连接宿主或创建工作树。
          </p>
          <a href="dist/component-manifest.json">组件来源与哈希</a>
        </details>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section>
          <h1 className="text-lg font-semibold">交给改进助手</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            将指针移到下面的控件，按住 {shortcut} 进入 React
            Grab。在目标上点右键，选择「交给改进助手」，用原生批注输入一句话。
          </p>
          <Button
            className="mt-3"
            variant="outline"
            aria-pressed={filtered}
            onClick={() => setFiltered(!filtered)}
          >
            {filtered ? '清除筛选' : '筛选任务'}
          </Button>
          {captureError && <p role="alert">选取未成功，可重新打开 React Grab。</p>}
          {!panelOpen && context && (
            <Button variant="ghost" className="ml-2" onClick={() => setPanelOpen(true)}>
              回到改进会话
            </Button>
          )}
        </section>
        {panelOpen && (
          <section
            className="border-t border-border pt-4"
            aria-label="改进会话"
            data-testid="collector"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">改进会话</h2>
              <Button variant="ghost" size="sm" onClick={() => setPanelOpen(false)}>
                收起会话
              </Button>
            </div>
            <details className="mb-4 text-sm">
              <summary>已带入的元素与起手提示</summary>
              <p>演示安装结果。完整读取并使用「{collectSkill}」中的 Skill，整理当前 BW 反馈。</p>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all">{context}</pre>
            </details>
            <ChatTranscript>
              <ChatRow
                id="assistant-start"
                text={`已收到元素与原生批注。演示 Issue 已形成：[BW #401（示例链接）](${issue})。`}
              />
              {receipt && (
                <ChatRow
                  id="created"
                  text={`演示已在${receipt.location}创建关联工作区。Issue 与备注已带入助手草稿，发送后开始修复。备注：${receipt.note}`}
                />
              )}
            </ChatTranscript>
            <Button className="mt-5" onClick={() => setWorkspaceOpen(true)}>
              开始修复
            </Button>
          </section>
        )}
        {workspaceOpen && (
          <RepairWorkspace
            open={workspaceOpen}
            onOpenChange={setWorkspaceOpen}
            onCreated={(location, note) => {
              setReceipt({ location, note })
              setWorkspaceOpen(false)
            }}
          />
        )}
      </main>
    </TooltipProvider>
  )
}
void setRendererUiLanguage('zh').finally(() =>
  createRoot(document.getElementById('root')!).render(<App />)
)
