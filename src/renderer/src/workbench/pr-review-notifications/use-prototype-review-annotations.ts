import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { BrowserPageAnnotation } from '../../../../shared/browser-grab-types'
import type { PrototypeReviewAnnotation } from '../../../../shared/workbench/prototype-review-annotation'
import { isWorkbenchShell } from '../is-workbench-shell'
import { notifyWorkbenchError } from '../error-feedback'
import { hostNameForWorktree, prototypeReviewPageFor } from './prototype-review-target'
import { sendPrototypeReview, usePrototypeReviewNotifications } from './prototype-store'
import { listConnectedReviewTargets } from './transport'

const RPC_OPTIONS = { timeoutMs: 15_000, suppressFeatureInteraction: true } as const

export type PrototypeReviewSubmit = {
  hostName: string
  count: number
  /** The notes on screen are exactly what the host already holds. */
  submitted: boolean
  submitting: boolean
  onSubmit: () => void
}

export type PrototypeReviewDocument = {
  /** Present when this tab shows a document that lives on another machine. */
  submit: PrototypeReviewSubmit | null
  /** Called with the notes about to be removed, so the host's copy goes too. */
  onRemoved: (annotations: readonly BrowserPageAnnotation[]) => void
  /** Called after a pulled note was edited here, so the host's copy stays equal. */
  onEdited: (annotation: BrowserPageAnnotation) => void
}

const INERT: PrototypeReviewDocument = {
  submit: null,
  onRemoved: () => undefined,
  onEdited: () => undefined
}

function signatureOf(annotations: readonly BrowserPageAnnotation[]): string {
  return annotations
    .map((annotation) => `${annotation.id}\u0000${annotation.comment}\u0000${annotation.intent}`)
    .join('\u0001')
}

function toBrowserAnnotation(
  annotation: PrototypeReviewAnnotation,
  browserPageId: string
): BrowserPageAnnotation {
  return {
    id: annotation.id,
    browserPageId,
    comment: annotation.comment,
    intent: annotation.intent,
    priority: annotation.priority,
    createdAt: annotation.createdAt,
    author: annotation.author,
    payload: annotation.payload
  }
}

/**
 * Review of an HTML document, seen from one preview tab. Whoever owns the document reads reviewers'
 * submitted notes into this tab; a reviewer on another machine annotates their own copy and submits
 * the notes back to the owner instead of sending them to a model.
 */
