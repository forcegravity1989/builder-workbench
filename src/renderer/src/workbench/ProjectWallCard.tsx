import React from 'react'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import { CharterPrNotice } from './charter-pr-notice'
import type { ProjectCharter } from './project-charter'
import type { WallProject, WallRepoSlot } from './workbench-wall-projects'

export type Health = 'green' | 'amber' | 'red' | 'unknown'

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
  version: string
  week: string
  goal: string
  lastDelivery: string
  pct: number
  signal: Health
  isActive: boolean
  charter: ProjectCharter | null
  status: CharterStatus | null
  worktreeCount: number
  hostTags: CardHostTag[]
  /** Builder 主机上的额外工作树数(非本机 host 之和),用于代码仓注脚。 */
  remoteWorktreeCount: number
  primaryRepo: Repo | undefined
}

function Dot({ signal, withLabel }: { signal: Health; withLabel?: boolean }): React.JSX.Element {
  const cls =
    signal === 'green'
      ? 'dot dot-green'
      : signal === 'amber'
        ? 'dot dot-amber'
        : signal === 'red'
          ? 'dot dot-red'
          : 'dot'
  const label =
    signal === 'green'
      ? '平稳'
      : signal === 'amber'
        ? '需要关注'
        : signal === 'red'
          ? '异常'
          : '无数据'
  return (
    <>
      <span className={cls} title={label} />
      {withLabel ? <span>{label}</span> : null}
    </>
  )
}

function SourceTag({ tag }: { tag: CardHostTag }): React.JSX.Element {
  if (tag.isLocal) {
    return (
      <span className="wb-tag wb-tag-neutral" title="本机注册的工作树">
        本机
      </span>
    )
  }
  const connection =
    tag.online === null ? '连接状态未知' : tag.online ? '在线' : '离线（连接恢复后可读）'
  const title = `${tag.label} · ${connection} · ${tag.worktreeCount} 个工作树`
  return (
    <span className="wb-tag wb-tag-outline" title={title}>
      {tag.label}
      {tag.online === false ? ' · 离线' : ''}
    </span>
  )
}

function openRepoLink(slot: WallRepoSlot): void {
  if (slot.href) {
    void window.api.shell.openUrl(slot.href)
    return
  }
  void window.api.shell.openPath(slot.path)
}

export function ProjectWallCard({
  card,
  switching,
  busyRepoId,
  updatingMain,
  onOpen,
  onRemoveRepo,
  onEditCharter,
  onAddRepo,
  onUpdateMain
}: {
  card: WallCardView
  switching: boolean
  busyRepoId: string | null
  updatingMain: boolean
  onOpen: () => void
  onRemoveRepo: (repoId: string) => void
  onEditCharter: () => void
  onAddRepo: () => void
  onUpdateMain: () => void
}): React.JSX.Element {
  const { project } = card
  const hasRemoteHosts = card.hostTags.some((tag) => !tag.isLocal)
  return (
    <div
      className={`pcard${card.isActive ? ' is-active' : ''}`}
      data-workbench-project-id={project.primaryRepoId}
      data-workbench-project-key={project.key}
    >
      <button type="button" className="pcard-main" disabled={switching} onClick={onOpen}>
        <div className="pcard-top">
          <span className="pcard-sources">
            {card.hostTags.map((tag) => (
              <SourceTag key={tag.hostId} tag={tag} />
            ))}
          </span>
          <span className="wb-tag wb-tag-outline wb-mono">{card.version.trim() || '版本未定'}</span>
          <span className="wb-tag wb-tag-neutral">{card.week}</span>
          {card.isActive ? <span className="wb-tag wb-tag-accent">当前</span> : null}
          <span className="spacer" style={{ flex: 1 }} />
          <Dot signal={card.signal} withLabel />
        </div>
        <div className="pcard-name">{card.displayName}</div>
        <div className="pcard-oneliner">{card.brief.trim() || '(还没填「想做什么」)'}</div>
        <div className="pcard-meta">
          <span>{card.goal}</span>
          <span>
            {card.lastDelivery.startsWith('上次') || card.lastDelivery.startsWith('仓')
              ? card.lastDelivery
              : `上次交付 ${card.lastDelivery}`}
          </span>
          <span>
            {project.slots.length} 个代码仓 · {card.worktreeCount} 个工作树
          </span>
        </div>
        <div className="pcard-bar" aria-hidden>
          <div className="pcard-bar-fill" style={{ width: `${card.pct}%` }} />
        </div>
      </button>

      <div className="pcard-repos" data-workbench-repo-slots>
        <div className="pcard-repos-head">代码仓</div>
        {!card.charter ? (
          <CharterPrNotice
            status={card.status}
            variant="wall"
            updating={updatingMain}
            onUpdateMain={card.primaryRepo ? onUpdateMain : undefined}
          />
        ) : null}
        <ul className="pcard-repo-list">
          {project.slots.map((slot) => (
            <li key={slot.repoId} className="pcard-repo-row" data-workbench-repo-slot={slot.repoId}>
              <button
                type="button"
                className="pcard-repo-link"
                title={slot.href ?? slot.path}
                onClick={() => openRepoLink(slot)}
              >
                <span className="pcard-repo-name">{slot.name}</span>
                <span className="pcard-repo-url">{slot.linkLabel}</span>
              </button>
              <span className="pcard-repo-hosts">
                {slot.hostIds.map((hostId) => {
                  const tag = card.hostTags.find((t) => t.hostId === hostId)
                  return tag ? <SourceTag key={hostId} tag={tag} /> : null
                })}
              </span>
              {slot.localRepoId ? (
                <button
                  type="button"
                  className="wb-btn wb-btn-ghost pcard-repo-remove"
                  disabled={busyRepoId === slot.repoId}
                  data-workbench-remove-repo
                  title="解除本机注册：墙与 Orca Projects 同步移除，不删除任何仓库文件"
                  onClick={() => onRemoveRepo(slot.localRepoId!)}
                >
                  删除
                </button>
              ) : (
                <span
                  className="pcard-repo-noRemove"
                  title="Builder 主机注册随 Orca 主机配对管理，无删除入口"
                >
                  随主机配对
                </span>
              )}
            </li>
          ))}
        </ul>
        {hasRemoteHosts ? (
          <p className="pcard-repo-note">
            {card.hostTags
              .filter((tag) => !tag.isLocal)
              .map((tag) => tag.label)
              .join(' / ')}{' '}
            的注册与 {card.remoteWorktreeCount} 个额外工作树见来源标签与左侧 Orca
            Projects；主机去留随 Orca 主机配对管理。
          </p>
        ) : null}
        <div className="pcard-repo-actions">
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={switching}
            onClick={onOpen}
            data-workbench-open-overview
          >
            打开项目总览
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-secondary"
            data-workbench-add-repo
            onClick={onAddRepo}
          >
            + 代码仓
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-secondary"
            data-workbench-edit-charter
            onClick={onEditCharter}
          >
            编辑名片
          </button>
        </div>
      </div>
    </div>
  )
}
