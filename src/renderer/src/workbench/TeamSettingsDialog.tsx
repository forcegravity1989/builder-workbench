import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, Save, UsersRound, X } from 'lucide-react'
import type { TeamDirectory } from '../../../shared/team-directory'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type TeamSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TeamSettingsDialog({ open, onOpenChange }: TeamSettingsDialogProps): React.JSX.Element {
  const [groupId, setGroupId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [directory, setDirectory] = useState<TeamDirectory | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setGroupId('')
      setSpaceId('')
      setDirectory(null)
      setError(null)
    }
  }, [open])

  const enterTeam = (): void => {
    setError(null)
    setDirectory({
      schema_version: 1,
      team_group_id: groupId.trim(),
      team_space_id: spaceId.trim(),
      identity_source: 'welink-cli',
      hosts: [],
      projects: []
    })
  }

  const loadDirectory = async (): Promise<void> => {
    if (!groupId.trim() || !spaceId.trim()) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.teamCollaboration.readDirectory({
        groupId: groupId.trim(),
        spaceId: spaceId.trim()
      })
      setDirectory(result.directory)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取团队目录失败。')
    } finally {
      setLoading(false)
    }
  }

  const saveDirectory = async (): Promise<void> => {
    if (!directory || !directory.team_group_id || !directory.team_space_id) {
      setError('请填写群 ID 和群空间 ID。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.teamCollaboration.writeDirectory(directory)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步团队目录失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="size-4" /> 团队设置
          </DialogTitle>
          <DialogDescription>
            先用群 ID 进入团队；群空间已有团队目录时直接填写或读回空间 ID。
          </DialogDescription>
        </DialogHeader>
        {!directory ? (
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <span>WeLink 群 ID</span>
              <Input value={groupId} onChange={(event) => setGroupId(event.target.value)} inputMode="numeric" />
            </label>
            <Button type="button" onClick={enterTeam} disabled={!groupId.trim()}>
              进入团队设置
            </Button>
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-4 overflow-y-auto scrollbar-sleek pr-1">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
              <label className="space-y-1 text-sm">
                <span>团队群 ID</span>
                <Input
                  value={groupId}
                  onChange={(event) => {
                    setGroupId(event.target.value)
                    setDirectory((current) => (current ? { ...current, team_group_id: event.target.value } : current))
                  }}
                  inputMode="numeric"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>群空间 ID</span>
                <Input
                  value={spaceId}
                  onChange={(event) => {
                    setSpaceId(event.target.value)
                    setDirectory((current) => (current ? { ...current, team_space_id: event.target.value } : current))
                  }}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void loadDirectory()} disabled={loading}>
                {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                读取群空间目录
              </Button>
              <Button type="button" onClick={() => void saveDirectory()} disabled={saving || !spaceId.trim()}>
                {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                同步到群空间
              </Button>
            </div>
            <div className="rounded-lg border border-border/60">
              <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">成员与主机</div>
              {directory.hosts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">读取目录后显示成员与主机。</p>
              ) : (
                directory.hosts.map((host) => (
                  <div key={host.member_id} className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                    <span>{host.name ?? host.member_id}</span>
                    <span className="text-muted-foreground">{host.orca_endpoint ?? '未登记 Orca 地址'}</span>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-lg border border-border/60">
              <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">团队项目</div>
              {directory.projects.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">还没有登记团队项目。</p>
              ) : (
                directory.projects.map((project) => (
                  <div key={project.repo_id} className="border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                    <div className="font-medium">{project.name ?? project.repo_id}</div>
                    <div className="text-muted-foreground">来源 {project.sources.join('、')}</div>
                  </div>
                ))
              )}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        {error && !directory ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" variant="ghost" size="icon-sm" className="absolute top-4 right-4" onClick={() => onOpenChange(false)} aria-label="关闭团队设置">
          <X className="size-4" />
        </Button>
      </DialogContent>
    </Dialog>
  )
}
