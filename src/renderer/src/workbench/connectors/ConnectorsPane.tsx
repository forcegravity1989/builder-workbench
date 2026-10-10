import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnboardingInlineCommandTerminal } from '@/components/onboarding/OnboardingInlineCommandTerminal'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { useAppStore } from '@/store'
import {
  mergeConnectorRows,
  type ConnectorAgentListing,
  type ConnectorListResult,
  type ConnectorRow
} from '../../../../shared/workbench/connector-status'
import {
  buildLoginCommand,
  buildRemoveCommand,
  renderCommandLine,
  withCodexHome,
  type ConnectorAgent,
  type ConnectorShell
} from '../../../../shared/workbench/connectors'
import { ConnectorAddPanel } from './ConnectorAddPanel'
import { AGENT_LABEL, ConnectorStatePill } from './ConnectorStatePill'
import { listConnectors } from './connectors-port'

const AGENTS: ConnectorAgent[] = ['claude', 'codex']

type Running = { commandLine: string; title: string }

type Loaded = ConnectorListResult & { forRepo: string | null }

function useConnectorShell(): { shell: ConnectorShell; shellOverride: string | undefined } {
  return useMemo(() => {
    // 命令按 PowerShell 语法拼；Windows 上不论默认终端是什么都钉 PowerShell。
    const isWindows = window.api.platform.get().platform === 'win32'
    return isWindows
      ? { shell: 'powershell', shellOverride: 'powershell.exe' }
      : { shell: 'posix', shellOverride: undefined }
  }, [])
}

function useActiveRepo(): { id: string; name: string } | null {
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const repo = useAppStore((s) => s.repos.find((r) => r.id === activeRepoId))
  return useMemo(() => (repo ? { id: repo.id, name: repo.displayName } : null), [repo])
}

