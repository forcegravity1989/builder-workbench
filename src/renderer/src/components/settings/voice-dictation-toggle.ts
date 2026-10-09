import type { DeveloperPermissionRequestResult } from '../../../../shared/developer-permissions-types'
import type { VoiceSettings } from '../../../../shared/speech-types'

type VoiceDictationToggleOptions = {
  voiceEnabled: boolean
  updateVoiceSettings: (updates: Partial<VoiceSettings>) => void
  requestMicrophonePermission: () => Promise<DeveloperPermissionRequestResult>
  setPermissionPending?: (pending: boolean) => void
  isMounted?: () => boolean
  notifyPermissionGranted?: () => void
  notifyPermissionOpenedSystemSettings?: () => void
  notifyPermissionRequired?: () => void
  notifyPermissionRequestFailed?: () => void
}

export async function handleVoiceDictationToggle({
  voiceEnabled,
  updateVoiceSettings,
  requestMicrophonePermission,
  setPermissionPending,
  isMounted,
  notifyPermissionGranted,
  notifyPermissionOpenedSystemSettings,
  notifyPermissionRequired,
  notifyPermissionRequestFailed
}: VoiceDictationToggleOptions): Promise<void> {
  if (voiceEnabled) {
    updateVoiceSettings({ enabled: false })
    return
  }

  setPermissionPending?.(true)
  try {
    // Why: enabling dictation is the point where users expect the macOS
    // microphone prompt, not after their first attempted recording fails.
    const result = await requestMicrophonePermission()
    if (result.status === 'granted' || result.status === 'unsupported') {
      updateVoiceSettings({ enabled: true })
    }

    if (result.status === 'granted') {
      notifyPermissionGranted?.()
    } else if (result.openedSystemSettings) {
      notifyPermissionOpenedSystemSettings?.()
    } else if (result.status !== 'unsupported') {
      notifyPermissionRequired?.()
    }
  } catch {
    notifyPermissionRequestFailed?.()
  } finally {
    if (isMounted?.() ?? true) {
      setPermissionPending?.(false)
    }
  }
}
