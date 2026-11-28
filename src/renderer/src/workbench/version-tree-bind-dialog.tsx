import { notifyWorkbenchError } from './error-feedback'
import { useVersionMembership } from './version-cycle/use-version-membership'
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
import { getRepoTaskSourceContext } from './task-source-context'
import { parseCodeHubRemote } from '../../../shared/codehub'
import type { Repo } from '../../../shared/repository/repo-types'
import type { Worktree, WorkspaceLinkedItem } from '../../../shared/worktree/types'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import type { CycleTaskReference } from './version-cycle/ports'
import {
  WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
  normalizeStoredWorkbenchVersionBinding,
  type WorkbenchVersionBinding
} from '../../../shared/workbench/version-binding'
import { versionFlowBranch } from '../../../shared/workbench/version-workspace-prepare'
import { branchName } from '@/lib/source-control/branches/branch-name'
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
import {
  linkedTreeIssueKey,
  parseVersionFlowBranch,
  suggestedBindWorkflow,
  treeBindMode,
  type BindWorkflow
} from './version-tree-bind-mode'
import { linkedIssueRepository, sameIssueLink } from '../../../shared/workbench/version-membership'
import { IssueAssignmentError, writeIssueVersionAssignment } from './version-issue-assignment'
import type { TaskSourceContext } from '../../../shared/work-items/task-source-context'

/**
 * 原生单树右键菜单共用的绑定选择器。流程树和已关联 Issue 的工作区只补树上
 * 还不能确定的项；尚未关联 Issue 时仍从本版计划引用选择，不凭分支名猜编号。
 * 先读后写：Issue 的计划标签只追加、标题改为所选版本和目标；这一步没写上就不写绑定。
 * 绑定与 linkedWorkItem 同一次保存，instanceId 围栏不变。
 */

const WORKFLOW_ORDER: readonly BindWorkflow[] = ['plan', 'acceptance', 'goal', 'issue']

const WORKFLOW_LABELS: Record<BindWorkflow, string> = {
  ...WORKFLOW_SCREEN_LABELS,
  goal: GOAL_PURPOSE_LABEL,
  issue: ISSUE_PURPOSE_LABEL
}

/** 可纳入的 Issue 引用：仅读回链就绪的 provider（与开工链同口径）。 */
type BindableTaskRef = Omit<CycleTaskReference, 'provider'> & {
  provider: 'github' | 'codehub'
}

function bindableProvider(provider: string): 'github' | 'codehub' | null {
  return provider === 'github' || provider === 'codehub' ? provider : null
}

function taskRefKey(task: CycleTaskReference): string {
  return `${task.provider}:${task.repository}:${task.number}`
}

