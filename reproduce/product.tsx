import React from 'react'
import { createRoot } from 'react-dom/client'
import { OverviewPage } from '../../src/renderer/src/workbench/OverviewPage'
import '../../src/renderer/src/workbench/workbench-tokens.css'
import { getInstanceByDom } from 'echarts/core'
import { store } from './fixtures'
document.documentElement.dataset.skin = 'ds'
document.documentElement.dataset.theme = 'claude'
const root = createRoot(document.getElementById('root')!)
root.render(<OverviewPage />)
window.chartSnapshots = () => [...document.querySelectorAll('.wb-mz-canvas')].map(el => getInstanceByDom(el)?.getOption())
window.switchFixtureProject = () => {
  const home = { id: 'second-home', repoId: 'second', path: '/second', isMainWorktree: true }
  store.repos = [{ id: 'second', displayName: '第二项目', path: '/second' }]
  store.activeRepoId = 'second'
  store.worktreesByRepo = { second: [home] }
  root.render(<OverviewPage />)
}
