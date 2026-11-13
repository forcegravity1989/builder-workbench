import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { DirectionWallDemo } from './DirectionWallDemo'
import { DirectionCharterDemo } from './DirectionCharterDemo'
import { DirectionMilestoneDemo } from './DirectionMilestoneDemo'
import './direction-walkthrough.css'

const durations = [5700, 9800, 7200, 9550] as const
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
    [3980, '[aria-label="添加特性"]'],
    [5170, '.wb-ml-resize.end']
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
  const step = steps[index]
  const duration = durations[step]
  const copy = getSteps()
  const Scene = step < 2 ? scenes[step as 0 | 1] : null
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

  useEffect(() => {
    const marker = cursor.current
    const surface = sceneRef.current
    const target = cue && surface?.querySelector(cue[1])
    if (!marker || !surface || !target) {
      return
    }
    const rect = target.getBoundingClientRect()
    const bounds = surface.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0 || rect.bottom > bounds.bottom) {
      return
    }
    marker.style.left = `${Math.min(bounds.width - 10, rect.left - bounds.left + Math.min(36, rect.width / 2))}px`
    marker.style.top = `${rect.top - bounds.top + rect.height / 2}px`
    marker.style.visibility = 'visible'
    return () => {
      marker.style.visibility = 'hidden'
    }
  }, [cue, index])

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
          className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {steps.map((id, position) => (
            <li key={id} className="relative min-w-0">
              {position > 0 && (
                <span
                  aria-hidden
                  className="absolute -left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  ›
                </span>
              )}
              <Button
                className={cn(
                  'h-full min-h-8 w-full justify-start whitespace-normal text-left text-xs',
                  index === position && 'border-foreground bg-accent'
                )}
                variant="outline"
                size="sm"
                aria-current={index === position ? 'step' : undefined}
                onClick={() => select(position, false)}
              >
                {position + 1} <span>{copy[id].title}</span>
              </Button>
            </li>
          ))}
        </ol>
      )}
      <section
        className="overflow-hidden rounded-lg border border-border"
        aria-label={copy[step].title}
      >
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3 py-1">
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
            <span
              aria-hidden
              ref={cursor}
              className={cn('direction-demo-cursor', click && 'is-clicking')}
            >
              ➤
            </span>
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
