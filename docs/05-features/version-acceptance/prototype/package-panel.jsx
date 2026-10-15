import { React, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

// CloudDragon pipeline names captured from the real list page (project ga751ea99).
export const PACKAGE_PIPELINES = [
  '174961_DockerImageSync_1752523205155',
  '174979_DockerImageSync_1752481806803',
  '174413_DockerImageSync_1751990402283',
  '133669_DockerImageSyncToolBox_1752523204855',
  '133685_DockerImageSyncToolBox_1752483334804',
  '133100_DockerImageSyncToolBox_1751990401989'
]

// History rows mirror the real CloudDragon history page columns: status is
// derived from the stage chain, plus time, trigger, runner, branch, version,
// version type and duration. Static prototype data; the product screen reads
// these from the pipeline history page.
export const INITIAL_PACKAGE_RUNS = [
  {
    id: 'run-2',
    status: 'success',
    time: '2026-10-15 09:15:09',
    trigger: 'Schedule',
    runner: 'y00652259',
    branch: 'master',
    version: '1.0.0-SNAPSHOT.20261015091509.975234647',
    versionType: 'snapshot',
    duration: '3m 44s',
    stages: ['Source', 'Build', 'VersionSet', 'Alpha', 'Beta']
  },
  {
    id: 'run-1',
    status: 'success',
    time: '2026-10-14 09:15:09',
    trigger: 'Schedule',
    runner: 'y00652259',
    branch: 'master',
    version: '1.0.0-SNAPSHOT.20261014091509.077667313',
    versionType: 'snapshot',
    duration: '2m 41s',
    stages: ['Source', 'Build', 'VersionSet', 'Alpha']
  },
  {
    id: 'run-0',
    status: 'failed',
    time: '2026-10-13 09:15:09',
    trigger: 'Schedule',
    runner: 'y00652259',
    branch: 'master',
    version: '--',
    versionType: 'snapshot',
    duration: '1m 02s',
    stages: ['Source', 'Build']
  }
]

const STATUS_LABEL = { success: '成功', failed: '失败', running: '运行中' }
const STATUS_TAG = { success: 'tag-success', failed: 'tag-danger', running: 'tag-warning' }

export function PackagePanel({ disabled, runs, onPackage }) {
  const [pipeline, setPipeline] = useState(PACKAGE_PIPELINES[0])
  return (
    <section className="package-sheet" aria-label="出包">
      <div className="package-toolbar">
        <label className="package-pipeline-label" htmlFor="package-pipeline">
          流水线
        </label>
        <select
          id="package-pipeline"
          className="input package-pipeline"
          aria-label="流水线名称"
          value={pipeline}
          disabled={disabled}
          onChange={(e) => setPipeline(e.target.value)}
        >
          {PACKAGE_PIPELINES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => onPackage(pipeline)}
        >
          <ArrowUpRight />
          出包
        </button>
      </div>
      <div className="package-history" role="table" aria-label="流水线执行历史">
        <div className="package-run package-run-head" role="row">
          <span>状态</span>
          <span>执行时间</span>
          <span>执行方式</span>
          <span>版本号</span>
          <span>耗时</span>
          <span>执行人</span>
          <span>阶段</span>
        </div>
        {runs.length === 0 && (
          <p className="package-run-empty">该流水线暂无执行历史。</p>
        )}
        {runs.map((run) => (
          <div className="package-run" data-status={run.status} role="row" key={run.id}>
            <span className={`tag run-status ${STATUS_TAG[run.status]}`}>
              {STATUS_LABEL[run.status]}
            </span>
            <span className="run-time">{run.time}</span>
            <span>{run.trigger}</span>
            <span className="run-version">{run.version}</span>
            <span>{run.duration}</span>
            <span>{run.runner}</span>
            <span className="run-stages">
              {run.stages.map((stage) => (
                <em key={stage}>{stage}</em>
              ))}
              {run.status === 'running' && <i className="run-pending">…</i>}
            </span>
          </div>
        ))}
      </div>
      <p className="package-source">
        数据源：CloudDragon 流水线列表与历史记录页；正式界面经 Playwright 读取与触发。
      </p>
    </section>
  )
}
