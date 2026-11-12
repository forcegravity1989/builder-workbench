import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function WorkbenchHelpPopover({ label, children }: { label: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}>
          <CircleHelp size={15} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label={label} align="end" className="w-72 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  )
}
