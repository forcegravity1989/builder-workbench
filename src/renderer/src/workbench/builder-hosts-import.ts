/**
 * G3「导入 Builder 主机」:配置文件解析与导入计划的纯函数。
 * 结构 =「主机名: 该主机 Orca 分享的 runtime 配对地址」清单(高保真模板同款);
 * 配对本身只走 Orca 原生 verifyAndAddFromPairingCode,BW 不建平行主机台账。
 */
import { parseHostAccessLink } from '../../../shared/remote-pairing-address'

export const BUILDER_HOSTS_TEMPLATE_FILENAME = 'builder-hosts-template.json'

export type BuilderHostsTemplateHost = { name: string; address: string }

/** 模板内容(与 G3 高保真 download-template 一致):占位地址必须被真实配对地址替换。 */
export function builderHostsTemplate(): { 说明: string; hosts: BuilderHostsTemplateHost[] } {
  return {
    说明: '每台主机一条记录：name 是你给这台 Builder 主机取的名字，address 是该主机 Orca 分享的 runtime 配对地址',
    hosts: [
      { name: 'Builder 01', address: 'orca-runtime://<builder-01 分享的配对地址>' },
      { name: 'Builder 02', address: 'orca-runtime://<builder-02 分享的配对地址>' }
    ]
  }
}

export type ParsedBuilderHost = {
  name: string
  address: string
  /** 解析出的展示端点;地址无效时为 null。 */
  displayEndpoint: string | null
  /** 非空 = 该条不能导入,内容是可展示的原因与下一步。 */
  issue: string | null
}

export type BuilderHostsFileParse =
  | { ok: true; hosts: ParsedBuilderHost[] }
  | { ok: false; error: string }

/** 校验清单:整体结构错误返回 ok:false;单条问题记在该条 issue 上,逐台如实。 */
export function parseBuilderHostsFile(text: string): BuilderHostsFileParse {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: '不是有效的 JSON 文件——按模板重新合成后再导入' }
  }
  const hosts = (data as { hosts?: unknown } | null)?.hosts
  if (typeof data !== 'object' || data === null || !Array.isArray(hosts)) {
    return {
      ok: false,
      error: '结构不对：需要 { "hosts": [{ "name", "address" }] }——可先下载模板'
    }
  }
  if (hosts.length === 0) {
    return { ok: false, error: 'hosts 清单是空的：至少填一台主机' }
  }
  const seenNames = new Set<string>()
  const parsed: ParsedBuilderHost[] = hosts.map((entry, index) => {
    const record = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const address = typeof record.address === 'string' ? record.address.trim() : ''
    const fallbackName = `第 ${index + 1} 条`
    if (!name) {
      return {
        name: fallbackName,
        address,
        displayEndpoint: null,
        issue: '缺主机名（name）——名字自己取，导入后用于墙上来源标签'
      }
    }
    if (seenNames.has(name)) {
      return { name, address, displayEndpoint: null, issue: '清单里主机名重复——改名后再导入' }
    }
    seenNames.add(name)
    if (!address) {
      return { name, address, displayEndpoint: null, issue: '缺配对地址（address）' }
    }
    const link = parseHostAccessLink(address)
    if (!link.ok) {
      return {
        name,
        address,
        displayEndpoint: null,
        issue: `配对地址无效——让该主机在 Orca 里重新分享配对地址（${link.message}）`
      }
    }
    if (link.value.endpointKind === 'loopback') {
      return {
        name,
        address,
        displayEndpoint: link.value.displayEndpoint,
        issue: '地址指回本机（loopback）——让该主机用 Tailscale 或局域网地址重新分享'
      }
    }
    return { name, address, displayEndpoint: link.value.displayEndpoint, issue: null }
  })
  return { ok: true, hosts: parsed }
}

export type BuilderHostImportAction = 'import' | 'skip-paired' | 'invalid'

export type BuilderHostImportPlanEntry = ParsedBuilderHost & {
  action: BuilderHostImportAction
}

/**
 * 导入计划:同名已配对的主机跳过(重复导入同一配置幂等的判据与 Orca 主机名唯一约束一致,
 * 大小写敏感);地址无效的不发起配对。
 */
export function planBuilderHostImports(
  hosts: readonly ParsedBuilderHost[],
  pairedNames: readonly string[]
): BuilderHostImportPlanEntry[] {
  const paired = new Set(pairedNames.map((name) => name.trim()))
  return hosts.map((host) => {
    if (host.issue) {
      return { ...host, action: 'invalid' as const }
    }
    if (paired.has(host.name)) {
      return { ...host, action: 'skip-paired' as const }
    }
    return { ...host, action: 'import' as const }
  })
}
