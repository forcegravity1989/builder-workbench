import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MousePointer2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { DirectionWallDemo } from './DirectionWallDemo'
import { DirectionCharterDemo } from './DirectionCharterDemo'
import { DirectionMilestoneDemo } from './DirectionMilestoneDemo'
import './direction-walkthrough.css'

const durations = [5700, 9800, 8300, 9550] as const
const wholeJourney = [0, 1, 2, 3] as const
type Step = (typeof wholeJourney)[number]

function getSteps() {
  return [
    {
      title: translate('guidance.direction.wall.title', 'Find the project'),
      action: translate(
        'guidance.direction.wall.body',
        'Open the project overview from the project wall.'
      )
    },
    {
      title: translate('guidance.direction.card.title', 'Agree on the direction'),
      action: translate(
        'guidance.direction.card.body',
        'Edit the vision and check the review summary.'
      )
    },
    {
      title: translate('guidance.direction.draft.title', 'Plan milestone outcomes'),
      action: translate('guidance.direction.draft.body', 'Add an outcome and adjust its schedule.')
    },
    {
      title: translate('guidance.direction.review.title', 'Review and update'),
      action: translate(
        'guidance.direction.review.body',
        'After review and merge, update the formal schedule.'
      )
    }
  ]
}

const scenes = [DirectionWallDemo, DirectionCharterDemo] as const
const pointerCues: readonly (readonly [at: number, target: string][])[] = [
  [
    [750, 'input'],
    [3700, '[data-workbench-open-overview]']
  ],
  [
    [790, '.card-toggle'],
    [2320, '[data-contextual-tour-target="workbench-overview-edit"]'],
    [3960, '#direction-demo-opportunity'],
    [7090, '[data-demo-action="review"]']
  ],
  [
    [790, '[data-demo-action="plan"]'],
    [2040, '[data-contextual-tour-target~="milestone-start"]'],
    [2500, '.direction-milestone-form textarea'],
    [3950, '.direction-milestone-form button[type="submit"]'],
    [4900, '[aria-label="添加特性"]'],
    [6300, '.wb-ml-resize.end']
  ],
  [
    [1050, '[data-contextual-tour-target="milestone-submit"]'],
    [3500, '[data-demo-action="confirm"]'],
    [5100, '[data-contextual-tour-target="milestone-submit"]'],
    [7660, '[data-contextual-tour-target="milestone-submit"]']
  ]
]

