import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// 用法：node verify-web-build.mjs [webClientRoot]。默认 out/web（独立 web 构建）；
// 打包链传 out/renderer——配对网页直接由 renderer 产物提供（issue #493）。
const root = resolve(process.argv[2] ?? 'out/web')
const indexPath = resolve(root, 'web-index.html')
const html = await readFile(indexPath, 'utf8')

const absoluteAssetReference = /\b(?:src|href)=["']\/assets\//.exec(html)

if (absoluteAssetReference) {
  console.error(
    `Web build must use relative asset URLs for reverse-proxy pairing URLs; found ${absoluteAssetReference[0]} in ${indexPath}`
  )
  process.exit(1)
}

// 入口隔离断言从 project-renderer-web-client.mjs 迁来：任一入口的模块闭包都不得
// 执行其它入口（web-index.html 闭包吞并 index/popout 桌面入口会把桌面代码带进浏览
// 器）。只有 renderer 构建带 .vite/manifest.json；独立 out/web 构建没有 manifest，
// 跳过。
const manifestPath = resolve(root, '.vite', 'manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entryKeys = new Set(
    Object.entries(manifest)
      .filter(([, entry]) => entry?.isEntry === true)
      .map(([key]) => key)
  )

  for (const sourceEntry of entryKeys) {
    const visited = new Set()
    const pending = [sourceEntry]
    while (pending.length > 0) {
      const key = pending.pop()
      if (visited.has(key)) {
        continue
      }
      visited.add(key)
      const entry = manifest[key]
      if (!entry || typeof entry !== 'object') {
        console.error(`Web client manifest is missing entry: ${key}`)
        process.exit(1)
      }
      for (const dependency of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
        if (entryKeys.has(dependency) && dependency !== sourceEntry) {
          console.error(`Renderer entry ${sourceEntry} executes entry ${dependency}`)
          process.exit(1)
        }
        pending.push(dependency)
      }
    }
  }
}
