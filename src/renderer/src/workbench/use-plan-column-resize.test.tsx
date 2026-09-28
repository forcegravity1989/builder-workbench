// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { usePlanColumnResize } from './use-plan-column-resize'

it('reapplies the column width when entering the workflow without remounting the native workspace', async () => {
  const callbacks: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    }
  )
  localStorage.clear()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Probe({ enabled }: { enabled: boolean }) {
    const resize = usePlanColumnResize(enabled)
    return (
      <div data-container ref={resize.bodyRef}>
        <div
          data-workspace
          ref={resize.chatColRef}
          style={enabled ? undefined : { flex: 1, width: '100%' }}
        />
      </div>
    )
  }
  try {
    await act(async () => root.render(<Probe enabled={false} />))
    const container = host.querySelector('[data-container]')!
    const workspace = host.querySelector<HTMLElement>('[data-workspace]')!
    Object.defineProperty(container, 'clientWidth', { value: 1000 })
    await act(async () => callbacks.forEach((callback) => callback()))
    await act(async () => root.render(<Probe enabled />))
    expect(host.querySelector('[data-workspace]')).toBe(workspace)
    expect(workspace.style.width).toBe('300px')
    await act(async () => root.render(<Probe enabled={false} />))
    await act(async () => root.render(<Probe enabled />))
    expect(workspace.style.width).toBe('300px')
  } finally {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
