import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot as BotIcon, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import type { Bot } from '../../../../shared/bot-types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { BotDialog } from './BotDialog'

type Listing = { bots: Bot[]; botsEnabled: boolean; chatEnabled: boolean }

export function SidebarBotsSection({ onOpenBot }: { onOpenBot: () => void }): React.JSX.Element {
  const environmentId = useAppStore((state) => state.settings?.activeRuntimeEnvironmentId)
  return (
    <HostBotsSection
      key={environmentId ?? 'local'}
      environmentId={environmentId}
      onOpenBot={onOpenBot}
    />
  )
}

function HostBotsSection({
  environmentId,
  onOpenBot
}: {
  environmentId?: string | null
  onOpenBot: () => void
}): React.JSX.Element | null {
  const environmentName = useAppStore(
    (state) => state.runtimeEnvironments.find((entry) => entry.id === environmentId)?.name
  )
  const target = useMemo(
    () => getActiveRuntimeTarget({ activeRuntimeEnvironmentId: environmentId }),
    [environmentId]
  )
  const [listing, setListing] = useState<Listing | null>(null)
  const [dialog, setDialog] = useState<Bot | 'new' | null>(null)
  const localChatEnabled = useAppStore((state) => state.settings?.experimentalStructuredNativeChat)

  useEffect(() => {
    let current = true
    let refreshGeneration = 0
    const refresh = () => {
      const requested = ++refreshGeneration
      void callRuntimeRpc<Listing>(target, 'bots.list').then(
        (result) => {
          if (current && requested === refreshGeneration) {
            setListing(result)
          }
        },
        () => {
          if (current && requested === refreshGeneration) {
            setListing(null)
          }
        }
      )
    }
    refresh()
    const unsubscribe = target.kind === 'local' ? window.api.repos.onChanged(refresh) : undefined
    return () => {
      current = false
      unsubscribe?.()
    }
  }, [target, localChatEnabled])

  const open = useCallback(
    async (bot: Bot) => {
      try {
        const { sessionId } = await callRuntimeRpc<{ sessionId: string }>(
          target,
          'bots.chat.open',
          {
            botId: bot.id
          }
        )
        const owner = { runtimeEnvironmentId: environmentId ?? null }
        const state = useAppStore.getState()
        await state.fetchProjectGroups(owner)
        await state.fetchFolderWorkspaces(owner)
        if (
          (useAppStore.getState().settings?.activeRuntimeEnvironmentId ?? null) !==
          owner.runtimeEnvironmentId
        ) {
          return
        }
        useAppStore.getState().setActiveView('terminal')
        await activateAiVaultStructuredSession({
          structuredSession: { sessionId, workspaceId: folderWorkspaceKey(bot.folderWorkspaceId) }
        })
        onOpenBot()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    },
    [environmentId, onOpenBot, target]
  )

  if (!listing?.botsEnabled) {
    return null
  }

  return (
    <section aria-label={translate('bots.sidebar', 'Bots')} className="shrink-0 px-2 pb-2">
      <div className="flex h-8 items-center justify-between px-2">
        <h2 className="text-xs font-medium text-muted-foreground">
          {translate('bots.sidebar', 'Bots')}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('bots.new', 'New bot')}
          disabled={!listing.chatEnabled}
          onClick={() => setDialog('new')}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {!listing.chatEnabled ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          {translate('bots.chat-disabled', 'Enable structured Chat in Settings on this host.')}
        </p>
      ) : null}
      <div className="scrollbar-sleek max-h-52 overflow-y-auto">
        {listing.bots.map((bot) => (
          <div key={bot.id} className="group flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 justify-start"
              disabled={!listing.chatEnabled}
              onClick={() => void open(bot)}
            >
              <BotIcon aria-hidden="true" />
              <span className="truncate">{bot.name}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('bots.edit', 'Edit bot')}
              onClick={() => setDialog(bot)}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      {dialog !== null ? (
        <BotDialog
          key={dialog === 'new' ? 'new' : dialog.id}
          target={target}
          hostName={environmentName ?? translate('bots.this-computer', 'This computer')}
          bot={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={(bot) => {
            setListing((previous) =>
              previous
                ? {
                    ...previous,
                    bots:
                      dialog === 'new' && !previous.bots.some((entry) => entry.id === bot.id)
                        ? [...previous.bots, bot]
                        : previous.bots.map((entry) => (entry.id === bot.id ? bot : entry))
                  }
                : previous
            )
            setDialog(null)
            if (dialog === 'new') {
              void open(bot)
            }
          }}
        />
      ) : null}
    </section>
  )
}
