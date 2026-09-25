import { useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type {
  AcceptanceCandidatePort,
  ArtifactCheck,
  CandidateCheck
} from './acceptance-candidate-port'
import { artifactCandidateCheck, preparationKey, type EvidenceCheck } from './acceptance-model'

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

export function AcceptancePreparation({
  document,
  port,
  onPrepare,
  onCandidateCheck
}: {
  document: AcceptanceMaterial
  port: AcceptanceCandidatePort
  onPrepare(): void
  onCandidateCheck(check: CandidateCheck, artifacts: ArtifactCheck[]): void
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
  }, [sourceKey, port, request])
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
          : await port.check(document.candidateRef)
      const artifacts = await Promise.all(
        document.preparedArtifacts.map((artifact) => port.inspect(artifact, document.candidateRef!))
      )
      if (!current()) {
        return
      }
      setVerification({ key: sourceKey, candidate: checked, artifacts })
      onCandidateCheck(checked, artifacts)
      setError(null)
    } catch (reason) {
      if (current()) {
        setError(String(reason))
      }
    } finally {
      if (current()) {
        setBusy(false)
      }
    }
  }
  return (
    <section className="va-preparation" aria-label="交付准备" id="acceptance-preparation">
      <div className="va-section-head">
        <h2>交付准备</h2>
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={onPrepare}>
          准备交付
        </button>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!document.candidateRef || busy}
          onClick={() => void inspect()}
        >
          {busy ? '核对中…' : '核对材料来源'}
        </button>
      </div>
      <div className="va-candidate">
        <span>候选提交</span>
        <code>{document.candidateRef?.commit ?? '待固定'}</code>
        <Check check={verified?.candidate} />
        {!document.preparedArtifacts.length && <span className="va-muted">交付材料待准备</span>}
      </div>
      {document.preparedArtifacts.map((artifact) => {
        const check = verified?.artifacts.find((item) => item.artifactId === artifact.artifactId)
        const declared = artifactCandidateCheck(artifact, document.candidateRef)
        return (
          <details key={artifact.artifactId} className="va-artifact">
            <summary>
              {
                {
                  delivery: '交付件',
                  package: '交付包',
                  verification: '验证报告',
                  showcase: '展示材料'
                }[artifact.kind]
              }{' '}
              · {artifact.location}
            </summary>
            <p>
              候选：<code>{artifact.candidateRef.commit}</code>{' '}
              <Check check={declared.kind === 'mismatch' ? declared : check?.candidate} />
            </p>
            <p>
              文件：
              <Check check={check?.availability} />
            </p>
            <p>
              执行来源：
              <Check check={check?.execution} />
            </p>
            {artifact.command && (
              <p>
                入口：<code>{artifact.command}</code>
              </p>
            )}
            {artifact.executionRoot && (
              <p>
                工作区：<code>{artifact.executionRoot}</code>
              </p>
            )}
            <p>
              生成时间：{artifact.generatedAt}
              {artifact.checksum && ` · 校验值：${artifact.checksum}`}
            </p>
            {check?.file && (
              <button
                className="wb-btn wb-btn-sm"
                onClick={() =>
                  void port.openFile(check.file!).catch((reason) => setError(String(reason)))
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
            {!check && <p className="va-muted">先核对来源，再打开关联工作区材料。</p>}
          </details>
        )
      })}
      {error && (
        <p className="va-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
