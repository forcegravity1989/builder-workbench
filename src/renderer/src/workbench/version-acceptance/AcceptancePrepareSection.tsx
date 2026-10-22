import { ArrowUpRight, ChevronDown, ChevronRight, FileText, MonitorSmartphone } from 'lucide-react'
import { useState, type Ref } from 'react'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { PackageLatest, PackagePipelinePort } from '../../../../shared/workbench/package-pipeline'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { BoardIconButton } from '../board-ui'
import { latestVerificationArtifact } from './acceptance-model'
import { AcceptancePackage } from './AcceptancePackage'

/**
 * First zone: candidate + packaging + demo environment + the single evidence
 * report. Packaging is collapsible and starts collapsed to a one-line summary of
 * the latest package; the block stays mounted so its per-minute refresh keeps
 * reporting the latest package while collapsed.
 *
 * Deployment is session-driven: the button injects a request, the model deploys
 * through the project's own entry point and writes the environment back. The row
 * reads two honest shapes — a URL for a web service, opened in the built-in Orca
 * browser, or a launched state for a desktop application. Neither is faked: no
 * placeholder link stands in for a desktop app.
 */
export function AcceptancePrepareSection({
  document,
  packages,
  scope,
  disabled,
  onSendAction,
  onOpenMaterial,
  sectionRef
}: {
  document?: AcceptanceMaterial
  packages: PackagePipelinePort
  scope: MetricScope
  disabled: boolean
  onSendAction(prompt: string, label: string): void
  onOpenMaterial(location: string): void
  sectionRef: Ref<HTMLElement>
}) {
  const [packageOpen, setPackageOpen] = useState(false)
  const [latest, setLatest] = useState<PackageLatest | null>(null)
  const candidate = document?.candidateRef
  const report = document ? latestVerificationArtifact(document) : undefined
  const demoEnv = document?.demoEnv
  return (
    <section id="prepare" ref={sectionRef} aria-label="验收准备">
      <div className="acc-section-title">
        <h2>
          验收准备
          <small>
            {candidate
              ? `候选 ${candidate.commit.slice(0, 8)} · ${
                  document?.preparedArtifacts.some((item) => item.kind === 'package')
                    ? '已登记包'
                    : '未登记包'
                }`
              : '候选未固定 · 尚未出包'}
          </small>
        </h2>
      </div>

      <div className="acc-package-block">
        <button
          type="button"
          className="acc-package-summary"
          aria-expanded={packageOpen}
          onClick={() => setPackageOpen(!packageOpen)}
        >
          {packageOpen ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
          <span>出包</span>
          <span className="acc-muted">
            {latest ? `最新包 ${latest.version} · ${latest.created}` : '暂无制品包'}
          </span>
        </button>
        <div className={packageOpen ? undefined : 'acc-collapsed'} aria-hidden={!packageOpen}>
          <AcceptancePackage port={packages} scope={scope} onLatestChange={setLatest} />
        </div>
      </div>

      <div className="acc-prepare-rows">
        <div className="acc-prepare-row">
          <MonitorSmartphone size={15} aria-hidden="true" />
          <span className="acc-prepare-label">演示环境</span>
          {demoEnv?.kind === 'url' ? (
            <button
              type="button"
              className="acc-link"
              title="环境 URL 由验收助手部署后写回材料；点击经内置 Orca 浏览器打开"
              onClick={() => onOpenMaterial(demoEnv.url)}
            >
              {demoEnv.url}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : demoEnv?.kind === 'launched' ? (
            <span className="acc-prepare-value" title="桌面应用类没有环境 URL，如实呈现启动状态">
              已启动 · {demoEnv.detail}
            </span>
          ) : (
            <span className="acc-muted">
              未部署 · 点「部署」注入请求，验收助手按项目自有入口部署并写回环境
            </span>
          )}
          <button
            type="button"
            className="acc-text-button"
            disabled={disabled || !latest}
            title={
              latest
                ? '向验收助手会话注入部署请求；与在会话中直说等价'
                : '尚无制品包；先出包'
            }
            onClick={() =>
              onSendAction(
                '下载最新安装包并按项目自有部署入口部署启动；完成后把演示环境 URL（桌面应用则写启动状态）写回材料',
                '部署请求'
              )
            }
          >
            部署
          </button>
        </div>

        <div className="acc-prepare-row">
          <FileText size={15} aria-hidden="true" />
          <span className="acc-prepare-label">验收证据报告</span>
          {report ? (
            <button
              type="button"
              className="acc-link"
              title="一个版本一份、全目标合并；点击按所属宿主打开"
              onClick={() => onOpenMaterial(report.location)}
            >
              已生成 {new Date(report.generatedAt).toLocaleString('zh-CN')}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : (
            <span className="acc-muted">未生成 · 在会话中让验收助手按目标采集证据并生成</span>
          )}
          <BoardIconButton
            label={
              report
                ? '打开验收证据报告'
                : '报告未生成；先在会话中让验收助手生成'
            }
            disabled={!report}
            onClick={() => {
              if (report) {
                onOpenMaterial(report.location)
              }
            }}
          >
            <ArrowUpRight size={15} aria-hidden="true" />
          </BoardIconButton>
        </div>
      </div>
      <p className="acc-footnote">
        出包与部署的事实只以真实读数与登记呈现；缺流水线、缺权限或远端认不出时如实报错，
        改按项目自有出包与部署入口执行并核对，没有包要求就不造包要求。
      </p>
    </section>
  )
}
