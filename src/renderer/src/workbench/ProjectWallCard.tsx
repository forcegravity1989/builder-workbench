import type { ReactNode } from 'react'
import {
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
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { archiveStateLabel } from '../../../shared/workbench/archive-state-label'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSourceTag } from './ProjectSourceTag'
import type { ProjectCharter } from './project-charter'
import type { WallCardReadings, WallArchiveReading } from './wall-card-readings'
import type { WallProject, WallRepoSlot } from './workbench-wall-projects'

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
function archiveLabel(reading: WallArchiveReading): string {
  return reading.kind === 'missing' ? '未创建' : archiveStateLabel(reading.status)
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
      data-workbench-project-id={primaryRepo.id}
      data-workbench-project-key={project.key}
    >
      <div className="pcard-top">
        <button
          type="button"
          className="pcard-name"
          data-contextual-tour-target="workbench-wall-project"
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
      {project.group && (
        <details className="pcard-members">
          <summary>{project.slots.length} 个代码仓</summary>
          {project.slots.map((member) => (
            <div key={`${getRepoExecutionHostId(member.repo)}:${member.repoId}`}>
              <button type="button" onClick={() => onOpen(member.repo)}>
                {member.name}
              </button>
              {repoMenu(member.repo)}
            </div>
          ))}
        </details>
      )}
      <div className={`pcard-delivery${readings.kind === 'version' ? '' : ' is-compact'}`}>
        {readings.kind === 'version' ? (
          <>
            <div className="pcard-version">
              <span>版本目标</span>
              <span>{readings.version}</span>
            </div>
            <ul>
              {readings.goals.slice(0, 2).map((title, index) => (
                <li key={index} title={title}>
                  {title}
                </li>
              ))}
            </ul>
            {readings.goals.length > 2 && (
              <span className="pcard-muted">另 {readings.goals.length - 2} 项目标</span>
            )}
            {!readings.goals.length && <span className="pcard-muted">暂无可读目标</span>}
          </>
        ) : (
          <div
            className="pcard-muted"
            title={readings.kind === 'unknown' ? readings.reason : undefined}
          >
            {readings.kind === 'loading'
              ? '正在读取版本…'
              : readings.kind === 'unknown'
                ? '版本信息暂不可用'
                : card.charter?.brief?.trim() || '未建立版本'}
          </div>
        )}
      </div>
      {readings.kind === 'version' && (
        <div className="pcard-stages">
          <button type="button" onClick={() => onStage('plan')}>
            <span>计划</span>
            <strong>{archiveLabel(readings.plan)}</strong>
          </button>
          <button type="button" onClick={() => onStage('tasks')}>
            <span>任务</span>
            <strong>
              {readings.tasks ? `${readings.tasks.closed} / ${readings.tasks.total}` : '—'}
            </strong>
          </button>
          <button type="button" onClick={() => onStage('acceptance')}>
            <span>验收</span>
            <strong>{archiveLabel(readings.acceptance)}</strong>
          </button>
        </div>
      )}
    </article>
  )
}
