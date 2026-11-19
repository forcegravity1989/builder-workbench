import { ErrorDetails } from './error-feedback'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  Download,
  ExternalLink,
  FilePenLine,
  LayoutDashboard,
  LoaderCircle,
  SlidersHorizontal,
  type LucideIcon
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSourceTag } from './ProjectSourceTag'
import type { ProjectCharter } from './project-charter'
import type { WallCardReadings } from './wall-card-readings'
import type { VersionWorkflowProgress } from './version-workflow-progress'
import type { WallProject, WallRepoSlot } from './workbench-wall-projects'

export type WallCardMode = 'compact' | 'detail'
export type CardHostTag = {
  hostId: string
  label: string
  online: boolean | null
  isLocal: boolean
}
export type WallCardView = {
  project: WallProject
  displayName: string
  charter: ProjectCharter | null
  readings: WallCardReadings
  hostTags: CardHostTag[]
  primaryRepo: Repo
}
function WorkflowProgress({ progress }: { progress: VersionWorkflowProgress }) {
  const { archive, label } = progress
  return <strong title={archive?.label}>{label}</strong>
}

function workflowProblem(progress: VersionWorkflowProgress): string | undefined {
  return (
    progress.reason ??
    (progress.archive?.status?.state === 'unknown' ? progress.archive.status.reason : undefined)
  )
}

