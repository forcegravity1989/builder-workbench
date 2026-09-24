import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronRight, ListFilter } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

export function CodeHubFilterPopover({ model }: { model: TaskPageComposerActionsModel }) {
  const {
    codehubView,
    codehubState,
    setCodehubState,
    setCodehubPreset,
    codehubAuthor,
    setCodehubAuthor,
    codehubAssignee,
    setCodehubAssignee
  } = model
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSection, setFilterSection] = useState<'status' | 'author' | 'assignee' | null>(null)
  const states =
    codehubView === 'mrs'
      ? (['opened', 'merged', 'closed', 'all'] as const)
      : (['opened', 'closed', 'all'] as const)
  const filterCount =
    (codehubState !== 'opened' ? 1 : 0) + (codehubAuthor ? 1 : 0) + (codehubAssignee ? 1 : 0)
  return (
    <Popover
      open={filterOpen}
      onOpenChange={(open) => {
        setFilterOpen(open)
        if (!open) {
          setFilterSection(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-md border-border/60 bg-background px-2.5 text-xs font-medium text-foreground shadow-xs hover:bg-muted/60"
        >
          <ListFilter className="size-3.5" />
          {translate('auto.components.github.PRFilterDropdowns.79c54552f7', 'Filters')}
          {filterCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[10px] font-medium text-foreground">
              {filterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {filterSection === null ? (
          <div className="py-1 text-xs">
            {(
              [
                [
                  'status',
                  translate('auto.components.github.PRFilterSections.764a0b4ce1', 'Status'),
                  codehubState
                ],
                [
                  'author',
                  translate('auto.components.github.PRFilterSections.24754c44ad', 'Author'),
                  codehubAuthor
                ],
                [
                  'assignee',
                  translate('auto.components.github.PRFilterSections.ea3416d646', 'Assignee'),
                  codehubAssignee
                ]
              ] as const
            ).map(([key, label, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterSection(key)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-muted/50"
              >
                <span>{label}</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {value ? <span className="max-w-[140px] truncate">{value}</span> : null}
                  <ChevronRight className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        ) : filterSection === 'status' ? (
          <div className="flex flex-col py-1 text-xs">
            {states.map((state) => (
              <button
                key={state}
                type="button"
                className="px-3 py-1.5 text-left hover:bg-muted/50"
                onClick={() => {
                  setCodehubState(state)
                  setCodehubPreset('open')
                  setFilterOpen(false)
                  setFilterSection(null)
                }}
              >
                {state === 'opened'
                  ? translate('auto.components.TaskPage.606a85c774', 'Open')
                  : state === 'merged'
                    ? translate('auto.components.TaskPage.37a82eaaf8', 'Merged')
                    : state === 'closed'
                      ? translate('auto.components.TaskPage.d09bf34db7', 'Closed')
                      : translate(
                          'auto.components.github.PRFilterSections.2b2f019091',
                          'Any state'
                        )}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="flex flex-col gap-2 p-3"
            onSubmit={(event) => {
              event.preventDefault()
              setFilterOpen(false)
              setFilterSection(null)
            }}
          >
            <Input
              autoFocus
              value={filterSection === 'author' ? codehubAuthor : codehubAssignee}
              onChange={(event) => {
                if (filterSection === 'author') {
                  setCodehubAuthor(event.target.value)
                } else {
                  setCodehubAssignee(event.target.value)
                }
              }}
              placeholder={
                filterSection === 'author'
                  ? translate('auto.components.github.PRFilterSections.24754c44ad', 'Author')
                  : translate('auto.components.github.PRFilterSections.ea3416d646', 'Assignee')
              }
            />
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
