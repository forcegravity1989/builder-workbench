import { useState } from 'react'
import { Button } from '@/components/ui/button'

export const OVERVIEW_HELP =
  '展开名片看项目方向和负责人，在里程碑安排阶段成果和时间。下方记分牌用于查看实际指标。'

const DISMISSED_KEY = 'bw:overview-intro-dismissed'

export function OverviewIntro() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) !== 'true'
    } catch {
      return true
    }
  })

  if (!visible) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 text-sm text-muted-foreground">
      <p>{OVERVIEW_HELP}</p>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setVisible(false)
          try {
            localStorage.setItem(DISMISSED_KEY, 'true')
          } catch {
            // Storage can be unavailable. Dismiss the introduction for this visit.
          }
        }}
      >
        跳过提示
      </Button>
    </div>
  )
}
