import { CircleUserRound } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react'

export type WallAvatarSource = {
  id: string
  label: string
  online: boolean | null
  onOpen(): void
}

const AVATAR_SIZE = 26
const AVATAR_GAP = 20
const STEP_DELAY = 70
const MOVE_DURATION = 280

export function WallSourceAvatarGroup({ sources }: { sources: readonly WallAvatarSource[] }) {
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const opening = useRef(false)
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [bounds, setBounds] = useState({ left: 0, top: 28, width: 0 })
  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const close = useCallback(() => {
    clearTimer()
    opening.current = false
    setExpanded(false)
    timer.current = setTimeout(
      () => {
        setVisible(false)
        timer.current = null
      },
      reducedMotion() ? 0 : MOVE_DURATION + Math.max(0, sources.length - 1) * STEP_DELAY
    )
  }, [clearTimer, sources.length])
  const toggle = () => {
    if (opening.current) {
      close()
    } else {
      clearTimer()
      opening.current = true
      setVisible(true)
      timer.current = setTimeout(
        () => {
          setExpanded(true)
          timer.current = null
        },
        reducedMotion() ? 0 : 30
      )
    }
  }
  useEffect(() => clearTimer, [clearTimer])
  useLayoutEffect(() => {
    if (!visible || !root.current) {
      return
    }
    const element = root.current
    const card = element.closest<HTMLElement>('.pcard')
    if (!card) {
      return
    }
    const measure = () => {
      const anchor = element.getBoundingClientRect()
      const rectangle = card.getBoundingClientRect()
      const laneWidth = sources.length * AVATAR_SIZE + Math.max(0, sources.length - 1) * AVATAR_GAP
      const width = Math.min(laneWidth + 28, Math.max(AVATAR_SIZE, rectangle.width - 26))
      const top = Math.max(rectangle.top + 8, Math.min(anchor.bottom + 4, rectangle.bottom - 84))
      setBounds({ left: rectangle.right - 13 - width - anchor.left, top: top - anchor.top, width })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [visible, sources.length])
  useEffect(() => {
    if (!visible) {
      return
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        close()
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        root.current?.querySelector<HTMLButtonElement>('.pcard-avatar-trigger')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [visible, close])
  const count = Math.min(sources.length, 4)
  if (!count) {
    return null
  }
  return (
    <div
      ref={root}
      className="pcard-avatar-group"
      data-visible={visible}
      data-expanded={expanded}
      data-has-more={sources.length > 4}
      style={{ width: AVATAR_SIZE + (Math.max(0, count - 1) * AVATAR_SIZE * 2) / 3 }}
      role="group"
      aria-label="项目来源（主机）"
    >
      <div
        className="pcard-avatar-track"
        style={visible ? { left: bounds.left, top: bounds.top, width: bounds.width } : undefined}
      >
        <div
          className="pcard-avatar-lane"
          style={
            visible
              ? {
                  width:
                    sources.length * AVATAR_SIZE + Math.max(0, sources.length - 1) * AVATAR_GAP + 14
                }
              : undefined
          }
        >
          {sources.map((source, index) => (
            <div
              key={source.id}
              className="pcard-avatar-entry"
              style={
                {
                  '--avatar-index': index,
                  '--avatar-stack': Math.min(index, 3),
                  '--avatar-delay': `${(expanded ? index : sources.length - 1 - index) * STEP_DELAY}ms`,
                  zIndex: index + 1
                } as CSSProperties
              }
            >
              <button
                type="button"
                className="pcard-avatar-trigger"
                title={`${source.label} · ${source.online === null ? '连接状态未知' : source.online ? '在线' : '离线'}`}
                aria-label={`${expanded ? '收起' : '展开'}项目来源：${source.label}`}
                aria-expanded={expanded}
                onClick={toggle}
              >
                <CircleUserRound size={22} />
                <span
                  className={`pcard-source-dot${source.online === true ? ' is-online' : source.online === false ? ' is-offline' : ''}`}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className="pcard-avatar-name"
                tabIndex={expanded ? 0 : -1}
                aria-hidden={!expanded}
                title={source.label}
                disabled={source.online === false}
                onClick={source.onOpen}
              >
                {source.label.replace(/的电脑$/, '')}
              </button>
            </div>
          ))}
          {sources.length > 4 && (
            <button
              type="button"
              className="pcard-avatar-trigger pcard-avatar-more"
              onClick={toggle}
              aria-label={`展开全部 ${sources.length} 个项目来源`}
              aria-expanded={expanded}
              style={{ left: 52, zIndex: sources.length + 1 }}
            >
              +{sources.length - 3}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
