import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  buildInstallCommands,
  CONNECTOR_CATALOG,
  renderCommandLine,
  splitCommandLine,
  validateInstallPlan,
  type ConnectorAgent,
  type ConnectorCatalogEntry,
  type ConnectorInstallPlan,
  type ConnectorScope,
  type ConnectorShell,
  type ConnectorTarget
} from '../../../../shared/workbench/connectors'
import { AGENT_LABEL } from './ConnectorStatePill'

type CustomKind = 'http' | 'sse' | 'stdio'

type Props = {
  installedAgents: ConnectorAgent[]
  /** 名称 → 已经装了它的执行工具。同名即同一个 connector，可以补装到没装的工具上。 */
  existing: ReadonlyMap<string, ConnectorAgent[]>
  project: { name: string; path: string } | null
  shell: ConnectorShell
  onRun: (commandLine: string, title: string) => void
  onCancel: () => void
}

export function ConnectorAddPanel({
  installedAgents,
  existing,
  project,
  shell,
  onRun,
  onCancel
}: Props): React.JSX.Element {
  const [entry, setEntry] = useState<ConnectorCatalogEntry | 'custom' | null>(null)
  const [name, setName] = useState('')
  const [customKind, setCustomKind] = useState<CustomKind>('http')
  const [customValue, setCustomValue] = useState('')
  const [customOauth, setCustomOauth] = useState(true)
  const [agents, setAgents] = useState<ConnectorAgent[]>(installedAgents)
  const [scope, setScope] = useState<ConnectorScope>('user')

  const missingFor = (n: string): ConnectorAgent[] =>
    installedAgents.filter((a) => !existing.get(n)?.includes(a))
  const pick = (next: ConnectorCatalogEntry | 'custom'): void => {
    setEntry(next)
    setName(next === 'custom' ? '' : next.name)
    setAgents(next === 'custom' ? installedAgents : missingFor(next.name))
  }

  const target = useMemo((): ConnectorTarget | null => {
    if (entry === null) {
      return null
    }
    if (entry !== 'custom') {
      return { transport: 'http', url: entry.url }
    }
    if (customKind !== 'stdio') {
      return { transport: customKind, url: customValue.trim() }
    }
    const parts = splitCommandLine(customValue)
    return parts && parts.length > 0
      ? { transport: 'stdio', command: parts[0], args: parts.slice(1) }
      : { transport: 'stdio', command: '', args: [] }
  }, [entry, customKind, customValue])

  const plan: ConnectorInstallPlan | null = target
    ? {
        name: name.trim(),
        target,
        oauth: entry === 'custom' ? customOauth && customKind !== 'stdio' : !!entry?.oauth,
        agents,
        scope: project ? scope : 'user'
      }
    : null
  const duplicate =
    plan && plan.agents.some((a) => existing.get(plan.name)?.includes(a))
      ? `${plan.name} 已装在${plan.agents
          .filter((a) => existing.get(plan.name)?.includes(a))
          .map((a) => AGENT_LABEL[a])
          .join('、')}上：取消勾选，或换个名称。`
      : null
  const problem = plan ? (duplicate ?? validateInstallPlan(plan)) : null
  // 有当前项目就在其目录下执行：Claude Code 的「仅当前项目」按执行目录记录。
  const commandLine =
    plan && !problem ? renderCommandLine(buildInstallCommands(plan), shell, project?.path) : ''

  if (installedAgents.length === 0) {
    return (
      <div className="space-y-3 rounded-md border border-border/60 p-4 text-sm">
        <p>本机没有 Claude Code 或 Codex。装好其中一个后点「重新检测」。</p>
        <pre className="rounded bg-muted/60 p-2 font-mono text-xs">
          {'npm install -g @anthropic-ai/claude-code\nnpm install -g @openai/codex'}
        </pre>
        <Button variant="outline" size="sm" onClick={onCancel}>
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-md border border-border/60 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CONNECTOR_CATALOG.map((item) => (
          <CatalogCard
            key={item.name}
            title={item.title}
            sub={catalogSub(item, existing.get(item.name) ?? [], missingFor(item.name))}
            active={entry !== 'custom' && entry?.name === item.name}
            disabled={missingFor(item.name).length === 0}
            onClick={() => pick(item)}
          />
        ))}
        <CatalogCard
          title="自定义"
          sub="远程地址或本机命令"
          active={entry === 'custom'}
          onClick={() => pick('custom')}
        />
      </div>

      {entry !== null ? (
        <div className="space-y-3 text-sm">
          <Field label="名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
          </Field>
          {entry === 'custom' ? (
            <>
              <Field label="类型">
                <Segmented
                  value={customKind}
                  options={[
                    ['http', '远程地址'],
                    ['sse', '远程地址（SSE）'],
                    ['stdio', '本机命令']
                  ]}
                  onChange={(v) => setCustomKind(v as CustomKind)}
                />
              </Field>
              <Field label={customKind === 'stdio' ? '命令' : '地址'}>
                <Input
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder={customKind === 'stdio' ? 'npx -y some-mcp-server' : 'https://'}
                  className="h-8 font-mono"
                />
              </Field>
              {customKind !== 'stdio' ? (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={customOauth}
                    onChange={(e) => setCustomOauth(e.target.checked)}
                  />
                  装完在浏览器登录
                </label>
              ) : null}
            </>
          ) : null}
          <Field label="装给">
            <div className="flex gap-4">
              {(['claude', 'codex'] as const).map((agent) => (
                <label key={agent} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!installedAgents.includes(agent)}
                    checked={agents.includes(agent)}
                    onChange={(e) =>
                      setAgents((prev) =>
                        e.target.checked ? [...prev, agent] : prev.filter((a) => a !== agent)
                      )
                    }
                  />
                  {AGENT_LABEL[agent]}
                  {installedAgents.includes(agent) ? null : (
                    <span className="text-xs text-muted-foreground">本机没有</span>
                  )}
                </label>
              ))}
            </div>
          </Field>
          {project ? (
            <Field label="范围">
              <Segmented
                value={scope}
                options={[
                  ['user', '所有项目'],
                  ['local', `仅 ${project.name}`]
                ]}
                onChange={(v) => setScope(v as ConnectorScope)}
              />
              {scope === 'local' && agents.includes('codex') ? (
                <p className="mt-1 text-xs text-muted-foreground">Codex 只有所有项目一级。</p>
              ) : null}
            </Field>
          ) : null}
          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
          {commandLine ? (
            <pre className="whitespace-pre-wrap break-all rounded bg-muted/60 p-2 font-mono text-xs">
              {commandLine}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="sm"
          disabled={!commandLine}
          onClick={() => plan && onRun(commandLine, `安装 ${plan.name}`)}
        >
          安装
        </Button>
      </div>
    </div>
  )
}

function catalogSub(
  item: ConnectorCatalogEntry,
  installedOn: ConnectorAgent[],
  missing: ConnectorAgent[]
): string {
  if (installedOn.length === 0) {
    return item.oauth ? '浏览器登录' : '免登录'
  }
  if (missing.length === 0) {
    return '已添加'
  }
  return `已装在 ${installedOn.map((a) => AGENT_LABEL[a]).join('、')}，可补装`
}

function CatalogCard(props: {
  title: string
  sub: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        'rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        props.active ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/40'
      )}
    >
      <div className="text-sm font-medium">{props.title}</div>
      <div className="text-xs text-muted-foreground">{props.sub}</div>
    </button>
  )
}

function Field(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3">
      <span className="pt-1.5 text-xs text-muted-foreground">{props.label}</span>
      <div>{props.children}</div>
    </div>
  )
}

function Segmented(props: {
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="inline-flex rounded-md border border-border/60 p-0.5">
      {props.options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => props.onChange(value)}
          className={cn(
            'rounded px-2.5 py-1 text-xs',
            props.value === value ? 'bg-muted font-medium' : 'text-muted-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
