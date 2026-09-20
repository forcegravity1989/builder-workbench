/** Compile-time / env gate for Builders' Workbench chrome. */
export function isWorkbenchShell(): boolean {
  try {
    if (import.meta.env.VITE_WORKBENCH_SHELL === '1') {
      return true
    }
  } catch {
    // ignore non-vite hosts
  }
  return false
}
