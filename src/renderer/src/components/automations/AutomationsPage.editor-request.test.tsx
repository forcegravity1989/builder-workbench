// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AutomationEditorRequest } from './automation-editor-request'
import {
  api,
  mocks,
  installAutomationsPageHarness,
  renderPage,
  settleHostQueries,
  runtimeHost,
  addRuntimeProject,
  RUNTIME_SELF_FILTER,
  RUNTIME_REPO_ID,
  RUNTIME_WORKSPACE_ID,
  scopedList
} from './automations-page-test-harness'
import { makeAutomation } from './automations-page-fixtures'

installAutomationsPageHarness()

function requestEditor(request: AutomationEditorRequest): void {
  mocks.state.pendingAutomationEditorRequest = request
  mocks.state.consumeAutomationEditorRequest = vi.fn((current) => {
    if (mocks.state.pendingAutomationEditorRequest === current) {
      mocks.state.pendingAutomationEditorRequest = null
    }
  })
}
const createRequest = (): AutomationEditorRequest => ({
  kind: 'create',
  host: RUNTIME_SELF_FILTER.host,
  draft: {
    name: 'Version planning',
    prompt: 'Read the planning skill',
    projectId: RUNTIME_REPO_ID,
    workspaceId: RUNTIME_WORKSPACE_ID,
    reuseSession: false,
    preset: 'weekly',
    dayOfWeek: '1',
    creationKey: 'cycle-planning'
  }
})

describe('native automation editor entry', () => {
  it('preserves the explicit runtime draft through hydration and writes only after Save', async () => {
    api.automations.list.mockResolvedValue([])
    scopedList([])
    runtimeHost([], [])
    addRuntimeProject()
    const previous = mocks.callRuntimeRpc.getMockImplementation()
    mocks.callRuntimeRpc.mockImplementation(async (target, method, params, options) =>
      method === 'automation.create'
        ? { automation: makeAutomation({ id: 'created' }) }
        : previous?.(target, method, params, options)
    )
    requestEditor(createRequest())
    await renderPage({ strict: true })
    await settleHostQueries()
    expect(mocks.editorDialog?.open).toBe(true)
    expect(mocks.editorDialog?.draft).toMatchObject({
      name: 'Version planning',
      projectId: RUNTIME_REPO_ID,
      workspaceId: RUNTIME_WORKSPACE_ID,
      prompt: 'Read the planning skill',
      reuseSession: false,
      dayOfWeek: '1'
    })
    expect(mocks.editorDialog?.createDestination?.resolution).toMatchObject({
      status: 'ready',
      authority: { kind: 'runtime', environmentId: 'gpu' }
    })
    expect(
      mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.create')
    ).toHaveLength(0)
    await act(async () => {
      mocks.editorDialog?.onSave()
    })
    const creates = mocks.callRuntimeRpc.mock.calls.filter(
      (call) => call[1] === 'automation.create'
    )
    expect(creates).toHaveLength(1)
    expect(creates[0]?.[0]).toMatchObject({ kind: 'environment', environmentId: 'gpu' })
    expect(creates[0]?.[2]).toMatchObject({
      repo: `id:${RUNTIME_REPO_ID}`,
      workspace: `id:${RUNTIME_WORKSPACE_ID}`,
      creationKey: 'cycle-planning',
      reuseSession: false
    })
    expect(api.automations.create).not.toHaveBeenCalled()
    expect(api.automations.runNow).not.toHaveBeenCalled()
  })

  it('keeps an unavailable explicit destination instead of falling back to the local project', async () => {
    requestEditor(createRequest())
    await renderPage()
    await settleHostQueries()
    expect(mocks.editorDialog?.draft).toMatchObject({
      projectId: RUNTIME_REPO_ID,
      workspaceId: RUNTIME_WORKSPACE_ID
    })
    expect(mocks.editorDialog?.createDestination?.resolution.status).toBe('choice-required')
    await act(async () => {
      mocks.editorDialog?.onSave()
    })
    expect(api.automations.create).not.toHaveBeenCalled()
    expect(
      mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.create')
    ).toHaveLength(0)
  })

  it('edits the named host record even when another host has the same automation id', async () => {
    const local = makeAutomation({ id: 'same-id', name: 'Local job' })
    const remote = makeAutomation({
      id: 'same-id',
      name: 'Remote job',
      projectId: RUNTIME_REPO_ID,
      workspaceId: RUNTIME_WORKSPACE_ID,
      runContext: null
    })
    api.automations.list.mockResolvedValue([local])
    scopedList([local])
    runtimeHost([remote], [])
    addRuntimeProject()
    mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
    requestEditor({ kind: 'edit', host: RUNTIME_SELF_FILTER.host, automationId: 'same-id' })
    await renderPage()
    await settleHostQueries()
    expect(mocks.editorDialog?.open).toBe(true)
    expect(mocks.editorDialog?.isEditing).toBe(true)
    expect(mocks.editorDialog?.draft).toMatchObject({
      name: 'Remote job',
      projectId: RUNTIME_REPO_ID
    })
    expect(api.automations.create).not.toHaveBeenCalled()
    expect(api.automations.update).not.toHaveBeenCalled()
  })

  it('reports a removed runtime once without repeatedly changing the host filter', async () => {
    mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
    requestEditor({ kind: 'edit', host: RUNTIME_SELF_FILTER.host, automationId: 'missing' })
    const page = await renderPage()
    await settleHostQueries()
    await page.rerender()
    expect(mocks.state.pendingAutomationEditorRequest).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledOnce()
    expect(mocks.setAutomationHostFilter).not.toHaveBeenCalled()
    expect(mocks.editorDialog?.open).toBe(false)
    expect(api.automations.create).not.toHaveBeenCalled()
  })

  it('does not wait for records from a removed SSH target', async () => {
    const host = {
      authority: { kind: 'desktop' as const },
      selector: { kind: 'ssh' as const, targetId: 'removed-ssh' }
    }
    mocks.state.automationHostFilter = { kind: 'host', host }
    requestEditor({ kind: 'edit', host, automationId: 'missing' })
    const page = await renderPage()
    await settleHostQueries()
    await page.rerender()
    expect(mocks.state.pendingAutomationEditorRequest).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledOnce()
    expect(mocks.setAutomationHostFilter).not.toHaveBeenCalled()
    expect(mocks.editorDialog?.open).toBe(false)
  })

  it('queues another entry without overwriting an already open editor', async () => {
    const page = await renderPage()
    await act(async () => {
      mocks.listPanel?.openCreateDialog()
    })
    await act(async () => {
      mocks.editorDialog?.onDraftChange((draft) => ({ ...(draft as object), name: 'Unsaved work' }))
    })
    requestEditor(createRequest())
    await page.rerender()
    expect(mocks.editorDialog?.draft).toMatchObject({ name: 'Unsaved work' })
    expect(mocks.state.pendingAutomationEditorRequest).not.toBeNull()
    expect(api.automations.create).not.toHaveBeenCalled()
  })
})
