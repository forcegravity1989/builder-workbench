import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { WorkbenchPlanningStartResult } from '../../shared/workbench-planning'

const execFileAsync = promisify(execFile)
const PLANNING_REL = join('standard', 'skills', 'week-planning', 'scripts', 'planning.py')
const START_TIMEOUT_MS = 20_000
const INIT_TIMEOUT_MS = 15_000

export type PlanningStartOk = WorkbenchPlanningStartResult

export type PlanningVersionStamp = {
  version: string
  mtimeMs: number
}

export function pickPlanningVersion(stamps: readonly PlanningVersionStamp[]): string {
  if (stamps.length === 0) {
    return 'default'
  }
  const named = stamps.filter((stamp) => stamp.version !== 'default')
  const pool = named.length > 0 ? named : stamps
  return [...pool].sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.version ?? 'default'
}

export function planningStartUrlIsLocal(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.port.length > 0
  } catch {
    return false
  }
}

export function parsePlanningStartStdout(stdout: string): {
  url: string
  data: string
  reused: boolean
} {
  const parsed: unknown = JSON.parse(stdout)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('规划服务返回了无法识别的结果')
  }
  const record = parsed as Record<string, unknown>
  const url = typeof record.url === 'string' ? record.url.trim() : ''
  const data = typeof record.data === 'string' ? record.data.trim() : ''
  if (!planningStartUrlIsLocal(url)) {
    throw new Error('规划服务没有返回本机地址')
  }
  return { url, data, reused: record.reused === true }
}

export function planningScriptCandidates(
  appPath: string,
  cwd: string,
  resourcesPath: string
): string[] {
  return uniquePaths([
    join(appPath, PLANNING_REL),
    join(cwd, PLANNING_REL),
    join(resourcesPath, PLANNING_REL),
    join(resourcesPath, 'app.asar.unpacked', PLANNING_REL)
  ])
}

export function pythonCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? ['python', 'py'] : ['python3', 'python']
}

export function listPlanningVersionStamps(workspace: string): PlanningVersionStamp[] {
  const root = join(workspace, '.bw', 'planning')
  if (!existsSync(root)) {
    return []
  }
  const stamps: PlanningVersionStamp[] = []
  for (const name of readdirSync(root)) {
    if (name === '.local' || name === 'template' || name.startsWith('.')) {
      continue
    }
    const dataFile = join(root, name, 'data.json')
    if (!existsSync(dataFile)) {
      continue
    }
    stamps.push({ version: name, mtimeMs: statSync(dataFile).mtimeMs })
  }
  return stamps
}

export async function startPlanningWorkspace(
  workspacePath: string,
  scriptCandidates: readonly string[],
  pythonBins: readonly string[]
): Promise<PlanningStartOk> {
  const workspace = resolveWorkspace(workspacePath)
  const script = firstExisting(scriptCandidates)
  if (!script) {
    throw new Error('找不到 week-planning 的 planning.py')
  }
  const python = await resolvePython(pythonBins)
  const version = pickPlanningVersion(listPlanningVersionStamps(workspace))
  const dataFile = join(workspace, '.bw', 'planning', version, 'data.json')
  if (!existsSync(dataFile)) {
    await runPlanning(python, script, workspace, ['init'], INIT_TIMEOUT_MS)
  }
  const started = parsePlanningStartStdout(
    await runPlanning(python, script, workspace, ['--version', version, 'start'], START_TIMEOUT_MS)
  )
  return { ...started, version, workspace }
}

function resolveWorkspace(workspacePath: string): string {
  const trimmed = workspacePath.trim()
  if (!trimmed || !isAbsolute(trimmed)) {
    throw new Error('规划工作目录必须是绝对路径')
  }
  const workspace = resolve(trimmed)
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    throw new Error('规划工作目录不存在')
  }
  return workspace
}

async function resolvePython(candidates: readonly string[]): Promise<string> {
  for (const binary of candidates) {
    try {
      await execFileAsync(binary, ['-c', 'import sys; print(sys.executable)'], {
        timeout: 5_000,
        windowsHide: true
      })
      return binary
    } catch {
      continue
    }
  }
  throw new Error('本机没有 Python 3，无法打开周一屏')
}

async function runPlanning(
  python: string,
  script: string,
  workspace: string,
  argv: readonly string[],
  timeout: number
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      python,
      ['-B', '-X', 'utf8', script, '--workspace', workspace, ...argv],
      { timeout, windowsHide: true, encoding: 'utf8' }
    )
    return stdout
  } catch (error) {
    throw new Error(planningCommandError(error))
  }
}

function planningCommandError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '无法启动规划服务'
  }
  const record = error as { stderr?: unknown; message?: unknown }
  const stderr = typeof record.stderr === 'string' ? record.stderr.trim() : ''
  if (stderr) {
    return stderr.split('\n').findLast((line) => line.length > 0) ?? stderr
  }
  return typeof record.message === 'string' && record.message.trim()
    ? record.message
    : '无法启动规划服务'
}

function firstExisting(paths: readonly string[]): string | null {
  return paths.find((candidate) => existsSync(candidate)) ?? null
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)]
}
