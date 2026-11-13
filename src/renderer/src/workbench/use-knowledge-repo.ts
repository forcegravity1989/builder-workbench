import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useAppStore } from '@/store'
import type { KbDoc } from './knowledge-doc-registry'
import {
  loadKnowledgeFromRepo,
  writeKnowledgeDocToRepo,
  type WriteKnowledgeDocResult
} from './knowledge-repo-loader'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { useProjectPage } from './project-page-state'
import { currentProjectRepo, resolveProjectSource } from './project-source-resolution'

export function useKnowledgeRepo(): {
  activeRepo: ReturnType<typeof useAppStore.getState>['repos'][number] | undefined
  docs: KbDoc[]
  bodies: Record<string, string>
  setBodies: Dispatch<SetStateAction<Record<string, string>>>
  savedBodies: Record<string, string>
  readErrors: Record<string, string>
  loading: boolean
  error: string | null
  unavailable: string | null
  reload: () => void
  saveDoc: (docId: string, content?: string) => Promise<WriteKnowledgeDocResult>
} {
  const page = useProjectPage()
  const activeRepo = useAppStore((state) => {
    if (page?.kind === 'knowledge') {
      return page.options
        ? (findRepoForHost(state.repos, page.options.repoId, { hostId: LOCAL_EXECUTION_HOST_ID }) ??
            undefined)
        : undefined
    }
    const current = currentProjectRepo(state)
    return (current && resolveProjectSource(state, current, true)) ?? undefined
  })
  const hasProjects = useAppStore((state) => state.repos.length > 0)
  const unavailable =
    hasProjects && !activeRepo ? '知识库只读取本机项目。请先在本机添加当前项目。' : null
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [savedBodies, setSavedBodies] = useState<Record<string, string>>({})
  const [readErrors, setReadErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!activeRepo?.path) {
      setDocs([])
      setBodies({})
      setSavedBodies({})
      setReadErrors({})
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
        setReadErrors(snapshot.readErrors)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return
        }
        setDocs([])
        setBodies({})
        setSavedBodies({})
        setReadErrors({})
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
    if (loading || readErrors[docId]) {
      return { wrote: false, error: '文档读取成功后才能写回' }
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
    readErrors,
    loading,
    error,
    unavailable,
    reload: () => setReloadToken((n) => n + 1),
    saveDoc
  }
}
