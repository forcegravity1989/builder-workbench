import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '../..')
const topics = ['week-planning', 'version-acceptance', 'metrics-refresh']
const output = path.join(root, 'src/shared/workbench/skill-package.json')

async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Skill source cannot be a link: ${entry.name}`)
    }
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await files(path.join(directory, entry.name), relative)))
    } else {
      result.push(relative)
    }
  }
  return result
}

async function main() {
  const cache = path.join(root, '.bw/runtime/skill-package-build')
  await mkdir(cache, { recursive: true })
  const work = await mkdtemp(path.join(cache, 'build-'))
  if (!path.resolve(work).startsWith(path.resolve(cache) + path.sep)) {
    throw new Error('Unsafe build directory')
  }
  try {
    const hash = createHash('sha256')
    const sources = []
    for (const topic of topics) {
      const sourceRoot = path.join(root, 'standard/skills', topic)
      const projectedRoot = path.join(work, topic)
      const pending = (await files(sourceRoot)).map((relative) => ({
        source: path.join(sourceRoot, relative),
        destination: relative
      }))
      const seen = new Set()
      for (const item of pending) {
        if (seen.has(item.destination)) {
          continue
        }
        seen.add(item.destination)
        let content = await readFile(item.source)
        if (/\.(md|mjs|py|toml|tmpl)$/.test(item.source)) {
          let text = content.toString('utf8').replace(/\r\n?/g, '\n')
          if (item.source.endsWith('.md')) {
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (link, label, target) => {
              if (/^(?:[a-z]+:|#)/i.test(target)) {
                return link
              }
              const [file, anchor] = target.split('#')
              const resolved = path.resolve(path.dirname(item.source), file)
              let destination
              const own = path.relative(sourceRoot, resolved)
              if (!own.startsWith('..') && !path.isAbsolute(own)) {
                destination = own.split(path.sep).join('/')
              } else if (resolved.startsWith(path.join(root, 'standard/references') + path.sep)) {
                destination = `references/shared/${path.basename(resolved)}`
              } else if (resolved === path.join(root, 'standard/templates/metrics.toml.tmpl')) {
                destination = 'assets/metrics.toml.tmpl'
              } else {
                throw new Error(`Dependency escapes Skill: ${item.source} -> ${target}`)
              }
              pending.push({ source: resolved, destination })
              const relative = path.posix.relative(
                path.posix.dirname(item.destination),
                destination
              )
              return `[${label}](${relative}${anchor ? `#${anchor}` : ''})`
            })
          }
          content = Buffer.from(text)
        }
        const target = path.join(projectedRoot, item.destination)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, content)
        hash.update(`${topic}/${item.destination}\0`).update(content)
      }
      sources.push({ id: topic, sourceDirectory: projectedRoot })
    }
    // Native creation verifies the complete file set, stages it and creates the standard archive.
    const builder = path.join(work, 'native-bundle.mjs')
    await build({
      entryPoints: [path.join(root, 'src/main/skills/skill-bundle-creation.ts')],
      outfile: builder,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
      }
    })
    const { createSkillBundleArchive } = await import(pathToFileURL(builder).href)
    const archivePath = path.join(work, 'workbench.tar.gz')
    const bundle = await createSkillBundleArchive({
      sources,
      archivePath,
      packageId: 'workbench-workflows',
      versionId: hash.digest('hex'),
      bundleName: 'workbench-workflows',
      createdAt: '1970-01-01T00:00:00.000Z'
    })
    const content = `${JSON.stringify(
      {
        package: {
          packageId: bundle.manifest.packageId,
          versionId: bundle.manifest.versionId,
          bundleDigest: bundle.manifest.bundleDigest,
          archiveSha256: bundle.archiveSha256,
          compressedBytes: bundle.compressedBytes
        },
        archiveBase64: (await readFile(archivePath)).toString('base64')
      },
      null,
      2
    )}\n`
    if (process.argv.includes('--write')) {
      await writeFile(output, content)
    } else if ((await readFile(output, 'utf8')) !== content) {
      throw new Error('Workbench Skill package is stale; regenerate it.')
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

await main()
