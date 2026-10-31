import { OVERVIEW_TIME_ZONE } from './feature-timeline'

export const timeLabel = (time: string | number) =>
  new Date(time).toLocaleString('zh-CN', {
    timeZone: OVERVIEW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

export function openEvidenceUrl(url: string) {
  if (/^https?:\/\//i.test(url)) {
    void window.api.shell.openUrl(url)
  }
}
