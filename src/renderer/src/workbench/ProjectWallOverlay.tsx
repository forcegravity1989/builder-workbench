import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { closeProjectWall, useProjectWallOpen } from './project-wall-state'
import { openProjectOnboard } from './project-onboard-state'
import { isWorkbenchShell } from './is-workbench-shell'
import { readProjectCharter, type ProjectCharter } from './project-charter'
import { switchActiveProject } from './switch-active-project'
import { buildWallProjects, type WallProject, type WallRepoSlot } from './workbench-wall-projects'
import { ensureWallProjectGroup, removeRepoFromWallProject } from './wall-project-repo-actions'
import './workbench-wall.css'

type Health = 'green' | 'amber' | 'red' | 'unknown'

type WallCard = {
  project: WallProject
  brief: string
  version: string
  week: string
  weekGoal: string
  lastDelivery: string
  weekDone: number
  weekTotal: number
  signal: Health
  isActive: boolean
  displayName: string
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

function openRepoLink(slot: WallRepoSlot): void {
  if (slot.href) {
    void window.api.shell.openUrl(slot.href)
    return
  }
  void window.api.shell.openPath(slot.path)
}

async function startAddRepoSlot(project: WallProject): Promise<void> {
  const groupId = await ensureWallProjectGroup(project)
  if (!groupId) {
    return
  }
  closeProjectWall()
  openProjectOnboard({
    attachToGroupId: groupId,
    seedName: project.name,
    attachLabel: project.name
  })
}

/** Top-layer project wall — loop-buddy screens/wall; open from project icon. */
export function ProjectWallOverlay(): React.JSX.Element | null {
  const open = useProjectWallOpen()
  const repos = useAppStore((s) => s.repos)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const fetchRepos = useAppStore((s) => s.fetchRepos)
  const [charters, setCharters] = useState<Record<string, ProjectCharter | null>>({})
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [busyRepoId, setBusyRepoId] = useState<string | null>(null)

  const wallProjects = useMemo(
    () => buildWallProjects(repos, projectGroups),
    [repos, projectGroups]
  )

  useEffect(() => {
    if (!open || wallProjects.length === 0) {
      return
    }
    let cancelled = false
    void (async () => {
      const next: Record<string, ProjectCharter | null> = {}
      for (const p of wallProjects) {
        const primary = repos.find((r) => r.id === p.primaryRepoId)
        if (!primary) {
          continue
        }
        const result = await readProjectCharter(primary.path)
        if (cancelled) {
          return
        }
        next[p.key] = result.charter
      }
      if (!cancelled) {
        setCharters(next)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, wallProjects, repos])

  const cards = useMemo((): WallCard[] => {
    return wallProjects.map((p) => {
      const c = charters[p.key]
      return {
        project: p,
        displayName: c?.name?.trim() || p.name,
        brief: c?.brief?.trim() || '(还没填「想做什么」)',
        version: '版本未定',
        week: '本周',
        weekGoal: '',
        lastDelivery: '仓里还没有发版记录',
        weekDone: 0,
        weekTotal: 0,
        signal: 'unknown' as Health,
        isActive: p.repoIds.includes(activeRepoId ?? '')
      }
    })
  }, [wallProjects, charters, activeRepoId])

  const counts = useMemo(() => {
    const n = (s: Health) => cards.filter((c) => c.signal === s).length
    return { green: n('green'), amber: n('amber'), red: n('red'), unknown: n('unknown') }
  }, [cards])

  if (!isWorkbenchShell() || !open) {
    return null
  }

  return (
    <div
      className="wb-wall-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="项目墙"
      data-screen="wall"
    >
      <div className="wb-wall">
        <header className="page-head">
          <h1>项目墙</h1>
          <div className="page-actions">
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              title="刷新项目数据"
              onClick={() => {
                void fetchRepos()
              }}
            >
              刷新
            </button>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              data-workbench-onboard
              onClick={() => {
                closeProjectWall()
                openProjectOnboard()
              }}
            >
              + 接入项目
            </button>
            <button
              type="button"
              className="wb-btn wb-btn-ghost"
              onClick={() => closeProjectWall()}
            >
              关闭
            </button>
          </div>
        </header>

        <div className="envbar">
          <span className="bar-label">本机环境</span>
          <span className="env-item">
            <span className="dot dot-green" />
            Git · 可用
          </span>
          <span className="env-item">
            <span className="dot dot-green" />
            Node · 可用
          </span>
        </div>

        <div className="healthbar">
          <span className="bar-label">健康概览</span>
          <span className="health-group">
            <Dot signal="green" />
            平稳 {counts.green}
          </span>
          <span className="health-group">
            <Dot signal="amber" />
            需要关注 {counts.amber}
          </span>
          <span className="health-group">
            <Dot signal="red" />
            异常 {counts.red}
          </span>
          <span className="health-group">
            <Dot signal="unknown" />
            无数据 {counts.unknown}
          </span>
          <span className="ml-auto hint">共 {cards.length} 个项目</span>
        </div>

        {cards.length === 0 ? (
          <div className="wb-card empty-center">
            还没有接入任何项目。
            <br />
            点击「接入项目」打开本地仓库或克隆远端仓库。
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="wb-btn wb-btn-primary"
                onClick={() => {
                  closeProjectWall()
                  openProjectOnboard()
                }}
              >
                + 接入项目
              </button>
            </div>
          </div>
        ) : (
          <div className="wall-grid">
            {cards.map((p) => {
              const pct = p.weekTotal > 0 ? Math.round((p.weekDone * 100) / p.weekTotal) : 0
              const goal =
                p.weekGoal.trim().length === 0
                  ? '版本目标:还没定'
                  : `版本目标:${p.weekGoal.trim().slice(0, 30)}${p.weekGoal.trim().length > 30 ? '…' : ''}`
              const key = p.project.key
              return (
                <div
                  key={key}
                  className={`pcard${p.isActive ? ' is-active' : ''}`}
                  data-workbench-project-id={p.project.primaryRepoId}
                  data-workbench-project-key={key}
                >
                  <button
                    type="button"
                    className="pcard-main"
                    disabled={switchingKey === key}
                    onClick={() => {
                      setSwitchingKey(key)
                      void switchActiveProject(p.project.primaryRepoId).finally(() =>
                        setSwitchingKey(null)
                      )
                    }}
                  >
                    <div className="pcard-top">
                      <span className="wb-tag wb-tag-outline wb-mono">
                        {p.version.trim() || '版本未定'}
                      </span>
                      <span className="wb-tag wb-tag-neutral">{p.week}</span>
                      {p.isActive ? <span className="wb-tag wb-tag-accent">当前</span> : null}
                      <span className="spacer" style={{ flex: 1 }} />
                      <Dot signal={p.signal} withLabel />
                    </div>
                    <div className="pcard-name">{p.displayName}</div>
                    <div className="pcard-oneliner">{p.brief.trim() || '(还没填「想做什么」)'}</div>
                    <div className="pcard-meta">
                      <span>{goal}</span>
                      <span>
                        {p.lastDelivery.startsWith('上次') || p.lastDelivery.startsWith('仓')
                          ? p.lastDelivery
                          : `上次交付 ${p.lastDelivery}`}
                      </span>
                      <span>{p.project.slots.length} 个代码仓</span>
                    </div>
                    <div className="pcard-bar" aria-hidden>
                      <div className="pcard-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </button>

                  <div className="pcard-repos" data-workbench-repo-slots>
                    <div className="pcard-repos-head">代码仓</div>
                    <ul className="pcard-repo-list">
                      {p.project.slots.map((slot) => (
                        <li
                          key={slot.repoId}
                          className="pcard-repo-row"
                          data-workbench-repo-slot={slot.repoId}
                        >
                          <button
                            type="button"
                            className="pcard-repo-link"
                            title={slot.href ?? slot.path}
                            onClick={() => openRepoLink(slot)}
                          >
                            <span className="pcard-repo-name">{slot.name}</span>
                            <span className="pcard-repo-url">{slot.linkLabel}</span>
                          </button>
                          <button
                            type="button"
                            className="wb-btn wb-btn-ghost pcard-repo-remove"
                            disabled={busyRepoId === slot.repoId}
                            data-workbench-remove-repo
                            title="删除代码仓"
                            onClick={() => {
                              setBusyRepoId(slot.repoId)
                              void removeRepoFromWallProject({
                                project: p.project,
                                repoId: slot.repoId
                              }).finally(() => setBusyRepoId(null))
                            }}
                          >
                            删除
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="wb-btn wb-btn-secondary pcard-add-repo"
                      data-workbench-add-repo
                      onClick={() => {
                        void startAddRepoSlot(p.project)
                      }}
                    >
                      + 代码仓
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
