import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (root, args, input) =>
  execFileSync('git', ['-C', root, ...args], { input, maxBuffer: 32 * 1024 * 1024 })

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) {
    return 'image/gif'
  }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    return 'image/webp'
  }
  throw new Error('文件不是支持的 PNG/JPEG/GIF/WebP 图片')
}

export function createEvidenceTree(root, repo, branch, files) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('repo 应为 OWNER/REPO')
  }
  if (!branch.startsWith('shots/')) {
    throw new Error('证据分支必须位于 shots/')
  }
  git(root, ['check-ref-format', `refs/heads/${branch}`])
  const remote = git(root, ['remote', 'get-url', 'origin'])
    .toString()
    .trim()
    .replace(/\.git$/, '')
  if (
    remote
      .match(
        /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+)$/
      )?.[1]
      .toLowerCase() !== repo.toLowerCase()
  ) {
    throw new Error('repo 与 origin 不一致')
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('manifest.files 不能为空')
  }
  const names = new Set()
  const images = files.map(({ file, name }) => {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|jpg|jpeg|gif|webp)$/i.test(name) ||
      names.has(name.toLowerCase())
    ) {
      throw new Error('图片名称须唯一且仅含字母、数字、点、横线和下划线')
    }
    names.add(name.toLowerCase())
    const bytes = readFileSync(file)
    const type = imageType(bytes)
    const blob = git(root, ['hash-object', '-w', '--stdin'], bytes).toString().trim()
    return { name, type, sha256: digest(bytes), blob }
  })
  // Binary NUL records avoid Windows text-mode CRLF becoming part of Git filenames.
  const tree = git(
    root,
    ['mktree', '-z'],
    Buffer.from(images.map((i) => `100644 blob ${i.blob}\t${i.name}\0`).join(''))
  )
    .toString()
    .trim()
  const ref = `refs/heads/${branch}`
  let old = null
  try {
    old = git(root, ['rev-parse', '--verify', '--quiet', ref]).toString().trim()
  } catch {
    /* new branch */
  }
  const sameTree =
    old &&
    git(root, ['rev-parse', `${old}^{tree}`])
      .toString()
      .trim() === tree
  const sha = sameTree
    ? old
    : git(root, [
        'commit-tree',
        tree,
        ...(old ? ['-p', old] : []),
        '-m',
        'Publish PR screenshot evidence'
      ])
        .toString()
        .trim()
  git(root, ['update-ref', ref, sha, old ?? '0'.repeat(sha.length)])
  return {
    repo,
    branch,
    sha,
    published: false,
    images: images.map(({ blob: _blob, ...i }) => ({
      ...i,
      url: `https://github.com/${repo}/raw/${sha}/${i.name}`
    }))
  }
}

export async function checkImages(images, request = fetch) {
  if (!images.length) {
    throw new Error('没有找到待检查的图片')
  }
  const checks = []
  for (const image of images) {
    const url = new URL(image.url)
    if (
      url.protocol !== 'https:' ||
      !['github.com', 'raw.githubusercontent.com', 'camo.githubusercontent.com'].includes(
        url.hostname
      )
    ) {
      throw new Error('只检查 GitHub 图片或其图片代理')
    }
    const response = await request(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      throw new Error(`图片 HTTP ${response.status}: ${image.url}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    const type = imageType(bytes)
    if (response.headers.get('content-type')?.split(';')[0] !== type) {
      throw new Error(`图片响应类型不匹配: ${image.url}`)
    }
    if (image.sha256 && digest(bytes) !== image.sha256) {
      throw new Error(`远端图片内容不匹配: ${image.url}`)
    }
    checks.push({ url: image.url, status: response.status, type, sha256: digest(bytes) })
  }
  return checks
}

export function commentImageUrls(html) {
  return [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => ({
    url: match[1].replaceAll('&amp;', '&')
  }))
}

function options(args) {
  const result = {}
  while (args.length) {
    const key = args.shift()
    if (key === '--push') {
      result.push = true
      continue
    }
    if (
      !['--root', '--repo', '--branch', '--manifest', '--out', '--comment'].includes(key) ||
      !args.length
    ) {
      throw new Error(
        'publish: --root 仓根 --repo OWNER/REPO --branch shots/分支 --manifest 文件 --out 文件 [--push]；check: --comment GitHub评论URL --out 文件'
      )
    }
    result[key.slice(2)] = args.shift()
  }
  return result
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const o = options(args)
  if (!o.out) {
    throw new Error('需要 --out 保存检查结果')
  }
  const out = path.resolve(o.out)
  const save = (value) => {
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`)
  }
  if (command === 'publish') {
    if (!o.root || !o.manifest || !o.repo || !o.branch) {
      throw new Error('publish 缺少 root/manifest/repo/branch')
    }
    const manifest = path.resolve(o.manifest)
    const files = JSON.parse(readFileSync(manifest, 'utf8')).files.map((item) => ({
      ...item,
      file: path.resolve(path.dirname(manifest), item.file)
    }))
    if ([manifest, ...files.map((i) => i.file)].includes(out)) {
      throw new Error('输出不能覆盖输入')
    }
    const result = createEvidenceTree(path.resolve(o.root), o.repo, o.branch, files)
    save(result)
    if (o.push) {
      git(o.root, ['push', 'origin', `refs/heads/${o.branch}`])
      result.published = true
      result.checks = await checkImages(result.images)
      save(result)
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }
  if (command !== 'check' || !o.comment) {
    throw new Error('子命令为 publish 或 check')
  }
  const url = new URL(o.comment)
  const parts = url.pathname.match(/^\/([\w.-]+\/[^/]+)\/(pull|issues)\/\d+$/)
  const id = url.hash.match(/^#issuecomment-(\d+)$/)?.[1]
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !parts || !id) {
    throw new Error('需要完整 GitHub PR 评论 URL')
  }
  const comment = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        '-H',
        'Accept: application/vnd.github.full+json',
        `repos/${parts[1]}/issues/comments/${id}`
      ],
      { encoding: 'utf8' }
    )
  )
  const number = url.pathname.split('/').at(-1)
  if (comment.issue_url !== `https://api.github.com/repos/${parts[1]}/issues/${number}`) {
    throw new Error('评论不属于指定 PR')
  }
  const checks = await checkImages(commentImageUrls(comment.body_html ?? ''))
  save({ comment: o.comment, checkedAt: new Date().toISOString(), checks })
  console.log(`已检查评论渲染的 ${checks.length} 张图片`)
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
