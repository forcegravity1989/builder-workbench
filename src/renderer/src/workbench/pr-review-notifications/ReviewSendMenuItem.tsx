import { Send } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

export function ReviewSendMenuItem({
  disabled,
  reason,
  onSend
}: {
  disabled: boolean
  reason?: string
  onSend: () => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled} onSelect={onSend}>
        <Send className="size-3.5" />
        {reason ? `发送评审（${reason}）` : '发送评审…'}
      </DropdownMenuItem>
    </>
  )
}
