import { useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MetricWindow } from '../../../../shared/workbench/metrics'
import type {
  AcceptanceCandidatePort,
  ArtifactCheck,
  CandidateCheck
} from './acceptance-candidate-port'
import { artifactCandidateCheck, preparationKey, type EvidenceCheck } from './acceptance-model'
import { AcceptanceMetricWindow } from './AcceptanceMetricWindow'

function Check({ check }: { check?: EvidenceCheck }) {
  return (
    <span
      className={
        check?.kind === 'mismatch' || check?.kind === 'unavailable' ? 'va-warning' : 'va-muted'
      }
    >
      {!check ? '待核对' : check.kind === 'verified' ? `已核对 · ${check.checkedAt}` : check.reason}
    </span>
  )
}

const ARTIFACT_KINDS: Record<string, string> = {
  delivery: '交付件',
  package: '交付包',
  verification: '验证报告',
  showcase: '展示材料'
}

/**
 * Compact source-of-truth row: fixed plan reference, candidate/material evidence and the
 * shared metric window. It replaces the retired preparation card — data sources, open
 * paths and honesty about unknown checks stay, the placeholder checklist journey does not.
 */
export function AcceptanceSources({
  document,
  hasMetrics,
  metricWindow,
  disabled,
  onPrepare,
  candidatePort,
  onChecks
}: {
  document: AcceptanceMaterial
  hasMetrics: boolean
  metricWindow: {
    window: MetricWindow | null
    setWindow(value: MetricWindow): void
    error: string | null
  }
  disabled: boolean
  onPrepare(text: string): void
  candidatePort: AcceptanceCandidatePort
  onChecks(source: AcceptanceMaterial, check: CandidateCheck, artifacts: ArtifactCheck[]): void
}) {
  const [verification, setVerification] = useState<{
    key: string
    candidate: CandidateCheck
    artifacts: ArtifactCheck[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sourceKey = preparationKey(document)
  const verified = verification?.key === sourceKey ? verification : null
  const latestKey = useRef(sourceKey)
  latestKey.current = sourceKey
  const request = useRef({ sequence: 0 }).current
  useEffect(() => {
    setBusy(false)
    setError(null)
    return () => {
      request.sequence++
    }
  }, [sourceKey, candidatePort, request])
  async function inspect() {
    if (!document.candidateRef) {
      return
    }
    const token = ++request.sequence
    const current = () => request.sequence === token && latestKey.current === sourceKey
    setBusy(true)
    try {
      const checked: CandidateCheck =
        document.candidateRef.version !== document.version
          ? {
              candidate: document.candidateRef,
              kind: 'mismatch',
              reason: '源码候选与验收版本不一致'
            }
          : await candidatePort.check(document.candidateRef)
      const artifacts = await Promise.all(
        document.preparedArtifacts.map((artifact) =>
          candidatePort.inspect(artifact, document.candidateRef!)
        )
      )
      if (!current()) {
        return
      }
      setVerification({ key: sourceKey, candidate: checked, artifacts })
      onChecks(document, checked, artifacts)
      setError(null)
    } catch (reason) {
      if (current()) {
        setError(String(reason))
        const candidate: CandidateCheck = {
          candidate: document.candidateRef,
          kind: 'unavailable',
          reason: String(reason)
        }
        setVerification({ key: sourceKey, candidate, artifacts: [] })
        onChecks(document, candidate, [])
      }
    } finally {
      if (current()) {
        setBusy(false)
      }
    }
  }
  const window = metricWindow.window
  return (
    <div className="va-context-row">
      <details className="va-source">
        <summary>
          {document.planRef.kind === 'draft' ? '草案预验收' : '固定计划'} ·{' '}
          {document.planRef.cycleId}
        </summary>
        <p>
          {document.planRef.kind === 'committed'
            ? document.planRef.sourceCommit
            : document.planRef.sourceWorktreeId}
        </p>
        <p>{document.planRef.revision}</p>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={disabled}
          onClick={() =>
            onPrepare(
              `请核对当前 ${document.version} 验收固定计划与项目基线的新计划差异。先向我展示变化，由我明确是否换引用；保留原结果，更换后所有原结论待重新核对。`
            )
          }
        >
          核对计划更新
        </button>
      </details>
      <details className="va-source">
        <summary>
          候选与材料
          {document.candidateRef ? '' : ' · 待固定'}
          {document.preparedArtifacts.length ? ` · ${document.preparedArtifacts.length} 项` : ''}
        </summary>
        <p className="va-candidate">
          <span>候选提交</span>
          <code>{document.candidateRef?.commit ?? '待固定'}</code>
          <Check check={verified?.candidate} />
        </p>
        {document.preparedArtifacts.map((artifact) => {
          const check = verified?.artifacts.find((item) => item.artifactId === artifact.artifactId)
          const declared = artifactCandidateCheck(artifact, document.candidateRef)
          return (
            <div key={artifact.artifactId} className="va-artifact">
              <p>
                {ARTIFACT_KINDS[artifact.kind] ?? artifact.kind} · <code>{artifact.location}</code>
              </p>
              <p>
                候选：<code>{artifact.candidateRef.commit}</code>{' '}
                <Check check={declared.kind === 'mismatch' ? declared : check?.candidate} />
              </p>
              <p>
                文件：
                <Check check={check?.availability} /> · 执行来源：
                <Check check={check?.execution} />
              </p>
              {artifact.command && (
                <p>
                  入口：<code>{artifact.command}</code>
                </p>
              )}
              <p>
                生成时间：{artifact.generatedAt}
                {artifact.checksum && ` · 校验值：${artifact.checksum}`}
              </p>
              {check?.file && (
                <button
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  onClick={() =>
                    void candidatePort
                      .openFile(check.file!)
                      .catch((reason) => setError(String(reason)))
                  }
                >
                  打开材料
                </button>
              )}
              {check?.externalUrl && (
                <a href={check.externalUrl} target="_blank" rel="noreferrer">
                  打开外部材料
                </a>
              )}
            </div>
          )
        })}
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!document.candidateRef || busy}
          onClick={() => void inspect()}
        >
          {busy ? '检查中…' : '检查文件与候选'}
        </button>
        {error && (
          <p className="va-error" role="alert">
            {error}
          </p>
        )}
      </details>
      {hasMetrics && (
        <details className="va-window-choice">
          <summary>
            指标取值 ·{' '}
            {window?.kind === 'current'
              ? '当前值'
              : window?.kind === 'range'
                ? `${window.since || '开始'} 至 ${window.until || '结束'}`
                : '待配置'}
          </summary>
          <AcceptanceMetricWindow
            window={window}
            onChange={metricWindow.setWindow}
            error={metricWindow.error}
            disabled={disabled}
          />
        </details>
      )}
    </div>
  )
}
