const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const esbuild = require('esbuild')
const root = path.resolve(__dirname, '../../../../')
const renderer = path.join(root, 'src/renderer/src')

async function build() {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'preview.tsx')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    charset: 'utf8',
    alias: { '@': renderer },
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  fs.writeFileSync(path.join(__dirname, 'preview.js'), result.outputFiles[0].text)
  const requireTailwind = createRequire(require.resolve('@tailwindcss/vite'))
  const { compile } = requireTailwind('@tailwindcss/node')
  const sourceCss = fs
    .readFileSync(path.join(renderer, 'assets/main.css'), 'utf8')
    .replace(/^@import (?!'tailwindcss'|'tw-animate-css')[^;]+;/gm, '')
  const compiler = await compile(sourceCss, {
    base: path.join(renderer, 'assets'),
    onDependency() {}
  })
  const candidates = new Set()
  for (const file of Object.keys(result.metafile.inputs)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue
    const content = fs.readFileSync(path.resolve(file), 'utf8')
    for (const token of content.matchAll(/[^\s"'`<>]+/g)) candidates.add(token[0])
  }
  const css = compiler
    .build([...candidates])
    .replaceAll("url('./fonts/", "url('../../../../src/renderer/src/assets/fonts/")
    .replaceAll('url("./fonts/', 'url("../../../../src/renderer/src/assets/fonts/')
  fs.writeFileSync(path.join(__dirname, 'preview.css'), css)
  console.log('Refreshed preview from production notification components')
}
build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
