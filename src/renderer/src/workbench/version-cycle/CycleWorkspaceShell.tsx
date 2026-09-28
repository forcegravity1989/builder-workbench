import { useCycleWorkspace } from './cycle-workspace-context'
import { PlanningBoard } from '../version-planning/PlanningBoard'
import { AcceptancePage } from '../version-acceptance/AcceptancePage'
export function CycleWorkspaceShell() {
  const workspace = useCycleWorkspace()
  if (!workspace) {
    return null
  }
  const { workflow, context, prepareMetrics, configure, notice } = workspace
  return (
    <section className="vc-board-col" aria-label={workflow === 'plan' ? '计划材料' : '验收材料'}>
      <div className="vc-board-tools">
        <span>{workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'}</span>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!context.worktreeId}
          onClick={() => void configure()}
        >
          配置自动化
        </button>
      </div>
      {(notice || context.error) && (
        <p role="status" className="vc-notice">
          {context.error ?? notice}
        </p>
      )}
      {!context.worktreeId ? (
        <p className="vc-notice">
          {context.error ? '请核对上述问题后重新进入。' : '正在准备项目工作区…'}
        </p>
      ) : workflow === 'plan' ? (
        <PlanningBoard context={context} prepareMetrics={prepareMetrics} />
      ) : (
        <AcceptancePage context={context} />
      )}
    </section>
  )
}
