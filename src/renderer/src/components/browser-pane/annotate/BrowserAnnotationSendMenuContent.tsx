import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import React from 'react'
import { ReviewNotesSendMenuContent } from '@/components/editor/ReviewNotesSendMenuContent'

export type BrowserAnnotationSendMenuContentProps = {
  worktreeId: string
  groupId: string
  prompt: string
  includePageDetails: boolean
  onIncludePageDetailsChange: (include: boolean) => void
  onPromptDelivered?: () => void
}

export function BrowserAnnotationSendMenuContent({
  worktreeId,
  groupId,
  prompt,
  includePageDetails,
  onIncludePageDetailsChange,
  onPromptDelivered
}: BrowserAnnotationSendMenuContentProps): React.JSX.Element {
  return (
    <>
      <ReviewNotesSendMenuContent
        worktreeId={worktreeId}
        groupId={groupId}
        prompt={prompt}
        // Why: keep browser-annotation delivery and telemetry stable even if
        // the shared review-notes menu defaults change later.
        promptDelivery="submit-after-ready"
        launchSource="notes_send"
        onPromptDelivered={onPromptDelivered}
      />
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem
        checked={includePageDetails}
        onCheckedChange={onIncludePageDetailsChange}
        onSelect={(event) => event.preventDefault()}
      >
        {translate(
          'auto.components.browser.pane.annotate.browser.page.annotation.tray.includePageDetails',
          'Include page details'
        )}
      </DropdownMenuCheckboxItem>
    </>
  )
}
