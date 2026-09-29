import { useState } from 'react'
import { Ban, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

export function CodeHubIssueStatusMenu({
  closed,
  busy = false,
  onSetState
}: {
  closed: boolean
  busy?: boolean
  onSetState: (
    state: 'open' | 'closed',
    stateReason?: 'completed' | 'not_planned' | 'duplicate',
    duplicateOf?: number
  ) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [duplicatePickerOpen, setDuplicatePickerOpen] = useState(false)
  const [duplicateOf, setDuplicateOf] = useState('')
  const closeMenu = (): void => {
    setOpen(false)
    setDuplicatePickerOpen(false)
  }
  const closeWith = (reason: 'completed' | 'not_planned'): void => {
    onSetState('closed', reason)
    closeMenu()
  }
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setDuplicatePickerOpen(false)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={translate('auto.components.GitHubItemDialog.00ccdf9b5a', 'Status')}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            'group/status inline-flex h-5 w-fit shrink-0 cursor-pointer items-center gap-1 self-center rounded-full border px-2 text-[10px] font-medium leading-none transition hover:brightness-125 hover:ring-1 hover:ring-white/10 disabled:opacity-50',
            closed
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
          )}
        >
          {closed ? null : <CircleDot className="size-2.5" />}
          <span>
            {closed
              ? translate('auto.components.TaskPage.d09bf34db7', 'Closed')
              : translate('auto.components.TaskPage.606a85c774', 'Open')}
          </span>
          <ChevronDown className="size-2.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(duplicatePickerOpen ? 'w-64' : 'w-56', 'p-1')}
        align="start"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {duplicatePickerOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const duplicate = Number(duplicateOf)
              if (!Number.isInteger(duplicate)) {
                return
              }
              onSetState('closed', 'duplicate', duplicate)
              setDuplicateOf('')
              closeMenu()
            }}
          >
            <div className="flex items-center gap-2 px-1 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-7"
                onClick={() => setDuplicatePickerOpen(false)}
                aria-label={translate('auto.components.TaskPage.backToCloseReasons', 'Back')}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-[12px] font-semibold">
                {translate('auto.components.TaskPage.closeAsDuplicate', 'Close as duplicate')}
              </span>
            </div>
            <div className="flex items-center gap-1 px-1 pb-1">
              <input
                value={duplicateOf}
                onChange={(event) => setDuplicateOf(event.target.value)}
                inputMode="numeric"
                autoFocus
                placeholder={translate('auto.components.TaskPage.codehubDuplicateOf', '#')}
                aria-label={translate(
                  'auto.components.TaskPage.codehubDuplicateOf',
                  'Duplicate of issue number'
                )}
                className="h-8 w-20 rounded-md border border-border/60 bg-background px-2 text-xs"
              />
              <Button size="sm" type="submit" variant="outline" disabled={busy || !duplicateOf.trim()}>
                {translate('auto.components.TaskPage.closeAsDuplicate', 'Close as duplicate')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] hover:bg-accent',
                !closed && 'bg-accent/50'
              )}
              onClick={() => {
                onSetState('open')
                closeMenu()
              }}
            >
              <CircleDot className="size-4 text-muted-foreground" />
              {translate('auto.components.TaskPage.606a85c774', 'Open')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
              onClick={() => closeWith('completed')}
            >
              <CheckCircle2 className="size-4 text-muted-foreground" />
              {translate('auto.components.TaskPage.closeAsCompleted', 'Close as completed')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
              onClick={() => closeWith('not_planned')}
            >
              <Ban className="size-4 text-muted-foreground" />
              {translate('auto.components.TaskPage.closeAsNotPlanned', 'Close as not planned')}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-accent"
              onClick={() => setDuplicatePickerOpen(true)}
            >
              <Copy className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {translate('auto.components.TaskPage.closeAsDuplicate', 'Close as duplicate')}
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
