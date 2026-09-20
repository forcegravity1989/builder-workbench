import path from 'node:path'

/** Workbench HMR / trial package env — keeps profile + Dock title off Orca Dev. */
export function isWorkbenchDevEnv(env = process.env) {
  return (
    env.ORCA_PRODUCT_NAME === 'Workbench' ||
    env.WORKBENCH_SHELL === '1' ||
    env.VITE_WORKBENCH_SHELL === '1'
  )
}

export function createDevDockTitle(branch, label, env = process.env) {
  const product = isWorkbenchDevEnv(env) ? 'Workbench' : 'Orca'
  return `${product}: ${branch || label || 'dev'}`
}

export function getDevUserDataPath(env = process.env) {
  if (env.ORCA_DEV_USER_DATA_PATH) {
    return env.ORCA_DEV_USER_DATA_PATH
  }
  const dirName = isWorkbenchDevEnv(env) ? 'workbench-dev' : 'orca-dev'
  if (process.platform === 'darwin') {
    return path.join(env.HOME ?? '', 'Library', 'Application Support', dirName)
  }
  if (process.platform === 'win32') {
    return path.join(env.APPDATA ?? path.join(env.USERPROFILE ?? '', 'AppData', 'Roaming'), dirName)
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(env.HOME ?? '', '.config'), dirName)
}
