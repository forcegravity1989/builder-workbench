import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const devDependencies = [
  'electron-vite/package.json',
  '@xterm/headless/lib-headless/xterm-headless.js',
  '@xterm/addon-serialize/lib/addon-serialize.js'
]

export function prepareEnvironment(root, { assistant, devProfile, machine = os.hostname() }) {
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const projectRepo = path.dirname(common)
  const recordPath = path.join(projectRepo, '.bw/runtime/verification/environment.json')
  if (
    execFileSync('git', ['-C', projectRepo, 'ls-files', '--', recordPath], {
      encoding: 'utf8'
    }).trim()
  ) {
    throw new Error('本机环境记录已被 Git 跟踪，未覆盖')
  }
  let previous = {}
  if (existsSync(recordPath)) {
    const saved = JSON.parse(readFileSync(recordPath, 'utf8'))
    if (
      typeof saved.machine === 'string' &&
      saved.machine.toLowerCase() === machine.toLowerCase()
    ) {
      previous = saved
    }
  }
  devProfile = path.resolve(root, devProfile)
  let projectRegistration = 'unverified'
  let projectId = null
  let registrationEvidence = null
  if (!existsSync(devProfile)) {
    projectRegistration = 'profile-missing'
  } else {
    try {
      const index = JSON.parse(
        readFileSync(path.join(devProfile, 'orca-profile-index.json'), 'utf8')
      )
      if (!/^[\w-]+$/.test(index.activeProfileId)) {
        throw new Error('无效 profile 身份')
      }
      registrationEvidence = path.join(
        devProfile,
        'profiles',
        index.activeProfileId,
        'orca-data.json'
      )
      const data = JSON.parse(readFileSync(registrationEvidence, 'utf8'))
      const normalized = (value) =>
        process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
      const repo = data.repos?.find(
        (item) => typeof item.path === 'string' && normalized(item.path) === normalized(projectRepo)
      )
      projectRegistration = repo ? 'registered-in-profile' : 'not-registered'
      projectId = repo?.id ?? null
    } catch {
      projectRegistration = 'unverified'
    }
  }
  const ignored = spawnSync('git', ['-C', projectRepo, 'check-ignore', '--quiet', recordPath])
  if (ignored.status === 1) {
    const exclude = path.join(common, 'info/exclude')
    mkdirSync(path.dirname(exclude), { recursive: true })
    appendFileSync(exclude, '\n.bw/runtime/verification/\n')
  }
  if (spawnSync('git', ['-C', projectRepo, 'check-ignore', '--quiet', recordPath]).status !== 0) {
    throw new Error('无法确认本机记录会被 Git 忽略，未写入')
  }
  const result = {
    ...previous,
    machine,
    assistant: assistant ?? previous.assistant ?? 'unknown',
    network: previous.network ?? 'unknown',
    maxConcurrentHeavyJobs: previous.maxConcurrentHeavyJobs ?? 1,
    memoryGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    devProfile,
    projectRepo,
    projectRegistration,
    projectId,
    registrationEvidence,
    nodeVersion: process.version,
    gitVersion: git(['--version']),
    missingDevDependencies: devDependencies.filter(
      (file) => !existsSync(path.join(root, 'node_modules', file))
    ),
    observedAt: new Date().toISOString(),
    uiVerification: 'not-checked'
  }
  mkdirSync(path.dirname(recordPath), { recursive: true })
  writeFileSync(recordPath, `${JSON.stringify(result, null, 2)}\n`)
  return { recordPath, ...result }
}

export function sourceFingerprint(root) {
  const inputs = [
    'src',
    'config',
    'resources',
    'standard',
    'package.json',
    'pnpm-lock.yaml',
    'electron.vite.config.ts',
    'tsconfig.json'
  ]
  const git = (args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024 })
  const hash = createHash('sha256')
  hash.update(git(['rev-parse', 'HEAD']))
  hash.update(git(['diff', '--binary', 'HEAD', '--', ...inputs]))
  const files = git(['ls-files', '-z', '--others', '--exclude-standard', '--', ...inputs])
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort()
  return hash.update(fingerprint(root, files)).digest('hex')
}

function fingerprint(root, files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(`${file}\0`)
    const absolute = path.join(root, file)
    hash.update(existsSync(absolute) ? readFileSync(absolute) : '<deleted>')
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function outputFingerprint(root) {
  if (
    !['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html'].every((file) =>
      existsSync(path.join(root, file))
    )
  ) {
    return null
  }
  const files = []
  const walk = (relative) => {
    for (const name of readdirSync(path.join(root, relative))) {
      const file = `${relative}/${name}`
      if (statSync(path.join(root, file)).isDirectory()) {
        walk(file)
      } else {
        files.push(file)
      }
    }
  }
  for (const dir of ['out/main', 'out/preload', 'out/renderer']) {
    walk(dir)
  }
  return fingerprint(root, files.sort())
}

export function canReuseBuild(stamp, source, output) {
  return !!output && stamp?.source === source && stamp?.output === output
}

function workbenchEnv(base) {
  const env = {
    ...base,
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ORCA_ELECTRON_VITE_TARGET
  return env
}

export function developmentEnv(base) {
  return { ...workbenchEnv(base), ORCA_BACKGROUND_LAUNCH: '1' }
}

export function verificationEnv(base) {
  return {
    ...workbenchEnv(base),
    VITE_EXPOSE_STORE: 'true',
    ORCA_E2E_FORCE_HEADFUL: '1',
    SKIP_BUILD: '1'
  }
}

function run(root, script, args, env) {
  const startedAt = new Date().toISOString()
  const start = performance.now()
  console.log(`[verification] ${startedAt}: ${path.basename(script)} ${args.join(' ')}`)
  const child = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: 'inherit' })
  if (child.error) {
    throw child.error
  }
  return {
    command: [script, ...args],
    startedAt,
    durationMs: Math.round(performance.now() - start),
    exitCode: child.status,
    signal: child.signal
  }
}

