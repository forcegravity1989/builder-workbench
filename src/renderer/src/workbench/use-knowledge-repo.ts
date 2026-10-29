import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { useAppStore } from '@/store'
import { useVisibleRuntimeSessionActiveRepo } from '@/store/repos/use-visible-runtime-session-repos'
import type { KbDoc } from './knowledge-doc-registry'
import {
  loadKnowledgeFromRepo,
  writeKnowledgeDocToRepo,
  type WriteKnowledgeDocResult
} from './knowledge-repo-loader'

export function useKnowledgeRepo(): {
  activeRepo: ReturnType<typeof useAppStore.getState>['repos'][number] | undefined
  docs: KbDoc[]
  bodies: Record<string, string>
  setBodies: Dispatch<SetStateAction<Record<string, string>>>
  savedBodies: Record<string, string>
  loading: boolean
  error: string | null
  reload: () => void
  saveDoc: (docId: string, content?: string) => Promise<WriteKnowledgeDocResult>
} {
  const activeRepo = useVisibleRuntimeSessionActiveRepo()
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
    reload: () => setReloadToken((n) => n + 1),
    saveDoc
  }
}
