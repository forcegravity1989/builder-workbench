import { FilePenLine, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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

export function DirectionCharterDemo({ time }: { time: number }) {
  const editing = time >= 2500
  const typing = time >= 4050
  const review = time >= 7300
  const value = {
    ...sampleCharter,
    opportunity: typing
      ? vision.slice(0, 1 + Math.floor((time - 4050) / 80))
      : sampleCharter.opportunity
  }
  const changed = value.opportunity !== sampleCharter.opportunity

  return (
    <div className="direction-charter-demo wb-overview-with-settings">
      <div className="wb-ov">
        <header className="page-head">
          <h1>总览</h1>
        </header>
        <div className="content">
          <ProjectCard
            projectName={sampleCharter.name}
            charter={sampleCharter}
            version={null}
            previewExpanded={time >= 950}
            onEdit={() => {}}
          />
        </div>
      </div>
      {editing && (
        <aside className="wb-project-settings">
          <header className="wb-config-header">
            <div>
              <span className="wb-config-eyebrow">项目设置</span>
              <h2>{sampleCharter.name}</h2>
            </div>
            <WorkbenchIconButton label="关闭项目设置" icon={X} />
          </header>
          <div className="wb-config-scroll">
            <div className="wb-config-type">
              <label>项目类型</label>
              <Select value="team">
                <SelectTrigger aria-label="项目类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team">团队项目</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <section className="wb-config-section">
              <header className="wb-config-info-heading">
                <h3>项目信息</h3>
                <WorkbenchIconButton label="收起编辑" icon={FilePenLine} />
              </header>
              <div className="wb-config-body">
                <ProjectCharterFields value={value} idPrefix="direction-demo" onEdit={() => {}} />
              </div>
            </section>
          </div>
          {changed && (
            <footer className="wb-config-footer">
              <button type="button" className="wb-btn wb-btn-ghost">
                撤销修改
              </button>
              <button type="button" className="wb-btn wb-btn-primary" data-demo-action="review">
                提交评审
              </button>
            </footer>
          )}
          {review && (
            <div className="wb-ml-review direction-review-summary">
              <ProjectSettingsReviewSummary
                changes={['opportunity']}
                value={value}
                localOnly={false}
                onConfirm={() => {}}
              />
            </div>
          )}
        </aside>
      )}
    </div>
  )
}
