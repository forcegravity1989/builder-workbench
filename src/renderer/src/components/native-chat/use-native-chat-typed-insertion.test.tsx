// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNativeChatTypedInsertion } from './composer/editor/use-native-chat-typed-insertion'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('preserves selected draft text on append and leaves the IME-owned input untouched', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  let composing = false
  const input = document.createElement('textarea')
  input.value = 'User draft'
  input.setSelectionRange(0, input.value.length)
  const { result } = renderHook(() => {
    const [draft, setDraft] = useState(input.value)
    const [, setCaret] = useState(0)
    const [, setActiveSuggestion] = useState(0)
    const textareaRef = useRef(input)
    const actions = useNativeChatTypedInsertion({
      textareaRef,
      isComposing: () => composing,
      setDraft,
      setCaret,
      setActiveSuggestion
    })
    return { draft, ...actions }
  })
  act(() => {
    result.current.appendText('Archive request')
    result.current.appendText('Second request')
  })
  expect(result.current.draft).toBe('User draft\n\nArchive request\n\nSecond request')
  composing = true
  act(() => {
    result.current.appendText('Must stay pending')
  })
  expect(input.value).toBe('User draft\n\nArchive request\n\nSecond request')
  expect(result.current.draft).toContain('Must stay pending')
})
