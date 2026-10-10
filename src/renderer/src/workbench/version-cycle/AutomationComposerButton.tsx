import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * Page-header entry for the AI automation composer, next to the manual
 * 「配置自动化」 button. The one-line request rides with the disabled composer
 * automation as its one-shot prompt; the session it opens does the drafting,
 * trial runs and iteration. Enablement stays with the human.
 */
export function AutomationComposerButton({ onCompose }: { onCompose(request: string): void }) {
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState('')
  const submit = () => {
    const text = request.trim()
    if (!text) {
      return
    }
    setOpen(false)
    setRequest('')
    onCompose(text)
  }
  return (
    <>
      <button
        type="button"
        className="wb-btn wb-btn-ghost wb-btn-sm"
        title="用一句话让 AI 帮你配置定时任务"
        onClick={() => setOpen(true)}
      >
        <Sparkles size={13} aria-hidden="true" />
        AI 创建自动化
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="vp-modal"
          overlayClassName="vp-dialog-overlay"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <header>
            <DialogTitle>AI 创建自动化</DialogTitle>
          </header>
          <p>用一句话描述你想自动化的目标，AI 会起草配置、创建禁用状态的任务并试跑验证。</p>
          <textarea
            aria-label="自动化目标"
            value={request}
            rows={3}
            placeholder="例如：每天早上九点检查依赖有没有新版本"
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                submit()
              }
            }}
          />
          <button
            type="button"
            className="wb-btn wb-btn-secondary"
            disabled={!request.trim()}
            onClick={submit}
          >
            启动会话
          </button>
        </DialogContent>
      </Dialog>
    </>
  )
}
