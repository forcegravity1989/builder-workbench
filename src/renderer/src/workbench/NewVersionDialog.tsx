import React, { useEffect, useRef, useState } from 'react'
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
import { WORKFLOW_TREE_LABELS } from './version-labels'
import type { VersionCatalogState } from './use-version-catalog'

/**
 * G2 「＋ 新建版本」轻表单（P3a，高保真修订 8 · Primer Create 口径）：只要一个
 * 必要输入；重名/非法名就地提示并保留输入；提交走归属宿主的
 * workbench.versionWorkspace.prepare——部分成功保留并逐步回报，重入即补齐；
 * 两树就绪不启动 agent、不启用自动化、不预建目标/任务树。
 * prepare 模式（已存在版本补准备）复用同一执行与回报面板。
 */

export type NewVersionDialogRequest = { mode: 'create' } | { mode: 'prepare'; version: string }

function stepText(result: VersionWorkspacePrepareResult, workflow: 'plan' | 'acceptance'): string {
  const step = result.steps.find((item) => item.workflow === workflow)
  if (!step) {
    return `${WORKFLOW_TREE_LABELS[workflow]}：未执行`
  }
  const state =
    step.state === 'created' ? '已创建' : step.state === 'existing' ? '已就绪（复用登记）' : '失败'
  const material =
    step.material === undefined
      ? ''
      : step.material.state === 'initialized'
        ? ' · 空计划已初始化'
        : ' · 计划材料已存在（未覆盖）'
  return `${WORKFLOW_TREE_LABELS[workflow]}：${state}（${step.branch}）${material}`
}

/** 步骤链非原子回报：任一 problem 或失败步骤都算未全就绪（重试=重入补齐）。 */
function prepareFailed(result: VersionWorkspacePrepareResult | null): boolean {
  return (
    result !== null &&
    (result.problems.length > 0 || result.steps.some((step) => step.state === 'failed'))
  )
}

export function NewVersionDialog({
  request,
  catalog,
  projectKey,
  projectName,
  onClose
}: {
  request: NewVersionDialogRequest
  catalog: VersionCatalogState
  projectKey: string | null
  projectName: string | null
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(request.mode === 'prepare' ? request.version : '')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<VersionWorkspacePrepareResult | null>(null)
  const locked = request.mode === 'prepare'

  // StrictMode dev 双挂载不双发准备（宿主端 dedupe/重入虽可兜底，仍加 ref 消噪）。
  const autoRunRef = useRef(false)
  useEffect(() => {
    if (request.mode === 'prepare' && !autoRunRef.current) {
      autoRunRef.current = true
      void runPrepare(request.version)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

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
          toast.success(`版本 ${version} 的计划与验收工作区已就绪；未启动 agent。`)
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
    // prepare 模式的版本名锁定为已存在版本，重名校验恰是其反向前提：重试必须
    // 跳过 validate，否则「重试补齐」永远被「该版本已存在」挡死（不成立的承诺）。
    if (!locked) {
      const failure = validate(name)
      if (failure) {
        setFormError(failure)
        return
      }
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
          <DialogTitle>{locked ? `准备 ${request.version} 流程工作区` : '新建版本'}</DialogTitle>
          <DialogDescription>
            {projectName ? `${projectName} · ` : ''}
            准备本版计划、验收两棵固定工作树，并进入现有计划屏。不预建目标和任务树，不启动
            agent；验收材料在明确依据后准备。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {!locked ? (
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
          ) : null}
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          {report ? (
            <div className="flex flex-col gap-1 rounded-md border border-border/50 p-3 text-[12px]">
              <p className="font-medium">
                版本 {report.version} 准备结果（步骤链非原子，失败保留已成功结果）：
              </p>
              <p>{stepText(report, 'plan')}</p>
              <p>{stepText(report, 'acceptance')}</p>
              {report.problems.map((problem) => (
                <p key={`${problem.workflow}:${problem.code}`} className="text-destructive">
                  {WORKFLOW_TREE_LABELS[problem.workflow]}问题（{problem.code}）：{problem.message}
                </p>
              ))}
              {reportFailed ? (
                <p className="text-muted-foreground">
                  重试即重入同一准备流程，按宿主真实登记补齐缺失步骤；不会重复建树。
                </p>
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
                  准备中…
                </>
              ) : reportFailed ? (
                <>
                  <Plus className="size-3.5" />
                  重试补齐
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  创建并进入计划
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
