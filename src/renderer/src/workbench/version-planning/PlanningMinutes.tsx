import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export function PlanningMinutes({
  minutes,
  onClose,
  onCopy
}: {
  minutes: string
  onClose(): void
  onCopy(): Promise<void>
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="vp-modal"
        overlayClassName="vp-dialog-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <header>
          <DialogTitle>预览纪要</DialogTitle>
          <button className="wb-btn wb-btn-secondary wb-btn-sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <pre>{minutes}</pre>
        <button className="wb-btn wb-btn-secondary" onClick={() => void onCopy()}>
          复制纪要
        </button>
      </DialogContent>
    </Dialog>
  )
}
