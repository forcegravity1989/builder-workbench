/** Compile-time / env gate for Monica chrome. */
export function isMonicaShell(): boolean {
  try {
    if (import.meta.env.VITE_MONICA_SHELL === '1') {
      return true
    }
  } catch {
    // ignore non-vite hosts
  }
  return false
}
