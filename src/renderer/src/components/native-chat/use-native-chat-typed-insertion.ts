import type { NativeChatComposerInput } from './native-chat-composer-input'
import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  registerNativeChatDraftTarget,
  type NativeChatDraftTarget
} from '@/lib/native-chat-draft-insertion'
import type { HistoryState } from './native-chat-composer-state'

/** Imperative text insertion and focus for the composer textarea, used by the
 *  paste pipeline and the composer's imperative handle. */
export function useNativeChatTypedInsertion(args: {
  textareaRef: RefObject<NativeChatComposerInput | null>
  draftTarget?: NativeChatDraftTarget
  isComposing?: () => boolean
  caret: number
  draft: string
  setDraft: (value: string | ((previous: string) => string)) => void
  setCaret: Dispatch<SetStateAction<number>>
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setActiveSuggestion: Dispatch<SetStateAction<number>>
}): {
  insertTypedText: (text: string) => boolean
  appendDraftText: (text: string) => boolean
  focus: () => boolean
} {
  const {
    textareaRef,
    draftTarget,
    isComposing,
    caret,
    draft,
    setDraft,
    setCaret,
    setHistory,
    setActiveSuggestion
  } = args

  const insertTypedText = useCallback(
    (text: string): boolean => {
      const textarea = textareaRef.current
      if (!textarea || textarea.disabled) {
        return false
      }
      const selectionStart = textarea.selectionStart ?? caret
      const selectionEnd = textarea.selectionEnd ?? selectionStart
      const next = `${draft.slice(0, selectionStart)}${text}${draft.slice(selectionEnd)}`
      const nextCaret = selectionStart + text.length
      textarea.focus()
      setDraft(next)
      setCaret(nextCaret)
      setHistory((prev) => ({ entries: prev.entries, index: null }))
      setActiveSuggestion(0)
      requestAnimationFrame(() => {
        textarea.setSelectionRange(nextCaret, nextCaret)
      })
      return true
    },
    [caret, draft, setActiveSuggestion, setCaret, setDraft, setHistory, textareaRef]
  )

  const focus = useCallback((): boolean => {
    const textarea = textareaRef.current
    if (!textarea || textarea.disabled) {
      return false
    }
    textarea.focus()
    return true
  }, [textareaRef])

  const appendDraftText = useCallback(
    (text: string): boolean => {
      const textarea = textareaRef.current
      if (!textarea || textarea.disabled || isComposing?.()) {
        return false
      }
      // Preserve the complete existing draft, including selected text and attachments.
      setDraft((previous) => previous + (previous && !previous.endsWith('\n') ? '\n\n' : '') + text)
      setHistory((previous) => ({ entries: previous.entries, index: null }))
      setActiveSuggestion(0)
      textarea.focus()
      requestAnimationFrame(() => {
        const end = textarea.value.length
        setCaret(end)
        textarea.setSelectionRange(end, end)
      })
      return true
    },
    [isComposing, setActiveSuggestion, setCaret, setDraft, setHistory, textareaRef]
  )

  const tabId = draftTarget?.tabId
  const paneKey = draftTarget?.paneKey
  useEffect(() => {
    if (tabId && paneKey) {
      return registerNativeChatDraftTarget({ tabId, paneKey }, appendDraftText)
    }
  }, [tabId, paneKey, appendDraftText])

  return { insertTypedText, appendDraftText, focus }
}
