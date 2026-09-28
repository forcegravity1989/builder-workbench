// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { NativeWorkspaceScope } from './native-workspace'

const fixture = vi.hoisted(() => ({
  maintenanceId: 'tree-metrics',
  prompt: 'PROMPT',
  launchOrder: [] as string[],
  ensureShouldFail: false,
  defaultTuiAgent: null as TuiAgent | 'blank' | null,
  detectedIds: null as TuiAgent[] | null
}))

vi.mock('@/store', () => {
  const state = {
    get settings() {
      return { defaultTuiAgent: fixture.defaultTuiAgent }
    },
    setActiveWorktree: vi.fn()
  }
  const useAppStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
  return { useAppStore }
})
vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: (worktreeId: string | null) => ({ worktreeId })
}))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: fixture.detectedIds })
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: vi.fn((args: unknown) => {
    fixture.launchOrder.push(`launch:${JSON.stringify(args)}`)
  })
}))
vi.mock('@/runtime/web-runtime-worktree-activation', () => ({
  activateWebRuntimeSessionWorktree: vi.fn(async (args: unknown) => {
    fixture.launchOrder.push(`activate:${JSON.stringify(args)}`)
    return true
  })
}))
vi.mock('./native-workspace', () => ({
  ensureNamedWorktree: vi.fn(async () => {
    if (fixture.ensureShouldFail) {
      throw new Error('分支被占用')
    }
    return { id: fixture.maintenanceId }
  })
}))
vi.mock('./cycle-prompt', () => ({
  resolveWorkbenchPromptAssets: vi.fn(async () => ({ prompt: fixture.prompt }))
}))

import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import { ensureNamedWorktree } from './native-workspace'
import { resolveWorkbenchPromptAssets } from './cycle-prompt'
import {
  METRICS_BRANCH,
  METRICS_WORKTREE_NAME,
  prepareMetricsSession,
  useMetricsSetup,
  useMetricsSetupAgent
} from './metrics-setup'

const baseScope: NativeWorkspaceScope = {
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local'
}
const runtimeScope: NativeWorkspaceScope = { ...baseScope, runtimeOwnerEnvironmentId: 'env-1' }

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  fixture.launchOrder = []
  fixture.ensureShouldFail = false
  fixture.defaultTuiAgent = null
  fixture.detectedIds = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderHook<T>(useHook: () => T): Promise<{ current: T }> {
  const result: { current: T } = { current: undefined as unknown as T }
  function Probe(): null {
    result.current = useHook()
    return null
  }
  await act(async () => root.render(<Probe />))
  return result
}

it('走固定维护树管线：确保树→注入提示→移动选择→自动提交原生会话', async () => {
  await prepareMetricsSession({ baseScope, agent: 'claude' as TuiAgent })
  expect(ensureNamedWorktree).toHaveBeenCalledWith(baseScope, METRICS_BRANCH, METRICS_WORKTREE_NAME)
  expect(resolveWorkbenchPromptAssets).toHaveBeenCalledWith({
    ...baseScope,
    workflow: 'metrics-refresh',
    worktreeId: fixture.maintenanceId
  })
  expect(useAppStore.getState().setActiveWorktree).toHaveBeenCalledWith(
    fixture.maintenanceId,
    baseScope.hostId
  )
  expect(activateWebRuntimeSessionWorktree).not.toHaveBeenCalled()
  expect(launchAgentInNewTab).toHaveBeenCalledWith({
    agent: 'claude',
    worktreeId: fixture.maintenanceId,
    prompt: fixture.prompt,
    activate: true,
    promptDelivery: 'auto-submit'
  })
})

it('paired runtime 宿主先激活会话工作树再启动，顺序与壳一致', async () => {
  await prepareMetricsSession({ baseScope: runtimeScope, agent: 'codex' as TuiAgent })
  expect(fixture.launchOrder).toEqual([
    `activate:${JSON.stringify({ worktreeId: fixture.maintenanceId, environmentId: 'env-1' })}`,
    `launch:${JSON.stringify({
      agent: 'codex',
      worktreeId: fixture.maintenanceId,
      prompt: fixture.prompt,
      activate: true,
      promptDelivery: 'auto-submit'
    })}`
  ])
})

it('管线失败原样抛出，由调用屏的提示浮现', async () => {
  fixture.ensureShouldFail = true
  await expect(prepareMetricsSession({ baseScope, agent: 'claude' as TuiAgent })).rejects.toThrow(
    '分支被占用'
  )
  expect(launchAgentInNewTab).not.toHaveBeenCalled()
})

it('agent 优先级：设置默认值→检测到的第一个；blank 不算默认', async () => {
  fixture.detectedIds = ['codex', 'claude'] as TuiAgent[]
  fixture.defaultTuiAgent = 'gemini' as TuiAgent
  const withDefault = await renderHook(() => useMetricsSetupAgent('tree-1'))
  expect(withDefault.current).toBe('gemini')

  fixture.defaultTuiAgent = 'blank'
  const blank = await renderHook(() => useMetricsSetupAgent('tree-1'))
  expect(blank.current).toBe('codex')

  fixture.defaultTuiAgent = null
  fixture.detectedIds = null
  const loading = await renderHook(() => useMetricsSetupAgent('tree-1'))
  expect(loading.current).toBeNull()
})

it('总览入口：工作区未就绪时给出如实提示，不触碰管线', async () => {
  const entry = await renderHook(() => useMetricsSetup({ baseScope: null, worktreeId: null }))
  await act(async () => {
    await entry.current.prepareMetrics()
  })
  expect(entry.current.notice).toBe('项目工作区尚未就绪')
  expect(entry.current.busy).toBe(false)
  expect(ensureNamedWorktree).not.toHaveBeenCalled()
})

it('总览入口：无可用会话工具时提示配置，不启动会话', async () => {
  fixture.detectedIds = null
  const entry = await renderHook(() => useMetricsSetup({ baseScope, worktreeId: 'tree-1' }))
  await act(async () => {
    await entry.current.prepareMetrics()
  })
  expect(entry.current.notice).toBe('未检测到可用会话工具，请先在设置中配置')
  expect(launchAgentInNewTab).not.toHaveBeenCalled()
})

it('总览入口：管线失败把错误文案浮到 notice；成功后 notice 保持干净', async () => {
  fixture.detectedIds = ['claude'] as TuiAgent[]
  fixture.ensureShouldFail = true
  const entry = await renderHook(() => useMetricsSetup({ baseScope, worktreeId: 'tree-1' }))
  await act(async () => {
    await entry.current.prepareMetrics()
  })
  expect(entry.current.notice).toBe('分支被占用')
  expect(entry.current.busy).toBe(false)

  fixture.ensureShouldFail = false
  await act(async () => {
    await entry.current.prepareMetrics()
  })
  expect(entry.current.notice).toBeNull()
  expect(launchAgentInNewTab).toHaveBeenCalledTimes(1)
})
