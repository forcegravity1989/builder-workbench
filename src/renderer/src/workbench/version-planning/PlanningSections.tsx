import { BrainCircuit, ClipboardList, GitPullRequest, Presentation, Target } from 'lucide-react'
import type { RefObject } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import {
  archiveJourneyLamp,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'
export function PlanningHeader({
  currentVersion,
  versions,
  disabled,
  state,
  onSelect
}: {
  currentVersion: string
  versions: VersionMaterialCandidate[]
  disabled: boolean
  state: string
  onSelect(version: string): void
}) {
  return (
    <header className="vp-header">
      <h1>版本计划</h1>
      <select
        aria-label="计划版本"
        value={currentVersion}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value) {
            onSelect(event.target.value)
          }
        }}
      >
        <option value="">待选择版本</option>
        {versions.map((item) => (
          <option key={item.version} value={item.version} disabled={item.state !== 'ready'}>
            {item.version}
            {item.state !== 'ready' ? ' · 暂无法读取' : ''}
          </option>
        ))}
        {currentVersion && !versions.some((item) => item.version === currentVersion) && (
          <option value={currentVersion}>{currentVersion}</option>
        )}
      </select>
      <span className="vp-muted" role="status">
        {state}
      </span>
    </header>
  )
}
/** The rail locates sections. Review, decomposition and archive actions live in their cards. */
export function PlanningJourneyNav({
  hasProgress,
  goalCount,
  taskCount,
  archived,
  archive,
  preparationRef,
  goalsRef,
  tasksRef,
  archiveRef
}: {
  hasProgress: boolean
  goalCount: number
  taskCount: number
  archived: boolean
  archive: ArchiveStatus
  preparationRef: RefObject<HTMLElement | null>
  goalsRef: RefObject<HTMLElement | null>
  tasksRef: RefObject<HTMLElement | null>
  archiveRef: RefObject<HTMLElement | null>
}) {
  const lamp = archiveJourneyLamp(archive, archived)
  const steps = [
    {
      label: '准备',
      Icon: ClipboardList,
      ref: preparationRef,
      tone: hasProgress ? 'pending' : '',
      hint: hasProgress ? '已填写版本进展' : '待填写版本进展'
    },
    {
      label: '目标',
      Icon: Target,
      ref: goalsRef,
      tone: goalCount ? 'pending' : '',
      hint: goalCount ? '已填写目标，待评审核对' : '待明确目标'
    },
    {
      label: '评审',
      Icon: Presentation,
      ref: goalsRef,
      tone: '',
      hint: '与 PL 评审并直接修改目标；此处不代替人的评审结论'
    },
    {
      label: '拆解',
      Icon: BrainCircuit,
      ref: tasksRef,
      tone: taskCount ? 'pending' : '',
      hint: taskCount ? '已关联 Issue，状态以任务读回为准' : '在版本任务卡片中准备拆解请求'
    },
    {
      label: '归档',
      Icon: GitPullRequest,
      ref: archiveRef,
      tone:
        lamp === 'complete'
          ? 'done'
          : lamp === 'failed'
            ? 'failed'
            : lamp === 'pending'
              ? 'pending'
              : '',
      hint: '查看归档 PR 状态'
    }
  ]
  return (
    <nav className="vp-journey" aria-label="计划流程">
      {steps.map(({ label, Icon, ref, tone, hint }) => (
        <button
          key={label}
          title={hint}
          onClick={() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        >
          <span className={`vp-step-icon ${tone}`}>
            <Icon size={16} />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
