import React, { useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import {
  WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
  normalizeStoredWorkbenchVersionBinding
} from '../../../shared/workbench/version-binding'
import { versionFlowBranch } from '../../../shared/workbench/version-workspace-prepare'
import { branchName } from '@/lib/git-utils'
import { nativeVersionBindingPort } from './version-binding-port'
import {
  GOAL_PURPOSE_LABEL,
  ISSUE_TREE_LABEL,
  WORKFLOW_TREE_LABELS,
  goalOrdinal
} from './version-labels'

/**
 * G2 常驻补绑定入口（P3b）：创建结果处绑定写入失败会保留树并给本会话 toast
 * 重试，错过即缺——本对话框是人主导的常驻恢复路径。只列本仓无绑定的活树，
 * 由人显式断言「该树属于本版、用途是什么」；issue 用途的 taskSource 要求与
 * 解析查询精确相等，无法从登记完整推导，如实不提供（从任务屏开工或清理该树）。
 * 写入走 P1 绑定服务同一 RPC（instanceId 必填围栏、归属宿主路由、读回确认）。
 */

type BindWorkflow = 'plan' | 'acceptance' | 'goal'

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

const WORKFLOW_LABELS: Record<BindWorkflow, string> = {
  ...WORKFLOW_TREE_LABELS,
  goal: GOAL_PURPOSE_LABEL
}

export function VersionTreeBindDialog({
  version,
  entry,
  worktrees,
  onClose
}: {
  version: string
  /** null=条目已从目录消失；目标用途不可选（无 goalId 投影来源）。 */
  entry: VersionCatalogEntry | null
  worktrees: readonly Worktree[]
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [workflow, setWorkflow] = useState<BindWorkflow>('plan')
  const [goalId, setGoalId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = candidates.find((tree) => getWorktreeHostIdentity(tree) === selectedKey) ?? null
  const selectionSuggestion = selected ? suggestedWorkflow(selected, version) : null
  const effectiveWorkflow = selectionSuggestion ?? workflow
  const goalMissing = effectiveWorkflow === 'goal' && !goalId
  const instanceMissing = selected !== null && !selected.instanceId

  async function confirm(): Promise<void> {
    if (!selected || !selected.instanceId || busy) {
      return
    }
    setBusy(true)
    setError(null)
    const hostId = selected.hostId ?? LOCAL_EXECUTION_HOST_ID
    try {
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
        {
          schema: WORKBENCH_VERSION_BINDING_SCHEMA_VERSION,
          version,
          workflow: effectiveWorkflow,
          ...(effectiveWorkflow === 'goal' ? { goalId } : {})
        }
      )
      toast.message(`已把工作树 ${selected.displayName || selected.id} 绑定到 ${version}。`)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>绑定已有工作树到 {version}</DialogTitle>
          <DialogDescription>
            补绑定由人显式断言归属：选中的树按用途归入本版目录。分支名与本版流程分支一致时用途
            自动对齐；缺实例身份或对端不支持绑定契约时如实拒绝写入，不降级、不猜。
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            本仓没有无绑定的活树可补绑。已绑定的树在版本目录内；归属不明或不再需要的树请在原生
            项目工作区核对或清理。
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-[12px]">
            <label className="flex flex-col gap-1">
              工作树
              <select
                className="border-input rounded-md border bg-transparent px-2 py-1"
                value={selectedKey ?? ''}
                onChange={(event) => setSelectedKey(event.target.value || null)}
              >
                <option value="">待选择工作树</option>
                {candidates.map((tree) => (
                  <option key={getWorktreeHostIdentity(tree)} value={getWorktreeHostIdentity(tree)}>
                    {tree.displayName?.trim() ||
                      (tree.branch ? branchName(tree.branch) : '') ||
                      tree.id}
                    {tree.hostId && tree.hostId !== LOCAL_EXECUTION_HOST_ID
                      ? `（宿主 ${tree.hostId}）`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              用途
              <select
                className="border-input rounded-md border bg-transparent px-2 py-1"
                value={effectiveWorkflow}
                disabled={selectionSuggestion !== null}
                onChange={(event) => setWorkflow(event.target.value as BindWorkflow)}
              >
                <option value="plan">{WORKFLOW_LABELS.plan}</option>
                <option value="acceptance">{WORKFLOW_LABELS.acceptance}</option>
                <option value="goal">{WORKFLOW_LABELS.goal}</option>
                <option value="issue" disabled>
                  {ISSUE_TREE_LABEL}（须从任务屏开工：来源身份需精确一致）
                </option>
              </select>
              {selectionSuggestion ? (
                <span className="text-[11px] text-muted-foreground">
                  分支与本版{WORKFLOW_LABELS[selectionSuggestion]}分支一致，用途已对齐。
                </span>
              ) : null}
            </label>
            {effectiveWorkflow === 'goal' ? (
              <label className="flex flex-col gap-1">
                目标
                <select
                  className="border-input rounded-md border bg-transparent px-2 py-1"
                  value={goalId}
                  onChange={(event) => setGoalId(event.target.value)}
                >
                  <option value="">待选择目标</option>
                  {(entry?.goals ?? []).map((goal, index) => (
                    <option key={goal.goalId} value={goal.goalId}>
                      {goalOrdinal(index)} · {goal.title}
                    </option>
                  ))}
                </select>
                {(entry?.goals ?? []).length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    本版计划还没有目标；目标协作树只能绑定到已保存计划投影出的 goalId。
                  </span>
                ) : null}
              </label>
            ) : null}
            {selected && instanceMissing ? (
              <p className="text-[12px] text-destructive">
                该树缺实例身份，绑定被拒绝（围栏口径与创建链一致）；请在原生项目核对该树登记。
              </p>
            ) : null}
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selected || instanceMissing || goalMissing || busy}
            onClick={() => void confirm()}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            写入绑定
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
