import { BookOpen } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
export function MilestoneReference() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="wb-btn wb-btn-ghost wb-btn-sm" aria-label="设计参考">
          <BookOpen size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-reference" align="end">
        <strong>设计参考</strong>
        <p>
          参考 Linear Initiatives 的方向衔接、Cycles 的节奏与发布区分；保留 BW
          的版本计划和人工验收边界。
        </p>
        <button
          className="wb-btn wb-btn-secondary"
          onClick={() => void window.api.shell.openUrl('https://linear.app/docs/initiatives')}
        >
          Linear Initiatives
        </button>
        <button
          className="wb-btn wb-btn-secondary"
          onClick={() => void window.api.shell.openUrl('https://linear.app/docs/use-cycles')}
        >
          Linear Cycles
        </button>
      </PopoverContent>
    </Popover>
  )
}
