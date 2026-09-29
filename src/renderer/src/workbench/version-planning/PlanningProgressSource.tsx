import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type {
  PlanningMaterial,
  PlanningProgressSource as ProgressSource
} from '../../../../shared/workbench/version-material'
import type { VersionHistoryCatalog } from '../../../../shared/workbench/version-history'
import type { CycleScope } from '../version-cycle/ports'
import { nativeVersionHistoryPort } from '../version-history-port'
import { readPlanningProgressSource } from './planning-progress-source'

type Props = {
  scope: CycleScope | null
  worktreeId: string | null
  plan: PlanningMaterial
  disabled: boolean
  onSource(source: ProgressSource): void
}
type Preview = Awaited<ReturnType<typeof readPlanningProgressSource>>

export function PlanningProgressSource(props: Props) {
  const key = JSON.stringify([
    props.scope,
    props.worktreeId,
    props.plan.version,
    props.plan.cycleId,
    props.plan.summary.progressSource
  ])
  return <ProgressSourceContent key={key} {...props} />
}

function ProgressSourceContent({ scope, worktreeId, plan, disabled, onSource }: Props) {
  const history = useMemo(
    () => nativeVersionHistoryPort(scope?.runtimeOwnerEnvironmentId),
    [scope?.runtimeOwnerEnvironmentId]
  )
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<VersionHistoryCatalog | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const request = useRef(0)
  useEffect(
    () => () => {
      request.current++
    },
    []
  )
  const source = plan.summary.progressSource
  const read = async (selected?: ProgressSource) => {
    if (!scope || !worktreeId) {
      return
    }
    const token = ++request.current
    const metricScope = { repoId: scope.repoId, hostId: scope.hostId, worktreeId }
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      if (selected) {
        const result = await readPlanningProgressSource(history, metricScope, selected)
        if (request.current === token) {
          setPreview(result)
        }
      } else {
        const result = await history.list({ scope: metricScope })
        if (request.current === token) {
          setCatalog(result)
        }
      }
    } catch (reason) {
      if (request.current === token) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (request.current === token) {
        setBusy(false)
      }
    }
  }
  const close = () => {
    request.current++
    setOpen(false)
    setCatalog(null)
    setPreview(null)
    setError(null)
    setBusy(false)
  }
  const records = catalog?.records.filter((item) => item.workflow === 'acceptance') ?? []
  const problems = catalog?.problems.filter((item) => item.workflow === 'acceptance') ?? []
  const sameSource =
    preview &&
    source &&
    ['version', 'cycleId', 'sourceCommit', 'revision'].every(
      (key) => preview.source[key as keyof ProgressSource] === source[key as keyof ProgressSource]
    )
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close()
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={!scope || !worktreeId}
          onClick={() => {
            setOpen(true)
            void read(source)
          }}
        >
          上版验收 <ChevronRight size={14} />
        </button>
      </DialogTrigger>
      {open && (
        <DialogContent
          className="vp-modal"
          overlayClassName="vp-dialog-overlay"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <header>
            <DialogTitle>上版验收</DialogTitle>
            <button className="wb-btn wb-btn-secondary wb-btn-sm" onClick={close}>
              关闭
            </button>
          </header>
          {!catalog && source && (
            <p className="vp-inline">
              来源 {source.version} · {source.sourceCommit.slice(0, 12)}
              {!disabled && (
                <button
                  className="wb-btn wb-btn-secondary wb-btn-sm"
                  disabled={busy}
                  onClick={() => void read()}
                >
                  选择其他记录
                </button>
              )}
            </p>
          )}
          {catalog && (
            <>
              <p>选择本次进展依据的验收记录；选择来源不会覆盖已写的进展。</p>
              {records.length > 0 ? (
                <select
                  aria-label="进展来源验收记录"
                  defaultValue=""
                  disabled={busy}
                  onChange={(event) => {
                    const record = records[Number(event.target.value)]
                    if (record) {
                      void read({
                        version: record.version,
                        cycleId: record.cycleId,
                        sourceCommit: record.sourceCommit,
                        revision: record.revision
                      })
                    }
                  }}
                >
                  <option value="" disabled>
                    选择已归档验收
                  </option>
                  {records.map((record, index) => (
                    <option
                      key={`${record.sourceCommit}:${record.cycleId}:${record.version}`}
                      value={index}
                    >
                      {record.version} · {record.cycleId} · {record.committedAt} ·{' '}
                      {record.sourceCommit.slice(0, 12)}
                    </option>
                  ))}
                </select>
              ) : (
                <p>暂无可核验的已归档验收记录。可先在会话中核对来源，当前进展保留。</p>
              )}
              {problems.length > 0 && (
                <details>
                  <summary>{problems.length} 条验收记录无法核对</summary>
                  {problems.map((problem) => (
                    <p key={`${problem.sourceCommit}:${problem.version}`}>
                      {problem.version} · {problem.sourceCommit.slice(0, 12)}：{problem.message}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {busy && <p role="status">正在读取固定验收来源…</p>}
          {error && <p role="alert">{error}</p>}
          {preview && (
            <>
              <p className="vp-muted">
                {preview.source.version} · {preview.source.sourceCommit.slice(0, 12)} ·
                由固定材料派生的只读纪要
              </p>
              <pre>{preview.markdown}</pre>
              <details>
                <summary>原始验收材料</summary>
                <pre>{preview.original}</pre>
              </details>
              {!disabled && !sameSource && (
                <button
                  className="wb-btn wb-btn-secondary"
                  onClick={() => {
                    onSource(preview.source)
                    close()
                  }}
                >
                  作为进展来源
                </button>
              )}
            </>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
