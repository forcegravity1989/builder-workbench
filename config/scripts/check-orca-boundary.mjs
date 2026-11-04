import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const REGISTRY_PATH = 'ref/orca-differences.json'
const SCOPES = [
  'src',
  'native',
  'config',
  'resources',
  'skills',
  'skill-guides',
  'skill-stubs',
  'tests',
  '.github',
  '.husky',
  '.mcp.json',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'components.json',
  'opencode.json',
  'orca.yaml',
  'tsconfig.json',
  'cloud',
  'Casks',
  'examples',
  '.gitattributes',
  '.gitignore',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'electron.vite.config.ts',
  'vite.web.config.ts'
]
const OVERLAYS = [
  'src/main/workbench/',
  'src/relay/workbench/',
  'src/renderer/src/workbench/',
  'src/shared/workbench/'
]
const CATEGORIES = new Set([
  'native-fix',
  'native-enhancement',
  'business-integration',
  'bw-owned',
  'data-and-host',
  'product-identity',
  'product-scope',
  'toolchain'
])

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  }).trimEnd()
}

export function isBoundaryPath(file) {
  return (
    SCOPES.some((scope) => file === scope || file.startsWith(`${scope}/`)) &&
    !OVERLAYS.some((prefix) => file.startsWith(prefix))
  )
}

function validPath(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !path.isAbsolute(file) &&
    !file.split('/').includes('..') &&
    !/[\\*?\r\n\0]/.test(file)
  )
}

export function readDifferences(root, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new Error('Orca baseline must be a full, fixed commit SHA.')
  }
  try {
    git(root, ['cat-file', '-e', `${commit}^{commit}`])
  } catch {
    throw new Error(
      `Missing Orca baseline ${commit}; fetch the registered baseline before checking.`
    )
  }
  if (git(root, ['ls-files', '-u'])) {
    throw new Error('Resolve the merge conflicts before checking the Orca boundary.')
  }
  const raw = git(root, [
    'diff',
    '--raw',
    '--no-abbrev',
    '--no-renames',
    '-z',
    commit,
    '--',
    ...SCOPES
  ]).split('\0')
  const modes = new Map()
  for (let index = 0; index + 1 < raw.length; index += 2) {
    modes.set(raw[index + 1], raw[index].split(' ')[1])
  }
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...SCOPES])
  const files = [
    ...new Set([...modes.keys(), ...untracked.split('\0')].filter(isBoundaryPath))
  ].sort()
  for (const file of files) {
    if (!validPath(file)) {
      throw new Error(`Unsupported source path: ${JSON.stringify(file)}`)
    }
  }
  const stats = new Map(
    files.map((file) => [file, fs.lstatSync(path.resolve(root, file), { throwIfNoEntry: false })])
  )
  const symlinks = files.filter((file) => stats.get(file)?.isSymbolicLink())
  const present = files.filter((file) => stats.get(file) && !stats.get(file).isSymbolicLink())
  // One Git process applies the repository's clean/EOL rules to all paths;
  // spawning Git once per patch makes the gate needlessly slow on Windows.
  const hashes = present.length
    ? git(root, ['hash-object', '--stdin-paths'], {
        input: `${present.map((file) => JSON.stringify(file)).join('\n')}\n`
      }).split('\n')
    : []
  if (hashes.length !== present.length) {
    throw new Error('Incomplete native source hashing.')
  }
  const blobs = new Map(present.map((file, index) => [file, hashes[index]]))
  for (const file of symlinks) {
    blobs.set(
      file,
      git(root, ['hash-object', '--stdin'], { input: fs.readlinkSync(path.resolve(root, file)) })
    )
  }
  const trackExecutable = git(root, ['config', '--bool', 'core.filemode']) === 'true'
  return files.map((file) => ({
    path: file,
    mode:
      modes.get(file) ??
      (stats.get(file)?.isSymbolicLink()
        ? '120000'
        : trackExecutable && stats.get(file)?.mode & 0o111
          ? '100755'
          : '100644'),
    // Deletion is an intentional difference, not an exemption from registration.
    blob: blobs.get(file) ?? null
  }))
}

