import React from 'react'
import { createRoot } from 'react-dom/client'
import { OverviewPage } from '../../src/renderer/src/workbench/OverviewPage'
import '../../src/renderer/src/workbench/workbench-tokens.css'
document.documentElement.dataset.skin = 'ds'
document.documentElement.dataset.theme = 'claude'
createRoot(document.getElementById('root')!).render(<OverviewPage />)
