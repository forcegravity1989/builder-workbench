import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { translate } from '@/i18n/i18n'
import type {
  BrowserAnnotationIntent,
  BrowserPageAnnotation
} from '../../../../../shared/browser-grab-types'
import { formatBrowserAnnotationsAsMarkdown } from './browser-annotation-output'
import { EMPTY_BROWSER_ANNOTATIONS } from '../describe-page/browser-annotation-geometry'
import {
  canonicalPrototypeReviewDocumentKey,
  type PrototypeReviewAnnotation
} from '../../../../../shared/workbench/prototype-review-annotation'
import { usePrototypeReviewNotifications } from '@/workbench/pr-review-notifications/prototype-store'

function createBrowserPageAnnotationFromPrototype(
  annotation: PrototypeReviewAnnotation,
  browserPageId: string
): BrowserPageAnnotation {
  const rect = { x: annotation.x, y: annotation.y, width: 1, height: 1 }
  return {
    id: annotation.id,
    browserPageId,
    comment: annotation.comment,
    intent: 'question',
    priority: 'important',
    createdAt: annotation.createdAt,
    payload: {
      page: {
        sanitizedUrl: annotation.documentKey,
        title: '原型评审页',
        viewportWidth: 0,
        viewportHeight: 0,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        capturedAt: annotation.createdAt
      },
      target: {
        tagName: 'prototype-review',
        selector: '[data-prototype-review-annotation]',
        textSnippet: annotation.label ?? `${annotation.host} 的批注`,
        htmlSnippet: '',
        attributes: {},
        accessibility: {
          role: null,
          accessibleName: null,
          ariaLabel: null,
          ariaLabelledBy: null
        },
        rectViewport: rect,
        rectPage: rect,
        computedStyles: {
          display: 'block',
          position: 'static',
          width: '1px',
          height: '1px',
          margin: '',
          padding: '',
          color: '',
          backgroundColor: '',
          border: '',
          borderRadius: '',
          fontFamily: '',
          fontSize: '',
          fontWeight: '',
          lineHeight: '',
          textAlign: '',
          zIndex: ''
        }
      },
      nearbyText: [],
      ancestorPath: [],
      screenshot: null
    }
  }
}

