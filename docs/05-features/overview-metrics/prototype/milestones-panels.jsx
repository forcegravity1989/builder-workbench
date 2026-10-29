import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { historicalRows, outcomeLabel, sourceUrl } from './milestones-history.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, X } = window.BWPrototypeDependencies
export function Modal({ title, close, children, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`ml-dialog ${wide ? 'wide' : ''}`}
      onCancel={close}
    >
      <header>
        <h2>{title}</h2>
        <IconAction label="关闭对话框" icon={X} onClick={close} />
      </header>
      {children}
    </dialog>
  )
}

export function ReferencePanel({ close }) {
  return (
    <Modal title="设计依据" close={close}>
      <p className="muted">
        原型注释: 2026-10-29
        核对官方资料。本稿借鉴交互思路，产品规则以人工澄清与仓内原则为准；此入口仅供原型评审，不进入产品界面。
      </p>
      <section className="ml-reference">
        <h3>时间轴组件取舍</h3>
        <p>原型注释: 本稿沿 React DOM 与设计系统整理泳道，未引入新图表依赖。</p>
        <p>
          <a
            href="https://echarts.apache.org/handbook/en/how-to/custom-series/"
            target="_blank"
            rel="noreferrer"
          >
            ECharts custom series ↗
          </a>{' '}
          能绘制时间图形，但字段编辑、行排序、版本吸附和撤销仍需自行接入；本轮不替换编辑器。
        </p>
        <p>
          <a
            href="https://visjs.github.io/vis-timeline/docs/timeline/"
            target="_blank"
            rel="noreferrer"
          >
            vis-timeline ↗
          </a>{' '}
          提供 DOM/CSS 时间轴与可编辑节点，可作为今后需要成熟缩放或大数据布局时的候选，当前未接入。
        </p>
      </section>
      <section className="ml-reference">
        <h3>
          <a
            href="https://support.atlassian.com/jira-software-cloud/docs/edit-and-reorder-work-items-on-the-timeline/"
            target="_blank"
            rel="noreferrer"
          >
            Jira · 时间轴就地编辑与排序 ↗
          </a>
        </h3>
        <p>
          借鉴：在对象附近建立排期、直接改日期和拖动排序。BW
          在同一连续画布添加特性，空周在使用时登记；拖节点保持特性身份。
        </p>
      </section>
      <section className="ml-reference">
        <h3>
          <a
            href="https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Projects · Roadmap ↗
          </a>
        </h3>
        <p>借鉴：已有日期字段决定时间位置，关键节点帮助读轴。不从发布记录反推版本排期。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/initiatives" target="_blank" rel="noreferrer">
            Linear · Initiatives ↗
          </a>
        </h3>
        <p>借鉴：把方向、优先级、主导人和目标日期放在同一规划视图，再连接执行。</p>
        <p className="muted">取舍：不照搬组织层级或手设健康灯；BW 保留一项特性跨版本的整体身份。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/use-cycles" target="_blank" rel="noreferrer">
            Linear · Cycles ↗
          </a>
        </h3>
        <p>借鉴：工作节奏与发布节奏分开考虑，未来周期可调整。</p>
        <p className="muted">取舍：不把每周反馈等同于每周发布，也不照搬固定周期或自动结转规则。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://basecamp.com/shapeup/1.2-chapter-03" target="_blank" rel="noreferrer">
            Basecamp · Shape Up / Set Boundaries ↗
          </a>
        </h3>
        <p>借鉴：先讨论值得投入多少精力，再收敛问题与范围。</p>
        <p className="muted">
          取舍：不照搬六周周期、团队人数或立项角色。月度先取舍，具体规格与可试用交付在版本中收敛。
        </p>
      </section>
      <p>
        原型注释: 本轮五步旅程来自人工澄清：月度选择 → Pre版本 → 部分用户试用 → Release版本交付 →
        Issue 持续改善。
      </p>
      <footer>
        <a className="btn btn-secondary" href="spec.md" target="_blank" rel="noreferrer">
          查看完整规格
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回原型
        </button>
      </footer>
    </Modal>
  )
}

