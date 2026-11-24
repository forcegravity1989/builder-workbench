import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'

export function BotMemoryEditor({
  botId,
  target
}: {
  botId: string
  target: RuntimeClientTarget
}): React.JSX.Element {
  const [facts, setFacts] = useState<string[]>()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const requests = useRef(false)

  useEffect(() => {
    let active = true
    void callRuntimeRpc<{ facts: string[] }>(target, 'bots.memory.list', { botId }).then(
      (result) => {
        if (active) {
          setFacts(result.facts)
        }
      },
      (failure: unknown) => {
        if (active) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    )
    return () => {
      active = false
    }
  }, [botId, target])

  async function saveFact(forget?: string): Promise<void> {
    if (requests.current) {
      return
    }
    requests.current = true
    setPending(true)
    setError(undefined)
    try {
      await (forget !== undefined
        ? callRuntimeRpc(target, 'bots.memory.forget', { botId, fact: forget })
        : callRuntimeRpc(target, 'bots.memory.edit', { botId, fact: editing, text: text.trim() }))
      const result = await callRuntimeRpc<{ facts: string[] }>(target, 'bots.memory.list', {
        botId
      })
      setFacts(result.facts)
      setEditing(undefined)
      setText('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      requests.current = false
      setPending(false)
    }
  }

  return (
    <details className="grid gap-2">
      <summary className="cursor-pointer text-sm font-medium">
        {translate('bots.memory', 'Memory')}
      </summary>
      {facts ? (
        <div className="grid gap-2 pt-2">
          <ul className="scrollbar-sleek grid max-h-36 gap-1 overflow-y-auto">
            {facts.map((fact, index) => (
              <li key={index} className="flex items-center gap-1 text-sm">
                <span className="min-w-0 flex-1 break-words">{fact}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEditing(fact)
                    setText(fact)
                  }}
                >
                  {translate('bots.memory-edit', 'Edit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => void saveFact(fact)}
                >
                  {translate('bots.memory-forget', 'Forget')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              aria-label={translate('bots.memory-fact', 'Memory fact')}
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (text.trim()) {
                    void saveFact()
                  }
                }
              }}
            />
            <Button
              type="button"
              disabled={pending || !text.trim()}
              onClick={() => void saveFact()}
            >
              {editing ? translate('bots.save', 'Save') : translate('bots.memory-add', 'Add fact')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </details>
  )
}
