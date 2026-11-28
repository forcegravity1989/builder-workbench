import { toast } from 'sonner'
import type { Bot } from '../../../../shared/bot-types'
import { MONICA_SUPPORT_ROLE } from '../../../../shared/workbench/monica-support-role'
import { isWorkbenchShell } from '../is-workbench-shell'

function reportInvalidDestination(): void {
  toast.error('无法打开该入口，请按回复中的文字路径前往。')
}

function openMonicaChatLink(href: string): boolean {
  if (!href.startsWith('#bw-open=')) {
    return false
  }
  try {
    decodeURIComponent(href)
  } catch {
    reportInvalidDestination()
    return true
  }
  const params = new URLSearchParams(href.slice(1))
  const target = params.get('bw-open')
  if (
    !target ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(target) ||
    href.includes('&&') ||
    href.endsWith('&') ||
    [...params].some(
      ([key, value]) =>
        !['bw-open', 'project', 'version'].includes(key) ||
        !value.trim() ||
        params.getAll(key).length !== 1
    )
  ) {
    reportInvalidDestination()
    return true
  }
  void import('../navigation/open-monica-destination')
    .then(({ openMonicaDestination }) =>
      openMonicaDestination(
        target,
        params.get('project') ?? undefined,
        params.get('version') ?? undefined
      )
    )
    .catch(reportInvalidDestination)
  return true
}

export function monicaHomeLinkHandler(bot: Bot | null, sessionId: string) {
  return isWorkbenchShell() &&
    bot?.hostId === 'local' &&
    bot.templateId === MONICA_SUPPORT_ROLE &&
    bot.chatSessionId === sessionId
    ? openMonicaChatLink
    : undefined
}