export function ConnectorsPane(): React.JSX.Element {
  const activeRepo = useActiveRepo()
  const { shell, shellOverride } = useConnectorShell()
  const detection = useDetectedAgents(null)
  const installedAgents = useMemo(
    () => AGENTS.filter((a) => detection.detectedIds?.includes(a)),
    [detection.detectedIds]
  )
  const [result, setResult] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [running, setRunning] = useState<Running | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const repoId = activeRepo?.id ?? null
  // 一次列表要好几秒；切项目、连点重新检测、终端多次报结束都会叠请求，只认最后一次。
  const latestRequest = useRef(0)
  const reload = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current
    setLoading(true)
    setLoadError(null)
    try {
      const next = await listConnectors(repoId)
      if (request === latestRequest.current) {
        setResult({ ...next, forRepo: repoId })
      }
    } catch (error) {
      if (request === latestRequest.current) {
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (request === latestRequest.current) {
        setLoading(false)
      }
    }
  }, [repoId])

  useEffect(() => {
    void reload()
  }, [reload])

  // 只有主进程确认在本机项目目录里读过，才算有当前项目（SSH 或目录不在时它回 null）。
  const projectPath = result && result.forRepo === activeRepo?.id ? result.projectPath : null
  const project = useMemo(
    () => (activeRepo && projectPath ? { name: activeRepo.name, path: projectPath } : null),
    [activeRepo, projectPath]
  )
  const rows = useMemo(() => (result ? mergeConnectorRows(result) : []), [result])
  const existing = useMemo(
    () => new Map(rows.map((r) => [r.name, AGENTS.filter((a) => r.agents[a])])),
    [rows]
  )
  const recheck = (): void => {
    void detection.refresh()
    void reload()
  }

  const run = (commands: Parameters<typeof renderCommandLine>[0], title: string): void => {
    setRunning({
      commandLine: renderCommandLine(
        withCodexHome(commands, result?.codexHome ?? null),
        shell,
        project?.path
      ),
      title
    })
  }
  const login = (row: ConnectorRow): void => {
    const agents = AGENTS.filter((a) => row.agents[a]?.state === 'needs-auth')
    run(
      agents.map((a) => buildLoginCommand(a, row.name)),
      `登录 ${row.name}`
    )
  }
  const remove = (row: ConnectorRow): void => {
    setConfirmRemove(null)
    run(
      AGENTS.filter((a) => row.agents[a]).map((a) => buildRemoveCommand(a, row.name)),
      `移除 ${row.name}`
    )
  }
  const finishRun = (): void => {
    setRunning(null)
    setAdding(false)
    void reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {project ? `当前项目：${project.name}` : '未选中本机项目，只显示所有项目一级'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="重新检测"
            disabled={loading}
            onClick={recheck}
          >
            {loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          {!adding && !running ? (
            <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              添加
            </Button>
          ) : null}
        </div>
      </div>

      {running ? (
        <div className="space-y-2">
          <OnboardingInlineCommandTerminal
            key={running.commandLine}
            command={running.commandLine}
            title={running.title}
            description="命令已填入终端，按回车执行。需要登录的会打开浏览器，授权完成后终端才结束。"
            ariaLabel={running.title}
            shellOverride={shellOverride}
            forceHostRuntime
            onCommandFinished={() => void reload()}
            onTerminalExit={finishRun}
          />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={finishRun}>
              完成
            </Button>
          </div>
        </div>
      ) : adding ? (
        detection.detectedIds === null ? (
          <p className="text-xs text-muted-foreground">正在检测本机执行工具…</p>
        ) : (
          <ConnectorAddPanel
            installedAgents={installedAgents}
            existing={existing}
            codexHome={result?.codexHome ?? null}
            project={project}
            shell={shell}
            onRun={(commandLine, title) => setRunning({ commandLine, title })}
            onCancel={() => setAdding(false)}
          />
        )
      ) : null}

      {loadError ? <p className="text-xs text-destructive">{loadError}</p> : null}
      {result ? <AgentNotices result={result} /> : null}

      <div className="divide-y divide-border/50 rounded-md border border-border/50">
        {rows.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            {loading ? '正在读取…' : '还没有 connector。'}
            {!loading && !adding && !running ? (
              <Button variant="link" size="sm" onClick={() => setAdding(true)}>
                从推荐目录添加
              </Button>
            ) : null}
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.name} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-sm font-medium">{row.name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {row.target}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {AGENTS.map((a) => {
                    const agentRow = row.agents[a]
                    return agentRow ? <ConnectorStatePill key={a} agent={a} row={agentRow} /> : null
                  })}
                </div>
                {AGENTS.map((a) =>
                  row.agents[a]?.state === 'failed' && row.agents[a]?.detail ? (
                    <p key={a} className="text-xs text-destructive">
                      {AGENT_LABEL[a]}：{row.agents[a]?.detail}
                    </p>
                  ) : null
                )}
              </div>
              {running ? null : (
                <RowActions
                  row={row}
                  confirming={confirmRemove === row.name}
                  onLogin={() => login(row)}
                  onAskRemove={() => setConfirmRemove(row.name)}
                  onCancelRemove={() => setConfirmRemove(null)}
                  onRemove={() => remove(row)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RowActions(props: {
  row: ConnectorRow
  confirming: boolean
  onLogin: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}): React.JSX.Element {
  const needsAuth = AGENTS.some((a) => props.row.agents[a]?.state === 'needs-auth')
  if (props.confirming) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          从所有执行工具移除？写在仓库 .mcp.json 里的会改动仓库文件。
        </span>
        <Button variant="ghost" size="xs" onClick={props.onCancelRemove}>
          取消
        </Button>
        <Button variant="destructive" size="xs" onClick={props.onRemove}>
          移除
        </Button>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {needsAuth ? (
        <Button variant="outline" size="xs" onClick={props.onLogin}>
          登录
        </Button>
      ) : null}
      <Button variant="ghost" size="xs" onClick={props.onAskRemove}>
        移除
      </Button>
    </div>
  )
}

function AgentNotices({ result }: { result: ConnectorListResult }): React.JSX.Element | null {
  const notes = AGENTS.map((a) => [a, result[a]] as const).filter(
    (entry): entry is readonly [ConnectorAgent, Exclude<ConnectorAgentListing, { status: 'ok' }>] =>
      entry[1].status !== 'ok'
  )
  if (notes.length === 0) {
    return null
  }
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {notes.map(([agent, listing]) => (
        <li key={agent}>
          {AGENT_LABEL[agent]}：
          {listing.status === 'missing' ? '本机没有，跳过' : `读不到状态（${listing.message}）`}
        </li>
      ))}
    </ul>
  )
}
