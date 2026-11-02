import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

// Notify once per session about blocked OS notifications so completion bursts do not nag.
let shownThisSession = false

export function showBlockedNotificationFallbackToast(): void {
  if (shownThisSession) {
    return
  }
  shownThisSession = true
  toast.warning(
    isWorkbenchShell()
      ? translate(
          'auto.lib.blocked.notification.fallback.8d4c07e6b5',
          'macOS is blocking Workbench notifications'
        )
      : translate(
          'auto.lib.blocked.notification.fallback.de50bef680',
          'macOS is blocking Orca notifications'
        ),
    {
      description: isWorkbenchShell()
        ? translate(
            'auto.components.onboarding.mac.notification.permission.card.c25d81f9e3',
            'Turn on Allow notifications for Workbench in System Settings.'
          )
        : translate(
            'auto.components.onboarding.mac.notification.permission.card.721d2bedb6',
            'Turn on Allow notifications for Orca in System Settings.'
          ),
      action: {
        label: translate(
          'auto.components.onboarding.NotificationStep.4f6a1da718',
          'Open System Settings'
        ),
        onClick: () => {
          void window.api.notifications.openSystemSettings()
        }
      }
    }
  )
}
