import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { Bot } from '../../../../shared/bot-types'
import { buildAutomationRrule } from '../../../../shared/automation-schedule-occurrences'

export function BotScheduleEditor({
  bot,
  target
}: {
  bot: Bot
  target: RuntimeClientTarget
}): React.JSX.Element {
  const id = useId()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [time, setTime] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ error: boolean; text: string }>()
  const active = useRef(false)
  const request = useRef<{ fields: string; key: string } | undefined>(undefined)

  async function schedule(): Promise<void> {
    if (active.current) {
      return
    }
    const dtstart = new Date(time).getTime()
    if (!name.trim() || !prompt.trim() || !Number.isFinite(dtstart) || dtstart <= Date.now()) {
      setNotice({
        error: true,
        text: translate('bots.schedule-invalid', 'Enter a name, a prompt, and a future start time.')
      })
      return
    }
    active.current = true
    setPending(true)
    try {
      const firstRun = new Date(dtstart)
      const fields = {
        name: name.trim(),
        prompt: prompt.trim(),
        agentId: bot.agent,
        bot: { botId: bot.id, runsIn: 'new', resultsTo: 'none' },
        rrule: buildAutomationRrule({
          preset: 'daily',
          hour: firstRun.getHours(),
          minute: firstRun.getMinutes()
        }),
        dtstart,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      const fingerprint = JSON.stringify(fields)
      if (request.current?.fields !== fingerprint) {
        request.current = { fields: fingerprint, key: crypto.randomUUID() }
      }
      await callRuntimeRpc(target, 'automation.create', {
        ...fields,
        creationKey: request.current.key,
        destination: { selector: { kind: 'self' } }
      })
      request.current = undefined
      setName('')
      setPrompt('')
      setTime('')
      setNotice({
        error: false,
        text: translate('bots.schedule-saved', 'Schedule saved in Automations.')
      })
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      active.current = false
      setPending(false)
    }
  }

  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">
        {translate('bots.schedule', 'Schedule a run')}
      </summary>
      <div className="grid gap-2 pt-2">
        <Label htmlFor={`${id}-name`}>{translate('bots.schedule-name', 'Schedule name')}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Label htmlFor={`${id}-prompt`}>{translate('bots.schedule-prompt', 'Prompt')}</Label>
        <Textarea
          id={`${id}-prompt`}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
        <Label htmlFor={`${id}-time`}>{translate('bots.schedule-start', 'Start time')}</Label>
        <Input
          id={`${id}-time`}
          type="datetime-local"
          value={time}
          onChange={(event) => setTime(event.currentTarget.value)}
        />
        <p className="text-xs text-muted-foreground">
          {translate('bots.schedule-daily', 'Repeats daily in the Bot host’s time zone.')}
        </p>
        <Button variant="outline" type="button" disabled={pending} onClick={() => void schedule()}>
          {translate('bots.schedule-create', 'Create schedule')}
        </Button>
        {notice ? (
          <p
            role={notice.error ? 'alert' : 'status'}
            className={notice.error ? 'text-sm text-destructive' : 'text-sm'}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </details>
  )
}