function taskRepository(repo: Repo, provider: 'github' | 'codehub'): string {
  if (provider === 'codehub') {
    const remote =
      parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
      parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
    if (remote) {
      return `${remote.host}/${remote.project}`
    }
  }
  const key = repo.gitRemoteIdentity?.canonicalKey
  if (key) {
    return key
  }
  const upstream = repo.upstream
  if (upstream?.owner && upstream.repo) {
    return `${upstream.host ?? 'github.com'}/${upstream.owner}/${upstream.repo}`
  }
  return repo.id
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
  const mode = treeBindMode(tree)
  const [version, setVersion] = useState(
    () => currentBinding?.version ?? parseVersionFlowBranch(tree.branch)?.version ?? ''
  )
  const entry = entries.find((item) => item.version === version) ?? null
  const goals = entry?.goals ?? []
  const membership = useVersionMembership(scope, entry)
  const [manualWorkflow, setManualWorkflow] = useState<BindWorkflow>(
    currentBinding?.workflow ?? 'goal'
  )
  const workflow: BindWorkflow =
    mode.kind === 'flow'
      ? mode.workflow
      : mode.kind === 'linked-issue' || mode.kind === 'choose-issue'
        ? 'issue'
        : manualWorkflow
  const [goalId, setGoalId] = useState(currentBinding?.goalId ?? '')
  const [issueKey, setIssueKey] = useState<string | null>(null)
  const [attachmentKey, setAttachmentKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const taskDeps = useMemo(() => ({ ...nativeTaskPortDeps(), repos: () => repos }), [repos])
  const issueRefs = useMemo(() => {
    const seen = new Set<string>()
    const refs: BindableTaskRef[] = []
    for (const task of membership.references ?? []) {
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
  }, [membership.references, goalId])

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
  const chosenAttachment =
    mode.kind === 'linked-issue'
      ? mode.item
      : mode.kind === 'choose-issue'
        ? (mode.items.find((item) => linkedTreeIssueKey(item) === attachmentKey) ?? null)
        : null
  const issueMissing =
    (mode.kind === 'choose-issue' && !chosenAttachment) ||
    (workflow === 'issue' && mode.kind === 'manual' && !selectedIssueKey)
  const instanceMissing = !tree.instanceId
  const flowMismatch =
    (workflow === 'plan' || workflow === 'acceptance') &&
    suggestedBindWorkflow(tree, version) !== workflow
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
    let issueAssignment: {
      provider: 'github' | 'codehub'
      repo: Repo
      source: TaskSourceContext
      number: number
      url: string
      title: string
      labels?: readonly string[]
    } | null = null
    let remoteIssueUpdated = false
    try {
      const ownerScope = nativeWorkspaceScope(tree)
      if (workflow === 'goal') {
        binding = { ...binding, goalId }
      }
      if (workflow === 'issue' && chosenAttachment) {
        if (!scope) {
          throw new Error('项目工作区尚未就绪，无法核对 Issue 归属')
        }
        const item = chosenAttachment
        const listed = repos.find((repo) => repo.id === (item.repoId || tree.repoId))
        if (!listed) {
          throw new Error('未在已登记项目中找到该 Issue 对应的项目')
        }
        const pinned = item.url
          ? linkedIssueRepository(item.url, item.provider, item.number, repos)
          : null
        if (item.url && !pinned) {
          throw new Error('这条关联没有指向一个 GitHub 或 CodeHub Issue，绑定没有写入。')
        }
        const reference: BindableTaskRef = {
          provider: item.provider,
          repository: pinned ?? taskRepository(listed, item.provider),
          number: item.number,
          goalId,
          kind: 'issue'
        }
        const repo = resolveReferenceRepo(taskDeps, ownerScope, reference)
        if (!repo) {
          throw new Error('未在已登记项目中找到该 Issue 对应的项目')
        }
        const taskSource = getRepoTaskSourceContext(repo, item.provider)
        if (!taskSource) {
          throw new Error(`项目 ${repo.displayName || repo.id} 解析不出任务来源`)
        }
        const snapshot = await readReference(taskDeps, ownerScope, reference)
        const identityMatches = item.url
          ? sameIssueLink(item.url, snapshot.url, item.provider, item.number, repos)
          : linkedIssueRepository(snapshot.url, item.provider, item.number, repos) !== null
        if (!identityMatches) {
          throw new Error('读回的 Issue 和这条工作区关联不是同一条，绑定没有写入。')
        }
        const issueUrl = item.url ?? snapshot.url
        issueAssignment = {
          provider: item.provider,
          repo,
          source: taskSource,
          number: item.number,
          url: issueUrl,
          title: snapshot.title,
          labels: snapshot.labels
        }
        linkedWorkItem = {
          provider: item.provider,
          type: 'issue',
          number: item.number,
          title: snapshot.title,
          url: issueUrl,
          repoId: repo.id
        }
        binding = { ...binding, goalId, taskSource }
      } else if (workflow === 'issue') {
        if (!scope) {
          throw new Error('项目工作区尚未就绪，无法核对 Issue 归属')
        }
        const reference = issueRefs.find((task) => taskRefKey(task) === selectedIssueKey)
        if (!reference) {
          throw new Error('所选 Issue 引用已不在列表中，请重新选择')
        }
        const repo = resolveReferenceRepo(taskDeps, ownerScope, reference)
        if (!repo) {
          throw new Error(`未在已登记项目中找到 ${String(reference.repository)} 对应的项目`)
        }
        const taskSource = getRepoTaskSourceContext(repo, reference.provider)
        if (!taskSource) {
          throw new Error(`项目 ${repo.displayName || repo.id} 解析不出任务来源`)
        }
        const snapshot = await readReference(taskDeps, ownerScope, reference)
        issueAssignment = {
          provider: reference.provider,
          repo,
          source: taskSource,
          number: reference.number,
          url: snapshot.url,
          title: snapshot.title,
          labels: snapshot.labels
        }
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
      if (issueAssignment) {
        const assigned = await writeIssueVersionAssignment({
          ...issueAssignment,
          version,
          goalId
        })
        remoteIssueUpdated = assigned.titleChanged || assigned.labelAdded
        if (linkedWorkItem) {
          linkedWorkItem = { ...linkedWorkItem, title: assigned.title }
        }
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
      toast.success(
        remoteIssueUpdated
          ? `已把工作区 ${label} 纳入 ${version}，并写上该版本的计划标签和标题。`
          : `已把工作区 ${label} 纳入 ${version}。`
      )
      onClose()
    } catch (reason) {
      if (reason instanceof IssueAssignmentError) {
        notifyWorkbenchError(reason.message, reason.cause ?? reason, '工作区尚未绑定，可重新保存。')
      } else if (remoteIssueUpdated) {
        notifyWorkbenchError(
          'Issue 已写上该版本的计划标签和标题，工作区还没有绑定',
          reason,
          '可重新保存。'
        )
      } else {
        notifyWorkbenchError(
          `无法把工作区 ${label} 纳入 ${version}`,
          reason,
          '可重新选择版本后重试。'
        )
      }
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
                if (mode.kind === 'manual') {
                  setManualWorkflow(suggestedBindWorkflow(tree, value) ?? 'goal')
                }
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
          {mode.kind === 'manual' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="wb-bind-workflow">用途</Label>
              <Select
                value={workflow}
                onValueChange={(value) => setManualWorkflow(value as BindWorkflow)}
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
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>用途</Label>
              <p className="text-sm">{WORKFLOW_LABELS[workflow]}</p>
            </div>
          )}
          {version && flowMismatch ? (
            <span className="text-xs text-destructive">
              {WORKFLOW_LABELS[workflow]}工作区需要分支{' '}
              {versionFlowBranch(version, workflow as 'plan' | 'acceptance')}。
            </span>
          ) : null}
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
          {mode.kind === 'linked-issue' ? (
            <div className="flex flex-col gap-2">
              <Label>对应 Issue</Label>
              <p className="text-sm">
                #{mode.item.number}
                {mode.item.title ? ` · ${mode.item.title}` : ''}
              </p>
            </div>
          ) : null}
          {mode.kind === 'choose-issue' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="wb-bind-attachment">对应 Issue</Label>
              <Select
                value={attachmentKey ?? ''}
                onValueChange={(value) => setAttachmentKey(value || null)}
              >
                <SelectTrigger id="wb-bind-attachment" className="w-full">
                  <SelectValue placeholder="选择已关联的 Issue" />
                </SelectTrigger>
                <SelectContent>
                  {mode.items.map((item) => (
                    <SelectItem key={linkedTreeIssueKey(item)} value={linkedTreeIssueKey(item)}>
                      #{item.number}
                      {item.title ? ` · ${item.title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {workflow === 'issue' && mode.kind === 'manual' ? (
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
                  {membership.error ??
                    (membership.references ? '该目标暂无关联 Issue。' : '正在读取版本 Issue…')}
                </span>
              ) : null}
            </div>
          ) : null}
          {workflow === 'issue' ? (
            <p className="text-xs text-muted-foreground">
              保存后为这张 Issue 加上所选版本的计划标签，已有版本标签保留，标题改为当前版本和目标。
            </p>
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
