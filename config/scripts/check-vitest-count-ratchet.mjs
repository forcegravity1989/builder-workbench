import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Ratchet gate for the BW-overlay vitest case count (AGENTS 提交前门禁 / 02 环 4).
//
// 环 4 keeps only two kinds of unit tests: core-algorithm pure derivations and
// E2E-critical data protocols. The overlay suite's TOTAL executed case count is
// frozen in config/vitest-count-baseline.txt and may only shrink. Adding a case
// requires offsetting deletion(s) in the same delivery — the count never grows.
//
// The count comes from vitest's JSON reporter (executed cases, `it.each`
// expansions included, skipped/todo included — skipping does not free budget),
// not from parsing declarations, so parameterized growth cannot sneak past.
// The ratchet does not police itself: this script and its own test live outside
// the counted suite directories.

const BASELINE_PATH = 'config/vitest-count-baseline.txt'
export const SUITE_DIRS = [
  'src/main/workbench',
  'src/relay/workbench',
  'src/renderer/src/workbench',
  'src/shared/workbench'
]

export function parseBaseline(text) {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  const [key, n] = line ? line.split(/\s+/) : []
  if (key !== 'workbench' || !/^\d+$/.test(n ?? '')) {
    return null
  }
  return Number(n)
}

export function baselineText(count) {
  const header = [
    '# BW 叠层 vitest 总执行例数 ratchet（环 4：全局一个数，只减不增，新增先对冲）。',
    '# 范围：src/{main,relay,renderer/src,shared}/workbench 套件实际执行例数（含 it.each 展开与 skip/todo）。',
    '# 核对：pnpm check:vitest-count-ratchet　收紧（只降不升）：--prune　初始化：--init',
    '# 依据：AGENTS.md 提交前门禁、docs/01-principles/02-working-backwards.md 环 4（2026-09-30 拍板）。',
    ''
  ].join('\n')
  return `${header}workbench ${count}\n`
}

export function areaOf(relPath) {
  if (relPath.startsWith('src/main/')) {
    return 'main'
  }
  if (relPath.startsWith('src/relay/')) {
    return 'relay'
  }
  if (relPath.startsWith('src/renderer/')) {
    return 'renderer'
  }
  return 'shared'
}

export function summarize(report, root) {
  const perArea = { main: 0, relay: 0, renderer: 0, shared: 0 }
  const perFile = []
  for (const f of report.testResults ?? []) {
    const rel = path.relative(root, f.name).split(path.sep).join('/')
    const n = (f.assertionResults ?? []).length
    perFile.push({ rel, n })
    perArea[areaOf(rel)] += n
  }
  perFile.sort((a, b) => b.n - a.n || a.rel.localeCompare(b.rel))
  return {
    total: report.numTotalTests ?? 0,
    failed: report.numFailedTests ?? 0,
    perArea,
    perFile
  }
}

export function compare(total, baseline) {
  if (total > baseline) {
    return 'over'
  }
  if (total < baseline) {
    return 'under'
  }
  return 'ok'
}

