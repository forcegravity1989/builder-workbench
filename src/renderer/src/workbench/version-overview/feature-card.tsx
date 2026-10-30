import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { VersionGoal } from '../../../../shared/workbench/version-material'
import { taskKey, type FeatureData } from './feature-model'
import { featureStage } from './feature-timeline'
import { FeatureTimelineView } from './feature-timeline-view'
import './overview.css'
export { timeLabel } from './overview-time'

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
  const [expanded, setExpanded] = useState(true)
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
        <span className="bwo-badge">
          {feature.problems.length ? '阶段来源未读全' : featureStage(feature, historical)}
        </span>
      </button>
      {expanded && (
        <div className="bwo-feature-body">
          <p className="bwo-muted mb-3">
            <span className="mr-2">本版承担</span>
            <span className="text-foreground">{goal.title}</span>
            <span title="计划目前仅记录关联目标范围，未单列该特性的版内增量。"> · 目标范围 ⓘ</span>
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
          <FeatureTimelineView feature={feature} />
          {feature.problems.length > 0 && (
            <details className="bwo-muted mt-3">
              <summary>部分来源未读取（{feature.problems.length}）</summary>
              {feature.problems.map((problem) => (
                <p key={`${taskKey(feature.root.reference)}:${problem}`}>{problem}</p>
              ))}
            </details>
          )}
        </div>
      )}
    </article>
  )
}
