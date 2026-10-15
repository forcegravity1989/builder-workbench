import { React, useState } from 'react'
import { ArrowUpRight, Download } from 'lucide-react'

// CloudDragon pipeline names captured from the real list page (project ga751ea99).
export const PACKAGE_PIPELINES = [
  '174961_DockerImageSync_1752523205155',
  '174979_DockerImageSync_1752481806803',
  '174413_DockerImageSync_1751990402283',
  '133669_DockerImageSyncToolBox_1752523204855',
  '133685_DockerImageSyncToolBox_1752483334804',
  '133100_DockerImageSyncToolBox_1751990401989'
]

// Latest package captured from the real artifact services page: select the
// service on the left, open the newest software version, read its detail page.
// The product screen reaches this via Playwright; acceptance only cares about
// the final artifact, not how many pipeline runs produced it.
export const LATEST_PACKAGE = {
  version: '1.0.0-SNAPSHOT.20261015091143.640856637',
  repo: 'sz-software-snapshot',
  type: 'software',
  created: '2026-10-15 09:13:00',
  files: ['gtsllm-dfx-1.0.0-20260225_1000.7z', 'gtsllm-dfx-1.0.0-20260225_1000.7z.hwp7s']
}

export function PackagePanel({ disabled, latest, onPackage, onDownload }) {
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
      {latest ? (
        <div className="package-artifact" data-version={latest.version}>
          <div className="package-artifact-head">
            <span className="package-version">{latest.version}</span>
            <button
              className="btn btn-secondary"
              disabled={disabled}
              onClick={() => onDownload(latest)}
            >
              <Download />
              下载
            </button>
          </div>
          <dl className="package-meta">
            <div>
              <dt>制品仓库</dt>
              <dd>{latest.repo}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{latest.type}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{latest.created}</dd>
            </div>
          </dl>
          <ul className="package-files">
            {latest.files.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="package-artifact-empty">该服务暂无制品包。</p>
      )}
      <p className="package-source">
        数据源：CloudDragon 制品仓库服务版本包页；正式界面经 Playwright 读取，下载先选目录。
      </p>
    </section>
  )
}
