import { useEffect, useRef, useState } from 'react'
import type { VersionMigrationPreview } from '../../../../shared/workbench/version-material-migration'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { nativeVersionMaterialPort } from '../version-material-port'

export function PlanningMigration({
  port,
  versions,
  onMigrated
}: {
  port: ReturnType<typeof nativeVersionMaterialPort>
  versions: VersionMaterialCandidate[]
  onMigrated(version: string): Promise<void>
}) {
  const [preview, setPreview] = useState<VersionMigrationPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const prepare = async (version: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await port.previewMigration(version, crypto.randomUUID())
      if (mounted.current) {
        setPreview(result)
      }
    } catch (reason) {
      if (mounted.current) {
        setError(String(reason))
      }
    } finally {
      if (mounted.current) {
        setBusy(false)
      }
    }
  }
  const migrate = async () => {
    if (!preview) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await port.migrate(preview.plan.version, preview.plan.cycleId, preview.sourceRevision)
      if (mounted.current) {
        setPreview(null)
        await onMigrated(preview.plan.version)
      }
    } catch (reason) {
      if (mounted.current) {
        setError(String(reason))
      }
    } finally {
      if (mounted.current) {
        setBusy(false)
      }
    }
  }
  const candidates = versions.filter((item) => item.state === 'migration-required')
  if (!candidates.length && !preview) {
    return null
  }
  return (
    <div className="vp-migration">
      {candidates.map((item) => (
        <div className="vp-inline" key={item.version}>
          <span>{item.version} · 旧版材料</span>
          <button
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={busy}
            onClick={() => void prepare(item.version)}
          >
            预览迁移
          </button>
        </div>
      ))}
      {error && !preview && <p role="alert">{error}</p>}
      {preview && (
        <div className="vp-modal-backdrop">
          <section role="dialog" aria-modal="true" aria-label="确认旧材料迁移" className="vp-modal">
            <header>
              <h2>{preview.plan.version} · 确认迁移</h2>
              <button className="wb-btn wb-btn-sm" disabled={busy} onClick={() => setPreview(null)}>
                取消
              </button>
            </header>
            <div className="vp-migration-preview">
              <p>
                确认后保存以下计划，并完整保留原文件为 <code>{preview.backupName}</code>。
              </p>
              <h3>计划进展</h3>
              <p>{preview.plan.summary.progress || '未填写'}</p>
              <h3>版本目标</h3>
              {preview.plan.goals.map((goal) => (
                <div key={goal.goalId}>
                  <strong>{goal.title || '未填写标题'}</strong>
                  <p>{goal.acceptance || '未填写验收约定'}</p>
                </div>
              ))}
              <p>可识别任务：{preview.plan.tasks.length} 项。</p>
              <h3>旧结果的去向</h3>
              <p>
                {preview.results.length} 项旧结果保留为待核材料
                {preview.previousVersion
                  ? `，所属版本：${preview.previousVersion}`
                  : '，尚未明确所属版本'}
                。需在验收会话中核对该版本的真实计划，才能导入。
              </p>
              <ul>
                {preview.warnings.map((warning, index) => (
                  <li key={`${index}:${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
            {error && <p role="alert">{error}</p>}
            <button
              className="wb-btn wb-btn-primary"
              disabled={busy}
              onClick={() => void migrate()}
            >
              {busy ? '正在处理…' : '确认迁移并保留原件'}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
