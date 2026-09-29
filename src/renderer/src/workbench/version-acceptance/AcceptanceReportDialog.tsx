import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Read-only derived minutes; copying is the only output — no second handwritten record. */
export function AcceptanceReportDialog({
  report,
  onClose,
  onCopy
}: {
  report: string | null
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
        className="va-modal"
        overlayClassName="va-dialog-overlay"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <header>
          <DialogTitle>验收纪要</DialogTitle>
          <button className="wb-btn wb-btn-secondary wb-btn-sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <pre>{report ?? '正在从当前结果生成纪要…'}</pre>
        <button
          className="wb-btn wb-btn-secondary"
          disabled={!report}
          onClick={() => void onCopy()}
        >
          复制纪要
        </button>
      </DialogContent>
    </Dialog>
  )
}