export function checkRegistry(root, registry, differences) {
  const errors = []
  // Mobile is a removed product, not a directory where new patches are exempt.
  if (fs.existsSync(path.join(root, 'mobile'))) {
    errors.push('REMOVE mobile/: the Mobile product is outside the BW product scope.')
  }
  if (registry.version !== 1) {
    errors.push('Unsupported registry version.')
  }
  const cases = new Map()
  for (const item of registry.cases ?? []) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.id ?? '') || cases.has(item.id)) {
      errors.push(`Invalid or duplicate case: ${item.id}`)
    }
    cases.set(item.id, item)
    if (!CATEGORIES.has(item.category)) {
      errors.push(`${item.id}: unknown category.`)
    }
    for (const key of ['useCase', 'reason', 'retireWhen']) {
      if (typeof item[key] !== 'string' || !item[key].trim()) {
        errors.push(`${item.id}: missing ${key}.`)
      }
    }
    if (!Array.isArray(item.checks) || item.checks.length === 0) {
      errors.push(`${item.id}: specify the existing test or acceptance specification.`)
    }
    for (const check of item.checks ?? []) {
      if (
        !validPath(check) ||
        !fs.statSync(path.resolve(root, check), { throwIfNoEntry: false })?.isFile()
      ) {
        errors.push(`${item.id}: missing check/specification ${check}.`)
      }
    }
  }
  const registered = new Map()
  const usedCases = new Set()
  for (const item of registry.files ?? []) {
    if (!validPath(item.path) || !isBoundaryPath(item.path) || registered.has(item.path)) {
      errors.push(`Invalid, out-of-scope or duplicate path: ${item.path}`)
    }
    registered.set(item.path, item)
    if (item.blob !== null && !/^[0-9a-f]{40}$/.test(item.blob ?? '')) {
      errors.push(`${item.path}: blob must be a reviewed Git blob SHA, or null for deletion.`)
    }
    if (!['000000', '100644', '100755', '120000'].includes(item.mode)) {
      errors.push(`${item.path}: record its reviewed Git file mode.`)
    }
    if (!Array.isArray(item.cases) || item.cases.length === 0) {
      errors.push(`${item.path}: no use-case association.`)
    }
    for (const id of item.cases ?? []) {
      if (!cases.has(id)) {
        errors.push(`${item.path}: unknown case ${id}.`)
      }
      usedCases.add(id)
    }
  }
  const current = new Set()
  for (const item of differences) {
    current.add(item.path)
    const recorded = registered.get(item.path)
    if (!recorded) {
      errors.push(`REGISTER ${item.path}: native difference has no use case.`)
    } else if (recorded.blob !== item.blob || recorded.mode !== item.mode) {
      errors.push(`REVIEW ${item.path}: content changed; review its use cases and recorded blob.`)
    }
  }
  for (const file of registered.keys()) {
    if (!current.has(file)) {
      errors.push(`RETIRE ${file}: no longer differs from the native baseline.`)
    }
  }
  for (const id of cases.keys()) {
    if (!usedCases.has(id)) {
      errors.push(`RETIRE ${id}: no current native difference uses this case.`)
    }
  }
  return errors
}

export function run(root, report = false) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'))
  const differences = readDifferences(root, registry.upstream?.commit)
  if (report) {
    // A report is evidence for review, never an automatic approval or registry update.
    process.stdout.write(`${JSON.stringify(differences, null, 2)}\n`)
    return 0
  }
  const errors = checkRegistry(root, registry, differences)
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`)
    return 1
  }
  process.stdout.write(
    `Orca boundary: ${differences.length} registered paths / ${registry.cases.length} use cases; baseline ${registry.upstream.commit}.\n`
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = run(process.cwd(), process.argv.includes('--report'))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
