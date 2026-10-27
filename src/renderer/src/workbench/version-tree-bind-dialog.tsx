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
import type { Repo } from '../../../shared/repo-types'
import type { Worktree, WorkspaceLinkedItem } from '../../../shared/worktree/types'
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
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { selectVersionBindingTree, useVersionBindingTree } from './version-tree-binding-state'
import { compareMaterialVersions } from '../../../shared/workbench/version-catalog'
import {
  GOAL_PURPOSE_LABEL,
  ISSUE_PURPOSE_LABEL,
  WORKFLOW_SCREEN_LABELS,
  goalOrdinal
} from './version-labels'

/**
 * 原生单树右键菜单共用的绑定选择器。Issue 用途由人
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
  tree,
  entries,
  repos,
  scope,
  onClose
}: {
  tree: Worktree
  entries: readonly VersionCatalogEntry[]
  /** Issue 引用 → 已登记项目的身份解析范围。 */
  repos: readonly Repo[]
  /** Issue 读回与引用解析的项目范围。 */
  scope: NativeWorkspaceScope | null
  onClose(): void
}): React.JSX.Element {
  const currentBinding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
  const [version, setVersion] = useState(currentBinding?.version ?? '')
  const entry = entries.find((item) => item.version === version) ?? null
  const goals = entry?.goals ?? []
  const [workflow, setWorkflow] = useState<BindWorkflow>(currentBinding?.workflow ?? 'goal')
  const [goalId, setGoalId] = useState(currentBinding?.goalId ?? '')
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

  const linked = tree.linkedWorkItem
  const existingIssue = issueRefs.find((reference) => {
    if (
      !scope ||
      !linked ||
      linked.type !== 'issue' ||
      linked.provider !== reference.provider ||
      linked.number !== reference.number
    ) {
      return false
    }
    return resolveReferenceRepo(taskDeps, scope, reference)?.id === linked.repoId
  })
  const selectedIssueKey = issueKey ?? (existingIssue ? taskRefKey(existingIssue) : null)
  const goalMissing =
    (workflow === 'goal' || workflow === 'issue') && !goals.some((goal) => goal.goalId === goalId)
  const issueMissing = workflow === 'issue' && !selectedIssueKey
  const instanceMissing = !tree.instanceId
  const flowMismatch =
    (workflow === 'plan' || workflow === 'acceptance') &&
    suggestedWorkflow(tree, version) !== workflow
  const versions = [
    ...new Set([
      ...entries.map((item) => item.version),
      ...(currentBinding ? [currentBinding.version] : [])
    ])
  ].sort((a, b) => compareMaterialVersions(b, a))

  async function confirm(): Promise<void> {
    if (
      !tree.instanceId ||
      !version ||
      !entry ||
      goalMissing ||
      issueMissing ||
      flowMismatch ||
      busy
    ) {
      return
    }
    setBusy(true)
    const label = worktreeLabel(tree)
    let binding: WorkbenchVersionBinding = {
      schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
      version,
      workflow
    }
    let linkedWorkItem: WorkspaceLinkedItem | undefined
    try {
      const ownerScope = nativeWorkspaceScope(tree)
      if (workflow === 'goal') {
        binding = { ...binding, goalId }
      }
      if (workflow === 'issue') {
        if (!scope) {
          throw new Error('项目工作区尚未就绪，无法核对 Issue 归属')
        }
        const reference = issueRefs.find((task) => taskRefKey(task) === selectedIssueKey)
        if (!reference) {
          throw new Error('所选 Issue 引用已不在列表中，请重新选择')
        }
        const owner = { repoId: ownerScope.repoId, hostId: ownerScope.hostId }
        const repo = resolveReferenceRepo(taskDeps, owner, reference)
        if (!repo) {
          throw new Error(`未在已登记项目中找到 ${reference.repository} 对应的项目`)
        }
        const taskSource = getTaskPageRepoSourceContext(repo, reference.provider)
        if (!taskSource) {
          throw new Error(`项目 ${repo.displayName || repo.id} 解析不出任务来源`)
        }
        const snapshot = await readReference(taskDeps, owner, reference)
        linkedWorkItem = {
          provider: reference.provider,
          type: 'issue',
          number: reference.number,
          title: snapshot.title,
          url: snapshot.url,
          repoId: repo.id
        }
        binding = { ...binding, goalId, taskSource }
      }
      await nativeVersionBindingPort(ownerScope).set(
        {
          repoId: tree.repoId,
          worktreeId: tree.id,
          hostId: ownerScope.hostId,
          ...(tree.projectId ? { projectId: tree.projectId } : {}),
          instanceId: tree.instanceId
        },
        binding,
        linkedWorkItem
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
          <DialogTitle>{currentBinding ? '更改版本绑定' : '绑定版本'}</DialogTitle>
          <DialogDescription>{worktreeLabel(tree)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wb-bind-version">版本</Label>
            <Select
              value={version}
              onValueChange={(value) => {
                setVersion(value)
                setGoalId('')
                setIssueKey(null)
                setWorkflow(suggestedWorkflow(tree, value) ?? 'goal')
              }}
            >
              <SelectTrigger id="wb-bind-version" className="w-full">
                <SelectValue placeholder="选择版本" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无版本，请先创建版本。</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wb-bind-workflow">用途</Label>
            <Select value={workflow} onValueChange={(value) => setWorkflow(value as BindWorkflow)}>
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
            {version && flowMismatch ? (
              <span className="text-xs text-destructive">
                {WORKFLOW_LABELS[workflow]}工作区需要分支{' '}
                {versionFlowBranch(version, workflow as 'plan' | 'acceptance')}。
              </span>
            ) : null}
          </div>
          {workflow === 'goal' || workflow === 'issue' ? (
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
          {workflow === 'issue' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="wb-bind-issue">对应 Issue</Label>
              <Select
                value={selectedIssueKey ?? ''}
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
          {instanceMissing ? (
            <p className="text-sm text-destructive">
              该工作区缺少实例身份，无法纳入；请在原生项目核对该工作区的登记。
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            disabled={
              !version ||
              !entry ||
              instanceMissing ||
              goalMissing ||
              issueMissing ||
              flowMismatch ||
              busy
            }
            onClick={() => void confirm()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            保存绑定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BindingDialogForTree({ tree }: { tree: Worktree }): React.JSX.Element {
  const catalog = useVersionCatalogForRepo(tree.repoId)
  const repos = useAppStore((state) => state.repos)
  const current = useAppStore((state) => state.getKnownWorktreeById(tree.id, tree.hostId))
  const scope = useMemo(() => {
    try {
      return nativeWorkspaceScope(tree)
    } catch {
      return null
    }
  }, [tree])
  return (
    <VersionTreeBindDialog
      tree={
        current && current.instanceId === tree.instanceId
          ? current
          : { ...tree, instanceId: undefined }
      }
      entries={catalog.catalog?.entries ?? []}
      repos={repos}
      scope={scope}
      onClose={() => selectVersionBindingTree(null)}
    />
  )
}

export function WorkbenchVersionBindingDialog(): React.JSX.Element | null {
  const tree = useVersionBindingTree()
  return tree ? (
    <BindingDialogForTree
      key={`${tree.hostId ?? ''}:${tree.id}:${tree.instanceId ?? ''}`}
      tree={tree}
    />
  ) : null
}
