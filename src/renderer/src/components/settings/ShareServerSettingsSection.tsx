import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ShareConfigView } from '../../../../shared/workbench/share'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { getShareConfig, saveShareConfig, testShareConfig } from '../artifacts/share-server-client'

type Status = {
  kind: 'idle' | 'saving' | 'testing' | 'saved' | 'tested' | 'error'
  message?: string
}

/** Map the host's stable error codes; only unmapped failures fall back to its message. */
function shareConfigError(code: string, message: string): string {
  if (code === 'invalid-config') {
    return translate(
      'auto.components.settings.shareServer.invalidAddress',
      'The server address must be an http:// or https:// URL.'
    )
  }
  if (code === 'network') {
    return translate(
      'auto.components.settings.shareServer.unreachable',
      'Could not reach the share server. Check the address and network.'
    )
  }
  if (code === 'unauthorized') {
    return translate(
      'auto.components.settings.shareServer.rejectedToken',
      'The share server rejected the upload token.'
    )
  }
  return message
}

/** Self-hosted share service address and write token; both live outside synced settings. */
export function ShareServerSettingsSection(): React.JSX.Element {
  const [config, setConfig] = useState<ShareConfigView | null>(null)
  const [serverUrl, setServerUrl] = useState('')
  const [uploadToken, setUploadToken] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const isWebClient = isWebClientLocation()

  useEffect(() => {
    let cancelled = false
    void getShareConfig()
      .then((value) => {
        if (!cancelled) {
          setConfig(value)
          setServerUrl(value.serverUrl)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to read share service settings:', error)
        if (!cancelled) {
          setStatus({
            kind: 'error',
            message: translate(
              'auto.components.settings.shareServer.readFailed',
              'Could not read the share server settings.'
            )
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (): Promise<void> => {
    setStatus({ kind: 'saving' })
    try {
      const result = await saveShareConfig({
        serverUrl,
        ...(uploadToken ? { uploadToken } : {})
      })
      if (!result.ok) {
        setStatus({
          kind: 'error',
          message: shareConfigError(result.error.code, result.error.message)
        })
        return
      }
      setConfig(result.value)
      setServerUrl(result.value.serverUrl)
      setUploadToken('')
      setStatus({
        kind: 'saved',
        message: translate('auto.components.settings.shareServer.saved', 'Share settings saved.')
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const test = async (): Promise<void> => {
    setStatus({ kind: 'testing' })
    try {
      const result = await testShareConfig({
        serverUrl,
        ...(uploadToken ? { uploadToken } : {})
      })
      setStatus(
        result.ok
          ? {
              kind: 'tested',
              message: translate(
                'auto.components.settings.shareServer.testSucceeded',
                'Connected to the share server.'
              )
            }
          : {
              kind: 'error',
              message: shareConfigError(result.error.code, result.error.message)
            }
      )
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const clearToken = async (): Promise<void> => {
    setStatus({ kind: 'saving' })
    try {
      // An explicit empty string is the only way to remove the stored secret; a blank field
      // means "keep the saved token".
      const result = await saveShareConfig({ serverUrl, uploadToken: '' })
      if (!result.ok) {
        setStatus({
          kind: 'error',
          message: shareConfigError(result.error.code, result.error.message)
        })
        return
      }
      setConfig(result.value)
      setServerUrl(result.value.serverUrl)
      setStatus({
        kind: 'saved',
        message: translate(
          'auto.components.settings.shareServer.tokenCleared',
          'Upload token removed.'
        )
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const busy = status.kind === 'saving' || status.kind === 'testing'

  return (
    <section className="space-y-4 py-5">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {translate('auto.components.settings.shareServer.title', 'Share server')}
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.settings.shareServer.description',
            'HTML and Markdown files are uploaded to your team’s self-hosted service and opened through a public link.'
          )}
        </p>
      </div>

      {isWebClient ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate(
            'auto.components.settings.shareServer.desktopOnly',
            'Desktop only. Open Settings → Artifacts on the host device to change these settings.'
          )}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">
              {translate('auto.components.settings.shareServer.serverUrl', 'Server address')}
            </span>
            <Input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder={translate(
                'auto.components.settings.shareServer.serverUrlPlaceholder',
                'https://share.example.com'
              )}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">
              {translate('auto.components.settings.shareServer.uploadToken', 'Upload token')}
            </span>
            <Input
              type="password"
              value={uploadToken}
              onChange={(event) => setUploadToken(event.target.value)}
              placeholder={
                config?.uploadTokenSet
                  ? translate(
                      'auto.components.settings.shareServer.uploadTokenSaved',
                      'Saved — leave blank to keep it'
                    )
                  : translate(
                      'auto.components.settings.shareServer.uploadTokenEmpty',
                      'Token issued with the server'
                    )
              }
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
              {status.kind === 'saving' ? <Loader2 className="animate-spin" /> : null}
              {translate('auto.components.settings.shareServer.save', 'Save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || serverUrl.trim() === ''}
              onClick={() => void test()}
            >
              {status.kind === 'testing' ? <Loader2 className="animate-spin" /> : null}
              {translate('auto.components.settings.shareServer.test', 'Test connection')}
            </Button>
            {config?.uploadTokenSet ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void clearToken()}
              >
                {translate('auto.components.settings.shareServer.clearToken', 'Clear token')}
              </Button>
            ) : null}
            {status.message ? (
              <p
                className={
                  status.kind === 'error'
                    ? 'text-xs text-destructive'
                    : 'text-xs text-muted-foreground'
                }
              >
                {status.message}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
