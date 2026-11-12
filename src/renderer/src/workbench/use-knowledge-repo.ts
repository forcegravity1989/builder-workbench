import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useAppStore } from '@/store'
import type { KbDoc } from './knowledge-doc-registry'
import {
  loadKnowledgeFromRepo,
  writeKnowledgeDocToRepo,
  type WriteKnowledgeDocResult
} from './knowledge-repo-loader'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'

export function useKnowledgeRepo(): {
  activeRepo: ReturnType<typeof useAppStore.getState>['repos'][number] | undefined
  docs: KbDoc[]
  bodies: Record<string, string>
  setBodies: Dispatch<SetStateAction<Record<string, string>>>
  savedBodies: Record<string, string>
  loading: boolean
  error: string | null
  unavailable: string | null
  reload: () => void
  saveDoc: (docId: string, content?: string) => Promise<WriteKnowledgeDocResult>
} {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  // 没有显式选择时优先本机项目，避免默认落到远端路径。
  const selectedRepo =
    repos.find((r) => r.id === activeRepoId) ??
    repos.find((r) => getRepoExecutionHostId(r) === LOCAL_EXECUTION_HOST_ID) ??
    repos[0]
  // 知识库只使用本机文件能力；远端登记行的路径在本机不可读，不能静默当成本机项目。
  const activeRepo =
    selectedRepo && getRepoExecutionHostId(selectedRepo) === LOCAL_EXECUTION_HOST_ID
      ? selectedRepo
      : undefined
  const unavailable =
    selectedRepo && !activeRepo ? '知识库只读取本机项目；当前项目在本机没有登记。' : null
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [savedBodies, setSavedBodies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!activeRepo?.path) {
      setDocs([])
      setBodies({})
      setSavedBodies({})
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadKnowledgeFromRepo(activeRepo.path)
      .then((snapshot) => {
        if (cancelled) {
          return
        }
        setDocs(snapshot.docs)
        setBodies(snapshot.bodies)
        setSavedBodies(snapshot.bodies)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return
        }
        setDocs([])
        setBodies({})
        setSavedBodies({})
        setLoading(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [activeRepo?.path, reloadToken])

  const saveDoc = async (
    docId: string,
    contentOverride?: string
  ): Promise<WriteKnowledgeDocResult> => {
    if (!activeRepo?.path) {
      return { wrote: false, error: '未选项目' }
    }
    const doc = docs.find((d) => d.id === docId)
    if (!doc) {
      return { wrote: false, error: '文档不在清单里' }
    }
    const content = contentOverride ?? bodies[docId]
    if (content == null) {
      return { wrote: false, error: '没有可写内容' }
    }
    if (contentOverride !== undefined) {
      setBodies((prev) => ({ ...prev, [docId]: contentOverride }))
    }
    const result = await writeKnowledgeDocToRepo(activeRepo.path, doc.path, content)
    if (result.wrote) {
      setSavedBodies((prev) => ({ ...prev, [docId]: content }))
    }
    return result
  }

  return {
    activeRepo,
    docs,
    bodies,
    setBodies,
    savedBodies,
    loading,
    error,
    unavailable,
    reload: () => setReloadToken((n) => n + 1),
    saveDoc
  }
}
