import { CircleDot, CircleCheck, GitBranch, Plus, Search, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import StatusIndicator from '@/components/sidebar/workspace-card/surface/StatusIndicator'
import { NewWorkspaceComposerFooter } from '@/components/new-workspace/composer/NewWorkspaceComposerFooter'
import { ProjectWallCard, type WallCardView } from '../ProjectWallCard'
import { sampleCharter } from './sample-charter'
import '../workbench-wall.css'

export const sampleVersion = 'v0.2'
export const bookingIssue = '实现首场交换预约'
export const locationIssue = '补充活动地点说明'
export const deliveryGoal = '让邻居用手机预约首场交换'
export const ignore = () => {}

const repo = {
  id: 'book-exchange-demo',
  path: '',
  kind: 'git',
  displayName: sampleCharter.name,
  badgeColor: '',
  addedAt: 0,
  projectVisibility: 'team'
} as const

function DeliveryWall({ closed }: { closed: boolean }) {
  const card: WallCardView = {
    primaryRepo: repo,
    displayName: sampleCharter.name,
    charter: sampleCharter,
    hostTags: [{ hostId: 'local', label: '本机', online: true, isLocal: true }],
    project: {
      key: repo.id,
      groupId: null,
      name: sampleCharter.name,
      primaryRepoId: repo.id,
      repoIds: [repo.id],
      rows: [repo],
      hostIds: ['local'],
      slots: []
    },
    readings: {
      kind: 'version',
      version: sampleVersion,
      goals: [deliveryGoal],
      plan: { label: '已进入归档' },
      acceptance: { label: '未开始' },
      tasks: { closed: closed ? 1 : 0, total: 2 },
      catalog: {
        scope: null,
        home: null,
        worktrees: [],
        repoIds: [repo.id],
        planTrees: [],
        catalog: null,
        loading: false,
        error: null,
        materialReady: true,
        materialError: null,
        planOrderPending: false,
        reload: ignore
      }
    }
  }
  return (
    <div className="wb-wall direction-demo-window direction-wall-demo">
      <header className="page-head">
        <h1>项目墙</h1>
      </header>
      <div className="mx-auto max-w-[420px]" data-delivery-action="wall-tasks">
        <ProjectWallCard
          card={card}
          switching={false}
          configured={false}
          onOpen={ignore}
          onOverview={ignore}
          onClone={ignore}
          onConfigure={ignore}
          onStage={ignore}
          nativeMenu={null}
          repoMenu={() => null}
          onRepoSettings={ignore}
        />
      </div>
    </div>
  )
}

function IssueRows({ scoped, closed = false }: { scoped: boolean; closed?: boolean }) {
  return (
    <div className="direction-demo-window grid grid-cols-[minmax(80px,27%)_minmax(0,1fr)] overflow-hidden text-xs">
      <aside className="min-w-0 border-r border-border bg-muted/40 p-2">
        <p className="px-2 py-1 font-semibold">版本工作区</p>
        <p className="px-2 py-1 text-muted-foreground">{sampleVersion} · 任务</p>
        <Button
          data-delivery-action="goal"
          size="xs"
          variant={scoped ? 'secondary' : 'ghost'}
          className="w-full justify-start"
          title={deliveryGoal}
        >
          <Target size={13} /> G1 <span className="truncate">{deliveryGoal}</span>
        </Button>
      </aside>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <strong>任务</strong>
          <Button size="xs" variant="secondary">
            议题
          </Button>
          <Button size="xs" variant="ghost">
            PR
          </Button>
          <span className="rounded border border-border px-2 py-1">{sampleVersion}</span>
          {scoped && (
            <span className="min-w-0 truncate text-muted-foreground">目标 G1 · {deliveryGoal}</span>
          )}
          {closed && <span className="text-muted-foreground">目标任务 · 2 项 · 未完成 1 项</span>}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 px-3 py-2">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Search size={13} /> 搜索议题
            </span>
          </div>
        </div>
        {[
          { number: 12, title: bookingIssue, closed, owner: '林小满' },
          { number: 13, title: locationIssue, closed: false, owner: '陈晓' }
        ].map((issue) => (
          <div
            key={issue.number}
            className="flex items-center gap-2 border-t border-border px-3 py-2"
          >
            {issue.closed ? (
              <CircleCheck size={14} className="text-muted-foreground" />
            ) : (
              <CircleDot size={14} className="text-muted-foreground" />
            )}
            <span className="text-muted-foreground">#{issue.number}</span>
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
            <span className="hidden text-muted-foreground sm:inline">{issue.owner}</span>
            {issue.closed ? (
              <span>已关闭</span>
            ) : (
              <Button
                data-delivery-action={issue.number === 12 ? 'start-booking' : 'start-location'}
                size="icon-xs"
                variant="outline"
                aria-label="从议题开始工作区"
              >
                <Plus size={13} />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DeliveryFindDemo({ time }: { time: number }) {
  if (time < 1650) {
    return <DeliveryWall closed={false} />
  }
  return <IssueRows scoped={time >= 3400} />
}

function WorkspaceComposer({ location }: { location: boolean }) {
  return (
    <div className="direction-demo-focus space-y-3 text-sm">
      <h4 className="font-semibold">新工作区</h4>
      <p className="text-xs text-muted-foreground">
        {sampleCharter.name} · {sampleVersion} · G1
      </p>
      <label className="grid gap-1 text-xs">
        工作区名称
        <Input readOnly value={location ? '#13 补充活动地点说明' : '#12 实现首场交换预约'} />
      </label>
      <p className="text-xs text-muted-foreground">基准分支 · main　智能体 · Codex</p>
      <div data-delivery-action="create-workspace">
        <NewWorkspaceComposerFooter
          createError={null}
          createDisabled={false}
          creating={false}
          onCreate={ignore}
          primaryActionLabel="创建工作区"
          submitShortcutModifierLabel="Ctrl"
        />
      </div>
    </div>
  )
}

export function DeliveryWorkspaceDemo({ time }: { time: number }) {
  if (time < 1150 || (time >= 3050 && time < 4250)) {
    return <IssueRows scoped />
  }
  if (time < 3050 || (time >= 4250 && time < 6000)) {
    return <WorkspaceComposer location={time >= 4250} />
  }

  const bookingActive = time < 7750 || time >= 9600
  return (
    <div className="direction-demo-window grid min-h-[200px] grid-cols-[minmax(0,2fr)_minmax(0,3fr)] overflow-hidden text-xs">
      <div className="border-r border-border bg-muted/40 p-2">
        <div className="px-2 py-1 font-semibold">版本工作区</div>
        <div className="px-2 py-1">{sampleVersion} / G1</div>
        {[
          {
            action: 'booking-session',
            name: bookingIssue,
            active: bookingActive,
            status: 'permission' as const
          },
          {
            action: 'location-session',
            name: locationIssue,
            active: !bookingActive,
            status: 'working' as const
          }
        ].map(({ action, name, active, status }) => (
          <Button
            key={action}
            data-delivery-action={action}
            size="xs"
            variant={active ? 'secondary' : 'ghost'}
            className="w-full justify-start"
          >
            <StatusIndicator status={status} showTooltip={false} />
            <span className="truncate">{name}</span>
          </Button>
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <GitBranch size={13} />
          <span className="truncate">
            {bookingActive ? 'issue-12-booking' : 'issue-13-location'}
          </span>
        </div>
        <div className="space-y-2 p-3">
          <p className="font-medium">Codex</p>
          <p>
            {bookingActive
              ? '已准备预约原型。确认后展示哪些信息？'
              : '正在检查活动地点说明与入口。'}
          </p>
          <p className="text-muted-foreground">{bookingActive ? '等待输入' : '正在运行'}</p>
          {bookingActive && time >= 10300 && (
            <Input readOnly value="请先打开原型一起看看确认页。" />
          )}
        </div>
      </div>
    </div>
  )
}

export function DeliveryReadbackDemo({ time }: { time: number }) {
  if (time < 2100) {
    return (
      <div className="direction-demo-focus space-y-3 text-sm">
        <p className="font-medium">PR #16 · {bookingIssue}</p>
        {time < 1000 ? (
          <Button size="sm" data-delivery-action="merge-pr">
            确认合入
          </Button>
        ) : (
          <>
            <p className="flex items-center gap-2">
              <CircleCheck size={15} /> 已合入 main
            </p>
            <Button size="sm" variant="outline" data-delivery-action="read-issue">
              查看议题 #12
            </Button>
          </>
        )}
      </div>
    )
  }
  if (time < 5150) {
    return (
      <div className="direction-demo-focus space-y-3 text-sm">
        <p className="font-medium">#12 {bookingIssue}</p>
        <p className="text-muted-foreground">{time < 3500 ? '开放' : '已关闭 · 已完成'}</p>
        {time < 3500 && (
          <Button data-delivery-action="close-issue" size="sm" variant="outline">
            关闭为已完成
          </Button>
        )}
        {time >= 3500 && (
          <Button data-delivery-action="return-wall" size="sm" variant="outline">
            项目墙
          </Button>
        )}
      </div>
    )
  }
  if (time < 7550) {
    return <DeliveryWall closed />
  }
  return <IssueRows scoped closed />
}
