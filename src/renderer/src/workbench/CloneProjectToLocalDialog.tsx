import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getDefaultCloneParent } from '@/components/sidebar/clone-defaults'
import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import { cloneDisplayName, cloneableSlots, planCloneTargets, type CloneTarget } from './clone-to-local-plan'
import {
  cloneProjectReposToLocal,
  switchToClonedProject,
  type CloneStepPhase,
  type CloneToLocalResult
} from './clone-project-to-local'
import type { WallCardView } from './ProjectWallCard'

type SlotStep = { phase: CloneStepPhase; detail?: string }

const STEP_LABEL: Record<CloneStepPhase, string> = {
  cloning: '克隆中…',
  registering: '登记中…',
  done: '已克隆',
  failed: '失败'
}

/**
 * 「克隆到本机」轻确认框：把只注册在 Builder 主机的代码仓克隆到本机，
 * 登记成本机项目的一部分（项目组 / 单仓工作树基址 / 刷新工作树）。
 *
 * 落点默认复用 Orca 工作区默认父目录（`getDefaultCloneParent`，克隆落在 Orca
 * workspaces 树旁边）；取不到就留空并要求用户先选目录——不猜路径。
 */
export function CloneProjectToLocalDialog({
  card,
  initialRepoIds,
  onClose,
  onCloned
}: {
  card: WallCardView
  /** 打开时预选的槽（卡片级=全部待克隆仓；槽级=那一个仓）。 */
  initialRepoIds: readonly string[]
  onClose: () => void
  /** 克隆收尾后刷新整面墙（仓库目录 + 工作树 + 名片判据）。 */
  onCloned: () => Promise<void>
}): React.JSX.Element {
  const workspaceDir = useAppStore((s) => s.settings?.workspaceDir ?? '')
  const [parent, setParent] = useState(() => getDefaultCloneParent(workspaceDir))
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(initialRepoIds))
  const [frozen, setFrozen] = useState<CloneTarget[] | null>(null)
  const [steps, setSteps] = useState<Record<string, SlotStep>>({})
  const [progress, setProgress] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CloneToLocalResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Why: 配置项是按会话读到的，晚到的设置要把默认父目录补上（用户改过就不动）。
  const [parentTouched, setParentTouched] = useState(false)
  useEffect(() => {
    if (!parentTouched && !running) {
      setParent(getDefaultCloneParent(workspaceDir))
    }
  }, [workspaceDir, parentTouched, running])

  useEffect(() => {
    if (!running) {
      return undefined
    }
    return window.api.repos.onCloneProgress((event) => setProgress(event.percent))
  }, [running])

  const targets = useMemo(
    () => planCloneTargets(cloneableSlots(card.project.slots), parent),
    [card.project.slots, parent]
  )
  const listed = frozen ?? targets
  const selected = frozen ?? targets.filter((target) => checked.has(target.slot.repoId))
  const selectedCount = selected.length
  const parentMissing = parent.trim().length === 0

  const pickParent = async (): Promise<void> => {
    const dir = await window.api.repos.pickDirectory()
    if (!dir) {
      return
    }
    try {
      await authorizeWorkbenchLocalPath(dir)
    } catch {
      // 授权失败仍允许选择：克隆时还会再校验一次，错误在克隆阶段如实报出。
    }
    setParent(dir)
    setParentTouched(true)
    setError(null)
  }

  const run = async (): Promise<void> => {
    if (running || selectedCount === 0 || parentMissing) {
      return
    }
    // 冻结本次要克隆的清单：克隆过程中墙上的槽会变成「本机已注册」，列表不能跟着跳。
    setFrozen(selected)
    setSteps({})
    setProgress(null)
    setResult(null)
    setError(null)
    setRunning(true)
    try {
      const outcome = await cloneProjectReposToLocal({
        project: card.project,
        targets: selected,
        onStep: (repoId, phase, detail) => {
          // 进度条属于「当前正在克隆的那一个仓」，换仓要清掉上一个的百分比。
          if (phase === 'cloning') {
            setProgress(null)
          }
          setSteps((prev) => ({ ...prev, [repoId]: { phase, detail } }))
        }
      })
      setResult(outcome)
      if (outcome.error) {
        setError(outcome.error)
      }
      if (outcome.clonedRepoIds.length === 0) {
        if (!outcome.error) {
          toast.error('没有代码仓克隆成功，原因逐条列在对话框里')
        }
        return
      }
      await onCloned()
      const failed = outcome.outcomes.filter((item) => !item.ok).length
      if (outcome.allSucceeded) {
        toast.success(`已克隆 ${outcome.clonedRepoIds.length} 个代码仓到本机并挂入项目`)
        onClose()
        await switchToClonedProject(outcome)
        return
      }
      toast.error(`克隆完成：成功 ${outcome.clonedRepoIds.length} 个，失败 ${failed} 个`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const close = (): void => {
    if (running) {
      return
    }
    onClose()
  }

  return (
    <div
      className="wb-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <section
        className="wb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-clone-local-title"
        data-workbench-clone-local-dialog
      >
        <div className="wb-dialog-head">
          <h2 id="wb-clone-local-title">克隆到本机</h2>
          <button type="button" className="wb-btn wb-btn-ghost" aria-label="关闭" onClick={close}>
            ×
          </button>
        </div>
        <p className="wb-dialog-description">
          把「{card.displayName}」里只注册在 Builder
          主机的代码仓，按已有远端地址克隆到本机；克隆完自动登记成本机项目的一部分，可在本机
          agent 上打开。不删除任何远端内容。
        </p>

        <div className="wb-dialog-section">
          <span className="wb-dialog-label">克隆到</span>
          <div className="wb-clone-parent">
            <span className={`wb-clone-parent-path${parentMissing ? ' is-missing' : ''}`}>
              {parentMissing ? '未设置工作区目录——请先选一个父目录' : parent}
            </span>
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              disabled={running}
              onClick={() => void pickParent()}
              data-workbench-clone-pick-parent
            >
              更改文件夹
            </button>
          </div>
          <p className="wb-dialog-hint">
            默认取 Orca 工作区的上一层目录（克隆落在 Orca workspaces 树旁边）。每个仓克隆到
            该目录下以仓名命名的子文件夹。
          </p>
        </div>

        {listed.length > 0 ? (
          <div className="wb-dialog-section">
            <span className="wb-dialog-label">将克隆的代码仓</span>
            <div className="wb-import-hosts">
              {listed.map((target) => {
                const step = steps[target.slot.repoId]
                const disabled = running || frozen !== null
                return (
                  <label
                    key={target.slot.repoId}
                    className="wb-import-host"
                    data-workbench-clone-target={target.slot.repoId}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.some((item) => item.slot.repoId === target.slot.repoId)}
                      onChange={(event) => {
                        setChecked((prev) => {
                          const next = new Set(prev)
                          if (event.target.checked) {
                            next.add(target.slot.repoId)
                          } else {
                            next.delete(target.slot.repoId)
                          }
                          return next
                        })
                      }}
                    />
                    <span className="wb-import-copy">
                      <strong>{cloneDisplayName(target.slot)}</strong>
                      <span>{target.slot.remoteUrl}</span>
                      <span className="wb-clone-target">
                        将克隆到 {target.targetPath || '—（先选父目录）'}
                      </span>
                      {step?.phase === 'failed' ? (
                        <span className="wb-import-failure" role="alert">
                          克隆没成：{step.detail}
                        </span>
                      ) : null}
                    </span>
                    {step ? (
                      <span
                        className={`wb-tag ${
                          step.phase === 'failed'
                            ? 'wb-tag-danger'
                            : step.phase === 'done'
                              ? 'wb-tag-success'
                              : 'wb-tag-neutral'
                        }`}
                      >
                        {step.phase === 'cloning' && progress !== null
                          ? `克隆中 ${progress}%`
                          : STEP_LABEL[step.phase]}
                      </span>
                    ) : null}
                  </label>
                )
              })}
            </div>
            {running ? (
              <p className="wb-dialog-hint" role="status">
                正在逐个克隆；单个仓失败不会中断其余。
              </p>
            ) : null}
          </div>
        ) : (
          <p className="wb-dialog-hint">
            这个项目里没有待克隆的代码仓——每个仓都已经在本机注册，或没带远端地址。
          </p>
        )}

        {error ? (
          <p className="wb-import-error" role="alert">
            {error}
          </p>
        ) : null}
        {result && !error && !result.allSucceeded ? (
          <p className="wb-dialog-hint" role="status">
            成功 {result.clonedRepoIds.length} 个 · 失败{' '}
            {result.outcomes.filter((item) => !item.ok).length} 个。失败的仓原因见上；本机已有的仓不受影响。
          </p>
        ) : null}

        <div className="wb-dialog-actions">
          <button type="button" className="wb-btn wb-btn-ghost" onClick={close} disabled={running}>
            {result ? '完成' : '取消'}
          </button>
          {result && !result.allSucceeded && result.clonedRepoIds.length > 0 ? (
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              disabled={running}
              onClick={() => {
                const failed = result
                onClose()
                void switchToClonedProject(failed)
              }}
              data-workbench-clone-open-overview
            >
              切到项目总览
            </button>
          ) : null}
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={running || result !== null || selectedCount === 0 || parentMissing}
            onClick={() => void run()}
            data-workbench-clone-confirm
          >
            {running
              ? `克隆中 ${progress ?? 0}%`
              : parentMissing
                ? '先选父目录'
                : result
                  ? '已克隆'
                  : `克隆 ${selectedCount} 个仓到本机`}
          </button>
        </div>
      </section>
    </div>
  )
}