export function useBrowserPageAnnotationSend({
  browserTabId,
  worktreeId
}: {
  browserTabId: string
  worktreeId: string
}): {
  browserAnnotations: BrowserPageAnnotation[]
  browserAnnotationsPrompt: string
  includePageDetails: boolean
  handleIncludePageDetailsChange: (include: boolean) => void
  browserAnnotationsCopied: boolean
  annotationBannerSendOpen: boolean
  annotationTraySendOpen: boolean
  handleAnnotationBannerSendOpenChange: (open: boolean) => void
  handleAnnotationTraySendOpenChange: (open: boolean) => void
  handleCopyBrowserAnnotations: () => void
  handleClearBrowserAnnotations: () => void
  handleDeleteBrowserAnnotation: (annotationId: string) => void
  handleUpdateBrowserAnnotation: (
    annotationId: string,
    comment: string,
    intent: BrowserAnnotationIntent,
    imagePaths: string[]
  ) => void
  handleBrowserAnnotationsSentToAgent: () => void
  activeGroupId: string | undefined
} {
  const browserAnnotations = useAppStore(
    (s) => s.browserAnnotationsByPageId[browserTabId] ?? EMPTY_BROWSER_ANNOTATIONS
  )
  const browserPage = useAppStore((s) =>
    Object.values(s.browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === browserTabId)
  )
  const documentKey = canonicalPrototypeReviewDocumentKey(
    browserPage?.docLocation?.filePath ?? browserPage?.url ?? 'about:blank'
  )
  const prototypeReviewState = usePrototypeReviewNotifications()
  const prototypeReviewActive =
    prototypeReviewState.outgoing.some((note) => note.page.browserPageId === browserTabId) ||
    prototypeReviewState.incoming.some((note) => note.page.browserPageId === browserTabId)
  const activeGroupId = useAppStore((s) => s.activeGroupIdByWorktree[worktreeId])
  const browserAnnotationsRef = useRef(browserAnnotations)
  const [browserAnnotationsCopied, setBrowserAnnotationsCopied] = useState(false)
  const annotationCopyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [includePageDetails, setIncludePageDetails] = useState(false)
  const browserAnnotationsPrompt = useMemo(
    () =>
      formatBrowserAnnotationsAsMarkdown(browserAnnotations, {
        includeDiagnostics: includePageDetails
      }),
    [browserAnnotations, includePageDetails]
  )
  const openAgentSendPopoverTargetMode = useAppStore((s) => s.openAgentSendPopoverTargetMode)
  const closeAgentSendPopoverTargetMode = useAppStore((s) => s.closeAgentSendPopoverTargetMode)
  const activeAgentSendTargetModeId = useAppStore((s) => s.agentSendPopoverTargetMode?.id ?? null)
  const annotationBannerSendModeId = `browser-annotations:${browserTabId}:banner`
  const annotationTraySendModeId = `browser-annotations:${browserTabId}:tray`
  const annotationBannerSendOpen = activeAgentSendTargetModeId === annotationBannerSendModeId
  const annotationTraySendOpen = activeAgentSendTargetModeId === annotationTraySendModeId
  const deleteBrowserPageAnnotation = useAppStore((s) => s.deleteBrowserPageAnnotation)
  const updateBrowserPageAnnotation = useAppStore((s) => s.updateBrowserPageAnnotation)
  const clearBrowserPageAnnotations = useAppStore((s) => s.clearBrowserPageAnnotations)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const addBrowserPageAnnotation = useAppStore((s) => s.addBrowserPageAnnotation)

  useEffect(() => {
    if (!prototypeReviewActive) {
      return
    }
    let stopped = false
    const syncRemoteAnnotations = async (): Promise<void> => {
      try {
        const remote = await callRuntimeRpc<PrototypeReviewAnnotation[]>(
          { kind: 'local' },
          'workbench.prototypeReview.annotations.list',
          { worktree: toRuntimeWorktreeSelector(worktreeId), page: browserTabId, documentKey },
          { timeoutMs: 15_000, suppressFeatureInteraction: true }
        )
        if (stopped) {
          return
        }
        const existing = new Set(
          useAppStore.getState().browserAnnotationsByPageId[browserTabId]?.map((item) => item.id) ??
            []
        )
        for (const annotation of remote) {
          if (existing.has(annotation.id)) {
            continue
          }
          addBrowserPageAnnotation(
            createBrowserPageAnnotationFromPrototype(annotation, browserTabId)
          )
        }
      } catch {
        // A page without prototype-review annotations, or a temporarily unavailable runtime, is normal.
      }
    }
    void syncRemoteAnnotations()
    const timer = window.setInterval(() => void syncRemoteAnnotations(), 5000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [addBrowserPageAnnotation, browserTabId, documentKey, prototypeReviewActive, worktreeId])

  useLayoutEffect(() => {
    browserAnnotationsRef.current = browserAnnotations
  }, [browserAnnotations])

  useEffect(() => {
    return () => {
      clearTimeout(annotationCopyTimerRef.current)
    }
  }, [])

  const handleAnnotationBannerSendOpenChange = useCallback(
    (open: boolean): void => {
      if (open) {
        openAgentSendPopoverTargetMode({
          id: annotationBannerSendModeId,
          worktreeId,
          source: 'browser-annotations',
          prompt: browserAnnotationsPrompt,
          label: translate(
            'auto.components.browser.pane.BrowserPane.27d863542c',
            'Browser annotations'
          ),
          launchSource: 'notes_send'
        })
      } else {
        closeAgentSendPopoverTargetMode(annotationBannerSendModeId)
      }
    },
    [
      annotationBannerSendModeId,
      browserAnnotationsPrompt,
      closeAgentSendPopoverTargetMode,
      openAgentSendPopoverTargetMode,
      worktreeId
    ]
  )

  const handleAnnotationTraySendOpenChange = useCallback(
    (open: boolean): void => {
      if (open) {
        openAgentSendPopoverTargetMode({
          id: annotationTraySendModeId,
          worktreeId,
          source: 'browser-annotations',
          prompt: browserAnnotationsPrompt,
          label: translate(
            'auto.components.browser.pane.BrowserPane.27d863542c',
            'Browser annotations'
          ),
          launchSource: 'notes_send'
        })
      } else {
        closeAgentSendPopoverTargetMode(annotationTraySendModeId)
      }
    },
    [
      annotationTraySendModeId,
      browserAnnotationsPrompt,
      closeAgentSendPopoverTargetMode,
      openAgentSendPopoverTargetMode,
      worktreeId
    ]
  )

  useEffect(
    () => () => {
      closeAgentSendPopoverTargetMode(annotationBannerSendModeId)
      closeAgentSendPopoverTargetMode(annotationTraySendModeId)
    },
    [annotationBannerSendModeId, annotationTraySendModeId, closeAgentSendPopoverTargetMode]
  )

  const handleIncludePageDetailsChange = useCallback(
    (include: boolean): void => {
      setIncludePageDetails(include)
      const openModeId =
        annotationBannerSendOpen || annotationTraySendOpen ? activeAgentSendTargetModeId : null
      if (openModeId && browserAnnotations.length > 0) {
        openAgentSendPopoverTargetMode({
          id: openModeId,
          worktreeId,
          source: 'browser-annotations',
          prompt: formatBrowserAnnotationsAsMarkdown(browserAnnotations, {
            includeDiagnostics: include
          }),
          label: translate(
            'auto.components.browser.pane.BrowserPane.27d863542c',
            'Browser annotations'
          ),
          launchSource: 'notes_send'
        })
      }
    },
    [
      activeAgentSendTargetModeId,
      annotationBannerSendOpen,
      annotationTraySendOpen,
      browserAnnotations,
      openAgentSendPopoverTargetMode,
      worktreeId
    ]
  )

  const handleCopyBrowserAnnotations = useCallback((): void => {
    if (!browserAnnotationsPrompt) {
      return
    }
    void window.api.ui.writeClipboardText(browserAnnotationsPrompt)
    recordFeatureInteraction('browser-annotations')
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(true)
    annotationCopyTimerRef.current = setTimeout(() => setBrowserAnnotationsCopied(false), 1400)
  }, [browserAnnotationsPrompt, recordFeatureInteraction])

  const handleBrowserAnnotationsSentToAgent = useCallback((): void => {
    recordFeatureInteraction('browser-annotations-sent-to-agent')
  }, [recordFeatureInteraction])

  const handleClearBrowserAnnotations = useCallback((): void => {
    if (browserAnnotationsRef.current.length === 0) {
      return
    }
    clearTimeout(annotationCopyTimerRef.current)
    setBrowserAnnotationsCopied(false)
    recordFeatureInteraction('browser-annotations')
    clearBrowserPageAnnotations(browserTabId)
  }, [browserTabId, clearBrowserPageAnnotations, recordFeatureInteraction])

  const handleDeleteBrowserAnnotation = useCallback(
    (annotationId: string): void => {
      if (browserAnnotationsRef.current.length === 1) {
        clearTimeout(annotationCopyTimerRef.current)
        setBrowserAnnotationsCopied(false)
      }
      deleteBrowserPageAnnotation(browserTabId, annotationId)
      void callRuntimeRpc(
        { kind: 'local' },
        'workbench.prototypeReview.annotations.delete',
        { pageId: browserTabId, documentKey, annotationId },
        { timeoutMs: 15_000, suppressFeatureInteraction: true }
      ).catch(() => undefined)
      recordFeatureInteraction('browser-annotations')
    },
    [browserTabId, deleteBrowserPageAnnotation, documentKey, recordFeatureInteraction]
  )

  const handleUpdateBrowserAnnotation = useCallback(
    (
      annotationId: string,
      comment: string,
      intent: BrowserAnnotationIntent,
      imagePaths: string[]
    ): void => {
      updateBrowserPageAnnotation(browserTabId, annotationId, { comment, intent, imagePaths })
      recordFeatureInteraction('browser-annotations')
    },
    [browserTabId, recordFeatureInteraction, updateBrowserPageAnnotation]
  )

  return {
    browserAnnotations,
    browserAnnotationsPrompt,
    includePageDetails,
    handleIncludePageDetailsChange,
    browserAnnotationsCopied,
    annotationBannerSendOpen,
    annotationTraySendOpen,
    handleAnnotationBannerSendOpenChange,
    handleAnnotationTraySendOpenChange,
    handleCopyBrowserAnnotations,
    handleClearBrowserAnnotations,
    handleDeleteBrowserAnnotation,
    handleUpdateBrowserAnnotation,
    handleBrowserAnnotationsSentToAgent,
    activeGroupId
  }
}
