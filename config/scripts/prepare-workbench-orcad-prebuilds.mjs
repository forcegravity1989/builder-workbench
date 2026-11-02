import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { unzipSync } from 'fflate'
import { NODE_RUNTIME_PIN, ORCAD_TEMPLATE_TARGETS } from '../../src/shared/node-runtime-pin.ts'
import { mergeOrcadPrebuildTrees } from './merge-orcad-prebuilds.mjs'

const root = resolve(import.meta.dirname, '../..')
const archiveRoot = join(root, 'native/orcad-prebuilds')
const source = JSON.parse(readFileSync(join(archiveRoot, 'source.json'), 'utf8'))
const require = createRequire(import.meta.url)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

function inside(base, name) {
  const result = resolve(base, name)
  const suffix = relative(base, result)
  if (!suffix || suffix.startsWith('..') || isAbsolute(suffix)) {
    throw new Error(`Invalid prebuild path: ${name}`)
  }
  return result
}

// The mirror is reusable only while the reviewed native inputs remain unchanged.
for (const input of source.sourceInputs) {
  const bytes = Buffer.from(readFileSync(inside(root, input.path), 'utf8').replace(/\r\n/g, '\n'))
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (blob !== input.blob) {
    throw new Error(
      `Orcad native input changed: ${input.path}; review and refresh the pinned prebuilds.`
    )
  }
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const [name, version] of Object.entries(source.dependencies)) {
  if ((pkg.dependencies?.[name] ?? pkg.optionalDependencies?.[name]) !== version) {
    throw new Error(`Orcad native dependency changed: ${name}; refresh the pinned prebuilds.`)
  }
}

const slots = new Set()
for (const [name, version] of Object.entries(source.installedDependencies ?? {})) {
  if (require(`${name}/package.json`).version !== version) {
    throw new Error(`Installed orcad dependency changed: ${name}; refresh the pinned prebuilds.`)
  }
}
const archives = source.artifacts.map((artifact) => {
  const bytes = readFileSync(inside(archiveRoot, artifact.file))
  if (bytes.length !== artifact.bytes || digest(bytes) !== artifact.sha256) {
    throw new Error(`Orcad prebuild archive failed SHA256 verification: ${artifact.file}`)
  }
  const files = unzipSync(bytes)
  for (const name of Object.keys(files)) inside(archiveRoot, name)
  if (artifact.name.startsWith('orcad-prebuild-')) {
    const manifest = JSON.parse(Buffer.from(files['manifest.json'] ?? []).toString('utf8'))
    if (
      manifest.schemaVersion !== 2 ||
      manifest.napi !== 8 ||
      manifest.nodeHeaders !== NODE_RUNTIME_PIN.version ||
      manifest.version !== require('node-pty/package.json').version
    ) {
      throw new Error(`Orcad prebuild ABI does not match this checkout: ${artifact.file}`)
    }
    for (const [slot, entry] of Object.entries(manifest.slots)) {
      if (slots.has(slot)) throw new Error(`Duplicate prebuild slot: ${slot}`)
      slots.add(slot)
      for (const [name, hash] of Object.entries(entry.files)) {
        const file = files[`${slot}/${name}`]
        if (!file || digest(file) !== hash)
          throw new Error(`Invalid prebuild file: ${slot}/${name}`)
      }
    }
  }
  return { artifact, files }
})
for (const target of ORCAD_TEMPLATE_TARGETS) {
  if (!slots.has(target)) throw new Error(`Missing orcad prebuild target: ${target}`)
}

if (!process.argv.includes('--check')) {
  const cacheRoot = join(root, '.build/workbench-orcad-prebuilds', source.sourceCommit)
  const trees = []
  for (const { artifact, files } of archives) {
    const tree = inside(cacheRoot, artifact.name)
    for (const [name, bytes] of Object.entries(files)) {
      if (name.endsWith('/')) continue
      const destination = inside(tree, name)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, bytes)
    }
    if (artifact.name.startsWith('orcad-prebuild-')) {
      trees.push(tree)
    } else {
      const folder = artifact.name.replace(/^orcad-/, '')
      if (!['windows-security', 'windows-process-tree', 'windows-cli-launcher'].includes(folder)) {
        throw new Error(`Unexpected orcad helper archive: ${artifact.name}`)
      }
      for (const name of Object.keys(files).filter((name) => !name.endsWith('/'))) {
        const destination = inside(join(root, '.build', folder), name)
        mkdirSync(dirname(destination), { recursive: true })
        copyFileSync(inside(tree, name), destination)
      }
    }
  }
  // These are dependency outputs owned by this build, never a user project or installed profile.
  mergeOrcadPrebuildTrees(trees, inside(root, 'out/orcad-prebuilds'))
}
console.log(
  `[workbench-orcad-prebuilds] verified ${archives.length} archives, ${slots.size} native slots; no compilation`
)
