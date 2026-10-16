import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { nativeWorkspaceScopeKey, ensureNamedWorktree } from '../version-cycle/native-workspace'
import { useMetricsSetupAgent } from '../version-cycle/metrics-setup'
import type {
  WeeklyReportDocument,
  WeeklyReportSection
} from '../../../../shared/workbench/weekly-report'
import { WeeklyReportContent, exportWeeklyReportHtml } from './WeeklyReportContent'
import {
  saveWeeklyReport,
  listWeeklyReports,
  WeeklyReportConflictError,
  type WeeklyReportRecord
} from './report-port'
import {
  WEEKLY_REPORT_BRANCH,
  assertWeeklyReportOwner,
  prepareWeeklyReportSession,
  weeklyReportFileContext
} from './native-weekly-report-session'
import { useWeeklyReportFiles, assertWeeklyReportRepository } from './use-weekly-report-files'
import { useWeeklyReportView, weekEndExclusive } from './weekly-report-view-state'
import { useWeeklyReportWorkspace } from './use-weekly-report-workspace'
import { WeeklyReportEditor } from './WeeklyReportEditor'
import './weekly-report-page.css'

export function WeeklyReportPage() {
  const { repoId, workspace, base, repo, repository } = useWeeklyReportWorkspace()
  const identity = JSON.stringify([
    workspace.scope ? nativeWorkspaceScopeKey(workspace.scope) : (repoId ?? 'none'),
    repository,
    base?.path
  ])
  const activeIdentity = useRef(identity)
  activeIdentity.current = identity
  const [view, setView] = useWeeklyReportView(identity)
  const end = weekEndExclusive(view.start)
  const files = useWeeklyReportFiles(identity, workspace.tree, repository)
  const records = useMemo(
    () =>
      files.records
        .filter((record) => record.document.period.start === view.start)
        .sort(
          (left, right) =>
            Date.parse(right.document.generatedAt) - Date.parse(left.document.generatedAt) ||
            right.relativePath.localeCompare(left.relativePath)
        ),
    [files.records, view.start]
  )
  const latest = records[0] ?? null
  const selected = records.find((record) => record.relativePath === view.selected) ?? latest
  const projectName = selected?.document.project.name ?? repo?.displayName ?? '项目'
  const displayedEnd = new Date(
    Date.parse(`${selected?.document.period.endExclusive ?? end}T00:00:00Z`) - 86_400_000
  )
    .toISOString()
    .slice(0, 10)
  const agent = useMetricsSetupAgent(base?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<{
    identity: string
    start: string
    base: WeeklyReportRecord | null
  } | null>(null)

  async function update() {
    setNotice(null)
    setBusy(true)
    try {
      if (!workspace.scope) {
        throw new Error('项目工作区尚未就绪')
      }
      if (!repository) {
        throw new Error('项目仓库来源尚未就绪')
      }
      if (!agent) {
        throw new Error('未检测到可用会话工具，请先在设置中配置')
      }
      await prepareWeeklyReportSession({
        scope: workspace.scope,
        agent,
        projectName,
        repository,
        periodStart: view.start,
        periodEndExclusive: latest?.document.period.endExclusive ?? end,
        timezone: 'Asia/Shanghai'
      })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setNotice(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function saveManual(
    section: WeeklyReportSection,
    text: string,
    mode: 'append' | 'correct'
  ) {
    if (
      !editor ||
      !workspace.scope ||
      editor.identity !== identity ||
      editor.start !== view.start
    ) {
      throw new Error('项目或周期已改变，请重新打开补充面板')
    }
    const requestedIdentity = identity
    assertWeeklyReportOwner(workspace.scope)
    const tree =
      workspace.tree ??
      (await ensureNamedWorktree(workspace.scope, WEEKLY_REPORT_BRANCH, 'weekly-report'))
    if (activeIdentity.current !== requestedIdentity) {
      throw new Error('项目已改变，请重新核对后保存')
    }
    assertWeeklyReportOwner(workspace.scope, tree.id)
    const document: WeeklyReportDocument = editor.base?.document ?? {
      schemaVersion: 1,
      project: { name: projectName, repository },
      period: { start: view.start, endExclusive: end, timezone: 'Asia/Shanghai' },
      version: null,
      generatedAt: new Date().toISOString(),
      sections: {
        goals: [],
        progress: [],
        risks: [],
        milestones: [],
        requirements: [],
        problems: [],
        members: []
      },
      sources: [],
      manual: {}
    }
    const manual = { ...document.manual }
    if (text.trim()) {
      manual[section] = { text: text.trim(), mode }
    } else {
      delete manual[section]
    }
    try {
      await saveWeeklyReport(
        weeklyReportFileContext(tree),
        { ...document, manual, generatedAt: new Date().toISOString() },
        editor.base?.raw ?? null
      )
    } catch (reason) {
      if (reason instanceof WeeklyReportConflictError) {
        const fresh = await listWeeklyReports(weeklyReportFileContext(tree))
        assertWeeklyReportRepository(fresh, repository)
        const nextBase =
          fresh.findLast((record) => record.document.period.start === editor.start) ?? null
        if (activeIdentity.current === requestedIdentity) {
          setEditor((previous) =>
            previous?.identity === requestedIdentity && previous.start === editor.start
              ? { ...previous, base: nextBase }
              : previous
          )
          await files.reload(tree)
        }
        throw new Error('周报已更新，已读取最新内容，请核对后再次保存')
      }
      throw reason
    }
    if (activeIdentity.current === requestedIdentity) {
      setView({ selected: null })
      await files.reload(tree)
    }
  }

  async function exportReport() {
    if (!selected) {
      return
    }
    try {
      await window.api.fs.saveDownloadedFile({
        suggestedName: `${selected.document.project.name}-周报-${selected.document.period.start}.html`,
        content: exportWeeklyReportHtml(selected.document),
        encoding: 'utf8'
      })
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className="wb-weekly-page">
      <header className="page-head">
        <h1>项目周报</h1>
      </header>
      <main className="wb-weekly-body">
        <div className="wb-weekly-controls">
          <label>
            周期{' '}
            <input
              type="date"
              aria-label="周报开始日期"
              value={view.start}
              disabled={busy}
              onChange={(event) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) {
                  setView({ start: event.target.value, selected: null })
                  setNotice(null)
                  setEditor(null)
                }
              }}
            />
          </label>
          <span>至 {displayedEnd}</span>
          <label>
            版本{' '}
            <select
              aria-label="周报版本"
              value={selected?.relativePath ?? ''}
              disabled={files.busy || !records.length}
              onChange={(event) =>
                setView({
                  selected: event.target.value === latest?.relativePath ? null : event.target.value
                })
              }
            >
              {!records.length && <option value="">当前</option>}
              {records.map((record, index) => (
                <option key={record.relativePath} value={record.relativePath}>
                  {index === 0 ? '当前' : `第 ${records.length - index} 版`}
                </option>
              ))}
            </select>
          </label>
          <div className="wb-weekly-actions">
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              disabled={busy || files.busy || !repo}
              onClick={() => void update()}
            >
              {busy ? '准备中…' : '更新周报'}
            </button>
            <button
              type="button"
              className="wb-btn"
              disabled={busy || files.busy || !workspace.scope}
              onClick={() => setEditor({ identity, start: view.start, base: latest })}
            >
              补充或修正
            </button>
            <button
              type="button"
              className="wb-btn"
              disabled={!selected}
              onClick={() => void exportReport()}
            >
              导出
            </button>
          </div>
        </div>
        {(notice || workspace.error || files.error) && (
          <p role="alert" className="wb-weekly-error">
            {notice ?? workspace.error ?? files.error}{' '}
            <button type="button" className="wb-btn" onClick={() => void files.reload()}>
              重新读取
            </button>
          </p>
        )}
        <WeeklyReportContent document={selected?.document ?? null} projectName={projectName} />
      </main>
      {editor && editor.identity === identity && editor.start === view.start && (
        <WeeklyReportEditor
          key={`${identity}:${view.start}`}
          base={editor.base}
          onClose={() => setEditor(null)}
          onSave={saveManual}
        />
      )}
    </div>
  )
}
