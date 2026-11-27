import { getIndexedAllWorktrees } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { getWorktreeOnHostFromState } from '@/store/workspaces/selection/worktree-on-host-selector'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { versionTreeKey } from './version-material-selection'
import {
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../shared/execution-host/execution-host'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repository/repo-types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type {
  VersionCatalogEntry,
  VersionCatalogWorkspace
} from '../../../shared/workbench/version-catalog'
import { runWorktreeBatchDelete } from '@/components/sidebar/workspace-actions/deletion/delete-worktree-flow'
import { toWorktreeDeleteIdentities } from '@/components/sidebar/workspace-actions/deletion/worktree-delete-request'
import { useSidebarHostScopeOptions } from '@/components/sidebar/worktree-list/controls/use-sidebar-host-scope-options'
import { useDeleteWorktreeStatusHydration } from '@/components/sidebar/workspace-actions/deletion/use-delete-worktree-status-hydration'
import { getDeleteWorktreeDirtyChangeCounts } from '@/components/sidebar/workspace-actions/deletion/delete-worktree-dirty-change-counts'
import { useWorktreeAgentRows } from '@/components/sidebar/workspace-card/activity/useWorktreeAgentRows'
import { branchName } from '@/lib/source-control/branches/branch-name'
import { probeVersionAutomations } from './version-cleanup-automations'
import { ISSUE_TREE_LABEL, WORKFLOW_TREE_LABELS, goalTreeLabel } from './version-labels'

/**
 * G2 版本级清理确认单（P3b，spec「版本级清理（复用 Orca 原生删除）」）：
 * 本对话框只做版本语义的清单层——列出本版全部存活绑定实例，本机 owned 默认
 * 勾选、他宿主实例列而不勾（显式勾选=经共享通道在归属宿主删除）；预检状态与
 * 在跑会话数如实标注。确认后交原生批量删除漏斗（runWorktreeBatchDelete →
 * Orca 删除确认单 → removeWorktree RPC）：未提交修改/子树/归档 hook 预检与
 * force 豁免全部沿原生规则，不另造删除路径、不静默跳过。
 * 删除只改执行面：磁盘检出与原生登记（含绑定）消失，Git 材料与版本目录条目
 * 保留；目录现算，删后无悬空绑定。清理不改写任何自动化条目。
 */

function workflowLabel(entry: VersionCatalogEntry, workspace: VersionCatalogWorkspace): string {
  const workflow = workspace.binding.workflow
  if (workflow === 'goal') {
    const index = entry.goals.findIndex((goal) => goal.goalId === workspace.binding.goalId)
    return goalTreeLabel(index === -1 ? null : index)
  }
  return workflow === 'issue' ? ISSUE_TREE_LABEL : WORKFLOW_TREE_LABELS[workflow]
}

function nativeDeleteTarget(tree: Worktree): boolean {
  if (!tree.instanceId || tree.isMainWorktree) {
    return false
  }
  const execution = parseExecutionHostId(tree.hostId)
  if (
    tree.runtimeOwnerEnvironmentId &&
    (execution?.kind !== 'runtime' || execution.environmentId !== tree.runtimeOwnerEnvironmentId)
  ) {
    // The native confirmation serializes the execution host, not a separate relay owner.
    return false
  }
  const state = useAppStore.getState()
  const rows = getIndexedAllWorktrees(selectWorktreesByRepo(state)).filter(
    (row) => row.id === tree.id && (!tree.hostId || row.hostId === tree.hostId)
  )
  // Orca's delete request accepts host + instance. If two transport owners share that
  // host key, its native confirmation cannot distinguish them; keep the row read-only.
  return (
    rows.length === 1 &&
    versionTreeKey(rows[0]) === versionTreeKey(tree) &&
    getWorktreeOnHostFromState(state, tree.id, tree.hostId) === rows[0]
  )
}

