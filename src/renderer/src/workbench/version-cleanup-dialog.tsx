import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repo-types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  getAutomationAuthorityTarget,
  listAutomationsForTarget
} from '@/components/automations/automation-host-client'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import type {
  VersionCatalogEntry,
  VersionCatalogWorkspace
} from '../../../shared/workbench/version-catalog'
import { runWorktreeBatchDelete } from '@/components/sidebar/delete-worktree-flow'
import { toWorktreeDeleteIdentities } from '@/components/sidebar/worktree-delete-request'
import { useSidebarHostScopeOptions } from '@/components/sidebar/use-sidebar-host-scope-options'
import { useDeleteWorktreeStatusHydration } from '@/components/sidebar/use-delete-worktree-status-hydration'
import { getDeleteWorktreeDirtyChangeCounts } from '@/components/sidebar/delete-worktree-dirty-change-counts'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'

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
  switch (workspace.binding.workflow) {
    case 'plan':
      return '计划树'
    case 'acceptance':
      return '验收树'
    case 'goal': {
      const index = entry.goals.findIndex((goal) => goal.goalId === workspace.binding.goalId)
      return index !== -1 ? `目标树 G${index + 1}` : '目标树'
    }
    case 'issue':
      return 'Issue 执行树'
  }
}

function hostKey(hostId: string | null | undefined): string {
  return hostId ?? LOCAL_EXECUTION_HOST_ID
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
  const deleteStateByWorktreeId = useAppStore((s) => s.deleteStateByWorktreeId)
  const gitStatusByWorktree = useAppStore((s) => s.gitStatusByWorktree)
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
        const tree =
          worktrees.find(
            (item) =>
              item.id === workspace.worktreeId && hostKey(item.hostId) === hostKey(workspace.hostId)
          ) ?? null
        return {
          key: `${hostKey(workspace.hostId)}::${workspace.worktreeId}`,
          workspace,
          tree,
          local: hostKey(workspace.hostId) === LOCAL_EXECUTION_HOST_ID
        }
      }),
    [entry, worktrees]
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
        gitStatusByWorktreeIdentity,
        repoMap
      }),
    [
      deleteTargets,
      deleteStateByWorktreeId,
      gitStatusByWorktree,
      gitStatusByWorktreeIdentity,
      repoMap
    ]
  )

  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(rows.filter((row) => row.local && row.tree !== null).map((row) => row.key))
  )
  // spec「版本级清理」：本版自动化仍启用时在对话框如实提示（是否停用由人在原生
  // 编辑器决定）。探测覆盖本机可见的自动化登记（creationKey 版本维度后缀匹配，
  // P5 版本化身份）；他宿主 runtime 的条目不跨机探测，属如实留白。
  const [automationNotice, setAutomationNotice] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setAutomationNotice(null)
    void (async () => {
      try {
        const automations = await listAutomationsForTarget(
          getAutomationAuthorityTarget({ kind: 'desktop' })
        )
        const enabled = automations.filter(
          (item) =>
            item.enabled &&
            typeof item.creationKey === 'string' &&
            item.creationKey.startsWith('bw-cycle:') &&
            item.creationKey.endsWith(`:${version}`)
        )
        if (!cancelled && enabled.length > 0) {
          setAutomationNotice(
            `本版仍有 ${enabled.length} 条已启用的周期自动化（${enabled
              .map((item) => item.name)
              .join(
                '、'
              )}）：清理不改写它们；树删除后到点触发按登记缺失如实呈现。是否停用由你在原生自动化编辑器决定。`
          )
        }
      } catch {
        // 探测失败不阻塞清理：静态语义行仍如实说明「不改写自动化条目」。
      }
    })()
    return () => {
      cancelled = true
    }
  }, [version])
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>清理 {version} 工作树</DialogTitle>
          <DialogDescription>
            删除所选工作树的磁盘检出与原生登记（含版本绑定）；Git 材料与版本目录条目保留，
            删除后各屏只读回看。勾选后进入 Orca 删除确认，逐棵预检（未提交修改、子树、归档
            hook）不豁免。清理不改写自动化条目；删树后自动化到点按登记缺失如实呈现。
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek flex max-h-64 flex-col gap-1.5 overflow-y-auto text-[12px]">
          {rows.length === 0 ? (
            <p className="text-muted-foreground">
              本版没有存活绑定工作区（已清理或未准备）；材料回看不受影响。
            </p>
          ) : null}
          {rows.map((row) => {
            const label = row.tree
              ? row.tree.displayName?.trim() ||
                row.tree.branch?.replace(/^refs\/heads\//, '') ||
                row.tree.id
              : row.workspace.worktreeId
            const ownerLabel = row.local
              ? '本机'
              : (hostLabelById.get(hostKey(row.workspace.hostId)) ?? hostKey(row.workspace.hostId))
            const dirty = row.tree
              ? (dirtyCounts.get(
                  row.tree.hostId ? getWorktreeHostIdentity(row.tree) : row.tree.id
                ) ?? 0)
              : 0
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
                    {row.local ? '' : ' · 勾选=经共享通道在归属宿主删除（派发前复核配对权限）'}
                    {row.tree === null
                      ? ' · 登记缺失（目录即将刷新，不可勾选）'
                      : dirty > 0
                        ? ` · 未提交修改 ${dirty} 项（原生确认单内处理）`
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={checkedCount === 0}
            onClick={confirm}
          >
            删除所勾选（{checkedCount}）…
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
