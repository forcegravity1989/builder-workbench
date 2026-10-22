import React from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import { ExternalLink, LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { ProjectSourceTag } from './ProjectSourceTag'
import type { ProjectCharter } from './project-charter'
import type { WallCardReadings } from './wall-card-readings'
import type { WallProject } from './workbench-wall-projects'

/** 卡内来源主机标签的呈现事实(连接态由 Orca runtime 推导,只作事实,不冒充健康)。 */
export type CardHostTag = {
  hostId: string
  label: string
  online: boolean | null
  worktreeCount: number
  isLocal: boolean
}

export type WallCardView = {
  project: WallProject
  displayName: string
  brief: string
  readings: WallCardReadings
  isActive: boolean
  charter: ProjectCharter | null
  status: CharterStatus | null
  worktreeCount: number
  hostTags: CardHostTag[]
  /** Builder 主机上的额外工作树数(非本机 host 之和),用于代码仓注脚。 */
  remoteWorktreeCount: number
  primaryRepo: Repo | undefined
}

/**
 * 读数格：只显数字不跳转；Unknown 是事实不是错误——灰字「—」，
 * 不装绿、不装零、不推导健康结论（铁律二，判断归人）。
 */
function ReadingCell({
  label,
  value,
  unknown,
  title
}: {
  label: string
  value: string
  unknown?: boolean
  title?: string
}): React.JSX.Element {
  return (
    <div className="pcard-reading">
      <span className="pcard-reading-label">{label}</span>
      <span
        className={`pcard-reading-value${unknown ? ' is-unknown' : ''}`}
        {...(title ? { title } : {})}
      >
        {value}
      </span>
    </div>
  )
}

function versionCell(reading: WallCardReadings['version']): {
  value: string
  unknown?: boolean
  title?: string
} {
  if (reading.kind === 'loading') {
    return { value: '读取中…', unknown: true }
  }
  if (reading.kind === 'undecided') {
    return {
      value: '版本未定',
      unknown: true,
      title: '没人在计划屏为它选过版（不推断、不猜）；读不到计划材料时同样如实显示版本未定'
    }
  }
  return { value: reading.version }
}

function progressCell(reading: Exclude<WallCardReadings['progress'], { kind: 'hidden' }>): {
  value: string
  unknown?: boolean
  title?: string
} {
  if (reading.kind === 'loading') {
    return { value: '读取中…', unknown: true }
  }
  if (reading.kind === 'unknown') {
    return { value: '—', unknown: true, title: reading.reason }
  }
  return {
    value: `完成 ${reading.completed} · 开放 ${reading.open}`,
    title: '该版本 data.json 登记的承诺任务 × Issue 原生状态现算；关闭即计完成，关闭原因不参与计数'
  }
}

function sessionsCell(reading: WallCardReadings['sessions']): {
  value: string
  unknown?: boolean
  title?: string
} {
  if (reading.kind === 'unknown') {
    return {
      value: '—',
      unknown: true,
      title: '来源主机离线或连接未知：离线 ≠ 0，不装计数；恢复在线并刷新后给真实数'
    }
  }
  return {
    value: String(reading.count),
    title: 'Orca live 会话口径（与侧栏同源）：fresh 且未结束的会话数'
  }
}

function prsCell(reading: WallCardReadings['prs']): {
  value: string
  unknown?: boolean
  title?: string
} {
  if (reading.kind === 'loading') {
    return { value: '读取中…', unknown: true }
  }
  if (reading.kind === 'unknown') {
    return { value: '—', unknown: true, title: reading.reason }
  }
  return { value: String(reading.count), title: '该项目全部代码仓的开放 PR/MR 总数' }
}

export function ProjectWallCard({
  card,
  switching,
  configured,
  onOpen,
  onConfigure
}: {
  card: WallCardView
  switching: boolean
  configured: boolean
  onOpen: () => void
  onConfigure: (trigger: HTMLButtonElement) => void
}): React.JSX.Element {
  const opportunity = card.charter?.opportunity?.trim() || ''
  return (
    <article
      className={`pcard${configured ? ' is-configured' : ''}`}
      data-workbench-project-id={card.project.primaryRepoId}
      data-workbench-project-key={card.project.key}
    >
      <div className="pcard-top">
        <div className="pcard-sources">
          {card.hostTags.map((tag) => (
            <ProjectSourceTag key={tag.hostId} tag={tag} />
          ))}
        </div>
        <div className="pcard-actions">
          <WorkbenchIconButton
            label={`打开 ${card.displayName} 项目总览`}
            icon={switching ? LoaderCircle : ExternalLink}
            disabled={switching}
            onClick={onOpen}
            data-workbench-open-overview
          />
          <WorkbenchIconButton
            label={`配置 ${card.displayName}`}
            icon={SlidersHorizontal}
            aria-pressed={configured}
            onClick={(event) => onConfigure(event.currentTarget)}
            data-workbench-edit-charter
          />
        </div>
      </div>
      <button
        type="button"
        className="pcard-main"
        disabled={switching}
        onClick={onOpen}
        aria-label={`打开 ${card.displayName} 项目总览`}
      >
        <div className="pcard-name">{card.displayName}</div>
        {opportunity ? <div className="pcard-oneliner">{opportunity}</div> : null}
        <div className="pcard-readings" aria-label="读数">
          <ReadingCell label="版本" {...versionCell(card.readings.version)} />
          {card.readings.progress.kind !== 'hidden' ? (
            <ReadingCell label="承诺进展" {...progressCell(card.readings.progress)} />
          ) : null}
          <ReadingCell label="在跑会话" {...sessionsCell(card.readings.sessions)} />
          <ReadingCell label="PR 待审" {...prsCell(card.readings.prs)} />
        </div>
      </button>
    </article>
  )
}
