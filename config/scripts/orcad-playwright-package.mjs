import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import {
  ORCAD_PLAYWRIGHT_PACKAGE_FILES,
  ORCAD_PLAYWRIGHT_VERSION
} from '../../src/shared/orcad-artifacts.ts'

export function stageOrcadPlaywright(root, outputDir) {
  const require = createRequire(join(root, 'package.json'))
  const packageRoot = dirname(require.resolve('playwright-core/package.json'))
  const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  const files = readdirSync(packageRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(packageRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    // pnpm may materialize optional peer links here; they are not Playwright's published files.
    .filter((file) => !file.startsWith('node_modules/'))
    .sort()
  if (
    version !== ORCAD_PLAYWRIGHT_VERSION ||
    JSON.stringify(files) !== JSON.stringify(ORCAD_PLAYWRIGHT_PACKAGE_FILES)
  ) {
    throw new Error('Review the Orcad Playwright file manifest when upgrading playwright-core')
  }
  // Preserve lazy CDP/Electron/BiDi boundaries and package-relative assets instead of rebundling.
  for (const file of files) {
    const destination = join(outputDir, 'node_modules/playwright-core', file)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(packageRoot, file), destination)
  }
}
