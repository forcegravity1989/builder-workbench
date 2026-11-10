import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { FilePenLine, Info, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSettingsReview } from './ProjectSettingsReview'
import { CHARTER_LABELS, useProjectSettings } from './use-project-settings'
import { EDITABLE_CHARTER_FIELDS } from '../../../shared/workbench/project-charter-edit'
import './project-settings.css'

export function ProjectSettingsRail({
  repo,
  rows,
  displayName,
  onClose,
  onDirtyChange,
  onBusyChange,
  onChanged,
  discardRef
}: {
  repo: Repo
  rows?: readonly Repo[]
  displayName: string
  onClose(): void
  onDirtyChange(dirty: boolean): void
  onBusyChange(busy: boolean): void
  onChanged(): void
  discardRef: RefObject<(() => void) | null>
}) {
  const model = useProjectSettings(repo, onChanged)
  const [editing, setEditing] = useState(false)
  const [savingType, setSavingType] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const projectRows = useMemo(() => rows ?? [repo], [rows, repo])
  const ownRows = projectRows.filter(
    (row) => parseExecutionHostId(getRepoExecutionHostId(row))?.kind !== 'runtime'
  )
  const typeRows = ownRows.length ? ownRows : projectRows
  const visibility = typeRows.every((row) => row.projectVisibility === 'team') ? 'team' : 'personal'
  useEffect(() => {
    discardRef.current = model.discard
    return () => {
      discardRef.current = null
    }
  }, [discardRef, model.discard])
  useEffect(() => {
    onDirtyChange(model.dirty)
  }, [model.dirty, onDirtyChange])
  useEffect(() => {
    onBusyChange(model.busy || savingType)
  }, [model.busy, savingType, onBusyChange])
  useEffect(
    () => () => {
      onDirtyChange(false)
      onBusyChange(false)
    },
    [onDirtyChange, onBusyChange]
  )
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('[data-close-config]')?.focus()
  }, [])
  const blocked = model.loading || !model.canEdit || Boolean(model.pending || model.merged)
  const changeType = async (value: string) => {
    if (!ownRows.length || savingType || (value !== 'personal' && value !== 'team')) {
      return
    }
    setSavingType(true)
    try {
      for (const row of ownRows) {
        const updated = await useAppStore
          .getState()
          .updateRepo(row.id, { projectVisibility: value }, { hostId: getRepoExecutionHostId(row) })
        if (!updated) {
          throw new Error('未能保存项目类型，请刷新项目墙后重试')
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingType(false)
    }
  }
  return (
    <aside
      ref={panel}
      className="wb-project-settings"
      aria-label={`${displayName} 项目设置`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="wb-config-header">
        <div>
          <span className="wb-config-eyebrow">项目设置</span>
          <h2>{displayName}</h2>
        </div>
        <WorkbenchIconButton
          data-close-config
          label="关闭项目设置"
          icon={X}
          onClick={onClose}
          disabled={model.busy || savingType}
        />
      </header>
      <div className="wb-config-scroll">
        <div className="wb-config-type">
          <label htmlFor="project-visibility">项目类型</label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="项目类型说明">
                <Info size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              个人项目不显示在其他客户端的共享项目墙。此设置保存在项目所属主机，不提交评审。
            </TooltipContent>
          </Tooltip>
          <Select
            value={visibility}
            onValueChange={(value) => void changeType(value)}
            disabled={!ownRows.length || savingType}
          >
            <SelectTrigger id="project-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">个人项目</SelectItem>
              <SelectItem value="team">团队项目</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {repo.kind !== 'folder' && (
          <section className="wb-config-section">
            <header className="wb-config-info-heading">
              <h3>项目信息</h3>
              <WorkbenchIconButton
                label={editing ? '收起编辑' : '编辑项目信息'}
                icon={FilePenLine}
                disabled={blocked || model.busy}
                onClick={() => setEditing(!editing)}
              />
            </header>
            <div className="wb-config-body">
              {model.loading ? (
                <p role="status">正在读取项目信息…</p>
              ) : (
                model.form &&
                (editing ? (
                  <div className="wb-config-fields">
                    {EDITABLE_CHARTER_FIELDS.map((field) => (
                      <label key={field} htmlFor={`config-${field}`}>
                        <span>
                          {CHARTER_LABELS[field]}
                          {field === 'name' ? ' *' : ''}
                        </span>
                        {field === 'brief' || field === 'opportunity' ? (
                          <textarea
                            id={`config-${field}`}
                            value={model.form!.value[field] ?? ''}
                            onChange={(event) => model.edit(field, event.target.value)}
                            disabled={model.busy || blocked}
                          />
                        ) : (
                          <input
                            id={`config-${field}`}
                            value={model.form!.value[field] ?? ''}
                            onChange={(event) => model.edit(field, event.target.value)}
                            required={field === 'name'}
                            aria-invalid={field === 'name' && !model.form!.value.name.trim()}
                            disabled={model.busy || blocked}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                ) : (
                  <dl className="wb-config-facts">
                    {EDITABLE_CHARTER_FIELDS.map((field) => (
                      <div key={field}>
                        <dt>{CHARTER_LABELS[field]}</dt>
                        <dd>{model.form!.value[field] || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                ))
              )}
            </div>
          </section>
        )}
      </div>
      {(model.dirty || model.pending || model.merged) && (
        <footer className="wb-config-footer">
          {model.pending ? (
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              disabled={!model.status?.pr?.url}
              onClick={() => void window.api.shell.openUrl(model.status!.pr!.url!)}
            >
              查看评审
            </button>
          ) : model.merged ? (
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              disabled={model.busy}
              onClick={() => void model.update()}
            >
              {model.busy ? '更新中…' : '更新项目信息'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="wb-btn wb-btn-ghost"
                disabled={model.busy}
                onClick={model.discard}
              >
                撤销修改
              </button>
              <ProjectSettingsReview model={model} onSubmitted={() => setEditing(false)} />
            </>
          )}
        </footer>
      )}
    </aside>
  )
}
