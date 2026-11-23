import type { FeatureInteractionId } from './feature-interactions'

export type ContextualTourId =
  | 'workspace-board'
  | 'workspace-agent-sessions'
  | 'browser'
  | 'client-hosted-browser'
  | 'tasks'
  | 'automations'
  | 'floating-workspace'
  | 'workspace-creation'
  | 'workbench-wall'
  | 'workbench-overview'
  | 'workbench-scoreboard'
  | 'workbench-milestones'
  | 'workbench-plan'
  | 'workbench-acceptance'
  | 'workbench-version-overview'
  | 'workbench-versions'
  | 'workbench-source-control'

export type ContextualTourStepControl = {
  kind: 'auto-rename-branch-from-work'
}

export type ContextualTourStepActionKind =
  | 'next'
  | 'complete'
  | 'split-terminal-pane'
  | 'create-worktree'
  | 'show-worktrees'
  | 'open-tasks'
  | 'open-getting-started'
  | 'open-client-hosted-browser-settings'

export type ContextualTourStepAction = {
  kind: ContextualTourStepActionKind
  label: string
}

export type ContextualTourStepPlacement = 'top' | 'right' | 'bottom' | 'left'

export type ContextualTourStep = {
  // Stable anchor for localized copy — position-keyed translations shift onto the wrong step when one is inserted.
  id?: string
  title: string
  body: string
  targetSelector: string
  requiredForStart?: boolean
  fallbackCopy?: string
  preferredPlacement?: ContextualTourStepPlacement
  targetPulse?: boolean
  hidePrimaryAction?: boolean
  control?: ContextualTourStepControl
  primaryAction?: ContextualTourStepAction
  secondaryAction?: ContextualTourStepAction
  advanceOnFeatureInteraction?: FeatureInteractionId
}

export type ContextualTour = {
  id: ContextualTourId
  allowedActiveModals?: readonly string[]
  markSeenOn?: 'dismiss'
  steps: readonly ContextualTourStep[]
}

