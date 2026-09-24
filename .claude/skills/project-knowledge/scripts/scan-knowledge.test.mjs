import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scanKnowledge, writeSignals, renderMarkdown, markdownShape } from './scan-knowledge.mjs'

const git = (root, ...args) =>
  execFileSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-C',
      root,
      ...args
    ],
    { stdio: 'ignore' }
  )

async function fixture(t, { withGit = true } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'knowledge-scan-test-'))
  t.after(async () => {
    const resolved = path.resolve(base)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('knowledge-scan-test-'))
    await rm(resolved, { recursive: true, force: true })
  })
  const root = path.join(base, 'repo')
  for (const dir of ['docs/adr', 'docs/mod', 'crates/a/src', 'crates/b/src', 'target']) {
    await mkdir(path.join(root, dir), { recursive: true })
  }
  const duplicate = '重复段落需要明确来源，不能因为内容重复就自动删除。'.repeat(5)
  await writeFile(
    path.join(root, 'AGENTS.md'),
    `# 规则\n\n[指南](docs/guide.md)\n\n[决策](docs/adr/)\n\n[缺失](missing.md)\n\n${duplicate}`
  )
  await writeFile(
    path.join(root, 'docs/guide.md'),
    `# 指南\n\n[模块](mod/)\n\n本特性共 12 条用例，见 #211，2026-01-01 核对。命令 \`run 34 条\` 是契约。\n\n\`\`\`text\n示例里的 99 条不算\n\`\`\`\n\n${
      duplicate
    }`
  )
  await writeFile(path.join(root, 'docs/adr/0001-choice.md'), '# 用 A\n\n我们用 A。\n')
  await writeFile(
    path.join(root, 'docs/adr/0002-other.md'),
    '# 用 B\n\n选 B 不选 C，因为 C 要常驻进程；代价是冷启动慢。\n'
  )
  await writeFile(path.join(root, 'docs/mod/README.md'), '# 模块\n\n说明 </script> | 管道\n')
  await writeFile(path.join(root, 'docs/orphan.md'), '# 没人链接\n')
  await writeFile(path.join(root, 'target/ignored.md'), '# 不计入')
  await writeFile(path.join(root, 'crates/a/src/x.rs'), '// 1')
  await writeFile(path.join(root, 'crates/b/src/y.rs'), '// 1')
  if (withGit) {
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'one')
    await writeFile(path.join(root, 'crates/a/src/x.rs'), '// 2')
    git(root, 'commit', '-q', '-am', 'code only')
    await writeFile(path.join(root, 'crates/b/src/y.rs'), '// 2')
    await writeFile(
      path.join(root, 'docs/guide.md'),
      `${await readFile(path.join(root, 'docs/guide.md'), 'utf8')}\n\n补一句。\n`
    )
    git(root, 'commit', '-q', '-am', 'code and docs')
  }
  const profile = path.join(base, 'profile.json')
  const config = {
    id: 'fixture',
    version: '1',
    include: ['.'],
    entryPoints: ['^AGENTS\\.md$'],
    codeRoots: ['crates'],
    codeAreaDepth: 3,
    largeDocChars: 150,
    tradeoff: { paths: ['^docs/adr/'], pattern: '取舍|不选|代价' },
    drift: [
      { label: '计数', pattern: '\\d+\\s?条' },
      { label: 'PR/Issue 号', pattern: '(?<![\\w&/])#\\d{2,5}\\b' },
      { label: '日期', pattern: '\\b20\\d{2}-\\d{2}-\\d{2}\\b' }
    ]
  }
  await writeFile(profile, JSON.stringify(config))
  return { base, root, profile, config }
}

test('collects deletion, drift and trade-off signals without changing sources', async (t) => {
  const f = await fixture(t)
  const before = await readFile(path.join(f.root, 'AGENTS.md'))
  const result = await scanKnowledge(f)
  const file = (name) => result.files.find((x) => x.file === name)
  assert.equal(result.summary.markdown, 6)
  assert.ok(!result.files.some((x) => x.file.startsWith('target/')))
  assert.deepEqual(result.signals.orphans, ['docs/orphan.md'])
  assert.equal(file('docs/mod/README.md').inbound.length, 1, 'directory link reaches its README')
  assert.equal(
    file('docs/adr/0001-choice.md').viaDirectory.length,
    1,
    'directory listing without README reaches children'
  )
  assert.deepEqual(result.signals.missingTradeoffs, ['docs/adr/0001-choice.md'])
  const drift = Object.fromEntries(file('docs/guide.md').drift.map((d) => [d.label, d.count]))
  assert.deepEqual(
    drift,
    { 计数: 1, 'PR/Issue 号': 1, 日期: 1 },
    'inline code and fenced examples are not drift'
  )
  assert.equal(result.signals.duplicates.length, 1)
  assert.deepEqual(
    result.signals.linkErrors.map((l) => l.target),
    ['missing.md']
  )
  assert.ok(result.signals.large.some((x) => x.file === 'AGENTS.md'))
  assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), before)
})

test('ranks Git hot spots and whether code changes carried documentation', async (t) => {
  const f = await fixture(t)
  const result = await scanKnowledge(f)
  assert.equal(result.git.commits, 3)
  assert.equal(result.files.find((x) => x.file === 'docs/guide.md').churn.commits, 2)
  assert.equal(result.files.find((x) => x.file === 'docs/orphan.md').churn.commits, 1)
  assert.deepEqual(result.git.codeAreas, [
    { area: 'crates/a/src', commits: 2, withDocs: 1 },
    { area: 'crates/b/src', commits: 2, withDocs: 2 }
  ])
  const outside = await scanKnowledge({ ...f, now: new Date(Date.now() + 400 * 86400000) })
  assert.equal(outside.git.commits, 0, 'window excludes old commits')
  assert.ok(outside.files.find((x) => x.file === 'docs/guide.md').churn.lastChanged)
})

