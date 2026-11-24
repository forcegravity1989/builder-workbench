const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')

const repo = path.resolve(__dirname, '../../../..')
const renderer = path.join(repo, 'src/renderer/src')
const output = path.join(__dirname, 'dist')
const fixtureStore = path.join(__dirname, 'fixture-store.js')

function resolveDependencies() {
  const check = root => {
    const from = createRequire(path.join(root, 'package.json'))
    try {
      from.resolve('esbuild')
      from.resolve('@tailwindcss/vite')
      return { root, from }
    } catch {
      return null
    }
  }
  const local = check(repo)
  if (local) return local
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: repo,
      encoding: 'utf8'
    }).trim()
    const shared = check(path.dirname(common))
    if (shared) return shared
  } catch {
    // The task worktree may have already moved or may be an exported source tree.
  }
  throw new Error('该原型需要仓库已有的 esbuild、Tailwind 和 React 依赖。请从已准备开发依赖的 checkout 构建。')
}

async function build() {
  const { root: dependencyRoot, from } = resolveDependencies()
  const esbuild = from('esbuild')
  const result = await esbuild.build({
    absWorkingDir: __dirname,
    entryPoints: ['entry.tsx'],
    outdir: output,
    entryNames: 'preview',
    assetNames: 'assets/[name]-[hash]',
    bundle: true,
    minify: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    charset: 'utf8',
    metafile: true,
    nodePaths: [path.join(dependencyRoot, 'node_modules')],
    alias: { '@': renderer },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.platform': '"win32"',
      'process.env.WORKBENCH_SHELL': '"1"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.VITE_WORKBENCH_SHELL': '"1"',
      'import.meta.env.VITE_EXPOSE_STORE': 'false',
      'import.meta.env.MODE': '"production"',
      'import.meta.hot': 'undefined'
    },
    loader: {
      '.svg': 'dataurl', '.png': 'file', '.webp': 'file', '.jpg': 'file',
      '.jpeg': 'file', '.gif': 'file', '.css': 'empty', '.woff2': 'file'
    },
    plugins: [{
      name: 'prototype-only-store',
      setup(build) {
        build.onLoad({ filter: /SidebarFeedbackDialog\.tsx$/ }, request => {
          const original = fs.readFileSync(request.path, 'utf8')
          const anchor = '</DialogHeader>'
          if (!original.includes(anchor)) throw new Error('Feedback dialog extension anchor changed')
          const slot = path.join(__dirname, 'FeedbackCapture.tsx').split(path.sep).join('/')
          return {
            contents: `import { FeedbackCaptureSlot } from ${JSON.stringify(slot)};\n` + original.replace(anchor, `${anchor}<FeedbackCaptureSlot />`),
            loader: 'tsx', resolveDir: path.dirname(request.path)
          }
        })
        build.onResolve({ filter: /store/ }, request => {
          if (
            request.path === '@/store' ||
            (request.path.startsWith('.') && /[/\\]store(?:[/\\]index(?:\.ts)?)?$/.test(request.path))
          ) return { path: fixtureStore }
        })
      }
    }]
  })

  const requireTailwind = createRequire(from.resolve('@tailwindcss/vite'))
  const { compile } = requireTailwind('@tailwindcss/node')
  const assets = path.join(renderer, 'assets')
  const sourceCss = fs.readFileSync(path.join(assets, 'main.css'), 'utf8')
    .replace(/^@import (?!'tailwindcss'|'tw-animate-css')[^;]+;/gm, '')
  const compiler = await compile(sourceCss, {
    base: path.join(dependencyRoot, 'src/renderer/src/assets'),
    onDependency() {}
  })
  const candidates = new Set()
  const inputs = []
  const visibleComponents = new Set([
    'WorkbenchRail.tsx', 'TitlebarMainStrip.tsx', 'WindowControls.tsx', 'TerminalTabLeadingIcon.tsx', 'SidebarFeedbackDialog.tsx',
    'NewWorkspaceComposerCard.tsx', 'NativeChatMessageRow.tsx', 'NativeChatComposerField.tsx'
  ])
  for (const file of Object.keys(result.metafile.inputs)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue
    const absolute = path.resolve(__dirname, file)
    const source = fs.readFileSync(absolute, 'utf8')
    for (const token of source.matchAll(/[^\s"'\x60<>]+/g)) candidates.add(token[0])
    if (visibleComponents.has(path.basename(absolute))) {
      inputs.push({
        path: path.relative(repo, absolute).split(path.sep).join('/'),
        sha256: crypto.createHash('sha256').update(source).digest('hex')
      })
    }
  }

  fs.mkdirSync(output, { recursive: true })
  for (const file of result.outputFiles) {
    fs.mkdirSync(path.dirname(file.path), { recursive: true })
    fs.writeFileSync(file.path, file.contents)
  }
  fs.cpSync(path.join(assets, 'fonts'), path.join(output, 'fonts'), { recursive: true })
  fs.writeFileSync(path.join(output, 'preview.css'), compiler.build([...candidates]))
  fs.copyFileSync(path.join(renderer, 'workbench/workbench-tokens.css'), path.join(output, 'workbench-tokens.css'))
  fs.copyFileSync(from.resolve('react-grab/styles.css'), path.join(output, 'react-grab.css'))
  fs.writeFileSync(path.join(output, 'component-manifest.json'), JSON.stringify({ inputs, adaptations: ['SidebarFeedbackDialog: prototype-only FeedbackCaptureSlot after DialogHeader; original source remains unchanged', 'Workspace chrome: native leaf controls with static disabled tab/command positioning context'] }, null, 2) + '\n')
}

build().catch(error => {
  console.error(error)
  process.exitCode = 1
})