export const CONTEXTUAL_TOURS = [
  {
    id: 'workspace-board',
    steps: [
      {
        title: 'Plan work on the board',
        body: 'Use the board when you want to see workspaces by status instead of by project.',
        targetSelector: '[data-contextual-tour-target="workspace-board-center"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'Move work through lanes',
        body: 'Drag workspaces between lanes as their status changes.',
        targetSelector:
          '[data-contextual-tour-target="workspace-board-done-lane"], [data-contextual-tour-target="workspace-board-lanes"]'
      }
    ]
  },
  {
    id: 'workspace-agent-sessions',
    steps: [
      {
        title: 'Split a terminal pane',
        body: 'Open a second terminal pane with {terminal.splitRight}, or right-click the pane for split options.',
        targetSelector:
          '[data-contextual-tour-target="terminal-pane-split-target"], [data-contextual-tour-target="workspace-agent-terminal-tip"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        primaryAction: { kind: 'split-terminal-pane', label: 'Split terminal' },
        advanceOnFeatureInteraction: 'terminal-pane-split'
      },
      {
        title: 'Start another task in parallel',
        body: 'Each worktree gets its own branch, so parallel work stays separate.',
        targetSelector: '[data-contextual-tour-target="workspace-create-control"]',
        preferredPlacement: 'right',
        targetPulse: true,
        hidePrimaryAction: true
      }
    ]
  },
  {
    id: 'browser',
    steps: [
      {
        title: 'Grab page context for agents',
        body: "Use the grab tool to copy a page element's context for agents.",
        targetSelector: '[data-contextual-tour-target="browser-grab-control"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: 'Mark design feedback in place',
        body: 'Annotate elements and send those notes to an agent.',
        targetSelector: '[data-contextual-tour-target="browser-annotation-control"]',
        preferredPlacement: 'bottom'
      },
      {
        title: 'Stay logged in',
        body: 'Bring your existing logins into Orca to stay signed in immediately.',
        // Prefer the always-visible Import button; fall back to the overflow-menu
        // item only once the user has dismissed the import hint.
        targetSelector:
          '[data-contextual-tour-target="browser-import-hint"], [data-contextual-tour-target="browser-import-cookies-control"]',
        // Sit below the Import button with the arrow pointing up at it.
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'client-hosted-browser',
    steps: [
      {
        id: 'client-hosted-browser-intro',
        title: 'This page renders on your desktop',
        body: 'Remote browser tabs now render on this device. Network traffic still goes through the remote host.',
        targetSelector: '[data-contextual-tour-target="client-hosted-browser-controls"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        primaryAction: { kind: 'complete', label: 'Got it' },
        secondaryAction: { kind: 'open-client-hosted-browser-settings', label: 'Browser settings' }
      }
    ]
  },
  {
    id: 'tasks',
    steps: [
      {
        id: 'tasks-source',
        title: 'Choose the work source',
        body: 'Choose the project or work source. If none is available, check your connections in Settings.',
        targetSelector: '[data-contextual-tour-target="tasks-source-filters"]',
        requiredForStart: true
      },
      {
        id: 'tasks-filter',
        title: 'Filter to the work you need',
        body: 'Use presets and search to narrow issues, reviews, merge requests, or tasks.',
        targetSelector: '[data-contextual-tour-target="tasks-search-presets"]'
      },
      {
        id: 'tasks-start',
        title: 'Start from work items',
        body: 'Use Start or Open on a task, issue, review, or merge request to bring its context into a workspace.',
        targetSelector:
          '[data-contextual-tour-target="tasks-start-workspace"], [data-contextual-tour-target="tasks-actions"], [data-contextual-tour-target="tasks-search-presets"]'
      }
    ]
  },
  {
    id: 'automations',
    steps: [
      {
        id: 'automations-intro',
        title: 'What is an automation?',
        body: 'Automations run agent work on a schedule. Add an automation by clicking this button.',
        targetSelector: '[data-contextual-tour-target="automations-create"]',
        requiredForStart: true
      },
      {
        id: 'automations-results',
        title: 'Find the results',
        body: 'Runs show when automations ran, what happened, and where to inspect their output.',
        targetSelector: '[data-contextual-tour-target="automations-runs"]'
      }
    ]
  },
  {
    id: 'floating-workspace',
    steps: [
      {
        title: 'Run an agent across every repo',
        body: 'Agents here run in any folder you choose. Point one at the directory above your services to work across all your repos at once.',
        // Why: the per-action anchors only render in the empty state; fall back
        // to the panel surface when floating tabs already exist.
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-terminal"], [data-contextual-tour-target="floating-workspace-surface"]',
        requiredForStart: true,
        preferredPlacement: 'left'
      },
      {
        title: 'Or use it as a scratchpad',
        body: 'Open agents, scratch terminals, notes, and browser tabs without cluttering the worktree you’re focused on.',
        targetSelector:
          '[data-contextual-tour-target="floating-workspace-new-markdown"], [data-contextual-tour-target="floating-workspace-surface"]',
        preferredPlacement: 'left'
      }
    ]
  },
  {
    id: 'workspace-creation',
    allowedActiveModals: ['new-workspace-composer'],
    steps: [
      {
        title: 'Pick a project',
        body: 'Orca isolates each task in its own worktree, branched off your base.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-project"]',
        requiredForStart: true
      },
      {
        title: 'Name it, or start from existing work',
        body: 'Start from a linked task for a short issue or PR name. Or leave it blank to auto-name it from your first agent message.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-name"]',
        control: { kind: 'auto-rename-branch-from-work' }
      },
      {
        title: 'Choose what agent starts the work',
        body: 'Pick the agent that should be opened when this worktree is created.',
        targetSelector: '[data-contextual-tour-target="workspace-creation-agent"]'
      }
    ]
  },
  {
    id: 'workbench-wall',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-wall-start',
        title: '找到项目',
        body: '搜索项目。没有匹配时清除筛选，空墙可点「添加项目」。',
        targetSelector: '[data-contextual-tour-target="workbench-wall-start"]',
        requiredForStart: true,
        preferredPlacement: 'right'
      },
      {
        id: 'workbench-wall-open',
        title: '继续工作',
        body: '点项目名称回到工作区。',
        targetSelector: '[data-contextual-tour-target="workbench-wall-project"]'
      },
      {
        id: 'workbench-wall-overview',
        title: '查看方向和排期',
        body: '点卡片上的「项目总览」，查看名片和里程碑。',
        targetSelector: '[data-contextual-tour-target="workbench-wall-overview"]'
      }
    ]
  },
  {
    id: 'workbench-overview',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-overview-card',
        title: '查看项目名片',
        body: '展开名片查看想做什么、愿景和负责人。还没有项目时，点「添加项目」。',
        targetSelector:
          '[data-contextual-tour-target="workbench-overview-card"], [data-contextual-tour-target="workbench-overview-add"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-overview-edit',
        title: '编辑项目信息',
        body: '点编辑更新名片，核对后保存或提交评审。里程碑安排阶段成果，记分牌查看实际指标。',
        targetSelector: '[data-contextual-tour-target="workbench-overview-edit"]'
      }
    ]
  },
  {
    id: 'workbench-scoreboard',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-scoreboard-read',
        title: '怎么看指标',
        body: '有场景页签时，选一个场景看结果和引领指标。悬停走势柱看周编号和读数，完成线来自版本计划。',
        targetSelector: '[data-contextual-tour-target="workbench-scoreboard-title"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-scoreboard-refresh',
        title: '什么时候刷新',
        body: '需要重新采集时点「刷新」。失败时可查看详情。同步已合入的指标配置用页头「更新代码」。',
        targetSelector: '[data-contextual-tour-target="workbench-scoreboard-refresh"]',
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-scoreboard-setup',
        title: '从哪里配置指标',
        body: '按需点「配置指标」，在新会话里核对口径和历史来源。没有读数时，可以先看版本、任务或计划。',
        targetSelector: '[data-contextual-tour-target="workbench-scoreboard-setup"]',
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'workbench-milestones',
    markSeenOn: 'dismiss',
    steps: [
      {
        title: '添加与编排',
        body: '点「规划里程碑」开始。编辑时用旗帜添加成果，用加号添加特性。',
        targetSelector: '[data-contextual-tour-target~="milestone-start"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: '调整时间',
        body: '拖动条身移动排期，拖两端调整日期。开始编辑后即可操作。',
        targetSelector: '[data-contextual-tour-target="milestone-schedule"]'
      },
      {
        title: '提交评审',
        body: '编辑自动保存到项目材料工作树。核对改动并提交评审；里程碑标题旁的「更新代码」可同步该工作树。',
        targetSelector: '[data-contextual-tour-target~="milestone-submit"]'
      }
    ]
  },
  {
    id: 'workbench-plan',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-plan-start',
        title: '开始或继续计划',
        body: '点「开始计划」打开会话。已有材料时，点「本版目标」查看验收标准和「拆解 Issue」。',
        targetSelector:
          '[data-contextual-tour-target="workbench-plan-start"], [data-contextual-tour-target="workbench-plan-goals"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        targetPulse: true
      },
      {
        id: 'workbench-plan-annotations',
        title: '给计划留下评审意见',
        body: '先展开要评审的目标，再打开「批注模式」。点验收标准等对象添加批注，可从批注窗发给计划助手。',
        targetSelector: '[data-contextual-tour-target="workbench-plan-annotations"]',
        preferredPlacement: 'bottom',
        targetPulse: true
      },
      {
        id: 'workbench-plan-archive',
        title: '评审后归档',
        body: '在计划会话中发起归档。评审与合入进度可从「归档 PR」查看。',
        targetSelector: '[data-contextual-tour-target="workbench-plan-archive"]',
        preferredPlacement: 'bottom',
        targetPulse: true
      }
    ]
  },
  {
    id: 'workbench-acceptance',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-acceptance-prepare',
        title: '准备本版验收',
        body: '点「开始验收」打开助手会话。没有可读的固定计划时，核对本版计划已提交，再点「更新代码」。材料就绪后，在「验收准备」聚合或打开证据报告。',
        targetSelector:
          '[data-contextual-tour-target="workbench-acceptance-start"], [data-contextual-tour-target="workbench-acceptance-prepare"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-acceptance-showcase',
        title: '对照验收标准给出结论',
        body: '在 Showcase 展开目标，对照固定计划与交付证据。由你选择目标结论，证据不足可保留「未判定」。',
        targetSelector: '[data-contextual-tour-target="workbench-acceptance-showcase"]',
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-acceptance-minutes',
        title: '留下共识与遗留',
        body: '在「会议纪要」记录决定、补验安排或跟进 Issue。核对全文后点「标记人工确认」。',
        targetSelector: '[data-contextual-tour-target="workbench-acceptance-minutes"]',
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-acceptance-archive',
        title: '提交并核对归档',
        body: '点「发起归档」把请求交给验收助手。由人评审合入，再用「更新代码」读回材料。',
        targetSelector: '[data-contextual-tour-target="workbench-acceptance-archive"]',
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'workbench-version-overview',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-version-overview-progress',
        title: '核对本版的材料与归档',
        body: '计划和验收分别显示材料阶段。已有归档记录时，可查 PR／MR 状态、来源链接和合入时间。',
        targetSelector: '[data-contextual-tour-target="workbench-version-overview-progress"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-version-overview-decision',
        title: '查看目标的人工结论',
        body: '目标旁显示人的验收结论。点击可返回本版验收核对详情。任务数量和归档状态各自读回。',
        targetSelector: '[data-contextual-tour-target="workbench-version-overview-decision"]',
        preferredPlacement: 'bottom'
      },
      {
        id: 'workbench-version-overview-refresh',
        title: '重读当前来源',
        body: '点「刷新来源」重新读取这个项目的材料与任务。若本机未同步该版本，先更新项目代码。',
        targetSelector: '[data-contextual-tour-target="workbench-version-overview-refresh"]',
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'workbench-source-control',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-source-control-review',
        title: '找要检视的文件',
        body: '可以按文件名查找改动。列表为空时，先从编辑器保存文件，或清除当前筛选。',
        targetSelector: '[data-contextual-tour-target="workbench-source-control-filter"]',
        requiredForStart: true,
        preferredPlacement: 'left'
      },
      {
        id: 'workbench-source-control-diff',
        title: '打开文件差异',
        body: '点文件查看改动。按项目要求完成验证后，再暂存、提交和准备 PR。',
        targetSelector: '[data-testid="source-control-entry"]',
        preferredPlacement: 'left'
      }
    ]
  },
  {
    id: 'workbench-versions',
    markSeenOn: 'dismiss',
    steps: [
      {
        id: 'workbench-versions-start',
        title: '找到这版的工作区',
        body: '展开已有版本，或用加号新建。只有里程碑排期时，用同一版本名新建。',
        targetSelector: '[data-contextual-tour-target="workbench-versions-start"]',
        requiredForStart: true,
        preferredPlacement: 'right'
      },
      {
        id: 'workbench-versions-plan',
        title: '继续计划与会话',
        body: '点「计划」回到本版材料，展开计划行可找回原生会话。',
        targetSelector: '[data-contextual-tour-target="workbench-versions-plan"]'
      }
    ]
  }
] as const satisfies readonly ContextualTour[]

export const CONTEXTUAL_TOUR_IDS = CONTEXTUAL_TOURS.map((tour) => tour.id)

export function isContextualTourId(value: unknown): value is ContextualTourId {
  return typeof value === 'string' && CONTEXTUAL_TOUR_IDS.includes(value as ContextualTourId)
}

export function getContextualTour(id: ContextualTourId): ContextualTour {
  return CONTEXTUAL_TOURS.find((tour) => tour.id === id)!
}

export function normalizeContextualTourIds(value: unknown): ContextualTourId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<ContextualTourId>()
  for (const item of value) {
    if (isContextualTourId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}
