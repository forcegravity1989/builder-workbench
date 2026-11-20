import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Why the candidate order: dev standalone web builds land in out/web, packaged
// apps only carry out/renderer, and unpacked electron-vite entrypoints set
// appPath to out/main whose parent holds either bundle.
export function findBundledWebClientRoot(appPath: string): string | undefined {
  const roots = [
    join(appPath, 'out', 'web'),
    join(appPath, 'out', 'renderer'),
    join(appPath, '..', 'web'),
    join(appPath, '..', 'renderer')
  ]
  return roots.find((root) => existsSync(join(root, 'web-index.html')))
}
