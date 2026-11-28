import React, { useCallback, useState } from 'react'
import { Check, ChevronsUpDown, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/class-names'
import type {
  TeamGroupSpaceOption,
  TeamGroupSpaceResolveFailure
} from '../../../shared/team-group-discovery'
import { teamGroupSpaceDetail } from './team-group-search'
import { openW3AccountSettings } from './open-w3-account-settings'
import type { TeamBindingSelection, TeamGroupListState } from './use-team-group-picker'

type TeamGroupSpaceComboboxProps = {
  listState: TeamGroupListState
  options: readonly TeamGroupSpaceOption[]
  selection: TeamBindingSelection | null
  resolving: boolean
  resolveFailure: TeamGroupSpaceResolveFailure | null
  disabled: boolean
  onQueryChange: (query: string) => void
  onChoose: (space: TeamGroupSpaceOption) => void
  onRetry: () => void
}

type FailureCopy = { message: string; needsW3Account: boolean }

// Why fixed strings rather than the raw error: a rejected OneBox call carries
// cookies, CSRF tokens and stack frames, none of which belong on screen. The
// reason the main process derived is the only thing shown.
function failureCopy(reason: TeamGroupSpaceResolveFailure): FailureCopy {
  switch (reason) {
    case 'w3-unconfigured':
      return { message: '还没配置 W3 账户，读不到群列表。', needsW3Account: true }
    case 'w3-not-signed-in':
      return { message: 'W3 账户未登录，读不到群列表。', needsW3Account: true }
    case 'onebox-unauthorized':
      return {
        message: 'W3 免密登录没有通过 OneBox 校验，读不到群列表。',
        needsW3Account: true
      }
    case 'rate-limit':
      return { message: 'OneBox 接口限流，稍后重试。', needsW3Account: false }
    case 'unreachable':
      return { message: '连不上 OneBox 群空间服务。', needsW3Account: false }
    case 'parse-failed':
      return { message: 'OneBox 返回的群列表无法解析。', needsW3Account: false }
    case 'not-a-group-space':
      // Only a resolve can report this: the list already filters the spaces
      // that have no WeLink group behind them.
      return { message: '这个空间没有关联 WeLink 群，换一个群试试。', needsW3Account: false }
  }
}

function FailureBlock({ reason }: { reason: TeamGroupSpaceResolveFailure }): React.JSX.Element {
  const copy = failureCopy(reason)
  return (
    <div className="space-y-2 px-3 py-3" role="alert">
      <p className="text-xs text-destructive">{copy.message}</p>
      {copy.needsW3Account ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          // The settings page replaces this dialog, so the mouse-down that would
          // otherwise close the popover first is irrelevant — but suppressing it
          // keeps focus on the button for keyboard users.
          onMouseDown={(event) => event.preventDefault()}
          onClick={openW3AccountSettings}
        >
          打开 W3 账户设置
        </Button>
      ) : null}
    </div>
  )
}

function ListBody({
  listState,
  options,
  selection,
  resolveFailure,
  onChoose
}: Pick<
  TeamGroupSpaceComboboxProps,
  'listState' | 'options' | 'selection' | 'resolveFailure' | 'onChoose'
>): React.JSX.Element {
  if (listState.phase === 'idle' || listState.phase === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-label="正在读取群列表" />
        正在读取 W3 账户可见的群…
      </div>
    )
  }
  if (listState.phase === 'failed') {
    return <FailureBlock reason={listState.reason} />
  }
  return (
    <>
      <CommandList>
        <CommandEmpty>没有匹配的群。</CommandEmpty>
        {options.map((space) => {
          const isSelected = selection?.spaceId === space.spaceId
          const detail = teamGroupSpaceDetail(space)
          return (
            <CommandItem
              key={space.spaceId}
              value={space.spaceId}
              onSelect={() => onChoose(space)}
              className="items-center gap-2 px-3 py-1.5 text-xs"
            >
              <Check
                className={cn('size-3 shrink-0', isSelected ? 'opacity-70' : 'opacity-0')}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs">{space.name}</span>
                {detail ? (
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {detail}
                  </span>
                ) : null}
              </span>
            </CommandItem>
          )
        })}
      </CommandList>
      {resolveFailure ? <FailureBlock reason={resolveFailure} /> : null}
      {listState.truncated ? (
        <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          群数量超过上限，只列出了最近的一部分。输入群名称缩小范围。
        </p>
      ) : null}
    </>
  )
}

/**
 * The single input that replaces the two manual ID fields: pick a WeLink group
 * by name and both IDs are derived. The list arrives once from OneBox and is
 * narrowed locally, so an empty query still lets the user scroll every name.
 */
export function TeamGroupSpaceCombobox({
  listState,
  options,
  selection,
  resolving,
  resolveFailure,
  disabled,
  onQueryChange,
  onChoose,
  onRetry
}: TeamGroupSpaceComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        // Reopening after a failure retries; reopening with a list does not.
        onRetry()
      } else {
        onQueryChange('')
      }
    },
    [onQueryChange, onRetry]
  )

  const handleChoose = useCallback(
    (space: TeamGroupSpaceOption) => {
      // Close on choose like the approved prototype: the read-only ID line
      // underneath is what the user reads next, and the panel would cover it.
      setOpen(false)
      onQueryChange('')
      onChoose(space)
    },
    [onChoose, onQueryChange]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="WeLink 群名称"
          disabled={disabled}
          className="h-9 w-full justify-between gap-2 px-3 text-sm font-normal"
        >
          {resolving ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">正在获取群 ID…</span>
            </span>
          ) : selection ? (
            <span className="min-w-0 truncate">{selection.name}</span>
          ) : (
            <span className="text-muted-foreground">选择 WeLink 群</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Group names run to 65 characters, so the panel is wider than the trigger's minimum. */}
      <PopoverContent
        align="start"
        className="w-[min(420px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            placeholder="搜索群名称"
            onValueChange={onQueryChange}
            className="text-xs"
          />
          <ListBody
            listState={listState}
            options={options}
            selection={selection}
            resolveFailure={resolveFailure}
            onChoose={handleChoose}
          />
        </Command>
      </PopoverContent>
    </Popover>
  )
}
