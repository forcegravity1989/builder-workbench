import { useCycleWorkspace } from './cycle-workspace-context'
import { PlanningBoard } from '../version-planning/PlanningBoard'
import { AcceptancePage } from '../version-acceptance/AcceptancePage'
export function CycleWorkspaceShell() {
  const workspace = useCycleWorkspace()
  if (!workspace) {
    return null
  }
  const { workflow, context, prepareMetrics, busy, notice, start, configure } = workspace
  const entry = { workflow, busy, notice, start, configure }
  return (
    <section
      className="vc-board-col"
      aria-busy={context.syncing}
      aria-label={workflow === 'plan' ? '计划材料' : '验收材料'}
    >
      {context.syncing && (
        <p role="status" className="vc-notice">
          正在同步主干，现有材料暂时只读…
        </p>
      )}
      <div inert={context.syncing} style={{ display: 'contents' }}>
        {!context.worktreeId ? (
          <>
            {(notice || context.error) && (
              <p role="status" className="vc-notice">
                {context.error ?? notice}
              </p>
            )}
            <p className="vc-notice">
              {context.error ? '请核对上述问题后重新进入。' : '正在准备项目工作区…'}
            </p>
          </>
        ) : workflow === 'plan' ? (
          <PlanningBoard context={context} prepareMetrics={prepareMetrics} entry={entry} />
        ) : (
          <AcceptancePage context={context} entry={entry} />
        )}
      </div>
    </section>
  )
}