async function main() {
  const options = {}
  const args = process.argv.slice(2)
  const mode = ['dev', 'prepare'].includes(args[0]) ? args.shift() : 'isolated'
  const dev = mode === 'dev'
  while (args.length) {
    const key = args.shift()
    if (
      !['--root', '--config', '--grep', '--project', '--assistant'].includes(key) ||
      !args.length
    ) {
      throw new Error(
        'prepare: --root 仓根 [--assistant codex|claude]；dev: --root 仓根；隔离验证可选 --config/--grep/--project'
      )
    }
    options[key.slice(2)] = args.shift()
  }
  if (!options.root) {
    throw new Error('需要 --root 显式指定任务 worktree')
  }
  if (mode !== 'isolated' && (options.config || options.grep || options.project)) {
    throw new Error('dev 只启动持久开发实例；用例参数用于隔离验证模式')
  }
  const root = execFileSync('git', [
    '-C',
    path.resolve(options.root),
    'rev-parse',
    '--show-toplevel'
  ])
    .toString()
    .trim()
  const require = createRequire(path.join(root, 'package.json'))
  if (mode === 'prepare') {
    if (options.assistant && !['codex', 'claude'].includes(options.assistant)) {
      throw new Error('assistant 应为 codex 或 claude')
    }
    const { getDevUserDataPath } = await import(
      pathToFileURL(path.join(root, 'config/scripts/dev-workbench-env.mjs')).href
    )
    console.log(
      JSON.stringify(
        prepareEnvironment(root, {
          ...options,
          devProfile: getDevUserDataPath(workbenchEnv(process.env))
        }),
        null,
        2
      )
    )
    return
  }
  if (options.assistant) {
    throw new Error('assistant 参数只用于 prepare')
  }
  const missing = [...(dev ? [] : ['@playwright/test/package.json']), ...devDependencies].filter(
    (file) => !existsSync(path.join(root, 'node_modules', file))
  )
  if (missing.length) {
    throw new Error(
      `任务树依赖未准备完整，先按项目 setup 安装/复用匹配依赖；缺少：${missing.join(', ')}`
    )
  }
  if (dev) {
    const env = developmentEnv(process.env)
    console.log(
      '[verification] 启动原生 dev runner，沿用持久 workbench-dev profile；不是一次性 fixture，也不表示验证通过。'
    )
    const result = run(root, path.join(root, 'config/scripts/run-electron-vite-dev.mjs'), [], env)
    process.exitCode = result.exitCode ?? 1
    return
  }
  // Resolve installed dependencies from the task root; never invoke a package installer.
  const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js')
  const config = path.resolve(root, options.config ?? 'tests/playwright.config.ts')
  if (!existsSync(config)) {
    throw new Error('配置不存在；复用现有 fixture 为本 Issue 准备同一复现/复验用例')
  }
  const runtime = path.join(root, '.bw/runtime/verification')
  mkdirSync(runtime, { recursive: true })
  const lockPath = path.join(runtime, 'runner.lock')
  let lock
  try {
    lock = openSync(lockPath, 'wx')
  } catch {
    throw new Error(`已有验证锁，请先核对所属 PID：${lockPath}`)
  }
  writeFileSync(
    lock,
    JSON.stringify({ pid: process.pid, root, startedAt: new Date().toISOString() })
  )
  const result = {
    root,
    head: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD']).toString().trim(),
    stages: []
  }
  try {
    const env = verificationEnv(process.env)
    const source = sourceFingerprint(root)
    const stampPath = path.join(runtime, 'e2e-build.json')
    let stamp
    try {
      stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
    } catch {
      /* no reusable build */
    }
    result.reusedBuild = canReuseBuild(stamp, source, outputFingerprint(root))
    if (!result.reusedBuild) {
      const build = run(
        root,
        path.join(root, 'config/scripts/run-electron-vite-build.mjs'),
        ['--mode', 'e2e'],
        env
      )
      result.stages.push(build)
      if (build.exitCode !== 0) {
        throw new Error('E2E 构建失败，未启动验证')
      }
      if (source !== sourceFingerprint(root)) {
        throw new Error('构建期间源码变化，重新运行以验证正确版本')
      }
      const output = outputFingerprint(root)
      if (!output) {
        throw new Error('构建未生成完整 Electron 产物')
      }
      writeFileSync(stampPath, JSON.stringify({ source, output }, null, 2))
    }
    const builtOutput = outputFingerprint(root)
    const project = options.project ?? (options.config ? null : 'electron-headful')
    const test = run(
      root,
      cli,
      [
        'test',
        '--config',
        config,
        '--workers',
        '1',
        ...(project ? ['--project', project] : []),
        ...(options.grep ? ['--grep', options.grep] : [])
      ],
      env
    )
    result.stages.push(test)
    if (test.exitCode !== 0) {
      throw new Error('用例未通过；检查 fixture 输出，不以冒烟通过替代 Issue 判据')
    }
    if (source !== sourceFingerprint(root)) {
      throw new Error('验证期间源码变化，本次证据不能代表当前源码')
    }
    if (builtOutput !== outputFingerprint(root)) {
      throw new Error('验证期间产物变化，本次证据不能代表当前产物')
    }
    result.passed = true
  } finally {
    writeFileSync(path.join(runtime, 'last-run.json'), `${JSON.stringify(result, null, 2)}\n`)
    closeSync(lock)
    unlinkSync(lockPath)
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
