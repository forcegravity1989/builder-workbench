import { CircleHelp } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { replayMonicaGuide, useMonicaScreenGuide } from './MonicaScreenGuide'

export function MonicaBrowserHelp({ ready }: { ready: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      title="浏览器帮助"
      aria-label="浏览器帮助"
      onClick={() => {
        if (ready) {
          replayMonicaGuide('browser')
        } else {
          toast('请先加载网页，或退出绘制模式，再打开浏览器引导。')
        }
      }}
    >
      <CircleHelp size={15} />
    </Button>
  )
}

export function finishSourceControlGuide() {
  const state = useAppStore.getState()
  if (state.activeContextualTourId === 'monica-source-control') {
    state.completeContextualTour('monica-source-control')
  }
}

export function MonicaSourceControlHelp() {
  useMonicaScreenGuide('monica-source-control', true)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0"
      title="源代码管理帮助"
      aria-label="源代码管理帮助"
      onClick={() => replayMonicaGuide('monica-source-control')}
    >
      <CircleHelp size={15} />
    </Button>
  )
}
