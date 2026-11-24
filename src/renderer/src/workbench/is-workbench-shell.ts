declare const ORCA_WORKBENCH_SHELL: boolean | undefined

/** Compile-time / env gate for Builders' Workbench chrome. */
export function isWorkbenchShell(): boolean {
  if (typeof ORCA_WORKBENCH_SHELL !== 'undefined' && ORCA_WORKBENCH_SHELL) {
    return true
  }
  try {
    if (import.meta.env.VITE_WORKBENCH_SHELL === '1') {
      return true
    }
  } catch {
    // ignore non-vite hosts
  }
  return false
}
