import { toast } from 'sonner'
import { openImprovementAssistant } from './open-assistant'
import type { ReactGrabAPI } from 'react-grab'

let ready: Promise<ReactGrabAPI> | null = null

export function prepareImprovementAnnotation(): Promise<ReactGrabAPI> {
  return (ready ??= initialize().catch((error) => {
    ready = null
    throw error
  }))
}

function setToolbarVisible(api: ReactGrabAPI, visible: boolean): void {
  api.registerPlugin({
    name: 'bw-improvement-toolbar',
    theme: { toolbar: { enabled: visible } }
  })
}

export async function toggleImprovementAnnotation(): Promise<void> {
  try {
    const api = await prepareImprovementAnnotation()
    if (api.isActive()) {
      api.deactivate()
      setToolbarVisible(api, false)
    } else {
      setToolbarVisible(api, true)
      api.setToolbarState({ collapsed: false })
      api.comment()
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '无法开启批注，请重试。')
  }
}

async function initialize(): Promise<ReactGrabAPI> {
  const { getGlobalApi, init } = await import('react-grab')
  await import('react-grab/styles.css')
  const api = getGlobalApi() ?? init()
  api.setOptions({
    freezeReactUpdates: false,
    ...(!import.meta.env.DEV ? { activationKey: () => false } : {})
  })
  setToolbarVisible(api, false)
  api.registerPlugin({
    name: 'bw-improvement-activation',
    hooks: { onActivate: () => setToolbarVisible(api, true) }
  })
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !api.getState().isPromptMode) {
        api.deactivate()
        setToolbarVisible(api, false)
      }
    },
    true
  )
  attachHandoff(api)
  return api
}

function attachHandoff(api: ReactGrabAPI): void {
  let copying = false
  let copied: string | null = null
  let entries: { content: string; commentText?: string }[] = []
  const consumed = new Map<string, string>()
  let busy = false
  let button: HTMLButtonElement | null = null
  const observedRoots = new WeakSet<ShadowRoot>()
  const positionButton = (): void => {
    const toolbar = button?.parentElement
    if (!button || !toolbar) {
      return
    }
    const fitsRight = toolbar.getBoundingClientRect().right + 36 <= window.innerWidth
    button.style.left = fitsRight ? 'calc(100% + 4px)' : 'auto'
    button.style.right = fitsRight ? 'auto' : 'calc(100% + 4px)'
  }
  window.addEventListener('copy', (event) => {
    if (!copying) {
      return
    }
    copied = event.clipboardData?.getData('text/plain') || null
    try {
      const payload = JSON.parse(event.clipboardData?.getData('application/x-react-grab') || '{}')
      entries = Array.isArray(payload.entries)
        ? payload.entries.filter(
            (entry: { content?: unknown }) => typeof entry.content === 'string'
          )
        : []
    } catch {
      entries = []
    }
  })
  const send = async (root: ShadowRoot): Promise<void> => {
    if (busy) {
      return
    }
    const comments = root.querySelector('[data-react-grab-toolbar-comments]')
    if (!comments?.getAttribute('aria-label')?.includes('items')) {
      toast.info('请先选择对象，输入批注并按 Enter 保存。')
      return
    }
    const copy = root.querySelector<HTMLButtonElement>('[data-react-grab-toolbar-copy-all]')
    copied = null
    entries = []
    copying = true
    try {
      copy?.click()
    } finally {
      copying = false
    }
    const batch = entries.filter((entry) => !consumed.has(JSON.stringify(entry)))
    const content =
      batch.length > 0
        ? batch
            .map((entry) =>
              entry.commentText && !entry.content.includes(entry.commentText)
                ? `${entry.commentText}\n\n${entry.content}`
                : entry.content
            )
            .join('\n\n')
        : entries.map((entry) => consumed.get(JSON.stringify(entry))).find(Boolean)
    if (!copied || !content || entries.length === 0) {
      toast.error('未取得批注，现场仍保留，请重新交接。')
      return
    }
    busy = true
    if (button) {
      button.disabled = true
    }
    api.deactivate()
    setToolbarVisible(api, false)
    try {
      await openImprovementAssistant(content)
      for (const entry of batch) {
        consumed.set(JSON.stringify(entry), content)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '交接失败，批注仍保留。', {
        duration: 12000,
        action: {
          label: '重试',
          onClick: () => {
            void retry(content, batch)
          }
        }
      })
    } finally {
      busy = false
      if (button) {
        button.disabled = false
      }
    }
  }
  const retry = async (content: string, batch: typeof entries): Promise<void> => {
    try {
      await openImprovementAssistant(content)
      for (const entry of batch) {
        consumed.set(JSON.stringify(entry), content)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '交接失败，请稍后重试。')
    }
  }
  const attach = (): void => {
    const root = document.querySelector('[data-react-grab]')?.shadowRoot
    if (root && !observedRoots.has(root)) {
      observer.observe(root, { childList: true, subtree: true })
      observedRoots.add(root)
    }
    const toolbar = root?.querySelector('[data-react-grab-toolbar]')
    if (!root || !toolbar || button?.isConnected) {
      return
    }
    button = document.createElement('button')
    button.type = 'button'
    button.title = '交给改进助手'
    button.setAttribute('aria-label', '交给改进助手')
    button.setAttribute('data-react-grab-ignore-events', '')
    button.setAttribute('data-bw-send-improvement', '')
    button.style.cssText =
      'position:absolute;left:calc(100% + 4px);top:0;display:grid;place-items:center;width:28px;height:28px;border:1px solid #ddd;background:white;color:#222;cursor:pointer;border-radius:6px;box-shadow:0 1px 3px #0002'
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('width', '16')
    icon.setAttribute('height', '16')
    icon.setAttribute('fill', 'none')
    icon.setAttribute('stroke', 'currentColor')
    icon.setAttribute('stroke-width', '2')
    icon.setAttribute('aria-hidden', 'true')
    for (const d of ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13']) {
      const path = document.createElementNS(icon.namespaceURI, 'path')
      path.setAttribute('d', d)
      icon.appendChild(path)
    }
    button.appendChild(icon)
    button.onclick = () => {
      void send(root)
    }
    toolbar.appendChild(button)
    positionButton()
  }
  // React Grab exposes selection hooks, but no toolbar slot or aggregate-copy API.
  const observer = new MutationObserver(attach)
  observer.observe(document.body, { childList: true })
  api.onToolbarStateChange(() => requestAnimationFrame(positionButton))
  window.addEventListener('resize', positionButton)
  attach()
  const timer = window.setInterval(() => {
    attach()
    if (button?.isConnected) {
      window.clearInterval(timer)
    }
  }, 100)
}
