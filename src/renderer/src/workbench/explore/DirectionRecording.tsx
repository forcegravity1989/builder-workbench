import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import recording from './assets/w01.json'
import videoUrl from './assets/w01.webm?url'
import './direction-recording.css'

const allChapters = [0, 1, 2, 3] as const

export function DirectionRecording() {
  const titles = [
    translate('guidance.direction.wall.title', 'Find the project'),
    translate('guidance.direction.card.title', 'Agree on the direction'),
    translate('guidance.direction.draft.title', 'Plan milestone outcomes'),
    translate('guidance.direction.review.title', 'Review and update')
  ]
  const actions = [
    translate(
      'guidance.direction.recording.wall',
      'From the project wall, open the operations dashboard overview.'
    ),
    translate(
      'guidance.direction.recording.direction',
      'Edit the shared direction and check the change before submitting it for review.'
    ),
    translate(
      'guidance.direction.recording.milestones',
      'Add an outcome and feature, then save them in the project material worktree.'
    ),
    translate(
      'guidance.direction.recording.review',
      'Check and submit the changes for review. A person confirms the merge.'
    )
  ]
  const video = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const [src, setSrc] = useState<string | undefined>(import.meta.env.DEV ? undefined : videoUrl)
  const [attempt, setAttempt] = useState(0)
  const end = recording.duration

  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        video.current?.pause()
      }
    }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    // Vite's bundled dev server sends the recording without byte-range support.
    const controller = new AbortController()
    let objectUrl: string | undefined
    void fetch(videoUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load the local journey recording')
        }
        return response.blob()
      })
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setSrc(objectUrl)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true)
        }
      })
    return () => {
      controller.abort()
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [attempt])

  function seek(index: number, play = false) {
    const element = video.current
    if (!element) {
      return
    }
    element.pause()
    element.currentTime = recording.chapters[index].start
    setActive(index)
    if (play) {
      void element.play().catch(() => setError(true))
    }
  }

  function toggle() {
    const element = video.current
    if (!element) {
      return
    }
    if (!element.paused) {
      element.pause()
    } else if (element.currentTime >= end - 0.1) {
      seek(0, true)
    } else {
      void element.play().catch(() => setError(true))
    }
  }

  return (
    <div className="direction-recording">
      <ol
        aria-label={translate('guidance.direction.recording.steps', 'Journey steps')}
        className="direction-recording-steps"
      >
        {allChapters.map((index) => (
          <li key={index}>
            <Button
              variant="outline"
              size="sm"
              disabled={!src || error}
              aria-current={active === index ? 'step' : undefined}
              onClick={() => seek(index)}
            >
              {index + 1} {titles[index]}
            </Button>
          </li>
        ))}
      </ol>
      <section aria-label={titles[active]}>
        <header className="direction-recording-toolbar">
          <p aria-live="polite">{actions[active]}</p>
          <Button size="xs" disabled={!src || error} onClick={toggle}>
            {playing
              ? translate('guidance.direction.pause', 'Pause')
              : translate('guidance.direction.recording.play', 'Play')}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!src || error}
            onClick={() => seek(0, true)}
          >
            {translate('guidance.direction.restart', 'Replay')}
          </Button>
        </header>
        {error && (
          <div role="alert">
            {translate(
              'guidance.direction.recording.loadError',
              'Could not load the journey recording.'
            )}
            <Button
              variant="outline"
              onClick={() => {
                setError(false)
                if (import.meta.env.DEV) {
                  setSrc(undefined)
                  setAttempt((current) => current + 1)
                } else {
                  video.current?.load()
                }
              }}
            >
              {translate('guidance.direction.recording.retry', 'Retry')}
            </Button>
          </div>
        )}
        <video
          ref={video}
          src={src}
          muted
          playsInline
          preload="auto"
          aria-label={translate(
            'guidance.direction.recording.video',
            'Operations dashboard: real Workbench recording'
          )}
          onLoadedMetadata={() => {
            if (video.current) {
              video.current.playbackRate = 1.6
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError(true)}
          onTimeUpdate={() => {
            const element = video.current
            if (!element) {
              return
            }
            const wait = recording.skip.find(
              (span) => element.currentTime >= span.from && element.currentTime < span.to
            )
            if (wait && !element.paused) {
              element.currentTime = Math.min(wait.to, end)
              return
            }
            if (element.currentTime >= end) {
              element.pause()
              if (element.currentTime > end + 0.1) {
                element.currentTime = end
              }
            }
            setActive(
              allChapters.findLast(
                (index) => element.currentTime >= recording.chapters[index].start
              ) ?? 0
            )
          }}
        />
        <footer>
          {translate(
            'guidance.direction.recording.footer',
            'Sample project · Real Workbench recording · Waits shortened · Review is confirmed by a person'
          )}
        </footer>
      </section>
    </div>
  )
}