function DirectionPlayer({ steps }: { steps: readonly Step[] }) {
  const [index, setIndex] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLSpanElement>(null)
  const spotlight = useRef<HTMLSpanElement>(null)
  const step = steps[index]
  const duration = durations[step]
  const copy = getSteps()
  const Scene = step === 0 || step === 1 ? scenes[step] : null
  const cue = pointerCues[step].findLast(([at]) => time >= at - 440 && time < at + 500)
  const click = cue && time >= cue[0]

  useEffect(() => {
    if (!playing) {
      return
    }
    let last = performance.now()
    // Electron can throttle paint callbacks even while the help window is visible.
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = now - last
      last = now
      setTime((value) => Math.min(value + elapsed, duration))
    }, 32)
    return () => window.clearInterval(timer)
  }, [duration, playing])

  useEffect(() => {
    if (!playing || time < duration) {
      return
    }
    if (index + 1 === steps.length) {
      setPlaying(false)
    } else {
      setIndex(index + 1)
      setTime(0)
    }
  }, [duration, index, playing, steps.length, time])

  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        setPlaying(false)
      }
    }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])

  useLayoutEffect(() => {
    const marker = cursor.current
    const outline = spotlight.current
    const surface = sceneRef.current
    const target = cue && surface?.querySelector(cue[1])
    if (!marker || !outline || !surface || !cue) {
      return
    }
    const rect = target?.getBoundingClientRect()
    const bounds = surface.getBoundingClientRect()
    if (
      !rect ||
      rect.width === 0 ||
      rect.height === 0 ||
      rect.bottom > bounds.bottom ||
      rect.top < bounds.top ||
      rect.right > bounds.right ||
      rect.left < bounds.left
    ) {
      marker.style.visibility = 'hidden'
      outline.style.visibility = 'hidden'
      return
    }
    const left = rect.left - bounds.left
    const top = rect.top - bounds.top
    const approach = Math.max(0, Math.min(1, (cue[0] - time) / 440))
    marker.style.left = `${Math.min(bounds.width - 24, left + Math.min(40, rect.width / 2) + approach * 30)}px`
    marker.style.top = `${Math.min(bounds.height - 24, top + rect.height / 2 + approach * 22)}px`
    marker.style.visibility = 'visible'
    outline.style.inset = `${top - 2}px ${bounds.width - left - rect.width - 2}px ${bounds.height - top - rect.height - 2}px ${left - 2}px`
    outline.style.visibility = 'visible'
  }, [cue, time])

  function select(next: number, play: boolean) {
    setIndex(next)
    setTime(0)
    setPlaying(play)
  }

  function toggle() {
    if (time >= duration) {
      select(0, true)
    } else {
      setPlaying(!playing)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[940px] px-4 pb-2 pt-2 sm:px-6">
      {steps.length > 1 && (
        <ol
          aria-label={translate('guidance.direction.steps', 'Journey steps')}
          className="mb-2.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4"
        >
          {steps.map((id, position) => (
            <li key={id} className="relative min-w-0">
              {position > 0 && (
                <span
                  aria-hidden
                  className="absolute -left-2.5 top-1/2 hidden -translate-y-1/2 text-muted-foreground sm:block"
                >
                  ›
                </span>
              )}
              <Button
                className={cn(
                  'h-full min-h-[41px] w-full justify-start gap-[7px] whitespace-normal px-2 text-left text-xs',
                  index === position
                    ? 'border-foreground bg-accent font-semibold'
                    : 'text-muted-foreground'
                )}
                variant="outline"
                size="sm"
                aria-current={index === position ? 'step' : undefined}
                onClick={() => select(position, false)}
              >
                <span
                  className={cn(
                    'grid size-[19px] shrink-0 place-items-center rounded-full border border-border text-[10px]',
                    index === position && 'border-primary bg-primary text-primary-foreground'
                  )}
                >
                  {position + 1}
                </span>
                <span>{copy[id].title}</span>
              </Button>
            </li>
          ))}
        </ol>
      )}
      <section
        className="overflow-hidden rounded-lg border border-border"
        aria-label={copy[step].title}
      >
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-2.5 px-3 py-[7px]">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {copy[step].action}
          </p>
          <div className="flex items-center gap-1">
            <Button size="xs" onClick={toggle}>
              {playing
                ? translate('guidance.direction.pause', 'Pause')
                : time > 0 && time < duration
                  ? translate('guidance.direction.resume', 'Resume')
                  : steps.length > 1
                    ? translate('guidance.direction.playSequence', 'Play in order')
                    : translate('guidance.direction.playClip', 'Play clip')}
            </Button>
            <Button size="xs" variant="outline" onClick={() => select(0, true)}>
              {translate('guidance.direction.restart', 'Replay')}
            </Button>
          </div>
        </header>
        <div className="direction-demo-scene" ref={sceneRef}>
          <div inert aria-hidden className="direction-demo-content">
            {Scene ? (
              <Scene time={time} />
            ) : (
              <DirectionMilestoneDemo time={time} review={step === 3} />
            )}
          </div>
          {cue && (
            <>
              <span aria-hidden ref={spotlight} className="direction-demo-spotlight" />
              <span
                aria-hidden
                ref={cursor}
                className={cn('direction-demo-cursor', click && 'is-clicking')}
              >
                <MousePointer2 size={20} fill="currentColor" />
              </span>
            </>
          )}
        </div>
        <div className="border-t border-border px-3 py-1 text-[11px] text-muted-foreground">
          {translate('guidance.direction.sample', 'Sample project')}
        </div>
      </section>
    </div>
  )
}

export function DirectionJourney() {
  return <DirectionPlayer steps={wholeJourney} />
}
export function DirectionWall() {
  return <DirectionPlayer steps={[0]} />
}
export function DirectionOverview() {
  return <DirectionPlayer steps={[1]} />
}
export function DirectionMilestones() {
  return <DirectionPlayer steps={[2, 3]} />
}
