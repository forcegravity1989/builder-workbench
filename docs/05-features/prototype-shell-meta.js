// Shared review metadata for static feature prototypes.
// This describes the current BW shell; feature snapshots remain local demo data.
export const CURRENT_BW_SHELL = Object.freeze({
  productName: 'Workbench',
  projectName: 'Builder Workbench',
  source: '现行 Electron / Orca 壳',
  shellLayers: Object.freeze(['标题/拖拽区', 'WorkbenchRail', '原生对象侧栏', '页面内容', '状态栏']),
  sourceFiles: Object.freeze({
    appShell: 'src/renderer/src/app-shell/AppWorkspaceShell.tsx',
    rail: 'src/renderer/src/workbench/WorkbenchRail.tsx',
    projectSidebar: 'src/renderer/src/workbench/WorkbenchSidebarNav.tsx',
    versionSidebar: 'src/renderer/src/workbench/WorkbenchVersionNav.tsx'
  }),
  currentVersionLabel: '当前版本（由 BW 读回）',
  reviewNote: '当前壳复用现行 BW / Orca；版本、任务、目标和指标内容仍是本页示例快照。',
  dataBoundary: '壳元数据来自当前代码；特性成员、任务、版本和指标是演示数据。'
})
