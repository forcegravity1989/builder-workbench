import { ErrorDetails } from './error-feedback'
import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  CircleUserRound,
  Download,
  ExternalLink,
  FilePenLine,
  FolderGit2,
  LayoutDashboard,
  LoaderCircle,
  SlidersHorizontal
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Repo } from '../../../shared/repository/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { WallSourceAvatarGroup } from './WallSourceAvatarGroup'
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
  avatar?: string
}
export type WallCardView = {
  project: WallProject
  displayName: string
  charter: ProjectCharter | null
  ownerAvatar?: string
  readings: WallCardReadings
  hostTags: CardHostTag[]
  primaryRepo: Repo
}
function OwnerAvatar({ avatar }: { avatar?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | undefined>()
  if (avatar && failedUrl !== avatar) {
    return <img src={avatar} alt="" onError={() => setFailedUrl(avatar)} />
  }
  return <CircleUserRound size={22} />
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
  const identifiedVersion =
    readings.kind === 'version'
      ? readings.sourceLabel
        ? `${readings.version} · ${readings.sourceLabel}`
        : readings.version
      : readings.kind === 'unknown'
        ? readings.version
        : undefined
  const versionStatus =
    readings.kind === 'loading' ? '正在读取版本…' : readings.kind === 'unknown' ? '无' : null
  const goals = readings.kind === 'version' ? readings.goals : []
  const brief = !goals.length ? card.charter?.brief?.trim() : undefined
  const openRepository = (slot: WallRepoSlot) => {
    if (slot?.href) {
      void window.api.shell.openUrl(slot.href)
    } else if (getRepoExecutionHostId(slot.repo) === 'local') {
      void window.api.shell.openPath(slot.repo.path, getRepoExecutionHostId(slot.repo))
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <WorkbenchIconButton label="代码仓操作" icon={FolderGit2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {project.slots.map((slot) => (
                <div key={`${getRepoExecutionHostId(slot.repo)}:${slot.repoId}`}>
                  {project.slots.length > 1 && <span className="pcard-menu-repo">{slot.name}</span>}
                  <DropdownMenuItem
                    disabled={!slot.href && getRepoExecutionHostId(slot.repo) !== 'local'}
                    onSelect={() => openRepository(slot)}
                  >
                    <ExternalLink />
                    {slot.repo.kind === 'folder' ? '打开文件夹' : '打开代码仓'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onRepoSettings(slot.repo)}>
                    <SlidersHorizontal />
                    仓库设置
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!slot.remoteUrl || slot.hostIds.includes('local')}
                    onSelect={() => onClone(slot)}
                  >
                    <Download />
                    克隆到本机
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <WorkbenchIconButton
            label={primaryRepo.kind === 'folder' ? '项目总览（普通文件夹不可用）' : '项目总览'}
            icon={LayoutDashboard}
            disabled={primaryRepo.kind === 'folder'}
            onClick={onOverview}
            data-workbench-open-overview
            data-contextual-tour-target="workbench-wall-overview"
          />
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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="pcard-person-avatar"
              aria-label="项目负责人"
              title={`项目负责人：${card.charter?.owner?.trim() || '未设置'}`}
            >
              <OwnerAvatar avatar={card.ownerAvatar} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-3" align="start">
            项目负责人：{card.charter?.owner?.trim() || '未设置'}
          </PopoverContent>
        </Popover>
        <span className="pcard-owner-name" title={card.charter?.owner?.trim()}>
          {card.charter?.owner?.trim() || '—'}
        </span>
        <WallSourceAvatarGroup
          sources={card.hostTags.map((tag) => ({
            id: tag.hostId,
            label: tag.label,
            online: tag.online,
            avatar: tag.avatar,
            onOpen: () =>
              onOpen(project.rows.find((row) => getRepoExecutionHostId(row) === tag.hostId))
          }))}
        />
        {project.group && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="pcard-members">
                成员
              </button>
            </PopoverTrigger>
            <PopoverContent className="pcard-member-list p-3" align="end">
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
      </div>
      <div className="pcard-version">
        <span className="pcard-version-value" title={identifiedVersion}>
          {identifiedVersion ?? '—'}
        </span>
        <span className="pcard-release" title="现有墙卡材料未提供发布日期">
          发布 —
        </span>
        {versionStatus && (
          <span
            className="pcard-muted"
            title={readings.kind === 'unknown' ? '读取失败；打开读取问题查看原因' : versionStatus}
          >
            {versionStatus}
          </span>
        )}
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
      <div className="pcard-delivery">
        {goals.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="pcard-goal-preview"
                aria-label={`查看全部 ${goals.length} 项目标`}
              >
                <ul>
                  {goals.slice(0, 2).map((title, index) => (
                    <li key={index} title={title}>
                      {title}
                    </li>
                  ))}
                </ul>
              </button>
            </PopoverTrigger>
            <PopoverContent className="pcard-goal-list p-3" align="start">
              <strong>{identifiedVersion} · 月度版本目标</strong>
              <ol>
                {goals.map((title, index) => (
                  <li key={index}>{title}</li>
                ))}
              </ol>
              <button type="button" className="pcard-members" onClick={() => onStage('plan')}>
                进入版本计划
              </button>
            </PopoverContent>
          </Popover>
        ) : brief ? (
          <p className="pcard-brief" title={brief}>
            {brief}
          </p>
        ) : null}
      </div>
      <div className="pcard-footer">
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
