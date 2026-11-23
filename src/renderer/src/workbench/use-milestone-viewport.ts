import { workCalendarDay } from '../../../shared/workbench/work-calendar'
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type RefObject,
  type HTMLAttributes
} from 'react'
import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'
import {
  milestoneDay,
  milestoneDate,
  milestoneToday,
  milestoneCalendar,
  withinCivilRange
} from '../../../shared/workbench/milestone-calendar'
import {
  MILESTONE_DAY_WIDTH as width,
  MILESTONE_LABEL_WIDTH as labelWidth,
  type MilestoneGestureApi
} from './use-milestone-gesture'
export type MilestoneLocation = { date: string; sequence: number }
export function useMilestoneViewport(
  props: {
    draft: MilestoneDraft
    viewDate?: string
    scrollX: number | null
    scrollY: number
    locate: MilestoneLocation | null
    newFeature: string | null
    onScroll(x: number, y: number, date: string): void
  },
  viewport: RefObject<HTMLDivElement | null>,
  gesture: MilestoneGestureApi
) {
  const draft = props.draft,
    today = milestoneDay(milestoneToday())
  const initial = useRef({
    date: props.viewDate ?? milestoneDate(today - 10),
    x: props.scrollX,
    y: props.scrollY
  })
  const [anchor, setAnchor] = useState(initial.current.date)
  const [range, setRange] = useState({
    start: milestoneDay(initial.current.date),
    end: milestoneDay(initial.current.date) + 28
  })
  const calendar = milestoneCalendar(draft, undefined, { date: anchor })
  const { start: origin, end, weeks } = calendar
  const canvasWidth = (end - origin + 1) * width
  const days = Array.from({ length: end - origin + 1 }, (_, i) => {
    const day = origin + i,
      date = milestoneDate(day)
    return { day, date, ...workCalendarDay(date) }
  })
  const pan = useRef<{ x: number; left: number } | null>(null)
  function readRange() {
    const el = viewport.current
    if (!el) {
      return
    }
    const start = origin + el.scrollLeft / width,
      endVisible = start + Math.max(1, (el.clientWidth - labelWidth) / width)
    setRange((old) =>
      old.start === start && old.end === endVisible ? old : { start, end: endVisible }
    )
    props.onScroll(el.scrollLeft % width, el.scrollTop, milestoneDate(Math.floor(start)))
    if (
      (origin > withinCivilRange(-Infinity) && start < origin + 35) ||
      (end < withinCivilRange(Infinity) && endVisible > end - 35)
    ) {
      setAnchor(milestoneDate(Math.floor(start)))
    }
  }
  const previousOrigin = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) {
      return
    }
    if (previousOrigin.current === null) {
      el.scrollLeft = Math.max(
        0,
        (milestoneDay(initial.current.date) - origin) * width + ((initial.current.x ?? 0) % width)
      )
      el.scrollTop = initial.current.y
    } else if (previousOrigin.current !== origin) {
      const shift = (previousOrigin.current - origin) * width
      el.scrollLeft += shift
      gesture.shiftViewport(shift)
      if (pan.current) {
        pan.current.left += shift
      }
    }
    previousOrigin.current = origin
    readRange()
  }, [origin])
  useEffect(() => {
    const observer = new ResizeObserver(readRange)
    if (viewport.current) {
      observer.observe(viewport.current)
    }
    return () => observer.disconnect()
  }, [origin])
  const appliedLocation = useRef<MilestoneLocation | null>(props.locate)
  useLayoutEffect(() => {
    if (!props.locate || props.locate === appliedLocation.current || !viewport.current) {
      return
    }
    const day = milestoneDay(props.locate.date)
    if ((day < origin || day > end - 30) && anchor !== props.locate.date) {
      setAnchor(props.locate.date)
      return
    }
    viewport.current.scrollLeft = Math.max(0, (day - origin) * width)
    appliedLocation.current = props.locate
    readRange()
  }, [props.locate, origin, end])
  const previousNewFeature = useRef(props.newFeature)
  useLayoutEffect(() => {
    if (props.newFeature !== previousNewFeature.current && props.newFeature && viewport.current) {
      viewport.current.scrollTop = 0
    }
    previousNewFeature.current = props.newFeature
  }, [props.newFeature])

  const scrollProps: HTMLAttributes<HTMLDivElement> = {
    onScroll: readRange,
    onPointerDown: (e) => {
      if (
        e.button !== 0 ||
        (e.target as HTMLElement).closest('button,input,textarea,select,label,[data-ml-stop-pan]')
      ) {
        return
      }
      pan.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      if (gesture.move(e)) {
        return
      }
      if (pan.current) {
        e.currentTarget.scrollLeft = pan.current.left + pan.current.x - e.clientX
      }
    },
    onPointerUp: () => {
      gesture.finish()
      pan.current = null
      readRange()
    },
    onPointerCancel: () => {
      gesture.finish(true)
      pan.current = null
    },
    onLostPointerCapture: () => {
      gesture.finish(true)
      pan.current = null
    },
    onKeyDownCapture: (e) => {
      if (
        gesture.active() &&
        (e.key === 'Escape' ||
          ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())))
      ) {
        e.preventDefault()
        e.stopPropagation()
        gesture.finish(true)
      }
    }
  }
  return { origin, end, weeks, canvasWidth, range, days, scrollProps }
}
