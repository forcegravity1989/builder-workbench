import { React } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { facts } from './snapshot.js'

function MetricDetails({ detail, onPrepare, setDetail }) {
  return (
    <div className="dialog-backdrop" onClick={() => setDetail(null)}>
      <section
        className="dialog ov6-detail"
        role="dialog"
        aria-modal="true"
        aria-label="指标详情"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{detail.metric?.name || '指标来源与口径'}</h2>
          <button
            className="btn btn-icon btn-ghost"
            aria-label="关闭指标详情"
            onClick={() => setDetail(null)}
          >
            <X />
          </button>
        </header>
        {detail.metric ? (
          <>
            <dl>
              <dt>类别</dt>
              <dd>业务指标 · {detail.metric.type === 'leading' ? '引领' : '滞后'}</dd>
              <dt>归属</dt>
              <dd>{detail.metric.feature ? `${detail.metric.feature}特性` : '主要'}</dd>
              {detail.metric.leads && (
                <>
                  <dt>引领对象</dt>
                  <dd>{detail.metric.leads}</dd>
                </>
              )}
              <dt>定义</dt>
              <dd>{detail.metric.definition}</dd>
              <dt>长期目标</dt>
              <dd>{detail.metric.target}</dd>
              <dt>采集来源</dt>
              <dd>
                <code>{detail.metric.script || '脚本实测'}</code>
              </dd>
              <dt>本期值</dt>
              <dd>未采集</dd>
              {detail.metric.latest && (
                <>
                  <dt>历史查询</dt>
                  <dd>
                    {detail.metric.latest.value} · {detail.metric.latest.day} ·
                    脚本实测，与本期脚本采集分开
                  </dd>
                </>
              )}
            </dl>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const m = detail.metric
                setDetail(null)
                onPrepare(m)
              }}
            >
              在会话中准备采集
              <ArrowUpRight />
            </button>
          </>
        ) : (
          <div className="ov6-source">
            <p>
              业务指标来自 main 的 .bw/metrics.toml，保留 feature 归属、leads
              关系和采集定义。北极星仍为占位，本期脚本数据未采集。
            </p>
            <p>
              提交来自 bw-orca 调查提交 {facts.commit.slice(0, 12)} 的 Git
              历史，按提交时间统计可达提交，包含合并提交及上游历史；不当作团队产出或效率评分。
            </p>
            <p>
              合入 PR 来自 GitHub 仓库全部基线的真实 mergedAt。未处理 Issue 是当前开放 Issue
              快照（不含 PR）；历史快照尚无数据，仅画一个实际点，不反推历史。
            </p>
            <p>
              窗口为 UTC、左闭右开；本周/今日只截至采集时刻。时间：{facts.readAt}
              。刷新按钮只演示入口，不修改文件或远端。
            </p>
            <p>
              本页复用 main
              总览的项目卡、北极星、版本进展、业务指标与项目指标分区，用当前设计系统呈现。项目群与配置不在本次改动范围。
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
export { MetricDetails }
