import type { ReactNode } from 'react'
import { closeProjectPage } from './project-page-state'

export function MilestoneVersionOrigin({
  fromMilestones,
  children
}: {
  fromMilestones?: boolean
  children: ReactNode
}) {
  if (!fromMilestones) {
    return children
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="wb-ml-return">
        <button onClick={() => closeProjectPage()}>← 返回项目里程碑</button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