export function VersionBridge({ item, version, plan, close }) {
  const pre = item?.pre === version,
    release = item?.release === version
  const v = plan.versions.find((entry) => entry.id === version)
  return (
    <Modal title={`${v.name || '未命名版本'} · 版本总览`} close={close} wide>
      <p className="ml-footnote">
        原型注释: #334
        衔接预览。真实特性对应关系、来源定位与返回字段仍待接入；原型返回保留当前草案和视口。
      </p>
      <h3>{item?.title || '版本工作'}</h3>
      <div className="ml-source-columns">
        <section>
          <h3>里程碑安排</h3>
          {pre && (
            <p>
              <b>Pre版本：</b>
              {v.start} — {v.end}
            </p>
          )}
          {release && (
            <p>
              <b>Release版本：</b>
              {v.start} — {v.end}
            </p>
          )}
          {!pre && !release && <p>本版未关联当前特性。</p>}
          {(pre || release) && <p className="muted">负责人：{item.owner}</p>}
        </section>
        <section>
          <h3>版本计划与实际交付</h3>
          <p>尚未读取</p>
          <p className="muted">
            项目版本发布不代表本特性已交付Pre或Release，实际范围与验收以版本材料为准。
          </p>
        </section>
      </div>
      <footer>
        <a
          className="btn btn-secondary"
          href="../version-overview/prototype.html"
          target="_blank"
          rel="noreferrer"
        >
          查看版本总览原型 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回来源视图
        </button>
      </footer>
    </Modal>
  )
}
export function HistoryVersion({ plan, close }) {
  const rows = historicalRows.filter((r) => r.planVersion === plan.version)
  return (
    <Modal title={`${plan.version} · 真实版本材料`} close={close} wide>
      <p>原型注释: 此处只读 .bw 计划与人工验收；未记录排期的历史版本不绘入时间轴。</p>
      {rows.map((r) => (
        <details className="ml-source-item" key={r.id}>
          <summary>
            {r.displayGoal} · {r.title}
          </summary>
          <p>
            {outcomeLabel(r.result?.decision?.outcome)} ·{' '}
            {r.result?.decision?.recordedAt || '未记录验收时间'}
          </p>
          <p className="ml-info-text">{r.scope}</p>
          <p className="ml-info-text">{r.result?.decision?.reason || r.result?.note}</p>
        </details>
      ))}
      <footer>
        <a
          className="btn btn-secondary"
          href={sourceUrl(`.bw/planning/${plan.version}/data.json`)}
          target="_blank"
          rel="noreferrer"
        >
          查看原计划 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回来源视图
        </button>
      </footer>
    </Modal>
  )
}
export function PlanningReviewPanel({ state, changes, submit, markMerged, publish, close }) {
  const dirty = changes.length > 0
  return (
    <Modal
      title={
        dirty && state.review !== 'merged'
          ? '核对本次变更'
          : state.review === 'merged'
            ? '已合入，待更新'
            : '已提交，待合入'
      }
      close={close}
    >
      {dirty && state.review !== 'merged' ? (
        <>
          {changes.map((c, i) => (
            <div className="ml-confirm-row" key={i}>
              <strong>{c.title}</strong>
              <p>{c.detail}</p>
            </div>
          ))}
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              继续修改
            </button>
            <button className="btn btn-primary" onClick={submit}>
              {state.review === 'open' ? '更新评审' : '提交评审'}
            </button>
          </footer>
        </>
      ) : state.review === 'merged' ? (
        <>
          <p>正式总览将更新为最近已提交并合入的规划。</p>
          {dirty && <p>另有未提交修改，更新后继续保留。</p>}
          <footer>
            <button className="btn btn-primary" onClick={publish}>
              更新正式安排
            </button>
          </footer>
        </>
      ) : (
        <>
          <p>已提交的规划正在等待 PR / MR 合入。</p>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              返回总览
            </button>
          </footer>
          <div className="ml-prototype-controls">
            <button className="btn btn-ghost" onClick={markMerged}>
              原型注释: 模拟人工已合入
            </button>
          </div>
        </>
      )}
      <p className="ml-footnote">
        原型注释: 此处演示 bw/project → PR/MR → 主干的状态；没有真实 Git
        写入。还原仅针对最近提交后的修改，阶段成果仍由人确认。
      </p>
    </Modal>
  )
}
