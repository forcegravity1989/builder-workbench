import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { CycleSession } from './ports'
import { prepareCycleRequest } from './native-session'

/** The native modal protects the composer while one unsent request is prepared. */
export function useCycleRequest(workspaceKey: string) {
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => pending.current?.abort(), [workspaceKey])
  const prepareRequest = useCallback(async (session: CycleSession, text: string) => {
    if (pending.current) {
      throw new Error('正在准备会话请求，请稍后再操作。')
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 25_000)
    try {
      const cancelled = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () =>
            reject(
              new Error(timedOut ? '等待会话超时，请确认会话已就绪后重试。' : '已取消会话请求。')
            ),
          { once: true }
        )
      })
      await Promise.race([prepareCycleRequest(session, text, controller.signal), cancelled])
    } finally {
      clearTimeout(timer)
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }, [])
  return {
    prepareRequest,
    progress: (
      <Dialog
        open={busy}
        onOpenChange={(open) => {
          if (!open) {
            pending.current?.abort()
          }
        }}
      >
        <DialogContent>
          <DialogTitle>正在准备会话请求</DialogTitle>
          <DialogDescription>正在把请求放入当前会话，完成后可核对并发送。</DialogDescription>
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <Button variant="outline" onClick={() => pending.current?.abort()}>
            取消
          </Button>
        </DialogContent>
      </Dialog>
    )
  }
}
