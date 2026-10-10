import { describe, expect, it } from 'vitest'
import { mergeConnectorRows, parseClaudeMcpList, parseCodexMcpListJson } from './connector-status'
import {
  buildInstallCommands,
  renderCommandLine,
  validateInstallPlan,
  withCodexHome
} from './connectors'

// 前五行与 Codex 前三项取自 2026-10-10 沙盒实测：Claude Code 2.1.280 `claude mcp list`、
// Codex 0.153.4 `codex mcp list --json`；其余是同一格式下的边界行。
const CLAUDE_LIST = `Checking MCP server health…

context7: https://mcp.context7.com/mcp (HTTP) - ✔ Connected
linear: https://mcp.linear.app/mcp (HTTP) - ! Needs authentication
broken: /nonexistent/bin --x - ✘ Failed to connect — ENOENT: ENOENT: no such file or directory, posix_spawn '/nonexistent/bin'
team: https://mcp.context7.com/mcp (HTTP) - ⏸ Pending approval (run \`claude\` to approve)
flaky: https://a.dev/mcp (HTTP) - ✘ Failed to connect — HTTP 500 - Internal error
off: npx -y srv --opt key: value - ⊘ Disabled for this project
gone: https://b.dev/mcp (HTTP) - ✘ Disconnected
plugin:github:github: https://api.githubcopilot.com/mcp/ (HTTP) - ✔ Connected
`
const CODEX_LIST = JSON.stringify([
  {
    name: 'broken',
    enabled: true,
    transport: { type: 'stdio', command: '/nonexistent/bin', args: ['--x'] },
    auth_status: 'unsupported'
  },
  {
    name: 'context7',
    enabled: true,
    transport: { type: 'streamable_http', url: 'https://mcp.context7.com/mcp' },
    auth_status: 'not_logged_in'
  },
  {
    name: 'linear',
    enabled: true,
    transport: { type: 'streamable_http', url: 'https://mcp.linear.app/mcp' },
    auth_status: 'o_auth'
  },
  {
    name: 'off',
    enabled: false,
    transport: { type: 'stdio', command: 'x' },
    auth_status: 'unsupported'
  },
  // 插件自带的服务：config.toml 里没有，codex mcp remove 删不掉，不列。
  {
    name: 'code-review',
    enabled: false,
    transport: { type: 'stdio', command: '/bin/sh', cwd: '/Users/me/.codex/plugins/cache/x/1/.' },
    auth_status: 'unsupported'
  }
])

describe('connector 状态协议', () => {
  it('两家 CLI 输出按名称合并成每个工具一枚状态，认不出的不猜、不画绿', () => {
    const claude = parseClaudeMcpList(CLAUDE_LIST)
    expect([...claude.keys()]).toEqual([
      'context7',
      'linear',
      'broken',
      'team',
      'flaky',
      'off',
      'gone'
    ])
    expect(claude.get('broken')).toMatchObject({
      state: 'failed',
      detail: "ENOENT: ENOENT: no such file or directory, posix_spawn '/nonexistent/bin'",
      target: '/nonexistent/bin --x'
    })
    expect(claude.get('flaky')).toMatchObject({
      state: 'failed',
      detail: 'HTTP 500 - Internal error'
    })
    expect(claude.get('off')).toMatchObject({
      state: 'disabled',
      target: 'npx -y srv --opt key: value'
    })
    expect(claude.get('team')?.state).toBe('pending-approval')
    expect(claude.get('gone')?.state).toBe('failed')
    expect(parseCodexMcpListJson('not json')).toBeNull()

    const codex = parseCodexMcpListJson(CODEX_LIST)!
    const rows = mergeConnectorRows({
      projectPath: null,
      codexHome: '/Users/me/.codex',
      claude: { status: 'ok', rows: [...claude].map(([name, p]) => ({ name, ...p })) },
      codex: {
        status: 'ok',
        rows: codex.map((r) => ({ name: r.name, target: '', state: r.state }))
      }
    })
    const states = Object.fromEntries(
      rows.map((r) => [r.name, [r.agents.claude?.state, r.agents.codex?.state]])
    )
    expect(states).toEqual({
      broken: ['failed', 'no-auth'],
      context7: ['connected', 'needs-auth'],
      flaky: ['failed', undefined],
      gone: ['failed', undefined],
      linear: ['needs-auth', 'logged-in'],
      off: ['disabled', 'disabled'],
      team: ['pending-approval', undefined]
    })
  })
})

