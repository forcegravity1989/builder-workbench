import { FilePenLine, X } from 'lucide-react'
import { ProjectCard } from '../overview-project-card'
import { ProjectCharterFields } from '../ProjectCharterFields'
import { ProjectSettingsReviewSummary } from '../ProjectSettingsReview'
import { WorkbenchIconButton } from '../WorkbenchIconButton'
import type { ProjectCharter } from '../project-charter'
import '../project-settings.css'
import '../workbench-overview.css'

export const sampleCharter: ProjectCharter = {
  name: '周末书集',
  kind: '',
  benchmark: '',
  owner: '林小满',
  brief: '让邻居用手机预约周末的图书交换。',
  opportunity: '让社区借书更方便。'
}

const vision = '每周都有人带一本书来，也带一本书回家。'
const ignore = () => {}

export function DirectionOverviewFrame({
  expanded,
  showEdit = false
}: {
  expanded: boolean
  showEdit?: boolean
}) {
  return (
    <div className="wb-ov direction-demo-window">
      <header className="page-head">
        <h1>总览</h1>
      </header>
      <div className="content">
        <ProjectCard
          projectName={sampleCharter.name}
          charter={sampleCharter}
          version={null}
          previewExpanded={expanded}
          onEdit={showEdit ? ignore : undefined}
        />
      </div>
    </div>
  )
}

export function DirectionCharterDemo({ time }: { time: number }) {
  if (time < 2500) {
    return <DirectionOverviewFrame expanded={time >= 950} showEdit />
  }

  const typing = time >= 4050
  const value = {
    ...sampleCharter,
    opportunity: typing
      ? vision.slice(0, 1 + Math.floor((time - 4050) / 80))
      : sampleCharter.opportunity
  }

  if (time >= 7300) {
    return (
      <section className="wb-ml-review direction-demo-focus" data-demo-action="charter-confirm">
        <ProjectSettingsReviewSummary
          changes={['opportunity']}
          value={value}
          localOnly={false}
          onConfirm={ignore}
        />
      </section>
    )
  }

  return (
    <aside
      className="wb-project-settings direction-demo-window direction-charter-editor"
      data-demo-typing={typing || undefined}
    >
      <header className="wb-config-header">
        <div>
          <span className="wb-config-eyebrow">项目设置</span>
          <h2>{sampleCharter.name}</h2>
        </div>
        <WorkbenchIconButton label="关闭项目设置" icon={X} />
      </header>
      <section className="wb-config-section">
        <header className="wb-config-info-heading">
          <h3>项目信息</h3>
          <WorkbenchIconButton label="收起编辑" icon={FilePenLine} />
        </header>
        <div className="wb-config-body">
          <ProjectCharterFields value={value} idPrefix="direction-demo" onEdit={ignore} />
        </div>
      </section>
      <footer className="wb-config-footer">
        {typing && (
          <>
            <button type="button" className="wb-btn wb-btn-ghost">
              撤销修改
            </button>
            <button type="button" className="wb-btn wb-btn-primary" data-demo-action="review">
              提交评审
            </button>
          </>
        )}
      </footer>
    </aside>
  )
}
