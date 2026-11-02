import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from './workbench-app'

export const fixedWorkspaceVersion = 'v9.9'
export const fixedWorkspaceBranches = [
  { kind: 'project', branch: 'bw/project', name: 'project', hasPr: true },
  { kind: 'metrics', branch: 'bw/metrics-refresh', name: 'metrics-refresh', hasPr: false },
  {
    kind: 'plan',
    branch: `bw/${fixedWorkspaceVersion}/plan`,
    name: `plan-${fixedWorkspaceVersion}`,
    hasPr: false
  },
  {
    kind: 'acceptance',
    branch: `bw/${fixedWorkspaceVersion}/acceptance`,
    name: `acceptance-${fixedWorkspaceVersion}`,
    hasPr: true
  }
] as const

export type FixedWorkspaceRemote = {
  root: string
  repoPath: string
  bin: string
  commits: Record<string, string>
  ghLog: string
  gitLog: string
}

function writeWindowsLaunchers(bin: string) {
  // Native Git/gh spawning resolves .exe, while preflight also accepts .cmd.
  const source = path.join(bin, 'launcher.cs')
  writeFileSync(
    source,
    String.raw`using System;
using System.Diagnostics;
using System.IO;
using System.Text;
class Launcher {
  static string Quote(string value) {
    var result = new StringBuilder("\"");
    int slashes = 0;
    foreach (char character in value) {
      if (character == '\\') { slashes++; continue; }
      result.Append('\\', character == '"' ? slashes * 2 + 1 : slashes);
      result.Append(character);
      slashes = 0;
    }
    return result.Append('\\', slashes * 2).Append('"').ToString();
  }
  static int Main(string[] args) {
    string executable = System.Reflection.Assembly.GetExecutingAssembly().Location;
    string script = Path.Combine(Path.GetDirectoryName(executable), Path.GetFileNameWithoutExtension(executable) + "-fixture.cjs");
    var arguments = new StringBuilder(Quote(script));
    foreach (string argument in args) arguments.Append(" ").Append(Quote(argument));
    var process = Process.Start(new ProcessStartInfo(${JSON.stringify(process.execPath)}, arguments.ToString()) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true });
    var stdout = process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
    var stderr = process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
    Console.OpenStandardInput().CopyToAsync(process.StandardInput.BaseStream).ContinueWith(task => process.StandardInput.Close());
    process.WaitForExit();
    stdout.Wait();
    stderr.Wait();
    return process.ExitCode;
  }
}`
  )
  const launcher = path.join(bin, 'git.exe')
  execFileSync(
    path.join(process.env.WINDIR ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
    ['/nologo', '/target:exe', `/out:${launcher}`, source],
    { stdio: 'pipe' }
  )
  copyFileSync(launcher, path.join(bin, 'gh.exe'))
}

function createRemote(root: string): FixedWorkspaceRemote {
  writeFileSync(path.join(root, 'git-global-config'), '')
  const seed = path.join(root, 'seed')
  const bare = path.join(root, 'origin.git')
  const repoPath = path.join(root, 'checkout')
  const bin = path.join(root, 'bin')
  for (const directory of [seed, bin]) {
    mkdirSync(directory, { recursive: true })
  }
  const git = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(seed, ['init', '--initial-branch=main'])
  git(seed, ['config', 'user.name', 'Workbench E2E'])
  git(seed, ['config', 'user.email', 'e2e@test.local'])
  mkdirSync(path.join(seed, '.bw'))
  writeFileSync(path.join(seed, 'README.md'), '# Fixed workspace remote fixture\n')
  writeFileSync(path.join(seed, '.gitignore'), '.bw/worktrees/\nnode_modules/\n')
  writeFileSync(
    path.join(seed, '.bw/project.toml'),
    'name = "固定工作区复用验证"\nbrief = "真实远端分支恢复"\n'
  )
  git(seed, ['add', '.'])
  git(seed, ['commit', '-m', 'seed fixed workspace fixture'])
  const mainCommit = git(seed, ['rev-parse', 'HEAD'])
  git(root, ['init', '--bare', '--initial-branch=main', bare])
  git(seed, ['remote', 'add', 'origin', bare])
  git(seed, ['push', 'origin', 'main'])
  const commits: Record<string, string> = {}
  for (const item of fixedWorkspaceBranches) {
    git(seed, ['switch', '--create', item.branch, 'main'])
    writeFileSync(path.join(seed, 'fixed-workspace-marker.txt'), `${item.branch}\n`)
    if (item.kind === 'plan') {
      const directory = path.join(seed, '.bw/planning', fixedWorkspaceVersion)
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        path.join(directory, 'data.json'),
        JSON.stringify({
          schema_version: 3,
          version: fixedWorkspaceVersion,
          cycleId: 'fixed-remote-plan',
          summary: { progress: '', risks: '' },
          goals: [
            {
              goalId: 'remote-goal',
              title: '保留远端计划内容',
              deliverable: '原分支独立读回',
              metricTargets: []
            }
          ],
          tasks: []
        })
      )
    }
    git(seed, ['add', '.'])
    git(seed, ['commit', '-m', `seed remote ${item.kind}`])
    commits[item.branch] = git(seed, ['rev-parse', 'HEAD'])
    git(seed, ['push', 'origin', item.branch])
  }
  git(root, ['clone', '--single-branch', '--branch', 'main', bare, repoPath])
  git(repoPath, ['config', 'user.name', 'Workbench E2E'])
  git(repoPath, ['config', 'user.email', 'e2e@test.local'])
  const remoteUrl = 'https://github.com/fixed-workspace-e2e/fixed-workspaces.git'
  git(repoPath, ['remote', 'set-url', 'origin', remoteUrl])
  const gitLog = path.join(root, 'git-transport-calls.ndjson')
  const realGit = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], {
    encoding: 'utf8'
  })
    .trim()
    .split(/\r?\n/)[0]
  const gitBody = `#!/usr/bin/env node
const fs = require('node:fs')
const {spawnSync} = require('node:child_process')
const args = process.argv.slice(2)
if (args.some(value => value === 'push' || value === 'pull' || value === 'clone')) { console.error('Isolated git fixture rejected unexpected transport'); process.exit(1) }
const command = args.findIndex(value => value === 'fetch' || value === 'ls-remote')
if (command !== -1) {
  const original = [...args]
  const target = args.findIndex((value,index) => index > command && (value === 'origin' || value === ${JSON.stringify(remoteUrl)}))
  const defaultFetch = args[command] === 'fetch' && args.slice(command + 1).every(value => value.startsWith('-'))
  if (target === -1 && !defaultFetch) { console.error('Isolated git fixture rejected unknown transport'); process.exit(1) }
  const url = spawnSync(${JSON.stringify(realGit)}, ['config','--get','remote.origin.url'], {encoding:'utf8'}).stdout?.trim()
  if (url !== ${JSON.stringify(remoteUrl)}) { console.error('Isolated git fixture rejected foreign repo transport'); process.exit(1) }
  args.unshift('-c', ${JSON.stringify(`url.${pathToFileURL(bare).href}.insteadOf=${remoteUrl}`)})
  fs.appendFileSync(${JSON.stringify(gitLog)}, JSON.stringify({original,forwarded:args}) + '\\n')
}
const result = spawnSync(${JSON.stringify(realGit)}, args, {stdio:'inherit'})
if (result.error) { console.error(result.error.message); process.exit(1) }
process.exit(result.status ?? 1)
`
  const gitPath = path.join(bin, process.platform === 'win32' ? 'git.cmd' : 'git')
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'git-fixture.cjs'), gitBody)
  } else {
    writeFileSync(gitPath, gitBody)
    chmodSync(gitPath, 0o755)
  }
  const ghLog = path.join(root, 'gh-calls.ndjson')
  const prs = Object.fromEntries(
    fixedWorkspaceBranches
      .filter((item) => item.hasPr)
      .map((item, index) => [
        item.branch,
        {
          number: 901 + index,
          title: `Existing ${item.kind} review`,
          state: 'OPEN',
          url: `https://github.com/fixed-workspace-e2e/fixed-workspaces/pull/${901 + index}`,
          updatedAt: '2026-11-01T00:00:00Z',
          statusCheckRollup: [],
          isDraft: false,
          mergeable: 'MERGEABLE',
          baseRefName: 'main',
          baseRefOid: mainCommit,
          headRefName: item.branch,
          headRefOid: commits[item.branch]
        }
      ])
  )
  const ghBody = `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const prs = ${JSON.stringify(prs)}
fs.appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify(args) + '\\n')
const output = value => { console.log(JSON.stringify(value)); process.exit(0) }
if (args[0] === '--version') { console.log('gh version 2.82.0 (isolated-fixture)'); process.exit(0) }
if (args[0] === 'auth' && args[1] === 'status') { console.error('github.com\\n  ✓ Logged in to github.com account fixed-workspace-e2e (GITHUB_TOKEN)'); process.exit(0) }
const endpoint = args.find(value => /^(repos\\/|user$|rate_limit$)/.test(value))
if (args[0] === 'api' && endpoint === 'user') {
  if (args.includes('-q')) { console.log('fixed-workspace-e2e'); process.exit(0) }
  output({login:'fixed-workspace-e2e'})
}
if (args[0] === 'api' && endpoint === 'rate_limit') output({resources:{core:{limit:5000,remaining:5000,reset:0},graphql:{limit:5000,remaining:5000,reset:0},search:{limit:30,remaining:30,reset:0}}})
if (endpoint?.startsWith('repos/fixed-workspace-e2e/fixed-workspaces/pulls')) {
  const url = new URL('https://api.github.com/' + endpoint)
  const number = Number(url.pathname.split('/').at(-1))
  const head = url.searchParams.get('head')?.split(':').slice(1).join(':')
  const row = number ? Object.values(prs).find(pr => pr.number === number) : prs[head]
  const rest = row && {number:row.number,title:row.title,state:'open',html_url:row.url,updated_at:row.updatedAt,draft:false,mergeable:true,mergeable_state:'clean',base:{ref:'main',sha:row.baseRefOid},head:{ref:row.headRefName,sha:row.headRefOid}}
  output(number ? rest || {} : rest ? [rest] : [])
}
if (args[0] === 'pr' && args[1] === 'view') {
  const row = Object.values(prs).find(pr => String(pr.number) === args[2] || pr.headRefName === args[2])
  if (row) output(row)
  console.error('no pull requests found'); process.exit(1)
}
if (args[0] === 'pr' && args[1] === 'list') output(prs[args[args.indexOf('--head')+1]] ? [prs[args[args.indexOf('--head')+1]]] : [])
if (endpoint === 'repos/fixed-workspace-e2e/fixed-workspaces') output({name:'fixed-workspaces',owner:{login:'fixed-workspace-e2e'},default_branch:'main',permissions:{push:true},fork:false})
console.error('Isolated gh fixture rejected unsupported command: ' + args.join(' ')); process.exit(1)
`
  const ghPath = path.join(bin, process.platform === 'win32' ? 'gh.cmd' : 'gh')
  if (process.platform === 'win32') {
    writeFileSync(path.join(bin, 'gh-fixture.cjs'), ghBody)
    writeWindowsLaunchers(bin)
    const readback = execFileSync(path.join(bin, 'git.exe'), ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      encoding: 'utf8'
    })
    if (!readback.includes('branch refs/heads/main')) {
      throw new Error(`Git fixture launcher failed: ${readback}`)
    }
  } else {
    writeFileSync(ghPath, ghBody)
    chmodSync(ghPath, 0o755)
  }
  return { root, repoPath, bin, commits, ghLog, gitLog }
}

export const fixedWorkspaceTest = test.extend<{ fixedRemote: FixedWorkspaceRemote }>({
  minimumSeededWorktreeCount: 1,
  fixedRemote: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bw-fixed-remote-'))
    registerPostElectronShutdownCleanup(async () => {
      rmSync(root, { recursive: true, force: true })
    })
    await provideFixture(createRemote(root))
  },
  seededRepoPath: async ({ fixedRemote }, provideFixture) => provideFixture(fixedRemote.repoPath),
  launchEnv: async ({ fixedRemote }, provideFixture) =>
    provideFixture({
      PATH: `${fixedRemote.bin}${path.delimiter}${process.env.PATH ?? ''}`,
      GIT_CONFIG_GLOBAL: path.join(fixedRemote.root, 'git-global-config'),
      GIT_CONFIG_NOSYSTEM: '1',
      GH_CONFIG_DIR: path.join(fixedRemote.root, 'gh-config'),
      GH_TOKEN: 'isolated-fixture-not-a-real-token'
    })
})
