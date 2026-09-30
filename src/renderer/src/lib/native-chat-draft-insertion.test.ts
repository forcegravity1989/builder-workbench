import { describe, expect, it, vi } from 'vitest'
import {
  insertNativeChatDraft,
  insertNativeChatDraftForTab,
  registerNativeChatDraftTarget
} from './native-chat-draft-insertion'

describe('targeted native composer insertion', () => {
  it('only writes the exact mounted tab/pane and reports missing or disabled targets', () => {
    const target = { tabId: 'tab', paneKey: 'pane' }
    const writer = vi.fn(() => true)
    const unregister = registerNativeChatDraftTarget(target, writer)
    try {
      expect(insertNativeChatDraft({ ...target, paneKey: 'other', text: 'Archive' })).toBe(false)
      expect(insertNativeChatDraft({ ...target, text: 'Archive' })).toBe(true)
      expect(writer).toHaveBeenCalledOnce()
      writer.mockReturnValue(false)
      expect(insertNativeChatDraft({ ...target, text: 'Archive' })).toBe(false)
    } finally {
      unregister()
    }
    expect(insertNativeChatDraft({ ...target, text: 'Archive' })).toBe(false)
  })
  it('writes the only composer mounted on a tab when the pane key differs', () => {
    const writer = vi.fn(() => true)
    const unregister = registerNativeChatDraftTarget({ tabId: 'tab', paneKey: 'tab:leaf' }, writer)
    try {
      expect(insertNativeChatDraftForTab('tab', '归档请求')).toBe(true)
      expect(writer).toHaveBeenCalledWith('归档请求')
    } finally {
      unregister()
    }
  })

  it('rejects duplicate mounted targets without modifying either composer', () => {
    const target = { tabId: 'same-tab', paneKey: 'same-pane' }
    const a = vi.fn(() => true)
    const b = vi.fn(() => true)
    const stopA = registerNativeChatDraftTarget(target, a)
    const stopB = registerNativeChatDraftTarget(target, b)
    try {
      expect(insertNativeChatDraft({ ...target, text: 'Archive' })).toBe(false)
      expect(a).not.toHaveBeenCalled()
      expect(b).not.toHaveBeenCalled()
      stopA()
      expect(insertNativeChatDraft({ ...target, text: 'Archive' })).toBe(true)
    } finally {
      stopA()
      stopB()
    }
  })
})
