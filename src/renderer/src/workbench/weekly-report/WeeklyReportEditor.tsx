import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  weeklyReportTemplate,
  type WeeklyReportSection
} from '../../../../shared/workbench/weekly-report'
import type { WeeklyReportRecord } from './report-port'

export function WeeklyReportEditor({
  base,
  onClose,
  onSave
}: {
  base: WeeklyReportRecord | null
  onClose(): void
  onSave(section: WeeklyReportSection, text: string, mode: 'append' | 'correct'): Promise<void>
}) {
  const [section, setSection] = useState<WeeklyReportSection>('goals')
  const [text, setText] = useState(base?.document.manual.goals?.text ?? '')
  const [mode, setMode] = useState<'append' | 'correct'>(
    base?.document.manual.goals?.mode ?? 'append'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onSave(section, text, mode)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogTitle>补充或修正</DialogTitle>
        <DialogDescription className="sr-only">保存为当前周期的新版本。</DialogDescription>
        <label>
          栏目
          <select
            value={section}
            disabled={busy}
            onChange={(event) => {
              const key = weeklyReportTemplate.find((item) => item.key === event.target.value)?.key
              if (!key) {
                return
              }
              setSection(key)
              setText(base?.document.manual[key]?.text ?? '')
              setMode(base?.document.manual[key]?.mode ?? 'append')
            }}
          >
            {weeklyReportTemplate.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          方式
          <select
            value={mode}
            disabled={busy}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'append' || value === 'correct') {
                setMode(value)
              }
            }}
          >
            <option value="append">补充</option>
            <option value="correct">修正本栏内容</option>
          </select>
        </label>
        <textarea
          aria-label="补充或修正内容"
          rows={8}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <div className="wb-weekly-actions">
          <button type="button" className="wb-btn" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
