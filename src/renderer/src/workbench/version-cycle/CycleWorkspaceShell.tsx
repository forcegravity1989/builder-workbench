import { ErrorDetails } from '../error-feedback'
import { useCycleWorkspace } from './cycle-workspace-context'
import { PlanningBoard } from '../version-planning/PlanningBoard'
import { AcceptancePage } from '../version-acceptance/AcceptancePage'
import { VersionReadonlyMaterialView } from './VersionReadonlyMaterialView'
import { usePackagePipelineWarmup } from '../version-acceptance/use-package-pipeline-warmup'
export function CycleWorkspaceShell() {
  const workspace = useCycleWorkspace()
  usePackagePipelineWarmup(workspace?.context)
  if (!workspace) {
    return null
  }
  const { workflow, context, prepareMetrics, busy, notice, start, configure, readonlyBrowse } =
    workspace
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
      <div className="vc-board-content" inert={context.syncing}>
        {!context.worktreeId ? (
          readonlyBrowse ? (
            /* 历史版本或固定验收快照只读回看，不准备工作树。 */
            <VersionReadonlyMaterialView
              workflow={workflow}
              version={readonlyBrowse.version}
              fixedAcceptance={readonlyBrowse.fixedAcceptance}
              source={readonlyBrowse.source}
            />
          ) : (
            <>
              {context.error ? (
                <ErrorDetails
                  className="vc-notice"
                  summary="项目工作区未就绪 · 查看详情"
                  detail={context.error}
                />
              ) : notice ? (
                <p role="status" className="vc-notice">
                  {notice}
                </p>
              ) : null}
              <p className="vc-notice">
                {context.error ? '检查主机连接和项目工作区后重新进入。' : '正在准备项目工作区…'}
              </p>
            </>
          )
        ) : workflow === 'plan' ? (
          <PlanningBoard context={context} prepareMetrics={prepareMetrics} entry={entry} />
        ) : (
          <AcceptancePage context={context} entry={entry} />
        )}
      </div>
    </section>
  )
}
