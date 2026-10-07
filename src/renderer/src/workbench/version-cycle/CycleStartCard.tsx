import { Info, MessageSquarePlus } from 'lucide-react'
import type { Ref } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import type { CycleEntry } from './cycle-workspace-context'
import { materialProblemRequest } from './cycle-start-request'

/**
 * First content row of both cycle boards: one collaboration sentence and the
 * single launch entry. The automation editor entry lives in each board's page
 * header — one-off configuration stays off the weekly action row. Material
 * problems live inside the same card and ride along with the launch as one-shot
 * context — no second start button and no separate migration dialog.
 */
export function CycleStartCard({
  entry,
  problems,
  version,
  sectionRef
}: {
  entry: CycleEntry
  problems: VersionMaterialCandidate[]
  version: string | null
  sectionRef?: Ref<HTMLElement>
}) {
  const { workflow, busy, start } = entry
  const label = workflow === 'plan' ? '计划' : '验收'
  const file = workflow === 'plan' ? 'data.json' : 'acceptance.json'
  return (
    <section className="vc-start-card" aria-label={`${label}会话入口`} ref={sectionRef}>
      <div className="vc-start-line">
        <p>与 Agent 一起{workflow === 'plan' ? '制定版本计划' : '核对版本交付'}</p>
        <button
          className="wb-btn wb-btn-secondary"
          title={`新建会话，${workflow === 'plan' ? '制定版本计划' : '核对版本交付'}`}
          disabled={busy}
          onClick={() =>
            void start(
              [
                version ? `本次${label}版本：${version}。请读取该版本的当前材料并继续协作。` : '',
                problems.length ? materialProblemRequest(problems, workflow, version) : ''
              ]
                .filter(Boolean)
                .join('\n') || undefined
            )
          }
        >
          <MessageSquarePlus size={14} aria-hidden="true" />
          {busy ? '正在打开会话…' : `新建${label}`}
        </button>
      </div>
      {problems.length > 0 && (
        <p
          className="vc-start-problem"
          role="alert"
          title={problems
            .map((item) => `.bw/planning/${item.version}/${file}：${item.error ?? item.state}`)
            .join('\n')}
        >
          <Info size={14} aria-hidden="true" />
          <span>
            {problems.map((item) => item.version).join('、')} 的{label}数据文件格式
            {problems.every((item) => item.state === 'migration-required') ? '较旧' : '有问题'}
            ，暂无法读取；新建{label}时将一并带入会话。
          </span>
        </p>
      )}
    </section>
  )
}