test('reports missing Git history as a limit instead of zero churn', async (t) => {
  const f = await fixture(t, { withGit: false })
  const result = await scanKnowledge(f)
  assert.equal(result.git, null)
  assert.equal(result.summary.commits, null)
  assert.ok(result.limits.some((l) => l.includes('Git')))
})

test('writes signals only outside the root and escapes repository text in Markdown', async (t) => {
  const f = await fixture(t)
  const result = await scanKnowledge(f)
  // Keep the caller's original spelling: Windows TEMP can contain an 8.3 alias,
  // while scanKnowledge returns a canonical root. Neither spelling may write in it.
  await assert.rejects(writeSignals(result, path.join(f.root, 'report', 'nested')), /outside/)
  await assert.rejects(readFile(path.join(f.root, 'report', 'nested', 'signals.json')), {
    code: 'ENOENT'
  })
  await assert.rejects(writeSignals(result, path.join(result.root, 'report')), /outside/)
  await writeSignals(result, path.join(f.base, 'report'))
  const markdown = await readFile(path.join(f.base, 'report/signals.md'), 'utf8')
  assert.ok(markdown.includes('docs/orphan.md'))
  const hostile = renderMarkdown({
    ...result,
    signals: { ...result.signals, orphans: [], missingTradeoffs: ['a</script>|b'] }
  })
  assert.ok(hostile.includes('a&lt;/script&gt;\\|b'))
  assert.ok(!hostile.includes('</script>'))
})

test('resolves directory aliases, allows outside reports, and rejects aliases into sources', async (t) => {
  const f = await fixture(t, { withGit: false })
  const alias = path.join(f.base, 'alias')
  await symlink(path.resolve(f.base), alias, process.platform === 'win32' ? 'junction' : 'dir')
  const result = await scanKnowledge({ root: path.join(alias, 'repo'), profile: f.profile })
  await writeSignals(result, path.join(alias, 'external', 'nested'))
  assert.equal(
    JSON.parse(await readFile(path.join(f.base, 'external/nested/signals.json'), 'utf8')).root,
    result.root
  )
  await assert.rejects(
    writeSignals(result, path.join(alias, 'repo', 'report', 'nested')),
    /outside/
  )
  await assert.rejects(readFile(path.join(f.root, 'report/nested/signals.json')), {
    code: 'ENOENT'
  })
})

test('refuses report files hard-linked to sources before writing either output', async (t) => {
  const f = await fixture(t, { withGit: false })
  const result = await scanKnowledge(f)
  const source = path.join(f.root, 'AGENTS.md')
  const before = await readFile(source)
  const out = path.join(f.base, 'hard-link-report')
  await mkdir(out)
  await link(source, path.join(out, 'signals.md'))
  await assert.rejects(writeSignals(result, out), /Unsafe report destination/)
  assert.deepEqual(await readFile(source), before)
  await assert.rejects(readFile(path.join(out, 'signals.json')), { code: 'ENOENT' })
})

test('refuses outside-root includes and does not follow directory links', async (t) => {
  const f = await fixture(t, { withGit: false })
  await writeFile(f.profile, JSON.stringify({ ...f.config, include: ['../'] }))
  await assert.rejects(scanKnowledge(f), /outside root/)
  await writeFile(f.profile, JSON.stringify(f.config))
  const external = path.join(f.base, 'external')
  await mkdir(external)
  await writeFile(path.join(external, 'private.md'), '# Outside')
  await symlink(external, path.join(f.root, 'alias'), 'junction')
  const result = await scanKnowledge(f)
  assert.ok(!result.files.some((x) => x.file.includes('alias')))
  assert.ok(result.skipped.some((x) => x.file === 'alias' && x.reason === 'symbolic-link'))
  await symlink(f.root, path.join(f.base, 'out-alias'), 'junction')
  await assert.rejects(writeSignals(result, path.join(f.base, 'out-alias/report')), /outside/)
})

test('fenced examples are excluded from headings and paragraphs', () => {
  const shape = markdownShape(
    '# Title\n\n```md\n## fake\n| A | B |\n```\n\nReal paragraph with `code 3 条`'
  )
  assert.equal(shape.headings.length, 1)
  assert.equal(shape.paragraphs.length, 1)
  assert.ok(!shape.prose.join('\n').includes('3 条'))
})

test('--check writes reviewable signals and fails on mechanical errors; normal scan succeeds', async (t) => {
  const f = await fixture(t)
  const cli = fileURLToPath(new URL('./scan-knowledge.mjs', import.meta.url))
  const args = [
    cli,
    '--root',
    f.root,
    '--profile',
    f.profile,
    '--out',
    path.join(f.base, 'cli-report'),
    '--days',
    '30'
  ]
  const normal = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(normal.status, 0, normal.stderr)
  const gate = spawnSync(process.execPath, [...args, '--check'], { encoding: 'utf8' })
  assert.equal(gate.status, 1, gate.stderr)
  assert.equal(
    JSON.parse(await readFile(path.join(f.base, 'cli-report/signals.json'), 'utf8')).summary
      .linkErrors,
    1
  )
  const bad = spawnSync(process.execPath, [...args.slice(0, -2), '--days', '0'], {
    encoding: 'utf8'
  })
  assert.equal(bad.status, 2)
})
