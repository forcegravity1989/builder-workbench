import { useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import { artifactCandidateCheck, type EvidenceCheck } from './acceptance-model'
import { useCycleWorkspace } from '../version-cycle/cycle-workspace-context'
import { openAcceptanceMaterial } from './open-acceptance-material'

function Declared({ check }: { check: EvidenceCheck }) {
  if (check.kind === 'verified') {
    return <span className="va-muted">已核对 · {check.checkedAt}</span>
  }
  return (
    <span className={check.kind === 'mismatch' ? 'va-warning' : 'va-muted'}>{check.reason}</span>
  )
}

const ARTIFACT_KINDS: Record<string, string> = {
  delivery: '交付件',
  package: '交付包',
  verification: '验证报告',
  showcase: '展示材料'
}

/**
 * Compact source-of-truth row: fixed candidate and recorded artifacts, compared
 * only against each other (pure declarations). Live file/execution probing and
 * the journey-lamp derivation are retired — lamps follow workflow.stage.
 */
export function AcceptanceSources({ document }: { document: AcceptanceMaterial }) {
  const workspace = useCycleWorkspace()
  const [openError, setOpenError] = useState<string | null>(null)
  const openMaterial = async (location: string) => {
    try {
      if (!workspace) {
        throw new Error('验收工作区尚未就绪。')
      }
      await openAcceptanceMaterial(location, workspace.context)
      setOpenError(null)
    } catch (reason) {
      setOpenError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  if (!document.candidateRef && !document.preparedArtifacts.length) {
    return null
  }
  const versionMismatch =
    document.candidateRef && document.candidateRef.version !== document.version
  return (
    <div className="va-context-row">
      <details className="va-source">
        <summary>
          候选与材料
          {document.candidateRef ? '' : ' · 待固定'}
          {document.preparedArtifacts.length ? ` · ${document.preparedArtifacts.length} 项` : ''}
        </summary>
        <p className="va-candidate">
          <span>候选提交</span>
          <code>{document.candidateRef?.commit ?? '待固定'}</code>
          {versionMismatch && <span className="va-warning">源码候选与验收版本不一致</span>}
        </p>
        {document.preparedArtifacts.map((artifact) => {
          const declared = artifactCandidateCheck(artifact, document.candidateRef)
          return (
            <div key={artifact.artifactId} className="va-artifact">
              <p>
                {ARTIFACT_KINDS[artifact.kind] ?? artifact.kind} ·{' '}
                <a
                  href={artifact.location}
                  onClick={(event) => {
                    event.preventDefault()
                    void openMaterial(artifact.location)
                  }}
                >
                  {artifact.location}
                </a>
              </p>
              <p>
                候选：<code>{artifact.candidateRef.commit}</code> <Declared check={declared} />
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
            </div>
          )
        })}
        {openError && (
          <p className="va-error" role="alert">
            {openError}
          </p>
        )}
      </details>
    </div>
  )
}
