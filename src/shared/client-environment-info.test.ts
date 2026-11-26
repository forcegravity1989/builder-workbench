import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendClientEnvironmentFooter,
  formatClientEnvironmentFooter,
  formatClientEnvironmentInfo,
  hasClientEnvironmentFooter,
  stripClientEnvironmentFooter
} from './client-environment-info'

const SAMPLE = {
  appVersion: '1.4.178-rc.2',
  platform: 'win32',
  osRelease: '10.0.22631',
  arch: 'x64',
  shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
} as const

describe('formatClientEnvironmentInfo', () => {
  it('formats version, OS, and optional shell for copy-paste', () => {
    expect(formatClientEnvironmentInfo(SAMPLE)).toBe(
      [
        'Orca: 1.4.178-rc.2',
        'OS: win32 10.0.22631 (x64)',
        'Shell: C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      ].join('\n')
    )
  })

  it('omits shell when unset and falls back unknown fields', () => {
    expect(
      formatClientEnvironmentInfo({
        appVersion: '',
        platform: 'darwin',
        osRelease: '',
        arch: 'arm64'
      })
    ).toBe(['Orca: unknown', 'OS: darwin (arm64)'].join('\n'))
  })

  it('keeps environment-controlled values on one line', () => {
    expect(
      formatClientEnvironmentInfo({
        appVersion: '1.2.3\nInjected: value',
        platform: 'linux',
        osRelease: '6.8\r\nExtra',
        arch: 'x64',
        shell: '/bin/zsh\nMore: data'
      })
    ).toBe(
      [
        'Orca: 1.2.3 Injected: value',
        'OS: linux 6.8 Extra (x64)',
        'Shell: /bin/zsh More: data'
      ].join('\n')
    )
  })
})

describe('environment footer helpers', () => {
  it('builds a marked footer and detects when one is already present', () => {
    const footer = formatClientEnvironmentFooter(SAMPLE)
    expect(footer.startsWith('---\nOrca:')).toBe(true)
    expect(hasClientEnvironmentFooter(`oops\n\n${footer}`)).toBe(true)
    expect(hasClientEnvironmentFooter('oops')).toBe(false)
  })

  it('appends a footer once and leaves existing footers alone', () => {
    const withFooter = appendClientEnvironmentFooter({
      message: 'Working directory missing.',
      info: SAMPLE
    })
    expect(withFooter).toContain('Working directory missing.')
    expect(withFooter).toContain('Orca: 1.4.178-rc.2')
    expect(appendClientEnvironmentFooter({ message: withFooter, info: SAMPLE })).toBe(withFooter)
  })

  it('treats footer-only text as empty user feedback', () => {
    const footer = formatClientEnvironmentFooter(SAMPLE)
    expect(stripClientEnvironmentFooter(`\n\n${footer}\n`).trim()).toBe('')
    expect(stripClientEnvironmentFooter(`please fix tabs\n\n${footer}`).trimEnd()).toBe(
      'please fix tabs'
    )
    expect(stripClientEnvironmentFooter(footer).trim()).toBe('')
  })

  it('counts authored text above or below the footer as user feedback', () => {
    const footer = formatClientEnvironmentFooter(SAMPLE)
    expect(hasClientEnvironmentFooter(`\n\n${footer}\ntyped below`)).toBe(true)
    expect(stripClientEnvironmentFooter(`\n\n${footer}\ntyped below`).trim()).toBe('typed below')
    expect(stripClientEnvironmentFooter(`actual report\n\n${footer}`).trim()).toBe('actual report')
    expect(
      stripClientEnvironmentFooter(`above\n\n${footer}\nbelow`).replace(/\n+/g, ' ').trim()
    ).toBe('above below')
  })

  it('still detects an edited footer block', () => {
    const editedFooter = ['---', 'Orca: locally-built', 'OS: edited by user'].join('\n')

    expect(hasClientEnvironmentFooter(editedFooter)).toBe(true)
    expect(stripClientEnvironmentFooter(editedFooter).trim()).toBe('')
  })

  it('treats a report as user text after the footer is deleted', () => {
    const withoutFooter = 'Tabs hang after waking the laptop.'

    expect(hasClientEnvironmentFooter(withoutFooter)).toBe(false)
    expect(stripClientEnvironmentFooter(withoutFooter)).toBe(withoutFooter)
  })
})

// Why: the footer travels verbatim into group-space reports, so the version
// line must carry the running product's brand (#614) while footers prefilled
// by the other build keep stripping cleanly.
describe('Workbench product identity', () => {
  afterEach(() => {
    delete process.env.WORKBENCH_SHELL
    vi.resetModules()
  })

  it('labels the version line Workbench and still recognizes Orca footers', async () => {
    process.env.WORKBENCH_SHELL = '1'
    vi.resetModules()
    const mod = await import('./client-environment-info.js')

    const footer = mod.formatClientEnvironmentFooter(SAMPLE)
    expect(footer.startsWith('---\nWorkbench:')).toBe(true)
    expect(mod.hasClientEnvironmentFooter(`oops\n\n${footer}`)).toBe(true)
    expect(mod.stripClientEnvironmentFooter(`please fix tabs\n\n${footer}`).trimEnd()).toBe(
      'please fix tabs'
    )
    expect(mod.appendClientEnvironmentFooter({ message: footer, info: SAMPLE })).toBe(footer)

    const orcaFooter = ['---', 'Orca: 1.4.178-rc.2', 'OS: win32 10.0.22631 (x64)'].join('\n')
    expect(mod.hasClientEnvironmentFooter(orcaFooter)).toBe(true)
    expect(mod.stripClientEnvironmentFooter(orcaFooter).trim()).toBe('')
  })
})
