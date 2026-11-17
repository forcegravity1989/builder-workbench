import { ErrorDetails } from '../error-feedback'
import { Info, MessageSquarePlus } from 'lucide-react'
import type { Ref } from 'react'
import type { CycleEntry } from './cycle-workspace-context'
import { materialProblemFile, type CycleMaterialProblem } from './cycle-start-request'

/**
 * First content row of both cycle boards: one collaboration sentence and the
 * single launch entry. The automation editor entry lives in each board's page
 * header — one-off configuration stays off the weekly action row. Material
 * problems remain visible on the card; the Skill reads their current state from materials.
 */
export function CycleStartCard({
  entry,
  problems,
  version,
  sectionRef
}: {
  entry: CycleEntry
  problems: CycleMaterialProblem[]
  version: string | null
  sectionRef?: Ref<HTMLElement>
}) {
  const { workflow, busy, start } = entry
  const label = workflow === 'plan' ? '计划' : '验收'
  return (
    <section className="vc-start-card" aria-label={`${label}会话入口`} ref={sectionRef}>
      <div className="vc-start-line">
        <p>与 Agent 一起{workflow === 'plan' ? '制定版本计划' : '核对版本交付'}</p>
        <button
          className="wb-btn wb-btn-secondary"
          title={`新建会话，${workflow === 'plan' ? '制定版本计划' : '核对版本交付'}`}
          disabled={busy}
          onClick={() => void start(version)}
        >
          <MessageSquarePlus size={14} aria-hidden="true" />
          {busy ? '正在打开会话…' : `新建${label}`}
        </button>
      </div>
      {problems.length > 0 && (
        <div className="vc-start-problem" role="status">
          <Info size={14} aria-hidden="true" />
          <div>
            {[...new Set(problems.map((item) => item.version))].join('、')} 的版本材料格式
            {problems.every((item) => item.state === 'migration-required') ? '较旧' : '有问题'}
            ，暂无法读取；点「新建{label}
            」会打开草稿；发送后由助手读取实际问题、说明方案，经你确认后处理。
            <ErrorDetails
              detail={problems
                .map(
                  (item) => `${materialProblemFile(item, workflow)}：${item.error ?? item.state}`
                )
                .join('\n')}
            />
          </div>
        </div>
      )}
    </section>
  )
}
