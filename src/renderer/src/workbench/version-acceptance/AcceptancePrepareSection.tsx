import {
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  FileText,
  MonitorSmartphone
} from 'lucide-react'
import { useState, type Ref } from 'react'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type {
  PackageLatest,
  PackagePipelinePort
} from '../../../../shared/workbench/package-pipeline'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { BoardActionButton, BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'
import { latestVerificationArtifact } from './acceptance-model'
import { AcceptancePackage } from './AcceptancePackage'

/** Keep the prepare row one line: first three accounts, then 等; full list in title. */
function attendeePreview(attendees: string[]): string {
  const shown = attendees.slice(0, 3)
  return attendees.length > shown.length ? `${shown.join('、')} 等` : shown.join('、')
}

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
 *
 * Meeting booking and report aggregation are session-driven requests too (#471):
 * the model books the Friday acceptance meeting via welink-cli after the human
 * confirms the preview and writes the meeting back to the material; the row reads
 * that write-back and the button greys out once booked. The report is aggregated,
 * not collected: proof already lives on the merged Issues/PRs, and the aggregate
 * request only folds it into one per-goal report, marking honest gaps for the
 * human to resolve.
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
  onSendAction: SendActionWrap
  onOpenMaterial(location: string): void
  sectionRef: Ref<HTMLElement>
}) {
  const [packageOpen, setPackageOpen] = useState(false)
  const [latest, setLatest] = useState<PackageLatest | null>(null)
  const candidate = document?.candidateRef
  const report = document ? latestVerificationArtifact(document) : undefined
  const demoEnv = document?.demoEnv
  const meeting = document?.meeting
  const meetingLink = meeting?.link
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
              title={`经内置 Orca 浏览器打开 ${demoEnv.url}`}
              onClick={() => onOpenMaterial(demoEnv.url)}
            >
              {demoEnv.label || demoEnv.url}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : demoEnv?.kind === 'launched' ? (
            <span className="acc-prepare-value" title="桌面应用无环境 URL，显示启动状态">
              已启动 · {demoEnv.detail}
            </span>
          ) : (
            <span className="acc-muted">未部署 · 点「部署」注入请求</span>
          )}
          {onSendAction(
            '下载最新安装包，按项目自有部署入口部署启动，完成后给出本次演示环境',
            '部署请求',
            <BoardActionButton
              disabled={disabled || !latest}
              title={latest ? '向验收助手会话注入部署请求' : '尚无制品包；先出包'}
            >
              <BrainCircuit size={14} aria-hidden="true" /> 部署
            </BoardActionButton>
          )}
        </div>

        <div className="acc-prepare-row">
          <CalendarClock size={15} aria-hidden="true" />
          <span className="acc-prepare-label">验收会议</span>
          {meeting ? (
            <div className="acc-meeting">
              <span className="acc-prepare-value" title="经会话预订，信息已写回材料">
                {meeting.title} · {meeting.time}
              </span>
              <span
                className="acc-meeting-meta"
                title={
                  meeting.attendees?.length ? `与会人：${meeting.attendees.join('、')}` : undefined
                }
              >
                {meeting.id ? <>会议 ID {meeting.id}</> : null}
                {meeting.attendees?.length ? (
                  <>
                    {meeting.id ? ' · ' : ''}
                    与会人 {meeting.attendees.length} 人（{attendeePreview(meeting.attendees)}）
                  </>
                ) : null}
                {meetingLink ? (
                  <>
                    {meeting.id || meeting.attendees?.length ? ' · ' : ''}
                    <button
                      type="button"
                      className="acc-link"
                      title={`经内置 Orca 浏览器打开 ${meetingLink}`}
                      onClick={() => onOpenMaterial(meetingLink)}
                    >
                      打开会议页面
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </span>
            </div>
          ) : (
            <span className="acc-muted">未预订 · 点「预订会议」注入请求</span>
          )}
          {/* 预订会议（#471 评审新增，会议生命周期首片）：预订走会话，模型用
              welink-cli 创建会议（逻辑内置于验收技能）并把信息写回材料；已预订后
              置灰，改期或取消在会话中说明。纪要区的「同步会议纪要」依赖它。
              #516：prompt 点名时间、与会人来源与写回要求——此前只写「写回材料」，
              模型不知道与会人取项目群、也不知道要回读并保存 meeting，导致预订后
              板面一直显示未预订。SOP 细节仍在验收技能，prompt 只点出易漏的硬约束。
              #516 后续（v0.8 实测）：补「向项目群发会议通知」——实测模型照 SOP
              走完不发通知，人得自己提醒；通知口径、确认边界与 enMeetingId 轮换
              事实在验收技能预订节。 */}
          {onSendAction(
            '预订本周五的版本验收会议。先给我完整预览：起止时间、与会人、议题；与会人默认取本项目绑定项目群的全部成员，没有绑定项目群就问我群号；时间或与会人缺失先问我，不要猜。确认后用 welink-cli meeting create 创建，再用 meeting info 读回会议 ID 与链接，向项目群发一条会议通知（标题、时间、会议号、入会链接、议题，单独预览确认），把会议信息写回验收材料的 meeting 字段。',
            '预订会议请求',
            <BoardActionButton
              disabled={Boolean(meeting)}
              title={meeting ? '已预订；改期或取消在会话中说明' : '向验收助手会话注入预订会议请求'}
            >
              <BrainCircuit size={14} aria-hidden="true" /> 预订会议
            </BoardActionButton>
          )}
        </div>

        <div className="acc-prepare-row">
          <FileText size={15} aria-hidden="true" />
          <span className="acc-prepare-label">验收证据报告</span>
          {report ? (
            <button
              type="button"
              className="acc-link"
              title="一个版本一份，全目标合并"
              onClick={() => onOpenMaterial(report.location)}
            >
              已生成 {new Date(report.generatedAt).toLocaleString('zh-CN')}
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          ) : (
            <span className="acc-muted">未生成 · 点「聚合」注入请求</span>
          )}
          {/* #471：举证在各 Issue/PR 合入时已留下，报告=按目标聚合各 Issue 的
              验收件；缺口如实标出，由人确认或自行补充，模型不代采。
              #516：登记收拢成一条 add-artifact 命令——此前靠 prompt 提醒「登记
              后再保存」，真实会话里模型仍漏登记，板面行永远不亮；命令内部完成
              读改存与冲突重试，文件不存在如实报错，不登记幽灵制品。SOP 细节仍
              在验收技能，prompt 只给出可直接执行的命令。
              #516 后续（v0.8 实测）：补一句字段化子集口径——实测报告把逐条判据
              压缩成一段转述（每句都真、没有一条能独立核对），点名逐条一行与
              反面模式；细节仍留 SKILL，不让注入句膨胀成第二份规范。 */}
          {onSendAction(
            '聚合本次验收的证据报告：把各 Issue / PR 合入时留下的验收证据按目标归并成一份报告，判据逐条一行按字段提取（用例名、期望结果、实际结果、截图钉 SHA、执行路径），不压缩成一段转述、不用大段文本凑数，缺证的地方如实标缺。报告文件落本版 .bw/planning/<版本>/ 目录；生成后执行一条命令完成登记（--repo-id/--worktree-id 用入口提供的原生身份，candidateRef 复用材料现有值，文件不存在会如实报错）：ORCA bw materials add-artifact --repo-id <id> --worktree-id <id> --workflow acceptance --version <版本> --kind verification --location .bw/planning/<版本>/<报告文件名>',
            '聚合请求',
            <BoardActionButton title="向验收助手会话注入聚合请求：按目标归并各 Issue/PR 的验收件">
              <BrainCircuit size={14} aria-hidden="true" /> 聚合
            </BoardActionButton>
          )}
          <BoardIconButton
            label={report ? '打开验收证据报告' : '报告未生成；先点「聚合」注入请求'}
            disabled={!report}
            onClick={() => {
              if (report) {
                onOpenMaterial(report.location)
              }
            }}
          >
            {/* 打开报告统一用 FileText（与目标卡「关联 Issue」头的报告入口同图标）；
                ArrowUpRight 保留给环境/报告链接本体与原生 PR 页。 */}
            <FileText size={15} aria-hidden="true" />
          </BoardIconButton>
        </div>
      </div>
    </section>
  )
}
