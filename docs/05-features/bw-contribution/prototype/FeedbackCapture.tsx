import { createContext, useContext, useRef, useState } from 'react'
import type { ReactGrabAPI } from 'react-grab'
import { Button } from '@/components/ui/button'

type Capture = {
  context: string
  status: string
  activate: () => Promise<void>
  clear: () => void
  reset: () => void
}

export const FeedbackCaptureContext = createContext<Capture | null>(null)

// Prototype-only slot added to the existing dialog during the artifact build.
export function FeedbackCaptureSlot() {
  const capture = useContext(FeedbackCaptureContext)
  if (!capture) {
    return null
  }
  return (
    <section
      className="space-y-2 rounded-md border border-border p-3 text-xs"
      data-testid="feedback-capture"
    >
      <div className="flex items-center justify-between gap-2">
        <span>反馈现场</span>
        <Button
          variant="outline"
          size="sm"
          onClick={capture.activate}
          data-testid="feedback-select-element"
        >
          {capture.context ? '重新选取元素（开发版）' : '选取界面元素（开发版）'}
        </Button>
      </div>
      <p className="text-muted-foreground">
        选取时暂收起弹窗；完成后回到这份草稿，元素信息随反馈发送。也可直接附图说明。
      </p>
      {capture.status && <p role="status">{capture.status}</p>}
      {capture.context && (
        <>
          <details>
            <summary>已带入元素信息</summary>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap">{capture.context}</pre>
          </details>
          <Button variant="ghost" size="sm" onClick={capture.clear}>
            移除元素信息
          </Button>
        </>
      )}
    </section>
  )
}

export function useFeedbackCapture(setOpen: (open: boolean) => void): Capture {
  const [context, setContext] = useState('')
  const [status, setStatus] = useState('')
  const apiRef = useRef<ReactGrabAPI | null>(null)
  const pending = useRef(false)
  const captured = useRef(false)
  const restore = () => {
    if (!pending.current) {
      return
    }
    pending.current = false
    if (!captured.current) {
      setStatus('已取消本次选取，原反馈草稿保持不变。')
    }
    // Let the selection overlay release focus before Radix restores the dialog.
    requestAnimationFrame(() => setOpen(true))
  }
  const activate = async () => {
    pending.current = true
    captured.current = false
    setOpen(false)
    try {
      // Finish Radix's exit animation before React Grab freezes page animations.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const { getGlobalApi, init } = await import('react-grab')
      if (!apiRef.current) {
        const api = getGlobalApi() ?? init({ freezeReactUpdates: false })
        api.setOptions({ freezeReactUpdates: false })
        api.registerPlugin({
          name: 'bw-feedback-context',
          hooks: {
            onDeactivate: restore,
            transformCopyContent: (content) => {
              // Reuse the library's element/context output; clipboard access is not required to retain it.
              if (pending.current) {
                captured.current = true
                setContext(content)
                setStatus('元素信息已带入，请补一句问题或期望。')
              }
              return content
            },
            onAfterCopy: () => {
              api.deactivate()
              restore()
            },
            onCopyError: () => {
              setStatus('剪贴板复制未成功；已取得的元素信息仍保留，可继续填写。')
              api.deactivate()
              restore()
            }
          }
        })
        apiRef.current = api
      }
      if (!pending.current) {
        return
      }
      // Wait for the modal overlay to unmount before the native picker handles the pointer.
      requestAnimationFrame(() => requestAnimationFrame(() => apiRef.current?.activate()))
      setStatus('选择相关元素，使用 React Grab 的复制操作完成；Esc 返回草稿。')
    } catch {
      setStatus('元素工具未能启动，草稿已恢复。可重试或附图继续。')
      restore()
    }
  }
  return {
    context,
    status,
    activate,
    reset: () => {
      pending.current = false
      apiRef.current?.deactivate()
      setContext('')
      setStatus('')
    },
    clear: () => {
      setContext('')
      setStatus('')
    }
  }
}