describe('connector 命令协议', () => {
  it('按工具拼出安装与登录命令，失败即停，引号按目标 shell，非法输入不拼', () => {
    const plan = {
      name: 'linear',
      target: { transport: 'http' as const, url: 'https://mcp.linear.app/mcp' },
      oauth: true,
      agents: ['claude' as const, 'codex' as const],
      scope: 'local' as const
    }
    expect(validateInstallPlan(plan)).toBeNull()
    const commands = buildInstallCommands(plan)
    expect(commands.map((c) => c.argv.join(' '))).toEqual([
      'claude mcp add --transport http -s local linear https://mcp.linear.app/mcp',
      'claude mcp login linear',
      // Codex 的 add 检测到 OAuth 会自己进登录，不追加 login。
      'codex mcp add linear --url https://mcp.linear.app/mcp'
    ])
    expect(renderCommandLine(commands.slice(0, 2), 'posix', "/Users/me/it's repo")).toBe(
      `cd '/Users/me/it'\\''s repo' && claude mcp add --transport http -s local linear https://mcp.linear.app/mcp && claude mcp login linear`
    )
    // PowerShell 下 `-` 开头的参数一律加引号：npm 的 .ps1 垫片会吞掉裸 `--`。
    expect(renderCommandLine(commands.slice(0, 2), 'powershell', 'C:\\Users\\me\\repo')).toBe(
      "Set-Location -LiteralPath 'C:\\Users\\me\\repo'; if ($?) { claude mcp add '--transport' http '-s' local linear https://mcp.linear.app/mcp; if ($LASTEXITCODE -eq 0) { claude mcp login linear } }"
    )

    // Codex 命令显式写系统目录（Orca 托管目录会被同步覆盖），Claude 命令不带。
    const homed = withCodexHome([commands[1], commands[2]], '/Users/me/.codex')
    expect(renderCommandLine(homed, 'posix')).toBe(
      'claude mcp login linear && CODEX_HOME=/Users/me/.codex codex mcp add linear --url https://mcp.linear.app/mcp'
    )
    expect(renderCommandLine(homed, 'powershell')).toBe(
      "claude mcp login linear; if ($LASTEXITCODE -eq 0) { $env:CODEX_HOME = '/Users/me/.codex'; codex mcp add linear '--url' https://mcp.linear.app/mcp }"
    )

    const stdio = {
      ...plan,
      name: 'fs',
      oauth: false,
      target: { transport: 'stdio' as const, command: 'npx', args: ['-y', 'a b'] }
    }
    expect(buildInstallCommands(stdio).map((c) => c.argv)).toEqual([
      ['claude', 'mcp', 'add', '-s', 'local', 'fs', '--', 'npx', '-y', 'a b'],
      ['codex', 'mcp', 'add', 'fs', '--', 'npx', '-y', 'a b']
    ])
    const tricky = ['codex', 'mcp', 'add', 'x', '--', 'npx', '--%', 'a,b', '@s', 'it‘s']
    expect(renderCommandLine([{ agent: 'codex', argv: tricky }], 'powershell')).toBe(
      "codex mcp add x '--' npx '--%' 'a,b' '@s' 'it‘‘s'"
    )
    expect(renderCommandLine([{ agent: 'codex', argv: ['x', '=ls', '$HOME'] }], 'posix')).toBe(
      "x '=ls' '$HOME'"
    )
    expect(validateInstallPlan({ ...plan, name: '-s' })).not.toBeNull()
    expect(validateInstallPlan({ ...plan, name: 'bad name; rm -rf ~' })).not.toBeNull()
    expect(
      validateInstallPlan({ ...plan, target: { transport: 'http', url: 'file:///etc' } })
    ).not.toBeNull()
    expect(
      validateInstallPlan({ ...plan, target: { transport: 'sse', url: 'https://x.dev/sse' } })
    ).not.toBeNull()
  })
})
