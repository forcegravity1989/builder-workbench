import React, { useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type {
  VersionCatalogEntry,
  VersionCatalogTaskRef
} from '../../../shared/workbench/version-catalog'
import {
  WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
  normalizeStoredWorkbenchVersionBinding,
  type WorkbenchVersionBinding
} from '../../../shared/workbench/version-binding'
import { versionFlowBranch } from '../../../shared/workbench/version-workspace-prepare'
import { branchName } from '@/lib/git-utils'
import { nativeVersionBindingPort } from './version-binding-port'
import { nativeTaskPortDeps } from './native-task-port'
import { readReference, resolveReferenceRepo } from './task-port'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import {
  GOAL_PURPOSE_LABEL,
  ISSUE_PURPOSE_LABEL,
  WORKFLOW_SCREEN_LABELS,
  goalOrdinal
} from './version-labels'

/**
 * 常驻补绑定（P3b③）：把已有工作区纳入版本，由人显式断言归属。Issue 用途由人
 * 从本版计划材料中选定任务引用（零猜测）：taskSource 与 Start/Open 解析查询端
 * 同一构造函数，且须补写原生 linkedWorkItem——解析核要求绑定与 linked 双标记
 * 同时成立。先读后写：解析引用与读回 Issue 任一失败即不写任何数据；绑定写入
 * 走 P1 绑定服务同一 RPC（instanceId 必填围栏、归属宿主路由、读回确认）。
 */

type BindWorkflow = 'plan' | 'acceptance' | 'goal' | 'issue'

const WORKFLOW_ORDER: readonly BindWorkflow[] = ['plan', 'acceptance', 'goal', 'issue']

const WORKFLOW_LABELS: Record<BindWorkflow, string> = {
  ...WORKFLOW_SCREEN_LABELS,
  goal: GOAL_PURPOSE_LABEL,
  issue: ISSUE_PURPOSE_LABEL
}

/** 可纳入的 Issue 引用：仅读回链就绪的 provider（与开工链同口径）。 */
type BindableTaskRef = Omit<VersionCatalogTaskRef, 'provider'> & {
  provider: 'github' | 'codehub'
}

function bindableProvider(provider: string): 'github' | 'codehub' | null {
  return provider === 'github' || provider === 'codehub' ? provider : null
}

function taskRefKey(task: VersionCatalogTaskRef): string {
  return `${task.provider}:${task.repository}:${task.number}`
}

function suggestedWorkflow(tree: Worktree, version: string): BindWorkflow | null {
  const branch = tree.branch ? branchName(tree.branch) : null
  if (branch && branch === versionFlowBranch(version, 'plan')) {
    return 'plan'
  }
  if (branch && branch === versionFlowBranch(version, 'acceptance')) {
    return 'acceptance'
  }
  return null
}

function worktreeLabel(tree: Worktree): string {
  return tree.displayName?.trim() || (tree.branch ? branchName(tree.branch) : '') || tree.id
}

export function VersionTreeBindDialog({
  version,
  entry,
  worktrees,
  repos,
  scope,
  onClose
}: {
  version: string
  /** null=条目已从目录消失；目标/Issue 用途没有可选的投影来源。 */
  entry: VersionCatalogEntry | null
  worktrees: readonly Worktree[]
  /** Issue 引用 → 已登记项目的身份解析范围。 */
  repos: readonly Repo[]
  /** Issue 读回与引用解析的项目范围。 */
  scope: NativeWorkspaceScope | null
  onClose(): void
}): React.JSX.Element {
  const candidates = useMemo(
    () =>
      worktrees.filter(
        (tree) =>
          !tree.isArchived &&
          !tree.isMainWorktree &&
          normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding) === null
      ),
    [worktrees]
  )
  const goals = entry?.goals ?? []
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [workflow, setWorkflow] = useState<BindWorkflow>('plan')
  const [goalId, setGoalId] = useState('')
  const [issueKey, setIssueKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const taskDeps = useMemo(() => ({ ...nativeTaskPortDeps(), repos: () => repos }), [repos])
  const issueRefs = useMemo(() => {
    const seen = new Set<string>()
    const refs: BindableTaskRef[] = []
    for (const task of entry?.tasks ?? []) {
      const provider = bindableProvider(task.provider)
      if (!provider || !task.goalId || task.goalId !== goalId) {
        continue
      }
      const key = taskRefKey(task)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      refs.push({ ...task, provider })
    }
    return refs
  }, [entry, goalId])

  const selected = candidates.find((tree) => getWorktreeHostIdentity(tree) === selectedKey) ?? null
  const selectionSuggestion = selected ? suggestedWorkflow(selected, version) : null
  const effectiveWorkflow = selectionSuggestion ?? workflow
  const goalMissing = (effectiveWorkflow === 'goal' || effectiveWorkflow === 'issue') && !goalId
  const issueMissing = effectiveWorkflow === 'issue' && !issueKey
  const instanceMissing = selected !== null && !selected.instanceId

  async function confirm(): Promise<void> {
    if (!selected || !selected.instanceId || goalMissing || issueMissing || busy) {
      return
    }
    setBusy(true)
    const label = worktreeLabel(selected)
    const hostId = selected.hostId ?? LOCAL_EXECUTION_HOST_ID
    let binding: WorkbenchVersionBinding = {
      schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
      version,
      workflow: effectiveWorkflow
    }
    try {
      if (effectiveWorkflow === 'goal') {
        binding = { ...binding, goalId }
      }
      if (effectiveWorkflow === 'issue') {
        if (!scope) {
          throw new Error('项目工作区尚未就绪，无法核对 Issue 归属')
        }
        const reference = issueRefs.find((task) => taskRefKey(task) === issueKey)
        if (!reference) {
          throw new Error('所选 Issue 引用已不在列表中，请重新选择')
        }
        const owner = { repoId: scope.repoId, hostId: scope.hostId }
        const repo = resolveReferenceRepo(taskDeps, owner, reference)
        if (!repo) {
          throw new Error(`未在已登记项目中找到 ${reference.repository} 对应的项目`)
        }
        const taskSource = getTaskPageRepoSourceContext(repo, reference.provider)
        if (!taskSource) {
          throw new Error(`项目 ${repo.displayName || repo.id} 解析不出任务来源`)
        }
        const snapshot = await readReference(taskDeps, owner, reference)
        const meta = await useAppStore.getState().updateWorktreeMeta(
          selected.id,
          {
            linkedWorkItem: {
              provider: reference.provider,
              type: 'issue',
              number: reference.number,
              title: snapshot.title,
              url: snapshot.url,
              repoId: repo.id
            },
            linkedTaskSourceContext: taskSource
          },
          selected.hostId ? { executionHostId: selected.hostId } : undefined
        )
        if (!meta.ok) {
          throw new Error(meta.error)
        }
        binding = { ...binding, goalId, taskSource }
      }
      await nativeVersionBindingPort({
        hostId,
        ...(selected.runtimeOwnerEnvironmentId
          ? { runtimeOwnerEnvironmentId: selected.runtimeOwnerEnvironmentId }
          : {})
      }).set(
        {
          repoId: selected.repoId,
          worktreeId: selected.id,
          hostId,
          ...(selected.projectId ? { projectId: selected.projectId } : {}),
          instanceId: selected.instanceId
        },
        binding
      )
      toast.success(`已把工作区 ${label} 纳入 ${version}。`)
      onClose()
    } catch (reason) {
      toast.error(
        `把工作区 ${label} 纳入 ${version} 失败：${
          reason instanceof Error ? reason.message : String(reason)
        }`
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>把工作区纳入 {version}</DialogTitle>
          <DialogDescription>选一棵工作区，指定它属于哪个版本、做什么用。</DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            本仓当前没有可纳入的工作区；已归属版本的在版本目录里查看，不再需要的请在原生项目
            工作区清理。
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="wb-bind-worktree">工作区</Label>
              <Select
                value={selectedKey ?? ''}
                onValueChange={(value) => setSelectedKey(value || null)}
              >
                <SelectTrigger id="wb-bind-worktree" className="w-full">
                  <SelectValue placeholder="选择工作区" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((tree) => {
                    const key = getWorktreeHostIdentity(tree)
                    return (
                      <SelectItem key={key} value={key}>
                        {worktreeLabel(tree)}
                        {tree.hostId && tree.hostId !== LOCAL_EXECUTION_HOST_ID
                          ? `（宿主 ${tree.hostId}）`
                          : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="wb-bind-workflow">用途</Label>
              <Select
                value={effectiveWorkflow}
                disabled={selectionSuggestion !== null}
                onValueChange={(value) => setWorkflow(value as BindWorkflow)}
              >
                <SelectTrigger id="wb-bind-workflow" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_ORDER.map((item) => (
                    <SelectItem key={item} value={item}>
                      {WORKFLOW_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectionSuggestion ? (
                <span className="text-xs text-muted-foreground">
                  分支与本版{WORKFLOW_LABELS[selectionSuggestion]}分支一致，用途已对齐。
                </span>
              ) : null}
            </div>
            {effectiveWorkflow === 'goal' || effectiveWorkflow === 'issue' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="wb-bind-goal">所属目标</Label>
                <Select
                  value={goalId}
                  onValueChange={(value) => {
                    setGoalId(value)
                    setIssueKey(null)
                  }}
                >
                  <SelectTrigger id="wb-bind-goal" className="w-full">
                    <SelectValue placeholder="选择目标" />
                  </SelectTrigger>
                  <SelectContent>
                    {goals.map((goal, index) => (
                      <SelectItem key={goal.goalId} value={goal.goalId}>
                        {goalOrdinal(index)} · {goal.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {goals.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    本版计划还没有目标；先保存版本计划再纳入。
                  </span>
                ) : null}
              </div>
            ) : null}
            {effectiveWorkflow === 'issue' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="wb-bind-issue">对应 Issue</Label>
                <Select
                  value={issueKey ?? ''}
                  disabled={issueRefs.length === 0}
                  onValueChange={(value) => setIssueKey(value || null)}
                >
                  <SelectTrigger id="wb-bind-issue" className="w-full">
                    <SelectValue placeholder="选择 Issue" />
                  </SelectTrigger>
                  <SelectContent>
                    {issueRefs.map((task) => (
                      <SelectItem key={taskRefKey(task)} value={taskRefKey(task)}>
                        #{task.number} · {task.repository}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {goalId && issueRefs.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    本版计划材料没有可选的 Issue 引用。
                  </span>
                ) : null}
              </div>
            ) : null}
            {selected && instanceMissing ? (
              <p className="text-sm text-destructive">
                该工作区缺少实例身份，无法纳入；请在原生项目核对该工作区的登记。
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!selected || instanceMissing || goalMissing || issueMissing || busy}
            onClick={() => void confirm()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            纳入版本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
