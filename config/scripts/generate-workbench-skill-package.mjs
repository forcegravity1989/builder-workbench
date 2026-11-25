import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '../..')
const workflowTopics = ['week-planning', 'version-acceptance', 'metrics-refresh']
const featureMatrix = path.join(root, 'docs/05-features/README.md')
const feedbackScripts = [
  'codex-session-feedback.mjs',
  'claude-session-feedback.mjs',
  'cursor-session-feedback.mjs',
  'workflow-feedback-report.mjs'
]
const packages = [
  {
    id: 'workbench-workflows',
    topics: workflowTopics.map((id) => ({ id, source: `standard/skills/${id}` })),
    output: 'skill-package.json'
  },
  {
    id: 'workbench-improvement',
    topics: [{ id: 'improve-workbench', source: '.claude/skills/improve-workbench' }],
    output: 'improvement-skill-package.json'
  }
]

async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
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

async function generatePackage({ id, topics, output: fileName }) {
  const output = path.join(root, 'src/shared/workbench', fileName)
  const cache = path.join(root, '.bw/runtime/skill-package-build')
  await mkdir(cache, { recursive: true })
  const work = await mkdtemp(path.join(cache, 'build-'))
  if (!path.resolve(work).startsWith(path.resolve(cache) + path.sep)) {
    throw new Error('Unsafe build directory')
  }
  try {
    const hash = createHash('sha256')
    const sources = []
    for (const { id: topic, source } of topics) {
      const sourceRoot = path.join(root, source)
      const projectedRoot = path.join(work, topic)
      const pending = (await files(sourceRoot)).map((relative) => ({
        source: path.join(sourceRoot, relative),
        destination: relative
      }))
      if (topic === 'improve-workbench') {
        for (const script of feedbackScripts) {
          pending.push({
            source: path.join(root, '.claude/skills/workbench-start/scripts', script),
            destination: `scripts/${script}`
          })
        }
      }
      const seen = new Set()
      for (const item of pending) {
        if (seen.has(item.destination)) {
          continue
        }
        seen.add(item.destination)
        let content = await readFile(item.source)
        if (/\.(md|html|mjs|py|toml|tmpl)$/.test(item.source)) {
          let text = content.toString('utf8').replace(/\r\n?/g, '\n')
          if (item.source.endsWith('.md')) {
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (link, label, target) => {
              if (/^(?:[a-z]+:|#)/i.test(target)) {
                return link
              }
              const [file, anchor] = target.split('#')
              const resolved = path.resolve(path.dirname(item.source), file)
              if (item.source === featureMatrix && resolved.startsWith(root + path.sep)) {
                // The matrix is the local classification reference. Detailed specs stay in the
                // owning repository instead of pulling the whole documentation graph into the pack.
                const sourcePath = path.relative(root, resolved).split(path.sep).join('/')
                return `[${label}](https://github.com/forcegravity1989/builder-workbench/blob/main/${sourcePath}${anchor ? `#${anchor}` : ''})`
              }
              let destination
              const own = path.relative(sourceRoot, resolved)
              if (!own.startsWith('..') && !path.isAbsolute(own)) {
                destination = own.split(path.sep).join('/')
              } else if (resolved.startsWith(path.join(root, 'standard/references') + path.sep)) {
                destination = `references/shared/${path.basename(resolved)}`
              } else if (resolved === path.join(root, 'standard/templates/metrics.toml.tmpl')) {
                destination = 'assets/metrics.toml.tmpl'
              } else if (topic === 'improve-workbench' && resolved === featureMatrix) {
                destination = 'references/bw-feature-matrix.md'
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
      // Scripts run through their declared interpreter; package modes must not depend on the build OS.
      sources.push({ id: topic, sourceDirectory: projectedRoot, executablePaths: new Set() })
    }
    // Native creation verifies the complete file set, stages it and creates the standard archive.
    const builder = path.join(work, 'native-bundle.mjs')
    await build({
      entryPoints: [path.join(root, 'src/main/skills/bundle-archive/skill-bundle-creation.ts')],
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
      packageId: id,
      versionId: hash.digest('hex'),
      bundleName: id,
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
      const previous = JSON.parse(await readFile(output, 'utf8'))
      throw new Error(
        `Workbench Skill package is stale; regenerate it. Stored identity: ${JSON.stringify(previous.package)}; generated identity: ${JSON.stringify(JSON.parse(content).package)}`
      )
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

for (const definition of packages) {
  await generatePackage(definition)
}
