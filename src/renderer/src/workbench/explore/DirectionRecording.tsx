import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import recording from './assets/w01.json'
import videoUrl from './assets/w01.webm?url'
import './direction-recording.css'

const titles = ['找到项目', '明确共同方向', '安排阶段成果', '评审并更新']
const allChapters = [0, 1, 2, 3] as const
const actions = [
  '从项目墙进入运营看板的项目总览。',
  '编辑共同方向，核对改动后提交评审。',
  '添加阶段成果与特性，保存到项目材料工作区。',
  '核对本次改动并更新评审，等待人确认合入。'
]

export function DirectionRecording({ chapters = allChapters }: { chapters?: readonly number[] }) {
  const video = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(chapters[0])
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const start = recording.chapters[chapters[0]].start
  const last = chapters.at(-1) ?? 0
  const end = recording.chapters[last + 1]?.start ?? recording.duration

  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        video.current?.pause()
      }
    }
    document.addEventListener('visibilitychange', pause)
    return () => document.removeEventListener('visibilitychange', pause)
  }, [])

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
      seek(chapters[0], true)
    } else {
      void element.play().catch(() => setError(true))
    }
  }

  return (
    <div className="direction-recording">
      {chapters.length > 1 && (
        <ol aria-label="旅程步骤" className="direction-recording-steps">
          {chapters.map((index) => (
            <li key={index}>
              <Button
                variant="outline"
                size="sm"
                aria-current={active === index ? 'step' : undefined}
                onClick={() => seek(index)}
              >
                {index + 1} {titles[index]}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <section aria-label={titles[active]}>
        <header className="direction-recording-toolbar">
          <p aria-live="polite">{actions[active]}</p>
          <Button size="xs" disabled={error} onClick={toggle}>
            {playing ? '暂停' : '播放'}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={error}
            onClick={() => seek(chapters[0], true)}
          >
            重播
          </Button>
        </header>
        {error && (
          <div role="alert">
            演示视频未能加载。
            <Button
              variant="outline"
              onClick={() => {
                setError(false)
                video.current?.load()
              }}
            >
              重试
            </Button>
          </div>
        )}
        <video
          ref={video}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          aria-label="运营看板：真实 BW 窗口录制"
          onLoadedMetadata={() => {
            if (video.current) {
              video.current.currentTime = start
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
              chapters.findLast(
                (index) => element.currentTime >= recording.chapters[index].start
              ) ?? chapters[0]
            )
          }}
        />
        <footer>样例项目 · 真实 BW 录屏 · 等待过程已压缩，评审由人确认</footer>
      </section>
    </div>
  )
}
