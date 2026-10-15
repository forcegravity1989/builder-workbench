import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
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

// 列表与最新包在挂载时并行读取，状态文本按这个优先级显示最早未完成者。
const PENDING_ORDER: readonly BusyKind[] = ['list', 'latest', 'launch', 'download']

// 当前验收范围就是 gtsllm-dfx 服务；预选它让最新包读取与流水线列表并行
// 开始，而不是等列表落地。列表加载后若不含它，选择框回退到第一条真实流水线。
const DEFAULT_PIPELINE = 'gtsllm-dfx'
const AUTO_REFRESH_MS = 60_000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 出包区块：流水线选择与启动、最新制品包读取与下载。所有操作直连
 * CloudDragon；最新包每分钟静默刷新一次，启动受理后由下一次刷新带出
 * 新包。旅程轴的「出包」灯色跟随 onLatestChange 上报的真实包数据。
 */
export function AcceptancePackage({
  port,
  scope,
  sectionRef,
  onLatestChange
}: {
  port: PackagePipelinePort
  scope: MetricScope
  sectionRef?: RefObject<HTMLElement | null>
  onLatestChange?: (latest: PackageLatest | null) => void
}) {
  const [pipelines, setPipelines] = useState<string[]>([])
  const [pipeline, setPipeline] = useState(DEFAULT_PIPELINE)
  const [latest, setLatest] = useState<PackageLatest | null>(null)
  const [busy, setBusy] = useState<BusyKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const listSeq = useRef(0)
  const latestSeq = useRef(0)
  const pendingRef = useRef(new Set<BusyKind>())
  const pollPendingRef = useRef(false)

  /** 并行加载时多个动作同时在飞：busy 显示最早未完成者，避免先完成者把状态清空。 */
  const markBusy = useCallback((kind: BusyKind, on: boolean) => {
    if (on) {
      pendingRef.current.add(kind)
    } else {
      pendingRef.current.delete(kind)
    }
    const next = pendingRef.current.size > 0
    setBusy(next ? (PENDING_ORDER.find((pending) => pendingRef.current.has(pending)) ?? null) : null)
  }, [])

  useEffect(() => {
    const seq = ++listSeq.current
    markBusy('list', true)
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
          markBusy('list', false)
        }
      })
  }, [port, scope, markBusy])

  useEffect(() => {
    if (!pipeline) {
      setLatest(null)
      onLatestChange?.(null)
      return
    }
    const seq = ++latestSeq.current
    markBusy('latest', true)
    setError(null)
    port
      .latest({ scope, pipeline })
      .then((value) => {
        if (seq !== latestSeq.current) {
          return
        }
        setLatest(value)
        onLatestChange?.(value)
      })
      .catch((reason: unknown) => {
        if (seq === latestSeq.current) {
          setError(errorText(reason))
        }
      })
      .finally(() => {
        if (seq === latestSeq.current) {
          markBusy('latest', false)
        }
      })
  }, [port, scope, pipeline, onLatestChange, markBusy])

  /** 每分钟静默刷新：不占 busy、不打扰操作；失败保留旧数据并如实报错。 */
  const pollLatest = useCallback(async () => {
    if (!pipeline || pollPendingRef.current || pendingRef.current.size > 0) {
      return
    }
    const seq = latestSeq.current
    pollPendingRef.current = true
    try {
      const value = await port.latest({ scope, pipeline })
      if (seq !== latestSeq.current) {
        return
      }
      setLatest(value)
      onLatestChange?.(value)
      setError(null)
    } catch (reason: unknown) {
      if (seq === latestSeq.current) {
        setError(errorText(reason))
      }
    } finally {
      pollPendingRef.current = false
    }
  }, [port, scope, pipeline, onLatestChange])

  useEffect(() => {
    if (!pipeline) {
      return
    }
    const timer = window.setInterval(() => void pollLatest(), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [pipeline, pollLatest])

  const runAction = async (kind: BusyKind, action: () => Promise<void>): Promise<void> => {
    markBusy(kind, true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (reason: unknown) {
      setError(errorText(reason))
    } finally {
      markBusy(kind, false)
    }
  }

  const onLaunch = () =>
    runAction('launch', async () => {
      await port.launch({ scope, pipeline })
      setNotice('流水线已启动，运行约需几分钟；最新包信息每分钟自动刷新。')
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
    <section id="acceptance-package" ref={sectionRef} aria-label="出包" className="va-pkg">
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
          {pipeline && !pipelines.includes(pipeline) && <option>{pipeline}</option>}
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
        <button
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={busy !== null || !latest}
          onClick={onDownload}
        >
          <Download size={14} aria-hidden="true" />
          下载
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
        <dl className="va-pkg-list">
          <div>
            <dt>项目名称</dt>
            <dd title={latest.project}>{latest.project}</dd>
          </div>
          <div>
            <dt>版本号</dt>
            <dd className="va-pkg-mono" title={latest.version}>
              {latest.version}
            </dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{latest.created}</dd>
          </div>
          <div>
            <dt>包文件</dt>
            <dd className="va-pkg-mono" title={latest.files.join('、')}>
              {latest.files.join('、')}
            </dd>
          </div>
        </dl>
      ) : (
        !busy && !error && <p className="va-pkg-empty">该服务暂无制品包。</p>
      )}
    </section>
  )
}
