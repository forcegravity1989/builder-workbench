// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  closeProjectPage,
  openProjectOnboard,
  openProjectWall,
  useProjectPage
} from './project-page-state'

vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  return {
    useAppStore: create((set) => ({
      activeView: 'terminal',
      openActivityPage: () => set({ activeView: 'activity' })
    }))
  }
})

afterEach(() => {
  cleanup()
  closeProjectPage()
  useAppStore.setState({ activeView: 'terminal' })
})

describe('project pages in the Orca activity content slot', () => {
  it('leaves terminal chrome before showing project pages, including when replacing a page', () => {
    const page = renderHook(useProjectPage)
    act(openProjectWall)
    expect(useAppStore.getState().activeView).toBe('activity')
    expect(page.result.current?.kind).toBe('wall')

    const options = { attachToGroupId: 'group', seedName: 'Project' }
    act(() => openProjectOnboard(options))
    options.seedName = 'Changed outside the page'
    expect(page.result.current).toEqual({
      kind: 'onboard',
      options: { attachToGroupId: 'group', seedName: 'Project' }
    })
    act(openProjectWall)
    expect(page.result.current).toEqual({ kind: 'wall' })
  })

  it('does not reopen a dismissed project page when native navigation returns to overview', () => {
    const page = renderHook(useProjectPage)
    act(openProjectOnboard)
    act(() => useAppStore.setState({ activeView: 'terminal' }))
    expect(page.result.current).toBeNull()
    act(() => useAppStore.setState({ activeView: 'activity' }))
    expect(page.result.current).toBeNull()
  })

  it('returns to overview within the same slot without affecting native selection', () => {
    const page = renderHook(useProjectPage)
    act(openProjectWall)
    act(closeProjectPage)
    expect(page.result.current).toBeNull()
    expect(useAppStore.getState().activeView).toBe('activity')
  })
})
