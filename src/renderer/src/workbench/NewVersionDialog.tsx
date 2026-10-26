import React, { useState } from 'react'
import { Plus, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { validatePlanningVersion } from '../../../shared/workbench/version-document'
import {
  versionFlowBranch,
  type VersionWorkspacePrepareResult
} from '../../../shared/workbench/version-workspace-prepare'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { nativeVersionWorkspacePort } from './version-workspace-port'
import { setBrowsedVersion } from './version-context-state'
import { prepareFailed } from '../../../shared/workbench/version-workspace-prepare'
import { WORKFLOW_TREE_LABELS } from './version-labels'
import type { VersionCatalogState } from './use-version-catalog'
import { closeProjectPage } from './project-page-state'

/**
 * G2 「＋ 新建版本」轻表单（P3a，高保真修订 8 · Primer Create 口径）：只要一个
 * 必要输入；重名/非法名就地提示并保留输入；提交走归属宿主的
 * workbench.versionWorkspace.prepare——部分成功保留并逐步回报，重入即补齐；
 * 两树就绪不启动 agent、不启用自动化、不预建目标/任务树。
 * 已存在版本补准备不进本表单——版本行「初始化工作区」直接执行（#436 伴飞
 * 裁定：创建类动作不设确认单）。
 */

export function NewVersionDialog({
  catalog,
  projectKey,
  projectName,
  onClose
}: {
  catalog: VersionCatalogState
  projectKey: string | null
  projectName: string | null
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<VersionWorkspacePrepareResult | null>(null)

  function validate(input: string): string | null {
    const value = input.trim()
    if (!value) {
      return '请填写版本名，例如 v0.9。'
    }
    try {
      validatePlanningVersion(value)
    } catch {
      return '请填写有效版本名，例如 v0.9；不能包含路径或特殊文件名。'
    }
    if (!versionFlowBranch(value, 'plan') || !versionFlowBranch(value, 'acceptance')) {
      return '版本名不能组成合法的流程分支名，请换一个版本名。'
    }
    const existing = (catalog.catalog?.entries ?? []).find(
      (entry) => entry.version.toLowerCase() === value.toLowerCase()
    )
    if (existing) {
      return `该版本已存在：${existing.version}`
    }
    return null
  }

  async function runPrepare(version: string): Promise<void> {
    const { scope } = catalog
    if (!scope) {
      setFormError('项目工作区尚未就绪，请稍后再试')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const result = await nativeVersionWorkspacePort({
        hostId: scope.hostId,
        runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
      }).prepare({ repoId: scope.repoId, hostId: scope.hostId, version })
      setReport(result)
      // 登记刷新：让侧栏目录/绑定立即可见（不依赖轮询）。
      const state = useAppStore.getState()
      await Promise.all(catalog.repoIds.map((repoId) => state.fetchWorktrees(repoId)))
      catalog.reload()
      const failed = prepareFailed(result)
      if (!failed) {
        const planStep = result.steps.find((step) => step.workflow === 'plan')
        setBrowsedVersion(projectKey, version)
        closeProjectPage()
        onClose()
        // 最终检视 M-3：直开激活补宿主限定（STA-4343 同族收敛的漏网点）；fetchWorktrees
        // 已在上方完成，按 id 取登记行派生 host opts。
        const planTree = planStep?.worktreeId
          ? (useAppStore
              .getState()
              .allWorktrees()
              .find((item) => item.id === planStep.worktreeId) ?? null)
          : null
        if (
          planStep?.worktreeId &&
          activateAndRevealWorktree(
            planStep.worktreeId,
            planTree ? worktreeActivationHostOpts(planTree) : undefined
          ) === false
        ) {
          toast.error('工作区已就绪，但打开失败，请在原生项目工作区中核对。')
        } else {
          toast.success(`版本 ${version} 已创建。`)
        }
      }
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault()
    if (busy) {
      return
    }
    const failure = validate(name)
    if (failure) {
      setFormError(failure)
      return
    }
    setReport(null)
    void runPrepare(name.trim())
  }

  const reportFailed = prepareFailed(report)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建版本</DialogTitle>
          <DialogDescription>{projectName ?? '当前项目'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">版本名</span>
            <input
              autoFocus
              autoComplete="off"
              placeholder="例如 v0.9"
              value={name}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value)
                setFormError(null)
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          {report ? (
            <div className="flex flex-col gap-1 rounded-md border border-border/50 p-3 text-[12px]">
              <p className="font-medium">版本 {report.version} 创建结果</p>
              {report.steps.map((step) => (
                <p key={step.workflow}>
                  {WORKFLOW_TREE_LABELS[step.workflow]}：
                  {step.state === 'created'
                    ? '已创建'
                    : step.state === 'existing'
                      ? '已就绪'
                      : '创建失败'}
                </p>
              ))}
              {report.problems.map((problem) => (
                <p key={`${problem.workflow}:${problem.code}`} className="text-destructive">
                  {WORKFLOW_TREE_LABELS[problem.workflow]}：{problem.message}
                </p>
              ))}
              {reportFailed ? (
                <p className="text-muted-foreground">已创建的工作区会保留，可以重试完成创建。</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              {reportFailed ? '保留结果并关闭' : '取消'}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  创建中…
                </>
              ) : reportFailed ? (
                <>
                  <Plus className="size-3.5" />
                  重试
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  创建版本
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
