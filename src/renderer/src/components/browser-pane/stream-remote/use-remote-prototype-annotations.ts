import { useCallback, useEffect, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { PrototypeReviewAnnotation } from '../../../../../shared/workbench/prototype-review-annotation'
import type { RemoteBrowserRuntimeTarget } from './remote-browser-page-input-model'

export function useRemotePrototypeAnnotations({
  runtimeTarget,
  runtimeWorktree,
  pageId,
  documentKey,
  enabled
}: {
  runtimeTarget: () => RemoteBrowserRuntimeTarget | null
  runtimeWorktree: string
  pageId: string | null
  documentKey: string
  enabled: boolean
}): {
  annotations: PrototypeReviewAnnotation[]
  addAnnotation: (point: { x: number; y: number }, comment: string) => Promise<void>
  deleteAnnotation: (annotationId: string) => Promise<void>
} {
  const [annotations, setAnnotations] = useState<PrototypeReviewAnnotation[]>([])
  const [hostName, setHostName] = useState('共享主机')
  useEffect(() => {
    const environmentId = runtimeTarget()?.environmentId
    if (!environmentId) {
      return
    }
    void window.api.runtimeEnvironments
      .getStatusSnapshots()
      .then((snapshots) => {
        const name = snapshots.find((item) => item.environmentId === environmentId)?.name
        if (name) {
          setHostName(name)
        }
      })
      .catch(() => undefined)
  }, [runtimeTarget])
  const refresh = useCallback(async () => {
    const target = runtimeTarget()
    if (!enabled || !target || !pageId) {
      setAnnotations([])
      return
    }
    const next = await callRuntimeRpc<PrototypeReviewAnnotation[]>(
      target,
      'workbench.prototypeReview.annotations.list',
      { worktree: runtimeWorktree, page: pageId, documentKey },
      { timeoutMs: 15_000, suppressFeatureInteraction: true }
    )
    setAnnotations(next)
  }, [documentKey, enabled, pageId, runtimeTarget, runtimeWorktree])

  useEffect(() => {
    void refresh().catch(() => setAnnotations([]))
    if (!enabled) {
      return
    }
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 5000)
    return () => window.clearInterval(timer)
  }, [enabled, refresh])

  const addAnnotation = useCallback(
    async (point: { x: number; y: number }, comment: string) => {
      const target = runtimeTarget()
      if (!target || !pageId || !comment.trim()) {
        return
      }
      const added = await callRuntimeRpc<PrototypeReviewAnnotation>(
        target,
        'workbench.prototypeReview.annotations.add',
        {
          worktree: runtimeWorktree,
          page: pageId,
          documentKey,
          ...point,
          comment: comment.trim(),
          hostName
        },
        { timeoutMs: 15_000, suppressFeatureInteraction: true }
      )
      setAnnotations((current) => [...current, added])
    },
    [documentKey, hostName, pageId, runtimeTarget, runtimeWorktree]
  )

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      const target = runtimeTarget()
      if (!target || !pageId) {
        return
      }
      await callRuntimeRpc(
        target,
        'workbench.prototypeReview.annotations.delete',
        { pageId, documentKey, annotationId },
        { timeoutMs: 15_000, suppressFeatureInteraction: true }
      )
      setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
    },
    [documentKey, pageId, runtimeTarget]
  )

  return { annotations, addAnnotation, deleteAnnotation }
}
