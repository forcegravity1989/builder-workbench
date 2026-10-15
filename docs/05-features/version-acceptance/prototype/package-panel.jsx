import { React, useState } from 'react'
import { ArrowUpRight, Download } from 'lucide-react'

// CloudDragon pipeline names captured from the real list page (project
// ga751ea99), scope dropdown set to 当前项目下的流水线. The product screen
// reads the same scope; the default matches this project's service pipeline.
export const PACKAGE_PIPELINES = [
  'gtsllm-dfx',
  'axodendron',
  'benchmark-ai2_pujianfeng',
  'omdashboard-main',
  'benchmark-ai2',
  'benchmark-ai',
  'dfx'
]

// Latest package captured from the real artifact services page: select the
// service on the left, open the newest software version, read its detail page.
// The product screen reaches this via Playwright; acceptance only cares about
// the final artifact, not how many pipeline runs produced it.
export const LATEST_PACKAGE = {
  project: 'gtsllm-dfx',
  version: '1.0.0-SNAPSHOT.20261015091143.640856637',
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
          <div className="package-meta-row">
            <span>项目名称</span>
            <p>{latest.project}</p>
          </div>
          <div className="package-meta-row">
            <span>版本号</span>
            <p className="package-version">{latest.version}</p>
            <button
              className="btn btn-secondary"
              disabled={disabled}
              onClick={() => onDownload(latest)}
            >
              <Download />
              下载
            </button>
          </div>
          <div className="package-meta-row">
            <span>创建时间</span>
            <p>{latest.created}</p>
          </div>
          <div className="package-meta-row">
            <span>包文件</span>
            <div className="package-files">
              {latest.files.map((name) => (
                <p key={name}>{name}</p>
              ))}
            </div>
          </div>
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
