import { describe, expect, it } from 'vitest'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '../../../shared/pairing'
import {
  builderHostsTemplate,
  parseBuilderHostsFile,
  planBuilderHostImports
} from './builder-hosts-import'

function accessLink(endpoint: string): string {
  return encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint,
    deviceToken: 'token',
    publicKeyB64: 'key',
    scope: 'runtime'
  })
}

function manifest(hosts: unknown[]): string {
  return JSON.stringify({ hosts })
}

describe('builder hosts import manifest', () => {
  it('parses a filled manifest and flags the untouched template placeholders', () => {
    const parsed = parseBuilderHostsFile(
      manifest([
        { name: 'Builder 01', address: accessLink('wss://orca.example.com/runtime') },
        { name: 'Builder 02', address: accessLink('ws://[fd7a:115c:a1e0::1]:6768') }
      ])
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.hosts.map((h) => h.issue)).toEqual([null, null])
    expect(parsed.hosts[0].displayEndpoint).toBe('orca.example.com')

    // 模板占位地址必须被替换:原样导入要逐台报「地址无效」,不冒充可导入。
    const template = parseBuilderHostsFile(JSON.stringify(builderHostsTemplate()))
    expect(template.ok).toBe(true)
    if (template.ok) {
      expect(template.hosts).toHaveLength(2)
      expect(template.hosts.every((h) => h.issue !== null)).toBe(true)
    }
  })

  it('rejects broken structure with an honest reason', () => {
    expect(parseBuilderHostsFile('not json')).toMatchObject({ ok: false })
    expect(parseBuilderHostsFile(JSON.stringify({ servers: [] }))).toMatchObject({ ok: false })
    expect(parseBuilderHostsFile(manifest([]))).toMatchObject({ ok: false })
  })

  it('flags per-entry problems without failing the whole file', () => {
    const parsed = parseBuilderHostsFile(
      manifest([
        { name: 'Builder 01', address: accessLink('wss://orca.example.com/runtime') },
        { name: '"builder 01"', address: accessLink('wss://orca2.example.com/runtime') },
        { name: 'No Address' },
        { name: 'Loopback', address: accessLink('ws://127.0.0.1:6768') }
      ])
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    expect(parsed.hosts[0].issue).toBeNull()
    expect(parsed.hosts[1].issue).toContain('重复')
    expect(parsed.hosts[2].issue).toContain('缺配对地址')
    expect(parsed.hosts[3].issue).toContain('loopback')
  })

  it('leaves valid names to native host-key verification for add or re-pair', () => {
    const parsed = parseBuilderHostsFile(
      manifest([
        { name: 'Builder 01', address: accessLink('wss://orca.example.com/runtime') },
        { name: 'Builder 02', address: accessLink('wss://orca2.example.com/runtime') },
        { name: 'Broken', address: 'nope' }
      ])
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    const plan = planBuilderHostImports(parsed.hosts)
    expect(plan.map((entry) => entry.action)).toEqual(['import', 'import', 'invalid'])
  })
})
