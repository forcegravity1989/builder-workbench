import { useState } from 'react'
import { ChevronDown, ExternalLink, GitPullRequest, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import { openIssueWorkspaceOrStart } from '../issue-start-action'
import {
  featureStage,
  timelineRange,
  timelineClusters,
  validTime,
  taskKey,
  type FeatureData,
  type FeatureEvent
} from './feature-model'
import { workActivityTimes } from './version-evidence'
import './overview.css'

export const timeLabel = (time: string | number) =>
  new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
export const elapsedLabel = (milliseconds: number) =>
  `${Math.round(milliseconds / 360000) / 10} 小时`
const openUrl = (url: string) => {
  if (/^https?:\/\//i.test(url)) {
    void window.api.shell.openUrl(url)
  }
}

export function FeatureCard({
  feature,
  goal,
  version,
  historical,
  onVersion
}: {
  feature: FeatureData
  goal: VersionGoal
  version: string
  historical: boolean
  onVersion: (version: string, featureKey: string) => void
}) {
  const activity = workActivityTimes()
  const [expanded, setExpanded] = useState(true)
  const [selected, setSelected] = useState<FeatureEvent[] | null>(null)
  const events = [...feature.events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)
  )
  const range = timelineRange(events)
  const width = Math.max(760, events.length * 110)
  const placements = timelineClusters(events, width)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <article className="bwo-feature">
      <button
        className="bwo-feature-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
        <strong className="min-w-0 flex-1 text-left">
          {feature.root.title}{' '}
          <span className="font-normal text-muted-foreground">#{feature.root.iid}</span>
        </strong>
        <span className="text-xs text-muted-foreground">{feature.root.assignee}</span>
        <span className="bwo-badge">{featureStage(feature.pulls, historical, events)}</span>
      </button>
      {expanded && (
        <div className="bwo-feature-body">
          <p className="bwo-muted mb-3">
            <span className="mr-2">本版承担</span>
            <span className="text-foreground">{goal.title}</span>
            <span title="计划当前只记录目标范围，尚未单列该特性在本版的增量。"> · 目标范围 ⓘ</span>
          </p>
          <div className="bwo-related">
            <span className="text-xs text-muted-foreground">关联版本</span>
            {feature.versions.map((item) => (
              <button
                key={item.version}
                className="bwo-version"
                aria-current={item.version === version ? 'page' : undefined}
                title={item.scope}
                onClick={() => onVersion(item.version, feature.root.url)}
              >
                {item.version}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <strong>成果时间轴</strong>
            <span className="text-muted-foreground">{timezone} · 实际时间间隔</span>
          </div>
          {range ? (
            <div
              className="bwo-axis-scroll"
              tabIndex={0}
              role="region"
              aria-label={`${feature.root.title}成果时间轴，可横向滚动`}
            >
              <div className="bwo-axis" style={{ width }}>
                <div className="bwo-axis-line" />
                <span className="bwo-axis-start">{timeLabel(range.start)}</span>
                <span className="bwo-axis-end">{timeLabel(range.end)}</span>
                {feature.pulls.map((pull) => {
                  if (
                    !validTime(pull.createdAt) ||
                    !validTime(pull.mergedAt) ||
                    pull.state !== 'merged'
                  ) {
                    return null
                  }
                  const start = Date.parse(pull.createdAt),
                    end = Date.parse(pull.mergedAt)
                  if (start < range.start || end > range.end || end < start) {
                    return null
                  }
                  return (
                    <span
                      key={pull.url}
                      className="bwo-window"
                      style={{
                        left: 80 + (range.position(start) * (width - 160)) / 100,
                        width: Math.max(
                          2,
                          ((end - start) / Math.max(1, range.duration)) * (width - 160)
                        )
                      }}
                      title={`PR #${pull.number} 评审窗口：${elapsedLabel(end - start)}。从 PR 提交到合入，包含等待，不等于完整阶段耗时。`}
                    />
                  )
                })}
                {placements.map(({ events: cluster, x }, index) => (
                  <button
                    key={cluster[0]!.id}
                    className={`bwo-node bwo-node-${index % 4}`}
                    style={{ left: x }}
                    onClick={() => setSelected(cluster)}
                    title={cluster
                      .map((event) => `${timeLabel(event.at)} ${event.label}`)
                      .join('\n')}
                    aria-label={`${cluster.length > 1 ? `${cluster.length} 个成果节点` : cluster[0]!.label}，查看 PR 和工作会话`}
                  >
                    <i />
                    <span className="bwo-node-label">
                      <time dateTime={cluster[0]!.at}>{timeLabel(cluster[0]!.at)}</time>
                      <strong>
                        {cluster.length > 1 ? `${cluster.length} 个成果节点` : cluster[0]!.label}
                      </strong>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="bwo-muted py-6">尚无可定位时间的成果记录。</p>
          )}
          <p className="bwo-muted">
            {!activity.designStartedAt &&
              !activity.developmentStartedAt &&
              '设计／开发开工：未记录。'}
            {!activity.testsStartedAt && !activity.testsFinishedAt && ' 测试起止：未记录。'}
            <span title="依据版本计划与正式验收推导交付，目标未达成或结论未确认时不计入该特性交付；首次交付称 Pre，后续交付称 Release。">
              {' '}
              版本交付按计划与验收记录呈现 ⓘ
            </span>
          </p>
          {feature.problems.length > 0 && (
            <details className="bwo-muted">
              <summary>部分来源未读取（{feature.problems.length}）</summary>
              {feature.problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </details>
          )}
          <div className="bwo-feature-footer">
            <span className="bwo-muted">
              {historical
                ? '历史节点截止于本版人工验收确认'
                : `${feature.pulls.length} 个关联 PR / MR`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openIssueWorkspaceOrStart({ task: feature.root, version })}
            >
              <MessagesSquare />
              主单工作会话
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {feature.pulls
          .filter((pull) => !events.some((event) => event.url === pull.url))
          .map((pull) => (
            <button
              key={pull.url || pull.number}
              className="bwo-link"
              onClick={() =>
                setSelected([
                  {
                    id: pull.url,
                    phase: pull.phase ?? 'unknown',
                    label: `PR / MR #${pull.number}`,
                    at: '',
                    url: pull.url,
                    readAt: pull.readAt,
                    revision: pull.revision,
                    rule: 'unlocated',
                    tasks: pull.tasks,
                    sessions: pull.sessions
                  }
                ])
              }
            >
              时间未记录 · PR / MR #{pull.number} ↗
            </button>
          ))}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto scrollbar-sleek">
          <DialogHeader>
            <DialogTitle>成果节点</DialogTitle>
          </DialogHeader>
          {selected?.map((event) => {
            const sessions = event.sessions?.length
              ? event.sessions
              : (event.tasks?.length ? event.tasks : [feature.root]).map((task) => ({
                  task,
                  version: event.version ?? version
                }))
            return (
              <section key={event.id} className="space-y-3 border-t pt-4">
                <h3 className="font-medium">{event.label}</h3>
                <p className="text-xs text-muted-foreground">
                  {validTime(event.at) ? `${timeLabel(event.at)} · ${timezone}` : '时间未记录'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {event.phase !== 'issue' && event.url && (
                    <Button variant="outline" size="sm" onClick={() => openUrl(event.url)}>
                      <GitPullRequest />
                      PR / MR
                      <ExternalLink />
                    </Button>
                  )}
                  {sessions.map(({ task, version: sessionVersion }) => (
                    <Button
                      key={`${taskKey(task.reference)}:${sessionVersion}`}
                      variant="outline"
                      size="sm"
                      onClick={() => openIssueWorkspaceOrStart({ task, version: sessionVersion })}
                    >
                      <MessagesSquare />
                      {sessions.length > 1
                        ? `#${task.iid} · ${sessionVersion} 工作会话`
                        : '工作会话'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  读取于 {timeLabel(event.readAt)}
                  {event.revision ? ` · ${event.revision.slice(0, 8)}` : ''}
                </p>
              </section>
            )
          })}
        </DialogContent>
      </Dialog>
    </article>
  )
}