export function usePrototypeReviewAnnotations({
  browserTabId,
  worktreeId,
  documentPath
}: {
  browserTabId: string
  worktreeId: string
  /** Absolute path of the previewed document; null for any other kind of page. */
  documentPath: string | null
}): PrototypeReviewDocument {
  const enabled = isWorkbenchShell() && documentPath !== null
  const ownerEnvironmentId = useAppStore((state) =>
    enabled ? (getRuntimeEnvironmentIdForWorktree(state, worktreeId) ?? null) : null
  )
  const hostName = useAppStore((state) =>
    enabled ? hostNameForWorktree(state, worktreeId) : '主机'
  )
  const annotations = useAppStore((state) => state.browserAnnotationsByPageId[browserTabId])
  const [submittedSignature, setSubmittedSignature] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const reviewState = usePrototypeReviewNotifications()
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  // Why: a poll that started before a local delete or edit still carries the old copy, and applying
  // it would silently undo the change.
  const localChangeRef = useRef(0)

  const documentKey = documentPath ?? ''
  const ownsDocument = enabled && ownerEnvironmentId === null
  // Why: polling the owner's own host is only worth it once someone was invited or handed notes in.
  const reviewIsLive =
    ownsDocument &&
    (reviewState.outgoing.some(
      (note) => note.purpose === 'invite' && note.page.documentKey === documentKey
    ) ||
      reviewState.incoming.some(
        (note) => note.purpose === 'submitted' && note.page.documentKey === documentKey
      ))

  const hostTarget = useCallback(
    (): RuntimeClientTarget =>
      ownerEnvironmentId === null
        ? { kind: 'local' }
        : { kind: 'environment', environmentId: ownerEnvironmentId },
    [ownerEnvironmentId]
  )

  useEffect(() => {
    if (!ownsDocument) {
      return
    }
    let stopped = false
    let failureReported = false
    const pull = async (): Promise<void> => {
      const startedAt = localChangeRef.current
      try {
        const remote = await callRuntimeRpc<PrototypeReviewAnnotation[]>(
          { kind: 'local' },
          'workbench.prototypeReview.annotations.list',
          { documentKey },
          RPC_OPTIONS
        )
        if (stopped || startedAt !== localChangeRef.current) {
          return
        }
        failureReported = false
        const store = useAppStore.getState()
        const local = store.browserAnnotationsByPageId[browserTabId] ?? []
        const localById = new Map(local.map((item) => [item.id, item]))
        for (const note of remote) {
          const existing = localById.get(note.id)
          if (!existing) {
            store.addBrowserPageAnnotation(toBrowserAnnotation(note, browserTabId))
          } else if (
            existing.author !== undefined &&
            (existing.comment !== note.comment || existing.intent !== note.intent)
          ) {
            store.updateBrowserPageAnnotation(browserTabId, note.id, {
              comment: note.comment,
              intent: note.intent,
              imagePaths: existing.imagePaths
            })
          }
        }
        // Why: only notes that arrived from the host are dropped when the host no longer has them,
        // never the owner's own.
        const remoteIds = new Set(remote.map((note) => note.id))
        for (const item of local) {
          if (item.author !== undefined && !remoteIds.has(item.id)) {
            store.deleteBrowserPageAnnotation(browserTabId, item.id)
          }
        }
      } catch (error) {
        if (!stopped && reviewIsLive && !failureReported) {
          failureReported = true
          notifyWorkbenchError(
            '无法读回评审批注',
            error,
            '当前批注可能不完整，已有批注仍保留；连接恢复后会自动重试。'
          )
        }
      }
    }
    void pull()
    if (!reviewIsLive) {
      return () => {
        stopped = true
      }
    }
    const timer = window.setInterval(() => void pull(), 5000)
    window.addEventListener('focus', pull)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('focus', pull)
    }
  }, [browserTabId, documentKey, ownsDocument, reviewIsLive])

  const onRemoved = useCallback(
    (removed: readonly BrowserPageAnnotation[]): void => {
      // Why: the owner only mirrors notes that came from a reviewer; a reviewer mirrors all of theirs
      // because any may have been submitted.
      const mirrored = removed.filter((item) => ownerEnvironmentId !== null || item.author)
      if (mirrored.length > 0) {
        localChangeRef.current += 1
      }
      for (const item of mirrored) {
        void callRuntimeRpc(
          hostTarget(),
          'workbench.prototypeReview.annotations.delete',
          { documentKey, annotationId: item.id },
          RPC_OPTIONS
        ).catch((error: unknown) =>
          notifyWorkbenchError('无法同步批注的删除', error, '主机上仍保留这条批注，请稍后重试。')
        )
      }
    },
    [documentKey, hostTarget, ownerEnvironmentId]
  )

  const onEdited = useCallback(
    (annotation: BrowserPageAnnotation): void => {
      if (ownerEnvironmentId !== null || !annotation.author) {
        return
      }
      localChangeRef.current += 1
      void callRuntimeRpc(
        hostTarget(),
        'workbench.prototypeReview.annotations.add',
        {
          id: annotation.id,
          documentKey,
          comment: annotation.comment,
          intent: annotation.intent,
          priority: annotation.priority,
          payload: annotation.payload,
          author: annotation.author
        },
        RPC_OPTIONS
      ).catch((error: unknown) =>
        notifyWorkbenchError('无法同步批注的修改', error, '主机上仍是修改前的内容，请稍后重试。')
      )
    },
    [documentKey, hostTarget, ownerEnvironmentId]
  )

  const onSubmit = useCallback((): void => {
    const notes = annotationsRef.current ?? []
    if (!enabled || ownerEnvironmentId === null || notes.length === 0) {
      return
    }
    setSubmitting(true)
    void (async () => {
      try {
        const targets = await listConnectedReviewTargets()
        const target = targets.find((item) => item.environmentId === ownerEnvironmentId)
        if (!target) {
          throw new Error(`${hostName} 当前未连接`)
        }
        for (const note of notes) {
          await callRuntimeRpc(
            hostTarget(),
            'workbench.prototypeReview.annotations.add',
            {
              id: note.id,
              documentKey,
              comment: note.comment,
              intent: note.intent,
              priority: note.priority,
              payload: note.payload,
              hostName
            },
            RPC_OPTIONS
          )
        }
        const result = await sendPrototypeReview(
          prototypeReviewPageFor(worktreeId, documentKey),
          [target],
          { purpose: 'submitted', annotationCount: notes.length }
        )
        if (result.results.some((entry) => entry.ok)) {
          setSubmittedSignature(signatureOf(notes))
        }
      } catch (error) {
        notifyWorkbenchError('无法提交批注', error, '检查与主机的连接后重试；批注仍保留在本页。')
      } finally {
        setSubmitting(false)
      }
    })()
  }, [documentKey, enabled, hostName, hostTarget, ownerEnvironmentId, worktreeId])

  const count = annotations?.length ?? 0
  const submitted = count > 0 && submittedSignature === signatureOf(annotations ?? [])
  return useMemo(() => {
    if (!enabled) {
      return INERT
    }
    return {
      submit:
        ownerEnvironmentId === null ? null : { hostName, count, submitted, submitting, onSubmit },
      onRemoved,
      onEdited
    }
  }, [
    count,
    enabled,
    hostName,
    onEdited,
    onRemoved,
    onSubmit,
    ownerEnvironmentId,
    submitted,
    submitting
  ])
}
