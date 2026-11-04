import { codehubApi } from '@/lib/codehub-api'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LoaderCircle } from 'lucide-react'
import type { Repo } from '../../../../../shared/repo-types'

export function CodeHubCreateIssueDialog({
  repo: codehubRepo,
  open,
  onOpenChange,
  onCreated
}: {
  repo: Repo | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  return (
    <Dialog open={open} onOpenChange={(open) => !creating && onOpenChange(open)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
          </DialogTitle>
          <DialogDescription>{codehubRepo?.displayName}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const nextTitle = title.trim()
            if (!codehubRepo || !nextTitle || creating) {
              return
            }
            setCreating(true)
            void codehubApi
              .createIssue(
                {
                  repoPath: codehubRepo.path,
                  repoId: codehubRepo.id,
                  title: nextTitle,
                  description: description.trim() || undefined,
                  assignee: assignee.trim() || undefined
                },
                codehubRepo
              )
              .then(() => {
                setTitle('')
                setDescription('')
                setAssignee('')
                onOpenChange(false)
                toast.success(
                  translate('auto.components.TaskPage.codehubIssueCreated', 'Issue created')
                )
                onCreated()
              })
              .catch((error: unknown) => {
                toast.error(error instanceof Error ? error.message : String(error))
              })
              .finally(() => setCreating(false))
          }}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={translate('auto.components.TaskPage.codehubIssueTitle', 'New issue title')}
          />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={translate('auto.components.TaskPage.codehubIssueBody', 'Description')}
            className="min-h-28 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
          />
          <Input
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            placeholder={translate('auto.components.TaskPage.codehubAssignee', 'Assignee username')}
          />
          <DialogFooter>
            <Button type="submit" disabled={creating || title.trim().length === 0}>
              {creating ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {translate('auto.components.TaskPage.codehubCreateIssue', 'Create issue')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
