import { useRef, type ReactNode } from 'react'
import { MessageRow } from '@/components/native-chat/NativeChatMessageRow'
import { NativeChatComposerField } from '@/components/native-chat/NativeChatComposerField'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'

const noop = () => {}
const emptyAutocomplete = { mode: 'none' } as const

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  scope?: string
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  scope = 'review-collector'
}: ChatComposerProps) {
  const ref = useRef(null)
  const ime = useImeEnterGestureOwnership()
  return (
    <NativeChatComposerField
      composerScopeKey={scope}
      textareaRef={ref}
      draft={value}
      disabled={false}
      hasPty={false}
      canSend={!!value.trim()}
      autocomplete={emptyAutocomplete}
      activeSuggestion={-1}
      notice={null}
      imageAttachments={[]}
      sendButtonDisabled={!value.trim()}
      isWorking={false}
      attachDisabled
      dictationDisabled
      isDictating={false}
      isDictationHoldMode={false}
      imeEnterGesture={ime}
      onDraftChange={onChange}
      onTextareaSelect={noop}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          onSend()
        }
      }}
      onImeSettled={noop}
      onPaste={noop}
      pickerListboxId="feedback-review-picker"
      onChoosePickerItem={noop}
      onRetrySkills={noop}
      onAcceptMention={noop}
      onRemoveImageAttachment={noop}
      onAttach={noop}
      onDictationToggle={noop}
      onDictationHoldStart={noop}
      onDictationHoldEnd={noop}
      onSend={onSend}
      sessionOptionsSurface={null}
      sessionOptionsSnapshot={[]}
    />
  )
}
type ChatRowProps = { text: string; role?: 'assistant' | 'user'; id: string }

export function ChatRow({ text, role = 'assistant', id }: ChatRowProps) {
  return (
    <MessageRow
      message={{ id, role, blocks: [{ type: 'text', text }], timestamp: 1, source: 'transcript' }}
      expandSignal={false}
      onScrollMessageToTop={noop}
    />
  )
}
export function ChatTranscript({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-[5px]">{children}</div>
}
