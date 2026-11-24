import { Play, Plus } from 'lucide-react'
import { RightSidebarToggle } from '@/app-shell/TitlebarMainStrip'
import { WindowControls } from '@/app-shell/WindowControls'
import { TerminalTabLeadingIcon } from '@/components/tab-bar/TerminalTabLeadingIcon'
import { ACTIVE_TAB_INDICATOR_CLASSES } from '@/components/tab-bar/drop-indicator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

type PrototypeWorkspaceChromeProps = {
  onFeedback: () => void
  title?: string
}

/** The focused Windows workspace group with its right sidebar closed. */
export function PrototypeWorkspaceChrome({
  onFeedback,
  title = '工作会话'
}: PrototypeWorkspaceChromeProps): React.JSX.Element {
  return (
    <div
      className="flex h-8 shrink-0 items-stretch border-b border-border bg-card"
      aria-label="Windows 工作区标签行"
    >
      <div className="flex min-w-0 flex-1 items-stretch">
        <div className="relative flex min-w-0 max-w-52 items-center gap-1.5 border-r border-border bg-background px-3 text-xs">
          <TerminalTabLeadingIcon
            agent="codex"
            activityStatus="inactive"
            shell={undefined}
            showUnreadActivity={false}
            isActive
          />
          <span className="truncate">{title}</span>
          <span className={ACTIVE_TAB_INDICATOR_CLASSES} aria-hidden />
        </div>
        <button
          type="button"
          disabled
          aria-label={translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')}
          className="my-auto ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          title="现有控件，原型仅展示位置"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="ml-1.5 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          disabled
          aria-label={translate(
            'auto.components.tab.bar.TabBarQuickCommandsButton.8f1e971966',
            'Add quick command'
          )}
          className="my-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground"
          title="现有控件，原型仅展示位置"
        >
          <Play className="size-3.5" />
          <span className="text-xs font-medium">
            {translate('auto.components.tab.bar.TabBarQuickCommandsButton.a2c7a33831', 'Command')}
          </span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onFeedback} data-testid="canvas-feedback">
              反馈 BW
            </Button>
          </TooltipTrigger>
          <TooltipContent>反馈当前 BW 使用问题</TooltipContent>
        </Tooltip>
      </div>
      <fieldset
        disabled
        aria-label="现有右侧栏开关，仅位置参照"
        className="m-0 flex shrink-0 items-center border-0 p-0"
      >
        <RightSidebarToggle />
      </fieldset>
      <fieldset
        disabled
        aria-label="Windows 窗口控件，仅位置参照"
        className="m-0 shrink-0 border-0 p-0"
        data-prototype-window-controls
      >
        <style>{`[data-prototype-window-controls] .window-controls{position:static;height:31px}[data-prototype-window-controls] .window-controls-btn{height:31px;pointer-events:none;cursor:default}`}</style>
        <WindowControls />
      </fieldset>
    </div>
  )
}
