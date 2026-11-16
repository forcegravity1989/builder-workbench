import type { ReactNode } from 'react'
import { useAppStore } from '@/store'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { openProjectOverview, type VersionOverviewOptions } from './project-page-state'

export function MilestoneVersionOrigin({
  options,
  children
}: {
  options: VersionOverviewOptions
  children: ReactNode
}) {
  const feature = options.milestoneOrigin?.feature
  const repo = useAppStore((state) => findRepoForHost(state.repos, options.repoId, options))
  if (feature === undefined) {
    return children
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="wb-ml-return">
        <button disabled={!repo} onClick={() => repo && openProjectOverview(repo)}>
          ← 返回项目里程碑
        </button>
        {feature && <span>{feature} · 尚无已确认的版内特性对应关系</span>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
