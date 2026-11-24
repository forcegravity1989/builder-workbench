import {
  Globe,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  Pencil,
  Plus,
  Send
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BrowserChromeToolbar } from '@/components/browser-pane/assemble-chrome/toolbar/browser-chrome-toolbar'
import { bookingIssue, ignore } from './DeliveryTaskScenes'

const prototypeAddress = 'http://localhost:3000/booking'
const note = '提交后显示场次和地点。'
const refinedNote = '预约成功后，显示周六 10:00 和社区阅览室。'

export function DeliveryBrowserDemo({ time }: { time: number }) {
  const browserOpen = time >= 2100
  const loaded = time >= 3300
  const annotating = time >= 4750 && time < 7350
  const adding = time >= 5900 && time < 7350
  const saved = time >= 7350
  const collapsed = time >= 8600 && time < 10100
  const editing = time >= 11300 && time < 12800
  const sendOpen = time >= 14350
  const annotationText = time >= 12800 ? refinedNote : note

  return (
    <div data-delivery-browser className="direction-demo-window overflow-hidden text-xs">
      <div className="relative flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="min-w-0 truncate">{bookingIssue} · Codex</span>
        {browserOpen && (
          <span className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1">
            <Globe size={12} /> 预约原型
          </span>
        )}
        <Button
          data-delivery-action="tab-menu"
          size="icon-xs"
          variant="ghost"
          aria-label="新标签页"
        >
          <Plus size={14} />
        </Button>
        {time >= 950 && !browserOpen && (
          <div className="absolute left-3 top-full z-20 rounded-md border border-border bg-popover p-1 shadow-sm">
            <Button data-delivery-action="browser-tab" size="sm" variant="ghost">
              <Globe size={13} /> 新浏览器选项卡
            </Button>
          </div>
        )}
      </div>
      {browserOpen ? (
        <>
          <BrowserChromeToolbar
            showTourAnchors
            controls={{
              canGoBack: false,
              canGoForward: false,
              loading: false,
              goBack: ignore,
              goForward: ignore,
              reload: ignore,
              navigate: ignore
            }}
            addressSlot={
              <Input
                data-delivery-action="prototype-url"
                readOnly
                aria-label="地址"
                className="h-7 text-xs"
                value={time >= 2650 ? prototypeAddress : ''}
              />
            }
            elementTools={{
              activeIntent: annotating ? 'annotate' : null,
              onStartIntent: ignore,
              disabled: !loaded,
              grabShortcutLabel: 'Ctrl',
              annotationCount: saved ? 1 : 0
            }}
            markup={{
              active: false,
              disabled: !loaded,
              onToggle: ignore,
              canShowDiscoveryHint: false
            }}
            viewSource={null}
            openExternal={null}
          />
          {loaded && (
            <div className="grid gap-2 bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-md border border-border bg-card p-3">
                <h4 className="font-semibold">预约首场图书交换</h4>
                <p className="my-2 text-muted-foreground">周六 10:00 · 社区阅览室</p>
                <div className="relative inline-flex">
                  <Button
                    data-delivery-action="prototype-element"
                    size="sm"
                    className={annotating ? 'ring-2 ring-primary ring-offset-2' : ''}
                  >
                    确认预约
                  </Button>
                  {saved && (
                    <span className="absolute -right-2 -top-2 grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      1
                    </span>
                  )}
                </div>
              </div>
              {adding && (
                <div className="rounded-md border border-border bg-popover p-2 shadow-sm">
                  <p className="mb-1 font-medium">确认预约</p>
                  <textarea
                    className="min-h-12 w-full resize-none rounded-md border border-input bg-background p-1.5 text-xs"
                    readOnly
                    value={note.slice(0, Math.floor((time - 5900) / 45))}
                  />
                  <div className="mt-1 flex justify-end">
                    <Button size="xs" data-delivery-action="add-annotation">
                      <MessageSquarePlus size={12} /> 添加
                    </Button>
                  </div>
                </div>
              )}
              {saved && (
                <div className="rounded-md border border-border bg-popover p-2 shadow-sm">
                  <div className="flex items-center justify-between gap-1">
                    <Button data-delivery-action="annotation-tray" variant="ghost" size="xs">
                      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />} 1 条批注
                    </Button>
                    <Button data-delivery-action="send-annotation" variant="outline" size="xs">
                      <Send size={12} /> 发送
                    </Button>
                  </div>
                  {!collapsed && (
                    <div className="mt-1 border-t border-border pt-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium">1 · 确认预约</span>
                        <Button
                          data-delivery-action="edit-annotation"
                          size="icon-xs"
                          variant="ghost"
                          aria-label="编辑批注"
                        >
                          <Pencil size={12} />
                        </Button>
                      </div>
                      {editing ? (
                        <>
                          <Input
                            readOnly
                            className="h-7 text-xs"
                            value={refinedNote.slice(0, Math.floor((time - 11300) / 40))}
                          />
                          <Button data-delivery-action="save-annotation" size="xs" className="mt-1">
                            保存
                          </Button>
                        </>
                      ) : (
                        <p>{annotationText}</p>
                      )}
                    </div>
                  )}
                  {sendOpen && (
                    <div className="mt-2 rounded-md border border-border bg-popover p-1">
                      <Button variant="ghost" size="xs" className="w-full justify-start">
                        Codex · {bookingIssue}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="p-5 text-muted-foreground">Codex · 预约原型已启动</div>
      )}
    </div>
  )
}
