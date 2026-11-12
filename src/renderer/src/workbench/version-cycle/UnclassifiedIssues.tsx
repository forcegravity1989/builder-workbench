import { ChevronDown, ChevronRight, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import type { VersionTaskReference } from '../../../../shared/workbench/version-material'
import type { CycleTaskRead, CycleTaskSnapshot } from './ports'
import './unclassified-issues.css'

function readKey(reference: VersionTaskReference): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

/**
 * Label members whose title has no goal token still belong to the version, so
 * they land here instead of silently disappearing. Collapsed by default and
 * hidden entirely when empty; no assignment action — fixing the title is the
 * only source-of-truth edit, and the tooltip says so.
 */
export function UnclassifiedIssues({
  rows,
  reads,
  version,
  onTask
}: {
  rows: VersionTaskReference[]
  reads: Map<string, CycleTaskRead> | null
  version: string
  onTask(task: CycleTaskSnapshot): Promise<void>
}) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) {
    return null
  }
  return (
    <div className={`g3-unclassified${open ? ' open' : ''}`}>
      <div className="g3-unclassified-head">
        <button
          type="button"
          className="g3-unclassified-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
          <strong>未归类 Issue</strong>
          <span className="g3-unclassified-count">{rows.length}</span>
        </button>
        <span
          className="g3-unclassified-help"
          title={`本版已纳入、但标题未标注目标的 Issue；改标题补【${version}|目标】即可归位。`}
        >
          <CircleHelp size={13} aria-hidden="true" />
        </span>
      </div>
      {open && (
        <div className="version-unclassified-rows">
          {rows.map((reference) => {
            const read = reads?.get(readKey(reference))
            const ready = read?.kind === 'ready' ? read.task : null
            return (
              <div className="version-unclassified-row" key={readKey(reference)}>
                <a
                  href={ready?.url}
                  onClick={(event) => {
                    if (!ready) {
                      event.preventDefault()
                      return
                    }
                    event.preventDefault()
                    void onTask(ready)
                  }}
                >
                  <span className="g3-id">#{reference.number}</span>
                  {ready?.title ?? '标题未读到'}
                </a>
                <span className="version-unclassified-state">{ready?.state ?? '状态未知'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
