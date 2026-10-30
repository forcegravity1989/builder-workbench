import { FoldVertical, UnfoldVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { requestSidebarFold } from './sidebar-fold'

export function SidebarFoldActions() {
  return (
    <>
      {([false, true] as const).map((expanded) => {
        const label = expanded ? '全部展开' : '全部收起'
        const Icon = expanded ? UnfoldVertical : FoldVertical
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground"
                aria-label={label}
                onClick={() => requestSidebarFold(expanded)}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}
