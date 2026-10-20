import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  ChevronDown,
  ExternalLink,
  FilePenLine,
  FolderGit2,
  IdCard,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Unlink,
  X
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ProjectSettingsReview } from './ProjectSettingsReview'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { WallCardView } from './ProjectWallCard'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSourceTag } from './ProjectSourceTag'
import { CHARTER_LABELS, useProjectSettings } from './use-project-settings'
import { EDITABLE_CHARTER_FIELDS } from '../../../shared/workbench/project-charter-edit'
import './project-settings.css'

function Section({
  name,
  icon,
  summary,
  initialOpen = false,
  children
}: {
  name: string
  icon: ReactNode
  summary: string
  initialOpen?: boolean
  children: ReactNode
}) {
  return (
    <Collapsible defaultOpen={initialOpen} className="wb-config-section">
      <CollapsibleTrigger className="wb-config-toggle">
        {icon}
        <span>{name}</span>
        <span className="wb-config-summary">{summary}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="wb-config-body">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function ProjectSettingsRail({
  card,
  onClose,
  onDirtyChange,
  onBusyChange,
  onChanged,
  onAddRepo,
  onRemoveRepo,
  busyRepoId,
  leave,
  discardRef
}: {
  card: WallCardView
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
  onChanged: () => void
  onAddRepo: () => void
  onRemoveRepo: (repoId: string) => void
  busyRepoId: string | null
  leave: (action: () => void) => void
  discardRef: RefObject<(() => void) | null>
}) {
  const repo = card.primaryRepo!
  const model = useProjectSettings(repo, onChanged)
  const [editing, setEditing] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const panel = useRef<HTMLElement>(null)
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
    onBusyChange(model.busy)
  }, [model.busy, onBusyChange])
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('[data-close-config]')?.focus()
  }, [])
  const openSettings = (pane: 'repo' | 'servers', repoId: string | null = null) =>
    leave(() => {
      const state = useAppStore.getState()
      state.openSettingsTarget({ pane, repoId, hostId: getRepoExecutionHostId(repo) })
      state.openSettingsPage()
    })
  const blocked = model.loading || !model.canEdit || Boolean(model.pending || model.merged)
  const summary = model.loading
    ? '读取中…'
    : model.dirty
      ? `${model.changes.length} 项待提交`
      : model.error && !model.form
        ? '读取失败'
        : `${EDITABLE_CHARTER_FIELDS.filter((field) => model.form?.value[field].trim()).length} 项已填写`
  return (
    <aside
      ref={panel}
      className="wb-project-settings"
      aria-label={`${card.displayName} 项目配置`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !reviewing) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="wb-config-header">
        <div>
          <span className="wb-config-eyebrow">项目配置</span>
          <h2>{card.displayName}</h2>
        </div>
        <WorkbenchIconButton
          data-close-config
          label="关闭项目配置"
          icon={X}
          onClick={onClose}
          disabled={model.busy}
        />
      </header>
      <div className="wb-config-scroll">
        {model.status?.pr ? (
          <div className="wb-config-pr" role="status">
            <span>
              {model.pending ? '名片待合入' : model.merged ? '已合入，待更新代码' : '名片 PR'} · #
              {model.status.pr.number}
            </span>
            {model.status.pr.url ? (
              <WorkbenchIconButton
                label={`查看名片 ${model.status.pr.provider === 'codehub' ? 'MR' : 'PR'} #${model.status.pr.number}`}
                icon={ExternalLink}
                onClick={() => void window.api.shell.openUrl(model.status!.pr!.url!)}
              />
            ) : null}
          </div>
        ) : null}
        <Section
          name="项目信息"
          icon={<IdCard size={16} aria-hidden="true" />}
          summary={summary}
          initialOpen
        >
          {model.loading ? (
            <p role="status">正在读取项目信息…</p>
          ) : model.form ? (
            <>
              {editing ? (
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
                          value={model.form!.value[field]}
                          onChange={(event) => model.edit(field, event.target.value)}
                          disabled={model.busy || blocked}
                        />
                      ) : (
                        <input
                          id={`config-${field}`}
                          value={model.form!.value[field]}
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
                      <dd>{model.form!.value[field] || '未填写'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="wb-config-actions">
                <WorkbenchIconButton
                  label={editing ? '收起编辑' : '编辑项目信息'}
                  icon={FilePenLine}
                  disabled={blocked || model.busy}
                  onClick={() => setEditing(!editing)}
                />
                <WorkbenchIconButton
                  label="重新读取项目信息"
                  icon={RefreshCw}
                  disabled={model.busy}
                  onClick={() =>
                    leave(() => {
                      model.discard()
                      void model.reload()
                    })
                  }
                />
              </div>
            </>
          ) : (
            <WorkbenchIconButton
              label="重试读取项目信息"
              icon={RefreshCw}
              onClick={() => void model.reload()}
            />
          )}
          {editing && !model.form?.value.name.trim() ? (
            <p className="wb-config-error" role="alert">
              项目名称不能为空
            </p>
          ) : null}
        </Section>
        <Section
          name="代码仓"
          icon={<FolderGit2 size={16} aria-hidden="true" />}
          summary={`${card.project.slots.length} 个仓库`}
        >
          <ul className="wb-config-repos">
            {card.project.slots.map((slot) => (
              <li key={slot.repoId}>
                <div className="wb-config-repo-heading">
                  <strong>{slot.name}</strong>
                  <span className="wb-config-actions">
                    <WorkbenchIconButton
                      label={`打开 ${slot.name}`}
                      icon={ExternalLink}
                      onClick={() =>
                        void (slot.href
                          ? window.api.shell.openUrl(slot.href)
                          : window.api.shell.openPath(slot.path))
                      }
                    />
                    <WorkbenchIconButton
                      label={`配置 ${slot.name}`}
                      icon={SlidersHorizontal}
                      onClick={() => openSettings('repo', slot.repoId)}
                    />
                    {slot.localRepoId ? (
                      <WorkbenchIconButton
                        label={`解除 ${slot.name} 本机注册`}
                        icon={Unlink}
                        disabled={busyRepoId === slot.repoId}
                        onClick={() => onRemoveRepo(slot.localRepoId!)}
                        data-workbench-remove-repo
                      />
                    ) : null}
                  </span>
                </div>
                <div className="wb-config-path">{slot.linkLabel}</div>
                <div className="wb-config-path">{slot.path}</div>
                <div className="wb-config-sources">
                  {card.hostTags
                    .filter((tag) => slot.hostIds.includes(tag.hostId))
                    .map((tag) => (
                      <ProjectSourceTag key={tag.hostId} tag={tag} />
                    ))}
                </div>
              </li>
            ))}
          </ul>
          <WorkbenchIconButton
            label="添加代码仓"
            icon={Plus}
            onClick={onAddRepo}
            data-workbench-add-repo
          />
        </Section>
        <Section
          name="Builder 主机"
          icon={<Monitor size={16} aria-hidden="true" />}
          summary={card.hostTags.map((tag) => tag.label).join('、')}
        >
          <ul className="wb-config-hosts">
            {card.hostTags.map((tag) => (
              <li key={tag.hostId}>
                <ProjectSourceTag tag={tag} />
                <span>
                  {tag.isLocal ? '本机' : '远程'} ·{' '}
                  {tag.online === null ? '连接未知' : tag.online ? '在线' : '离线'}
                </span>
              </li>
            ))}
          </ul>
          <WorkbenchIconButton
            label="管理 Builder 主机连接"
            icon={Monitor}
            onClick={() => openSettings('servers')}
          />
        </Section>
      </div>
      <footer className="wb-config-footer">
        {model.error ? (
          <p className="wb-config-error" role="alert">
            {model.error}
          </p>
        ) : null}
        {model.notice ? <p role="status">{model.notice}</p> : null}
        <div className="wb-config-draft">
          {model.awaitingReadback ? (
            <WorkbenchIconButton
              label="核对后重新编辑"
              icon={FilePenLine}
              disabled={model.busy}
              onClick={() => {
                model.resume()
                setEditing(true)
              }}
            />
          ) : null}
          <span>
            {model.pending
              ? '等待合入'
              : model.awaitingReadback
                ? '提交结果待核对'
                : model.merged
                  ? '合入后待更新'
                  : model.dirty
                    ? `${model.changes.length} 项变更未提交`
                    : '没有待提交的变更'}
          </span>
          {model.dirty ? (
            <button
              type="button"
              className="wb-btn wb-btn-ghost"
              disabled={model.busy}
              onClick={model.discard}
            >
              撤销变更
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="wb-btn wb-btn-primary wb-config-submit"
          disabled={
            model.busy ||
            (!model.merged && (!model.dirty || !model.form?.value.name.trim() || blocked))
          }
          onClick={() => (model.merged ? void model.update() : setReviewing(true))}
        >
          {model.busy ? (
            <>
              <LoaderCircle size={16} className="wb-icon-spin" aria-hidden="true" />
              处理中…
            </>
          ) : model.awaitingReadback ? (
            '更新代码并核对'
          ) : model.merged ? (
            '更新代码'
          ) : model.pending ? (
            '等待合入'
          ) : (
            '查看变更'
          )}
        </button>
      </footer>
      <ProjectSettingsReview
        model={model}
        open={reviewing}
        setOpen={setReviewing}
        onSubmitted={() => setEditing(false)}
        saveLocally={model.localOnly}
      />
    </aside>
  )
}
