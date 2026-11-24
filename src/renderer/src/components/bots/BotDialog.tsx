import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { BOT_NAME_MAX_LENGTH, type Bot } from '../../../../shared/bot-types'
import { BotMemoryEditor } from './BotMemoryEditor'
import { BotScheduleEditor } from './BotScheduleEditor'

const NATIVE_CHAT_AGENTS = ['claude', 'codex'] as const

export function BotDialog({
  target,
  hostName,
  bot,
  onClose,
  onSaved
}: {
  target: RuntimeClientTarget
  hostName: string
  bot?: Bot
  onClose: () => void
  onSaved: (bot: Bot) => void
}): React.JSX.Element {
  const id = useId()
  const [name, setName] = useState(bot?.name ?? '')
  const [agent, setAgent] = useState<string>(bot?.agent ?? '')
  const [purpose, setPurpose] = useState('')
  const [installed, setInstalled] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const savePending = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const agents = NATIVE_CHAT_AGENTS.filter((entry) => installed?.includes(entry))
  const chosen = agents.find((entry) => entry === agent) ?? bot?.agent ?? agents[0]

  useEffect(() => {
    let current = true
    void callRuntimeRpc<string[]>(target, 'preflight.detectAgents').then(
      (result) => {
        if (current) {
          setInstalled(result)
        }
      },
      (failure: unknown) => {
        if (current) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    )
    return () => {
      current = false
    }
  }, [target])

  async function save(): Promise<void> {
    if (savePending.current || !chosen || !name.trim()) {
      return
    }
    savePending.current = true
    setSaving(true)
    setError(null)
    try {
      const fields = { name: name.trim(), agent: chosen }
      const response = bot
        ? await callRuntimeRpc<{ bot: Bot }>(target, 'bots.update', {
            botId: bot.id,
            updates: fields
          })
        : await callRuntimeRpc<{ bot: Bot }>(target, 'bots.create', {
            ...fields,
            ...(purpose.trim() ? { seed: { purpose: purpose.trim() } } : {})
          })
      onSaved(response.bot)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      savePending.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="scrollbar-sleek max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {bot ? translate('bots.edit', 'Edit bot') : translate('bots.new', 'New bot')}
          </DialogTitle>
          <DialogDescription>
            {translate('bots.runs-on', 'Runs on {{host}}', { host: hostName })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>{translate('bots.name', 'Name')}</Label>
            <Input
              id={`${id}-name`}
              maxLength={BOT_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-agent`}>{translate('bots.agent', 'Agent')}</Label>
            <select
              id={`${id}-agent`}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={chosen ?? ''}
              disabled={!chosen}
              onChange={(event) => setAgent(event.currentTarget.value)}
            >
              {bot && !agents.some((entry) => entry === bot.agent) ? (
                <option value={bot.agent}>{bot.agent}</option>
              ) : null}
              {agents.map((entry) => (
                <option value={entry} key={entry}>
                  {entry === 'claude'
                    ? translate('bots.agent-claude', 'Claude Code')
                    : translate('bots.agent-codex', 'Codex')}
                </option>
              ))}
            </select>
            {installed && !chosen ? (
              <p className="text-sm text-muted-foreground">
                {translate('bots.agent-missing', 'Set up Claude Code or Codex on this host.')}
              </p>
            ) : null}
          </div>
          {bot ? (
            <BotMemoryEditor botId={bot.id} target={target} />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-purpose`}>{translate('bots.purpose', 'Purpose')}</Label>
              <Textarea
                id={`${id}-purpose`}
                maxLength={200}
                value={purpose}
                onChange={(event) => setPurpose(event.currentTarget.value)}
              />
            </div>
          )}
          {bot && (bot.agent === 'claude' || bot.agent === 'codex') ? (
            <BotScheduleEditor bot={bot} target={target} />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {translate('bots.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving || !chosen || !name.trim()}>
              {bot ? translate('bots.save', 'Save') : translate('bots.create', 'Create bot')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
