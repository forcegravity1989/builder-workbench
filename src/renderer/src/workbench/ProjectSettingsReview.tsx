import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { CHARTER_LABELS, type useProjectSettings } from './use-project-settings'

export function ProjectSettingsReview({
  model,
  open,
  setOpen,
  onSubmitted,
  saveLocally
}: {
  model: ReturnType<typeof useProjectSettings>
  open: boolean
  setOpen: (open: boolean) => void
  onSubmitted: () => void
  saveLocally: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!model.busy) {
          setOpen(open)
        }
      }}
    >
      <DialogContent showCloseButton={false} className="wb-config-review">
        <header>
          <DialogTitle>确认项目信息变更</DialogTitle>
          <WorkbenchIconButton
            label="关闭变更对比"
            icon={X}
            onClick={() => setOpen(false)}
            disabled={model.busy}
          />
        </header>
        <DialogDescription>
          {saveLocally
            ? '变更将保存到项目所在主机，尚未共享。'
            : '提交后等待评审；合入并更新代码后，项目卡片显示新信息。'}
        </DialogDescription>
        <div className="wb-config-diff">
          {model.changes.map((field) => (
            <section key={field}>
              <h3>{CHARTER_LABELS[field]}</h3>
              <dl>
                <div>
                  <dt>原值</dt>
                  <dd>{model.form!.baseline[field] || '未填写'}</dd>
                </div>
                <div>
                  <dt>改为</dt>
                  <dd>{model.form!.value[field].trim() || '留空'}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
        {model.error ? (
          <p className="wb-config-error" role="alert">
            {model.error}
          </p>
        ) : null}
        <footer>
          <button
            type="button"
            className="wb-btn wb-btn-ghost"
            disabled={model.busy}
            onClick={() => setOpen(false)}
          >
            继续编辑
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary"
            disabled={model.busy}
            onClick={() =>
              void model.submit().then((ok) => {
                if (ok) {
                  setOpen(false)
                  onSubmitted()
                }
              })
            }
          >
            {model.busy ? '提交中…' : saveLocally ? '保存到主机' : '提交 PR'}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
