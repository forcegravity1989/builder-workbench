import { describe, expect, it } from 'vitest'
import { mergeConnectorRows, parseClaudeMcpList, parseCodexMcpListJson } from './connector-status'
import { buildInstallCommands, renderCommandLine, validateInstallPlan } from './connectors'

// 输入取自 2026-10-10 沙盒实测：Claude Code 2.1.280 `claude mcp list`、Codex 0.153.4 `codex mcp list --json`。
const CLAUDE_LIST = `Checking MCP server health…

context7: https://mcp.context7.com/mcp (HTTP) - ✔ Connected
linear: https://mcp.linear.app/mcp (HTTP) - ! Needs authentication
broken: /nonexistent/bin --x - ✘ Failed to connect — ENOENT: ENOENT: no such file or directory, posix_spawn '/nonexistent/bin'
team: https://mcp.context7.com/mcp (HTTP) - ⏸ Pending approval (run \`claude\` to approve)
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
    name: 'off',
    enabled: false,
    transport: { type: 'stdio', command: 'x' },
    auth_status: 'unsupported'
  }
])

describe('connector 状态协议', () => {
  it('两家 CLI 输出按名称合并成每个工具一枚状态，认不出的不猜', () => {
    const claude = parseClaudeMcpList(CLAUDE_LIST)
    expect([...claude.keys()]).toEqual(['context7', 'linear', 'broken', 'team'])
    expect(claude.get('linear')).toMatchObject({ state: 'needs-auth' })
    expect(claude.get('team')).toMatchObject({ state: 'pending-approval' })
    expect(claude.get('broken')).toMatchObject({
      state: 'failed',
      detail: "ENOENT: ENOENT: no such file or directory, posix_spawn '/nonexistent/bin'",
      target: '/nonexistent/bin --x'
    })
    expect(parseCodexMcpListJson('not json')).toBeNull()

    const codex = parseCodexMcpListJson(CODEX_LIST)!
    const rows = mergeConnectorRows({
      projectPath: null,
      claude: { status: 'ok', rows: [...claude].map(([name, p]) => ({ name, ...p })) },
      codex: {
        status: 'ok',
        rows: codex.map((r) => ({ name: r.name, target: '', state: r.state }))
      }
    })
    const context7 = rows.find((r) => r.name === 'context7')!
    expect(context7.agents.claude?.state).toBe('connected')
    expect(context7.agents.codex?.state).toBe('needs-auth')
    expect(rows.find((r) => r.name === 'broken')!.agents.codex?.state).toBe('no-auth')
    expect(rows.find((r) => r.name === 'off')!.agents.codex?.state).toBe('disabled')
    expect(rows.map((r) => r.name)).toEqual(['broken', 'context7', 'linear', 'off', 'team'])
  })
})

describe('connector 命令协议', () => {
  it('按工具拼出安装与登录命令，失败即停，非法输入不拼', () => {
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
    expect(renderCommandLine(commands.slice(0, 2), 'powershell', 'C:\\Users\\me\\repo')).toBe(
      "Set-Location -LiteralPath 'C:\\Users\\me\\repo'; if ($?) { claude mcp add --transport http -s local linear https://mcp.linear.app/mcp; if ($LASTEXITCODE -eq 0) { claude mcp login linear } }"
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
    expect(validateInstallPlan({ ...plan, name: 'bad name; rm -rf ~' })).not.toBeNull()
    expect(
      validateInstallPlan({ ...plan, target: { transport: 'http', url: 'file:///etc' } })
    ).not.toBeNull()
    expect(
      validateInstallPlan({ ...plan, target: { transport: 'sse', url: 'https://x.dev/sse' } })
    ).not.toBeNull()
  })
})
