declare const ORCA_WORKBENCH_SHELL: boolean | undefined

/** Compile-time / env gate for Builders' Workbench chrome. */
export function isWorkbenchShell(): boolean {
  try {
    if (ORCA_WORKBENCH_SHELL === true) {
      return true
    }
  } catch {
    // The compile-time flag is absent in plain Node consumers.
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
