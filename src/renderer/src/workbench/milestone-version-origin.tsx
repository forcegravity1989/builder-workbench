import type { ReactNode } from 'react'
import { closeProjectPage } from './project-page-state'

export function MilestoneVersionOrigin({
  feature,
  children
}: {
  feature?: string
  children: ReactNode
}) {
  if (feature === undefined) {
    return children
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="wb-ml-return">
        <button onClick={() => closeProjectPage()}>← 返回项目里程碑</button>
        <span>{feature} · 尚无已确认的版内特性对应关系</span>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
