import { ArrowRightLeft, LoaderCircle, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TeamGroupSpaceCombobox } from './TeamGroupSpaceCombobox'
import { useTeamGroupPicker, type TeamBindingSelection } from './use-team-group-picker'

export function TeamDirectoryReadFailure({
  switchButtonRef,
  onSwitch,
  onRetry
}: {
  switchButtonRef: React.Ref<HTMLButtonElement>
  onSwitch: () => void
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-destructive" role="alert">
        团队目录读取失败。已保留当前团队绑定。
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button ref={switchButtonRef} type="button" variant="ghost" onClick={onSwitch}>
          <ArrowRightLeft />
          切换团队
        </Button>
        <Button type="button" onClick={onRetry}>
          重试读取团队目录
        </Button>
      </div>
    </div>
  )
}

type TeamBindingFormProps = {
  selection: TeamBindingSelection | null
  onSelectionChange: (next: TeamBindingSelection | null) => void
  switching: boolean
  editedLocally: boolean
  loading: boolean
  failed: boolean
  onCancel: () => void
  onSubmit: () => void
}

/**
 * Bind a team by picking its WeLink group by name. Both IDs the team directory
 * is keyed by are derived from the pick, so neither is ever typed by hand.
 */
export function TeamBindingForm({
  selection,
  onSelectionChange,
  switching,
  editedLocally,
  loading,
  failed,
  onCancel,
  onSubmit
}: TeamBindingFormProps): React.JSX.Element {
  const picker = useTeamGroupPicker(onSelectionChange)
  const canSubmit = selection !== null && !loading && !picker.resolving
  const action = switching ? '读取并切换' : '绑定团队'
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) {
          onSubmit()
        }
      }}
    >
      <div className="grid min-w-0 gap-1">
        <span className="text-sm">WeLink 群名称</span>
        <TeamGroupSpaceCombobox
          listState={picker.listState}
          options={picker.options}
          selection={selection}
          query={picker.query}
          resolving={picker.resolving}
          resolveFailure={picker.resolveFailure}
          disabled={loading}
          onQueryChange={picker.setQuery}
          onChoose={picker.choose}
          onRetry={picker.reload}
        />
      </div>
      {selection && (
        <p className="text-xs text-muted-foreground">
          群 ID <span className="font-mono">{selection.groupId}</span> · 群空间 ID{' '}
          <span className="font-mono">{selection.spaceId}</span>
        </p>
      )}
      {switching && (
        <p className="text-sm text-muted-foreground">
          已保存的远程主机会保留，可在「管理远程主机」移除。
        </p>
      )}
      {switching && editedLocally && <p className="text-sm">切换后将丢弃未保存的修改。</p>}
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          未能读取新团队，当前团队保持不变。重新选择群后重试。
        </p>
      )}
      <div className="flex justify-end gap-2">
        {switching && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={!canSubmit}>
          {loading || picker.resolving ? (
            <LoaderCircle className="animate-spin" />
          ) : !switching ? (
            <UsersRound />
          ) : null}
          {loading && switching ? '正在读取团队…' : action}
        </Button>
      </div>
    </form>
  )
}
