import { React, useState } from 'react'
import { ArrowUpRight, Download } from 'lucide-react'

// CloudDragon pipeline names captured from the real list page (project
// ga751ea99), scope dropdown set to 当前项目下的流水线. The product screen
// reads the same scope; the default matches this project's service pipeline.
//
// Launch chain verified against the real page: click the per-row run button
// #startLaunch_<pipeline> -> dialog 启动流水线 offers 全量启动 / 选择任务启动 /
// 执行方案启动 -> 执行方案启动 lists the plans (pr_pipeline) -> click the plan
// to launch. The probe session hit "no permission!" on the final step, so the
// product must run this inside a session that holds launch rights.
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
//
// Download chain verified against the real page: clicking the per-row icon
// d-icon#artifact_artifactDownloadId first calls POST /artifact/v1/api/artifact
// /download for a signed URL (RS384 token, ~12h), then the browser downloads
// from cmc-szver-artifactory; Playwright waitForEvent('download') +
// download.saveAs(dir) saves into any user-chosen directory (verified: the
// saved .7z is a valid archive).
export const LATEST_PACKAGE = {
  project: 'gtsllm-dfx',
  version: '1.0.0-SNAPSHOT.20261015143151.060934033',
  created: '2026-10-15 14:33:02',
  files: ['gtsllm-dfx-1.0.0-20260225_1000.7z', 'gtsllm-dfx-1.0.0-20260225_1000.7z.hwp7s']
}

/**
 * 布局与生产 AcceptancePackage（#360 已合入）同构：工具栏一行放
 * 流水线选择 + 「出包」+「下载」，下方两行四列展示最新包真实读数
 * （项目名称/版本号/创建时间/包文件）；生产每分钟静默刷新，原型为静态快照。
 */
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
        <button className="btn btn-primary" disabled={disabled} onClick={() => onPackage(pipeline)}>
          <ArrowUpRight />
          出包
        </button>
        <button
          className="btn btn-secondary"
          disabled={disabled || !latest}
          onClick={() => onDownload(latest)}
        >
          <Download />
          下载
        </button>
      </div>
      {latest ? (
        <dl className="package-grid" data-version={latest.version}>
          <dt>项目名称</dt>
          <dt>版本号</dt>
          <dt>创建时间</dt>
          <dt>包文件</dt>
          <dd title={latest.project}>{latest.project}</dd>
          <dd className="package-version" title={latest.version}>
            {latest.version}
          </dd>
          <dd title={latest.created}>{latest.created}</dd>
          <dd className="package-files" title={latest.files.join('、')}>
            {latest.files.join('、')}
          </dd>
        </dl>
      ) : (
        <p className="package-artifact-empty">该服务暂无制品包。</p>
      )}
      <p className="package-source">
        数据源：CloudDragon 制品仓库服务版本包页；正式界面经 Playwright / gh
        按远端读取，最新包每分钟静默刷新，下载先选目录。
      </p>
    </section>
  )
}
