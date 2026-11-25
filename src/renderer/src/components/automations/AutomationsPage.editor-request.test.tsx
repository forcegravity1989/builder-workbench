// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { hostStableKey } from '../../../../shared/automations/ownership/automation-owner-key'
import type { StableAutomationHostRef } from '../../../../shared/automations/ownership/automation-owner-ref'
import type { AutomationEditorRequest } from './automation-editor-request'
import type { AutomationHostCatalogEntry } from './hosts/automation-host-catalog-types'
import type { AutomationListRow } from './listing/automation-list-row-identity'
import { makeAutomation } from './automations-page-fixtures'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { groupReposByAutomationAuthority } from './hosts/automation-authority-identity'
import { saveOrcaAutomation } from './authoring/automation-orca-save'
import type { AutomationSaveContext } from './authoring/automation-save-context'
import type { AutomationDraft } from './authoring/AutomationEditorDialog'
import { useAutomationCreateDestination } from './authoring/use-automation-create-destination'
import type { Repo } from '../../../../shared/repository/repo-types'
import type { ProjectHostSetup } from '../../../../shared/project/project-types'
import { useAutomationEditorRequest } from './use-automation-editor-request'
import type * as AutomationCapabilityProbe from './hosts/automation-capability-probe'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))
vi.mock('./authoring/automation-save-completion', () => ({ completeAutomationSave: vi.fn() }))
vi.mock('./authoring/automation-setup-review', () => ({
  confirmAutomationSaveSetup: vi.fn(async () => ({ trust: null, setupTrustHash: undefined }))
}))
vi.mock('./hosts/automation-capability-probe', async (importOriginal) => ({
  ...(await importOriginal<typeof AutomationCapabilityProbe>()),
  assertAutomationCreateIdempotencySupported: vi.fn(async () => undefined),
  assertOwnerFencingSupported: vi.fn(async () => undefined)
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const runtime: StableAutomationHostRef = {
  authority: { kind: 'runtime', environmentId: 'gpu' },
  selector: { kind: 'self' }
}
const desktop: StableAutomationHostRef = {
  authority: { kind: 'desktop' },
  selector: { kind: 'self' }
}
const createRequest: AutomationEditorRequest = {
  kind: 'create',
  host: runtime,
  draft: {
    name: 'Version planning',
    prompt: 'Read the planning skill',
    projectId: 'project-id',
    workspaceId: 'workspace-id',
    reuseSession: false,
    creationKey: 'cycle-planning'
  }
}

type RequestInput = Parameters<typeof useAutomationEditorRequest>[0]

function setUp(
  request: AutomationEditorRequest,
  options?: {
    selectedHost?: StableAutomationHostRef
    entry?: AutomationHostCatalogEntry
    rows?: AutomationListRow[]
    loading?: boolean
    open?: boolean
  }
) {
  const consumeAutomationEditorRequest =
    vi.fn<RequestInput['store']['consumeAutomationEditorRequest']>()
  const openCreateDialog = vi.fn<RequestInput['actions']['openCreateDialog']>()
  const openEditDialog = vi.fn<RequestInput['actions']['openEditDialog']>()
  const selectHost = vi.fn()
  const store: RequestInput['store'] = {
    pendingAutomationEditorRequest: request,
    consumeAutomationEditorRequest,
    automationHostFilter: { kind: 'host', host: options?.selectedHost ?? request.host }
  }
  const hostCatalog = {
    entries: options?.entry ? [options.entry] : [],
    rows: { rows: options?.rows ?? [], answered: !options?.loading },
    resolution: { status: options?.loading ? 'loading' : 'ready' },
    selectHost
  } as RequestInput['list']['hostCatalog']
  const hook = renderHook(
    ({ createOpen }) =>
      useAutomationEditorRequest({
        store,
        local: { createOpen },
        list: { hostCatalog },
        actions: { openCreateDialog, openEditDialog }
      }),
    { initialProps: { createOpen: options?.open ?? false } }
  )
  return { hook, openCreateDialog, openEditDialog, consumeAutomationEditorRequest, selectHost }
}

function row(host: StableAutomationHostRef, name: string): AutomationListRow {
  return {
    key: hostStableKey(host),
    automation: makeAutomation({ id: 'same-id', name }),
    catalogRef: host,
    hostLabel: name,
    usageSummary: null
  }
}

function hostEntry(host: StableAutomationHostRef): AutomationHostCatalogEntry {
  return {
    stableRef: host,
    owner: {
      authority:
        host.authority.kind === 'runtime'
          ? { ...host.authority, pairingRevision: 7 }
          : host.authority,
      selector: { kind: 'self' }
    },
    stableKey: hostStableKey(host),
    label: 'Host',
    authorityLabel: 'Host',
    kind: 'self',
    catalogState: 'authoritative',
    authorityHealth: 'fresh',
    executionHealth: 'connected',
    querySupport: 'scoped'
  }
}

function openSaveFixture(runtimeAvailable: boolean) {
  const repo: Repo = {
    id: createRequest.draft.projectId,
    path: '/repo',
    displayName: 'Planning',
    badgeColor: '#000000',
    addedAt: 0,
    executionHostId: 'runtime:gpu'
  }
  const setup: ProjectHostSetup = {
    id: 'setup',
    projectId: 'project',
    hostId: 'runtime:gpu',
    repoId: repo.id,
    path: repo.path,
    displayName: repo.displayName,
    setupState: 'ready',
    setupMethod: 'imported-existing-folder',
    createdAt: 0,
    updatedAt: 0
  }
  const entries = runtimeAvailable ? [hostEntry(desktop), hostEntry(runtime)] : [hostEntry(desktop)]
  const catalog = {
    entries,
    byStableKey: new Map(entries.map((entry) => [entry.stableKey, entry])),
    hydration: {
      runtimeCatalogSettled: true,
      desktopSshHydrated: true,
      runtimeSshHydratedByEnvironmentId: new Map(),
      savedRuntimeEnvironmentIds: new Set(['gpu']),
      orphanSettledAuthorityKeys: new Set<string>(),
      unavailableAuthorityKeys: new Set<string>()
    }
  }
  const { result } = renderHook(() =>
    useAutomationCreateDestination({
      open: true,
      catalog,
      entries,
      filterStableKey: hostStableKey(desktop),
      activeWorkspaceStableKey: hostStableKey(desktop),
      initialStableKey: hostStableKey(createRequest.host),
      repoTables: groupReposByAutomationAuthority([repo]),
      projects: [repo]
    })
  )
  const draft: AutomationDraft = {
    agentId: 'claude',
    extraAgentArgs: '',
    bot: null,
    workspaceMode: 'existing',
    baseBranch: '',
    reuseSession: false,
    precheckCommand: '',
    precheckTimeoutSeconds: '60',
    preset: 'weekly',
    time: '08:00',
    dayOfWeek: '1',
    customSchedule: '',
    missedRunGraceMinutes: '720',
    savedSchedule: null,
    scheduleWarning: null,
    ...createRequest.draft
  }
  const setEditorNotice = vi.fn()
  const save = () =>
    saveOrcaAutomation(
      {
        store: { projectHostSetups: [setup] },
        local: {
          draft,
          draftAtOpen: draft,
          editingAutomationId: null,
          editingRowKey: null,
          setEditorNotice
        },
        setup: {},
        destination: { createDestination: result.current, invalidateWrittenHost: vi.fn() },
        destinationForm: {
          dialogRepos: [repo],
          editingDestination: null,
          automationDialogTarget: { kind: 'local' },
          editHostEntries: entries
        }
      } as unknown as AutomationSaveContext,
      { hour: 8, minute: 0, now: 1_000_000, surface: 'terminal' }
    )
  return { save, resolution: result.current.control.resolution, setEditorNotice }
}

describe('native automation editor entry', () => {
  it('sends the draft and idempotency key only to the captured runtime on Save', async () => {
    vi.mocked(callRuntimeRpc).mockResolvedValue({ automation: makeAutomation() })
    const state = setUp(createRequest)
    state.hook.rerender()
    expect(state.openCreateDialog).toHaveBeenCalledExactlyOnceWith(undefined, createRequest)
    const fixture = openSaveFixture(true)
    expect(fixture.resolution).toMatchObject({
      status: 'ready',
      authority: { kind: 'runtime', environmentId: 'gpu', pairingRevision: 7 }
    })
    expect(callRuntimeRpc).not.toHaveBeenCalled()
    await fixture.save()
    expect(callRuntimeRpc).toHaveBeenCalledExactlyOnceWith(
      { kind: 'environment', environmentId: 'gpu' },
      'automation.create',
      expect.objectContaining({
        repo: 'id:project-id',
        workspace: 'id:workspace-id',
        creationKey: 'cycle-planning',
        prompt: 'Read the planning skill',
        reuseSession: false
      }),
      expect.objectContaining({ expectedEnvironmentPairingRevision: 7 })
    )
  })

  it('refuses to save when the explicit destination is unavailable even with a local host', async () => {
    const fixture = openSaveFixture(false)
    expect(fixture.resolution.status).toBe('choice-required')
    await fixture.save()
    expect(fixture.setEditorNotice).toHaveBeenCalledOnce()
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('edits the named host record even when another host has the same automation id', () => {
    const request = { kind: 'edit', host: runtime, automationId: 'same-id' } as const
    const remote = row(runtime, 'Remote job')
    const state = setUp(request, {
      entry: hostEntry(runtime),
      rows: [row(desktop, 'Local job'), remote]
    })
    expect(state.openEditDialog).toHaveBeenCalledExactlyOnceWith(remote)
    expect(state.consumeAutomationEditorRequest).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('reports a removed runtime once without repeatedly changing the host filter', () => {
    const request = { kind: 'edit', host: runtime, automationId: 'missing' } as const
    const state = setUp(request)
    state.hook.rerender()
    expect(state.consumeAutomationEditorRequest).toHaveBeenCalledExactlyOnceWith(request)
    expect(toast.error).toHaveBeenCalledOnce()
    expect(state.selectHost).not.toHaveBeenCalled()
  })

  it('retains a request while the host catalog is still loading', () => {
    const request = { kind: 'edit', host: runtime, automationId: 'same-id' } as const
    const state = setUp(request, { loading: true })
    expect(state.consumeAutomationEditorRequest).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('queues another entry without overwriting an already open editor', () => {
    const state = setUp(createRequest, { open: true })
    expect(state.openCreateDialog).not.toHaveBeenCalled()
    state.hook.rerender({ createOpen: false })
    expect(state.openCreateDialog).toHaveBeenCalledExactlyOnceWith(undefined, createRequest)
  })
})