function SessionCount({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const rows = useWorktreeAgentRows(worktreeId)
  const live = rows.filter((row) => row.rowSource === 'live').length
  return <span className="shrink-0 text-[11px] text-muted-foreground">在跑会话 {live}</span>
}

export function VersionCleanupDialog({
  version,
  entry,
  worktrees,
  onClose
}: {
  version: string
  /** null=条目已从目录消失（如已清理完成）；清单如实为空。 */
  entry: VersionCatalogEntry | null
  worktrees: readonly Worktree[]
  onClose(): void
}): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const registered = useAppStore((s) => s.worktreesByRepo)
  const deleteStateByWorktreeId = useAppStore((s) => s.deleteStateByWorktreeId)
  const gitStatusByWorktree = useAppStore((s) => s.gitStatusByWorktree)
  const gitStatusReadErrorByWorktree = useAppStore((s) => s.gitStatusReadErrorByWorktree)
  const repoMap = useMemo(
    () => new Map(repos.map((repo) => [repo.id, repo] as [string, Repo])),
    [repos]
  )
  const { hostOptions } = useSidebarHostScopeOptions()
  const hostLabelById = useMemo(
    () => new Map<string, string>(hostOptions.map((host) => [host.id, host.label])),
    [hostOptions]
  )

  const rows = useMemo(
    () =>
      (entry?.workspaces ?? []).map((workspace) => {
        const matches = worktrees.filter(
          (tree) =>
            tree.id === workspace.worktreeId &&
            (tree.hostId ?? null) === workspace.hostId &&
            (tree.runtimeOwnerEnvironmentId ?? null) === workspace.runtimeOwnerEnvironmentId &&
            (tree.instanceId ?? null) === workspace.instanceId
        )
        const tree = matches.length === 1 ? matches[0] : null
        let hostId: string | null = null
        let local = false
        try {
          const scope = tree && nativeWorkspaceScope(tree)
          if (scope) {
            hostId = scope.runtimeOwnerEnvironmentId
              ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
              : scope.hostId
            local = hostId === LOCAL_EXECUTION_HOST_ID
          }
        } catch {
          // Unknown ownership cannot authorize deletion.
        }
        return {
          key: tree ? versionTreeKey(tree) : JSON.stringify(workspace),
          workspace,
          hostId,
          local,
          tree: tree && hostId && nativeDeleteTarget(tree) ? tree : null
        }
      }),
    // Native deletion eligibility is rechecked whenever registered worktrees or owners change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, worktrees, registered, repos]
  )
  const deleteTargets = useMemo(
    () => rows.filter((row) => row.tree !== null).map((row) => row.tree as Worktree),
    [rows]
  )
  // 预检状态与原生删除确认单同一来源（同一 hydration 钩子），不另算一套。
  const gitStatusByWorktreeIdentity = useDeleteWorktreeStatusHydration({
    isOpen: true,
    deleteTargets,
    visibleTargets: deleteTargets,
    repoMap
  })
  const dirtyCounts = useMemo(
    () =>
      getDeleteWorktreeDirtyChangeCounts({
        deleteTargets,
        deleteStateByWorktreeId,
        gitStatusByWorktree,
        gitStatusReadErrorByWorktree,
        gitStatusByWorktreeIdentity,
        repoMap
      }),
    [
      deleteTargets,
      deleteStateByWorktreeId,
      gitStatusByWorktree,
      gitStatusReadErrorByWorktree,
      gitStatusByWorktreeIdentity,
      repoMap
    ]
  )

  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(rows.filter((row) => row.local && row.tree !== null).map((row) => row.key))
  )
  // spec「版本级清理」：本版自动化仍启用时在对话框如实提示（是否停用由人在原生
  // 编辑器决定）；提示只影响本提示条，不豁免原生预检。探测语义（creationKey 全键
  // 精确匹配、失败/离线不阻塞、他宿主留白）住 probeVersionAutomations。
  const [automationNotice, setAutomationNotice] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setAutomationNotice(null)
    void (async () => {
      const enabled = await probeVersionAutomations({ version, worktrees, rows })
      if (!cancelled && enabled.length > 0) {
        setAutomationNotice(
          `本版仍有 ${enabled.length} 条启用中的周期自动化（${enabled
            .map((item) => item.name)
            .join('、')}）：清理不会停用它们，可在自动化编辑器处理。`
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [version, worktrees, rows])
  const toggle = (key: string, next: boolean) => {
    setChecked((previous) => {
      const updated = new Set(previous)
      if (next) {
        updated.add(key)
      } else {
        updated.delete(key)
      }
      return updated
    })
  }

  function confirm(): void {
    const targets = rows
      .filter((row) => checked.has(row.key) && row.tree !== null)
      .map((row) => row.tree as Worktree)
    if (targets.some((target) => !nativeDeleteTarget(target))) {
      toast.error('工作区归属或实例已变化，请刷新清单后重选。')
      return
    }
    if (targets.length === 0) {
      return
    }
    // 原生批量漏斗：批量必开 Orca 确认单（copy/预检/force/宿主路由全原生）。
    const accepted = runWorktreeBatchDelete(toWorktreeDeleteIdentities(targets), {
      forceConfirm: true,
      onDeleted: (deleted) => {
        toast.message(
          `已删除 ${version} 的 ${deleted.length} 棵工作树；Git 材料与版本目录条目保留，目录按登记现算更新。`
        )
      }
    })
    if (!accepted) {
      // 原生漏斗已如实提示（清单变化/无可删对象）；保持本单打开供重选。
      return
    }
    onClose()
  }

  const checkedCount = rows.filter((row) => checked.has(row.key) && row.tree !== null).length
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>清理 {version} 工作树</DialogTitle>
          <DialogDescription>
            删除勾选工作树的磁盘检出与登记；版本材料与目录保留。
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek flex max-h-64 flex-col gap-1.5 overflow-y-auto text-[12px]">
          {rows.length === 0 ? (
            <p className="text-muted-foreground">本版没有可删除的工作树（已清理或未准备）。</p>
          ) : null}
          {rows.map((row) => {
            const label = row.tree
              ? row.tree.displayName?.trim() ||
                (row.tree.branch ? branchName(row.tree.branch) : '') ||
                row.tree.id
              : row.workspace.worktreeId
            const ownerLabel = row.hostId
              ? (hostLabelById.get(row.hostId) ?? row.hostId)
              : '主机未知'
            // Why: 缺键=预检未回读（他宿主离线/水合失败），与「已水合且干净」不可混同；
            // 没数据就是 Unknown，不能呈现否定断言（四铁律信号口径，检视 F6 修正）。
            const dirty = row.tree
              ? dirtyCounts.get(row.tree.hostId ? getWorktreeHostIdentity(row.tree) : row.tree.id)
              : undefined
            return (
              <label
                key={row.key}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  row.tree === null ? 'opacity-60' : ''
                }`}
              >
                <Checkbox
                  checked={checked.has(row.key)}
                  disabled={row.tree === null}
                  onCheckedChange={(next) => toggle(row.key, next === true)}
                  aria-label={`删除 ${label}（${ownerLabel}）`}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {label} · {entry ? workflowLabel(entry, row.workspace) : '绑定工作区'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {ownerLabel}
                    {row.local ? '' : ' · 在其归属主机删除'}
                    {row.tree === null
                      ? ' · 登记或归属无法确认（不可勾选）'
                      : dirty === undefined
                        ? ' · 预检未回读'
                        : dirty > 0
                          ? ` · 未提交修改 ${dirty} 项`
                          : ' · 预检未见未提交修改'}
                  </span>
                </span>
                {row.tree ? <SessionCount worktreeId={row.tree.id} /> : null}
              </label>
            )
          })}
        </div>
        {automationNotice ? (
          <p role="note" className="text-[11.5px] text-muted-foreground">
            {automationNotice}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={checkedCount === 0}
            onClick={confirm}
          >
            删除所勾选（{checkedCount}）…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
