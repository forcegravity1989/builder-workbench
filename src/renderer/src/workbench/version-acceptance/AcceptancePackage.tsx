import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Download } from 'lucide-react'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type { PackageLatest, PackagePipelinePort } from '../../../../shared/workbench/package-pipeline'

type BusyKind = 'list' | 'latest' | 'launch' | 'download'

const BUSY_LABEL: Record<BusyKind, string> = {
  list: '正在读取流水线列表…',
  latest: '正在读取最新包…',
  launch: '正在启动流水线…',
  download: '正在下载制品包…'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 出包区块：流水线选择与启动、最新制品包读取与下载。所有操作直连
 * CloudDragon，一次只允许一个动作进行；启动受理后由人决定何时刷新包信息。
 */
export function AcceptancePackage({
  port,
  scope
}: {
  port: PackagePipelinePort
  scope: MetricScope
}) {
  const [pipelines, setPipelines] = useState<string[]>([])
  const [pipeline, setPipeline] = useState('')
  const [latest, setLatest] = useState<PackageLatest | null>(null)
  const [busy, setBusy] = useState<BusyKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const listSeq = useRef(0)
  const latestSeq = useRef(0)

  useEffect(() => {
    const seq = ++listSeq.current
    setBusy('list')
    setError(null)
    port
      .list({ scope })
      .then((catalog) => {
        if (seq !== listSeq.current) {
          return
        }
        setPipelines(catalog.pipelines)
        setPipeline((current) =>
          current && catalog.pipelines.includes(current)
            ? current
            : (catalog.pipelines[0] ?? '')
        )
      })
      .catch((reason: unknown) => {
        if (seq === listSeq.current) {
          setError(errorText(reason))
        }
      })
      .finally(() => {
        if (seq === listSeq.current) {
          setBusy(null)
        }
      })
  }, [port, scope])

  useEffect(() => {
    if (!pipeline) {
      setLatest(null)
      return
    }
    const seq = ++latestSeq.current
    setBusy('latest')
    setError(null)
    port
      .latest({ scope, pipeline })
      .then((value) => {
        if (seq !== latestSeq.current) {
          return
        }
        setLatest(value)
      })
      .catch((reason: unknown) => {
        if (seq === latestSeq.current) {
          setError(errorText(reason))
        }
      })
      .finally(() => {
        if (seq === latestSeq.current) {
          setBusy(null)
        }
      })
  }, [port, scope, pipeline])

  const runAction = async (kind: BusyKind, action: () => Promise<void>): Promise<void> => {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (reason: unknown) {
      setError(errorText(reason))
    } finally {
      setBusy(null)
    }
  }

  const onLaunch = () =>
    runAction('launch', async () => {
      await port.launch({ scope, pipeline })
      setNotice('流水线已启动，运行约需几分钟；完成后可刷新包信息。')
    })

  const onRefreshLatest = () =>
    runAction('latest', async () => {
      const value = await port.latest({ scope, pipeline })
      setLatest(value)
    })

  const onDownload = () =>
    runAction('download', async () => {
      const directory = await window.api.shell.pickDirectory({})
      if (!directory) {
        return
      }
      const receipt = await port.download({ scope, pipeline, directory })
      const megabytes = Math.round((receipt.bytes / (1024 * 1024)) * 10) / 10
      setNotice(`已保存：${receipt.file}（${megabytes} MB）`)
    })

  return (
    <section id="acceptance-package" aria-label="出包" className="va-pkg">
      <div className="va-section-heading">
        <h2>出包</h2>
        <button
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={busy !== null || !pipeline}
          onClick={onRefreshLatest}
        >
          刷新包信息
        </button>
      </div>
      <div className="va-pkg-toolbar">
        <label className="va-pkg-pipeline-label" htmlFor="va-pkg-pipeline">
          流水线
        </label>
        <select
          id="va-pkg-pipeline"
          aria-label="流水线名称"
          value={pipeline}
          disabled={busy !== null || pipelines.length === 0}
          onChange={(event) => setPipeline(event.target.value)}
        >
          {pipelines.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button
          className="wb-btn wb-btn-primary wb-btn-sm"
          disabled={busy !== null || !pipeline}
          onClick={onLaunch}
        >
          <ArrowUpRight size={14} aria-hidden="true" />
          出包
        </button>
      </div>
      {busy && (
        <p className="va-pkg-status" role="status">
          {BUSY_LABEL[busy]}
        </p>
      )}
      {error && (
        <p className="va-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="va-notice" role="status">
          {notice}
        </p>
      )}
      {latest ? (
        <div className="va-pkg-artifact">
          <div className="va-pkg-meta">
            <span>项目名称</span>
            <p>{latest.project}</p>
          </div>
          <div className="va-pkg-meta">
            <span>版本号</span>
            <p className="va-pkg-version">{latest.version}</p>
            <button
              className="wb-btn wb-btn-secondary wb-btn-sm"
              disabled={busy !== null}
              onClick={onDownload}
            >
              <Download size={14} aria-hidden="true" />
              下载
            </button>
          </div>
          <div className="va-pkg-meta">
            <span>创建时间</span>
            <p>{latest.created}</p>
          </div>
          <div className="va-pkg-meta">
            <span>包文件</span>
            <div className="va-pkg-files">
              {latest.files.map((name) => (
                <p key={name}>{name}</p>
              ))}
            </div>
          </div>
        </div>
      ) : (
        !busy &&
        !error && <p className="va-pkg-empty">该服务暂无制品包。</p>
      )}
      <p className="va-muted va-pkg-source">数据源：CloudDragon 流水线与制品仓库。</p>
    </section>
  )
}
