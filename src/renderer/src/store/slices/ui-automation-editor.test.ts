import { describe, expect, it, vi } from 'vitest'
import { createUiViewActions } from './ui/ui-slice-view-actions'
import type { AppState } from '../types'
import type { UISliceSet } from './ui/ui-slice-contract'
import type { AutomationEditorRequest } from '@/components/automations/automation-editor-request'

describe('automation editor navigation', () => {
  it('gives repeated entries their own identity and ignores stale consumption', () => {
    let state = {
      activeView: 'artifacts',
      previousViewBeforeAutomations: 'terminal',
      recordViewVisit: vi.fn()
    } as unknown as AppState
    const set: UISliceSet = (next) => {
      state = { ...state, ...(typeof next === 'function' ? next(state) : next) }
    }
    state = { ...state, ...createUiViewActions(set, () => state) }
    const request: AutomationEditorRequest = {
      kind: 'edit',
      automationId: 'a',
      host: { authority: { kind: 'desktop' }, selector: { kind: 'self' } }
    }
    state.openAutomationEditor(request)
    const first = state.pendingAutomationEditorRequest!
    expect(state.activeView).toBe('automations')
    expect(state.previousViewBeforeAutomations).toBe('artifacts')
    state.consumeAutomationEditorRequest(first)
    state.openAutomationEditor(request)
    const second = state.pendingAutomationEditorRequest!
    expect(second).not.toBe(first)
    expect(second).toEqual(request)
    state.consumeAutomationEditorRequest(first)
    expect(state.pendingAutomationEditorRequest).toBe(second)
    state.consumeAutomationEditorRequest(second)
    expect(state.pendingAutomationEditorRequest).toBeNull()
  })
})
