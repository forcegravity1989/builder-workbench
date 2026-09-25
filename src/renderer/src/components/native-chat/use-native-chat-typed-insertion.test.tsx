// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNativeChatTypedInsertion } from './use-native-chat-typed-insertion'
import { EMPTY_HISTORY } from './native-chat-composer-state'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('preserves selected draft text on append and refuses insertion during IME composition', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  let composing = false
  const input = document.createElement('textarea')
  input.value = 'User draft'
  input.setSelectionRange(0, input.value.length)
  const { result } = renderHook(() => {
    const [draft, setDraft] = useState(input.value)
    const [caret, setCaret] = useState(0)
    const [, setHistory] = useState(EMPTY_HISTORY)
    const [, setActiveSuggestion] = useState(0)
    const textareaRef = useRef(input)
    const actions = useNativeChatTypedInsertion({
      textareaRef,
      isComposing: () => composing,
      caret,
      draft,
      setDraft,
      setCaret,
      setHistory,
      setActiveSuggestion
    })
    return { draft, ...actions }
  })
  act(() => {
    expect(result.current.appendDraftText('Archive request')).toBe(true)
    expect(result.current.appendDraftText('Second request')).toBe(true)
  })
  expect(result.current.draft).toBe('User draft\n\nArchive request\n\nSecond request')
  composing = true
  act(() => {
    expect(result.current.appendDraftText('Must stay pending')).toBe(false)
  })
  expect(result.current.draft).not.toContain('Must stay pending')
})