function runSuite(root, reportPath) {
  const vitestCli = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
  const args = [
    vitestCli,
    'run',
    '--config',
    'config/vitest.config.ts',
    ...SUITE_DIRS,
    '--reporter=json',
    `--outputFile=${reportPath}`
  ]
  // Why serial on Windows: 8GB dev machines OOM with parallel workers on this suite.
  if (process.platform === 'win32') {
    args.push('--no-file-parallelism')
  }
  try {
    execFileSync(process.execPath, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
    return true
  } catch {
    return false // test failures; the JSON report is still read for the count summary
  }
}

function printSummary(s, elapsedMs, baseline) {
  console.log(
    `vitest count: ${s.total} executed case(s) in ${s.perFile.length} file(s), ${(elapsedMs / 1000).toFixed(1)}s`
  )
  console.log(
    `  by area: main ${s.perArea.main} · relay ${s.perArea.relay} · renderer ${s.perArea.renderer} · shared ${s.perArea.shared}`
  )
  if (baseline !== null) {
    console.log(`  baseline: ${baseline} (ratchet: only shrinks; additions must be offset)`)
  }
  console.log('  top files:')
  for (const f of s.perFile.slice(0, 10)) {
    console.log(`    ${String(f.n).padStart(4)}  ${f.rel}`)
  }
}

function printOverFailure(s, baseline) {
  console.error(`::error::vitest count ratchet: ${s.total} > baseline ${baseline}`)
  console.error('')
  console.error('╭────────────────────────────────────────────────────────────────────────────╮')
  console.error('│  ❌  vitest 总量 ratchet 超限 — 叠层套件例数高于基线。                        │')
  console.error('╰────────────────────────────────────────────────────────────────────────────╯')
  console.error('')
  console.error(`  当前 ${s.total} 例 > 基线 ${baseline} 例（+${s.total - baseline}）。`)
  console.error('  环 4：单测只立两类看护（核心算法推导 / E2E 强相关数据协议）；')
  console.error('  总量只减不增。新增用例必须在同一交付内删掉至少同数量的存量用例（对冲），')
  console.error('  并在 PR 正文说明新增属于正清单哪一类、对冲删了哪些。')
  console.error('')
  console.error('  ✅  Fix it: 删掉负面清单存量（UI 渲染/文案/交互序列/装配例）对冲，')
  console.error(`      或撤销新增。基线文件不接受调大：${BASELINE_PATH}`)
  console.error('')
}

function printUnderFailure(s, baseline) {
  console.error(`::error::vitest count baseline is stale: ${s.total} < ${baseline}`)
  console.error('')
  console.error('╭────────────────────────────────────────────────────────────────────────────╮')
  console.error('│  ⚠️  例数低于基线 — 削减做得好，但基线必须跟着收紧。                          │')
  console.error('╰────────────────────────────────────────────────────────────────────────────╯')
  console.error('')
  console.error(`  当前 ${s.total} 例 < 基线 ${baseline} 例（-${baseline - s.total}）。`)
  console.error('  基线只减不增；不收紧就等于把额度还回去，ratchet 失效。')
  console.error('')
  console.error('  ✅  Fix it (one command):  pnpm check:vitest-count-ratchet --prune')
  console.error('')
}

export function main(root = process.cwd()) {
  const baselineFile = path.join(root, BASELINE_PATH)
  if (!fs.existsSync(baselineFile)) {
    console.error(
      `::error::Missing ${BASELINE_PATH}. Generate it with: node config/scripts/check-vitest-count-ratchet.mjs --init`
    )
    return 1
  }
  const baseline = parseBaseline(fs.readFileSync(baselineFile, 'utf8'))
  if (baseline === null) {
    console.error(`::error::Unparseable ${BASELINE_PATH} — expected a "workbench <count>" line.`)
    return 1
  }
  const reportPath = path.join(os.tmpdir(), `vitest-count-ratchet-${process.pid}.json`)
  const started = Date.now()
  const green = runSuite(root, reportPath)
  const elapsed = Date.now() - started
  let report
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  } catch (reason) {
    console.error(
      `::error::vitest JSON report missing/unreadable at ${reportPath}: ${reason instanceof Error ? reason.message : String(reason)}`
    )
    return 1
  } finally {
    try {
      fs.rmSync(reportPath, { force: true })
    } catch {
      /* best effort */
    }
  }
  const s = summarize(report, root)
  printSummary(s, elapsed, baseline)
  if (!green || s.failed > 0) {
    console.error('')
    console.error(
      `::error::vitest count ratchet: suite is not green (${s.failed} failed case(s)) — fix failures first; a red suite cannot certify the count.`
    )
    return 1
  }
  const verdict = compare(s.total, baseline)
  if (verdict === 'over') {
    console.error('')
    printOverFailure(s, baseline)
    return 1
  }
  if (verdict === 'under') {
    console.error('')
    printUnderFailure(s, baseline)
    return 1
  }
  console.log(`vitest count ratchet OK — ${s.total} case(s), exactly at baseline.`)
  return 0
}

function writeBaseline(root, count) {
  fs.writeFileSync(path.join(root, BASELINE_PATH), baselineText(count))
}

function measure(root) {
  const reportPath = path.join(os.tmpdir(), `vitest-count-ratchet-${process.pid}.json`)
  const started = Date.now()
  const green = runSuite(root, reportPath)
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  try {
    fs.rmSync(reportPath, { force: true })
  } catch {
    /* best effort */
  }
  const s = summarize(report, root)
  printSummary(s, Date.now() - started, null)
  if (!green || s.failed > 0) {
    console.error(`::error::suite not green (${s.failed} failed) — refusing to record a baseline.`)
    process.exit(1)
  }
  return s.total
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd()
  const arg = process.argv[2]
  if (arg === '--init') {
    const total = measure(root)
    writeBaseline(root, total)
    console.log(`Wrote ${BASELINE_PATH} with workbench ${total}.`)
    process.exit(0)
  }
  if (arg === '--prune') {
    const baselineFile = path.join(root, BASELINE_PATH)
    const baseline = fs.existsSync(baselineFile)
      ? parseBaseline(fs.readFileSync(baselineFile, 'utf8'))
      : null
    const total = measure(root)
    if (baseline !== null && total > baseline) {
      console.error(
        `::error::--prune never raises the baseline: current ${total} > baseline ${baseline}. Delete cases to get under it.`
      )
      process.exit(1)
    }
    writeBaseline(root, total)
    console.log(`Pruned ${BASELINE_PATH} to workbench ${total}.`)
    process.exit(0)
  }
  process.exit(main(root))
}
