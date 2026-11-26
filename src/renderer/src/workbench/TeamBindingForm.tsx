import { LoaderCircle, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type TeamBindingFormProps = {
  groupId: string
  spaceId: string
  onGroupIdChange: (value: string) => void
  onSpaceIdChange: (value: string) => void
  switching: boolean
  editedLocally: boolean
  loading: boolean
  failed: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function TeamBindingForm({
  groupId,
  spaceId,
  onGroupIdChange,
  onSpaceIdChange,
  switching,
  editedLocally,
  loading,
  failed,
  onCancel,
  onSubmit
}: TeamBindingFormProps): React.JSX.Element {
  const canSubmit = Boolean(groupId.trim() && spaceId.trim()) && !loading
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1">
          <span className="text-sm">WeLink 群 ID</span>
          <Input
            value={groupId}
            onChange={(event) => onGroupIdChange(event.target.value)}
            inputMode="numeric"
            disabled={loading}
            autoFocus
          />
        </label>
        <label className="grid min-w-0 gap-1">
          <span className="text-sm">群空间 ID</span>
          <Input
            value={spaceId}
            onChange={(event) => onSpaceIdChange(event.target.value)}
            inputMode="numeric"
            disabled={loading}
          />
        </label>
      </div>
      {switching && (
        <p className="text-sm text-muted-foreground">
          已保存的远程主机会保留，可在「管理远程主机」移除。
        </p>
      )}
      {switching && editedLocally && <p className="text-sm">切换后将丢弃未保存的修改。</p>}
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          未能读取新团队，当前团队保持不变。核对两个 ID 后重试。
        </p>
      )}
      <div className="flex justify-end gap-2">
        {switching && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={!canSubmit}>
          {loading ? <LoaderCircle className="animate-spin" /> : !switching ? <UsersRound /> : null}
          {loading && switching ? '正在读取团队…' : action}
        </Button>
      </div>
    </form>
  )
}