function RepositoryAction({
  slots,
  label,
  icon,
  onSelect
}: {
  slots: readonly WallRepoSlot[]
  label: string
  icon: LucideIcon
  onSelect(slot: WallRepoSlot): void
}) {
  if (!slots.length) {
    return null
  }
  if (slots.length === 1) {
    return <WorkbenchIconButton label={label} icon={icon} onClick={() => onSelect(slots[0])} />
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <WorkbenchIconButton label={label} icon={icon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {slots.map((slot) => (
          <DropdownMenuItem
            key={`${getRepoExecutionHostId(slot.repo)}:${slot.repoId}`}
            onSelect={() => onSelect(slot)}
          >
            {slot.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProjectWallCard({
  card,
  mode = 'detail',
  switching,
  configured,
  onOpen,
  onOverview,
  onConfigure,
  onStage,
  onClone,
  nativeMenu,
  repoMenu,
  onRepoSettings
}: {
  card: WallCardView
  mode?: WallCardMode
  switching: boolean
  configured: boolean
  onOpen(repo?: Repo): void
  onOverview(): void
  onClone(slot: WallRepoSlot): void
  onConfigure(trigger: HTMLButtonElement): void
  onStage(stage: 'plan' | 'tasks' | 'acceptance'): void
  nativeMenu: ReactNode
  repoMenu(repo: Repo): ReactNode
  onRepoSettings(repo: Repo): void
}) {
  const { readings, project, primaryRepo } = card
  const openRepository = (slot: WallRepoSlot) => {
    if (slot?.href) {
      void window.api.shell.openUrl(slot.href)
    } else if (getRepoExecutionHostId(slot.repo) === 'local') {
      void window.api.shell.openPath(slot.repo.path)
    }
  }
  return (
    <article
      className={`pcard${configured ? ' is-configured' : ''}`}
      data-card-mode={mode}
      data-workbench-project-id={primaryRepo.id}
      data-workbench-project-key={project.key}
    >
      <div className="pcard-top">
        <button
          type="button"
          className="pcard-name"
          data-contextual-tour-target="workbench-wall-project"
          title={card.displayName}
          disabled={switching}
          onClick={() => onOpen()}
        >
          {card.displayName}
        </button>
        <div className="pcard-actions">
          <RepositoryAction
            label={primaryRepo.kind === 'folder' ? '打开文件夹' : '打开代码仓'}
            icon={ExternalLink}
            slots={project.slots.filter(
              (slot) => slot.href || getRepoExecutionHostId(slot.repo) === 'local'
            )}
            onSelect={openRepository}
          />
          <RepositoryAction
            label="仓库设置"
            icon={SlidersHorizontal}
            slots={project.slots}
            onSelect={(slot) => onRepoSettings(slot.repo)}
          />
          <RepositoryAction
            label="克隆到本机"
            icon={Download}
            slots={project.slots.filter(
              (slot) => slot.remoteUrl && !slot.hostIds.includes('local')
            )}
            onSelect={onClone}
          />
          {primaryRepo.kind !== 'folder' && (
            <WorkbenchIconButton
              label="项目总览"
              icon={LayoutDashboard}
              onClick={onOverview}
              data-workbench-open-overview
              data-contextual-tour-target="workbench-wall-overview"
            />
          )}
          <WorkbenchIconButton
            label="项目设置与项目信息"
            icon={switching ? LoaderCircle : FilePenLine}
            aria-pressed={configured}
            onClick={(event) => onConfigure(event.currentTarget)}
            data-workbench-edit-charter
          />
          {nativeMenu}
        </div>
      </div>
      <div className="pcard-identity">
        <span className="pcard-owner">
          项目负责人{' '}
          <strong title={card.charter?.owner?.trim()}>{card.charter?.owner?.trim() || '—'}</strong>
        </span>
        <div className="pcard-hosts">
          {card.hostTags.map((tag) => (
            <button
              type="button"
              key={tag.hostId}
              className="pcard-host"
              onClick={() =>
                onOpen(project.rows.find((row) => getRepoExecutionHostId(row) === tag.hostId))
              }
              disabled={tag.online === false}
              aria-label={`在 ${tag.label} 继续工作`}
            >
              <ProjectSourceTag tag={tag} interactive />
            </button>
          ))}
        </div>
      </div>
      <div className="pcard-delivery">
        <div className="pcard-version">
          <span>{readings.kind === 'version' ? '版本目标' : '项目信息'}</span>
          <span>
            {readings.kind === 'version'
              ? readings.sourceLabel
                ? `${readings.version} · ${readings.sourceLabel}`
                : readings.version
              : ''}
          </span>
        </div>
        {readings.kind === 'version' ? (
          <>
            <ul>
              {readings.goals.slice(0, 2).map((title, index) => (
                <li key={index} title={title}>
                  {title}
                </li>
              ))}
            </ul>
            <div className="pcard-goal-note">
              {readings.goals.length > 2 && (
                <span className="pcard-muted">另 {readings.goals.length - 2} 项目标</span>
              )}
              {!readings.goals.length && <span className="pcard-muted">暂无可读目标</span>}
            </div>
          </>
        ) : (
          <p className="pcard-brief" title={card.charter?.brief?.trim()}>
            {readings.kind === 'loading'
              ? '正在读取版本…'
              : readings.kind === 'unknown'
                ? '版本信息暂不可用'
                : card.charter?.brief?.trim() || '未建立版本'}
          </p>
        )}
      </div>
      <div className="pcard-footer">
        <div className="pcard-meta">
          {project.group && (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="pcard-members">
                  {project.slots.length} 个代码仓
                </button>
              </PopoverTrigger>
              <PopoverContent className="pcard-member-list p-3" align="start">
                {project.slots.map((member) => (
                  <div key={`${getRepoExecutionHostId(member.repo)}:${member.repoId}`}>
                    <button type="button" onClick={() => onOpen(member.repo)}>
                      {member.name}
                    </button>
                    {repoMenu(member.repo)}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <span className="pcard-version-status">
            {readings.kind === 'version'
              ? mode === 'compact'
                ? readings.version
                : ''
              : readings.kind === 'loading'
                ? '正在读取版本…'
                : readings.kind === 'unknown'
                  ? '版本信息暂不可用'
                  : '未建立版本'}
          </span>
          {(readings.kind === 'unknown' ||
            (readings.kind === 'version' &&
              (workflowProblem(readings.plan) || workflowProblem(readings.acceptance)))) && (
            <Popover>
              <PopoverTrigger asChild>
                <WorkbenchIconButton label="查看读取问题" icon={AlertCircle} />
              </PopoverTrigger>
              <PopoverContent className="w-80 max-w-[calc(100vw-32px)] p-3" align="end">
                {readings.kind === 'unknown' ? (
                  <ErrorDetails summary="版本读取详情" detail={readings.reason} />
                ) : readings.kind === 'version' ? (
                  (['plan', 'acceptance'] as const).map((workflow) => {
                    const detail = workflowProblem(readings[workflow])
                    return detail ? (
                      <ErrorDetails
                        key={workflow}
                        summary={workflow === 'plan' ? '计划读取详情' : '验收读取详情'}
                        detail={detail}
                      />
                    ) : null
                  })
                ) : null}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="pcard-stages">
          <button
            type="button"
            disabled={readings.kind !== 'version'}
            onClick={() => onStage('plan')}
          >
            <span>计划</span>
            {readings.kind === 'version' ? (
              <WorkflowProgress progress={readings.plan} />
            ) : (
              <strong>—</strong>
            )}
          </button>
          <button
            type="button"
            disabled={readings.kind !== 'version'}
            onClick={() => onStage('tasks')}
          >
            <span>任务</span>
            <strong>
              {readings.kind === 'version' && readings.tasks
                ? `${readings.tasks.closed} / ${readings.tasks.total}`
                : '—'}
            </strong>
          </button>
          <button
            type="button"
            disabled={readings.kind !== 'version'}
            onClick={() => onStage('acceptance')}
          >
            <span>验收</span>
            {readings.kind === 'version' ? (
              <WorkflowProgress progress={readings.acceptance} />
            ) : (
              <strong>—</strong>
            )}
          </button>
        </div>
      </div>
    </article>
  )
}
