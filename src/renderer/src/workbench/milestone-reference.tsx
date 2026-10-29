import { Button } from '@/components/ui/button'
import { BookOpen } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export function MilestoneReference() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <MilestoneIconButton label="设计参考">
          <BookOpen size={16} />
        </MilestoneIconButton>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-reference" align="end">
        <strong>设计参考</strong>
        <p>
          参考 Linear Initiatives 的方向衔接、Cycles 的节奏与发布区分；保留 BW
          的版本计划和人工验收边界。
        </p>
        <Button
          variant="outline"
          size="xs"
          onClick={() => void window.api.shell.openUrl('https://linear.app/docs/initiatives')}
        >
          Linear Initiatives
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => void window.api.shell.openUrl('https://linear.app/docs/use-cycles')}
        >
          Linear Cycles
        </Button>
      </PopoverContent>
    </Popover>
  )
}
