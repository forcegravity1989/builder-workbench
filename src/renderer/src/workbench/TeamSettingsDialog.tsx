import { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, LoaderCircle, Plus, Save, UsersRound, X } from 'lucide-react'
import type { TeamDirectory } from '../../../shared/team-directory'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId } from '../../../shared/execution-host/execution-host'
import { cacheGeneratedRuntimePairingLink } from '@/components/settings/runtime-pairing-link-state'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import { TeamBindingForm } from './TeamBindingForm'
import { TeamSettingsMembers } from './TeamSettingsMembers'
import { logWorkbenchError, notifyWorkbenchError } from './error-feedback'
import {
  hasTeamBinding,
  rememberedTeamBinding,
  rememberTeamBinding,
  syncTeamHosts
} from './team-hosts'
import type { TeamBindingSelection } from './use-team-group-picker'

type TeamSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Last directory read in this renderer session, shown immediately on reopen while a fresh read runs.
let directorySnapshot: {
  directory: TeamDirectory
  fileId: string | null
  currentMemberId: string | null
} | null = null

export function TeamSettingsDialog({
  open,
  onOpenChange
}: TeamSettingsDialogProps): React.JSX.Element {
  // The group the binding form is offering to switch to; both IDs come from the
  // picker rather than from two hand-typed fields.
  const [pendingSelection, setPendingSelection] = useState<TeamBindingSelection | null>(null)
  const [directory, setDirectory] = useState<TeamDirectory | null>(null)
  const [directoryBase, setDirectoryBase] = useState<string | null>(null)
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingHostId, setGeneratingHostId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectRegisterOpen, setProjectRegisterOpen] = useState(false)
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [switchingTeam, setSwitchingTeam] = useState(false)
  const [switchFailed, setSwitchFailed] = useState(false)
  const reading = useRef(false)
  const switchButton = useRef<HTMLButtonElement>(null)
  const restoreSwitchFocus = useRef(false)
  const repos = useAppStore((state) => state.repos)
  const updateRepo = useAppStore((state) => state.updateRepo)
  // The team.json the visible draft was read from; saving refuses to overwrite a newer one.
  const directoryFileIdRef = useRef<string | null | undefined>(undefined)
  const editedLocally = Boolean(directory && JSON.stringify(directory) !== directoryBase)
  const busy = loading || saving || generatingHostId !== null

  useEffect(() => {
    if (!switchingTeam && restoreSwitchFocus.current) {
      restoreSwitchFocus.current = false
      switchButton.current?.focus()
    }
  }, [switchingTeam])

  useEffect(() => {
    if (!open) {
      setDirectory(null)
      setDirectoryBase(null)
      setCurrentMemberId(null)
      setSelectedProjectId('')
      setProjectRegisterOpen(false)
      setFilePreviewOpen(false)
      setLoadFailed(false)
      setSwitchingTeam(false)
      setSwitchFailed(false)
      setPendingSelection(null)
      directoryFileIdRef.current = undefined
    }
  }, [open])

  const enterTeam = (): void => {
    if (!pendingSelection) {
      return
    }
    const { groupId, spaceId } = pendingSelection
    if (!directory) {
      setPendingSelection(null)
    }
    const remembered = rememberedTeamBinding()
    const changingBinding =
      Boolean(remembered.groupId && remembered.spaceId) &&
      (groupId !== remembered.groupId || spaceId !== remembered.spaceId)
    if (switchingTeam || changingBinding) {
      void loadDirectory(groupId, spaceId, true)
    } else {
      void loadDirectory(groupId, spaceId).then(syncLoadedTeamHosts)
    }
  }

  const cancelSwitch = (): void => {
    restoreSwitchFocus.current = true
    setSwitchingTeam(false)
  }

  const beginSwitch = (): void => {
    setPendingSelection(null)
    setSwitchFailed(false)
    setSwitchingTeam(true)
  }

  const closeDialog = (): void => {
    if (busy || reading.current) {
      return
    }
    if (switchingTeam) {
      cancelSwitch()
    } else {
      onOpenChange(false)
    }
  }

  const refreshDirectory = (): void => {
    if (busy || !directory) {
      return
    }
    if (editedLocally) {
      notifyWorkbenchError('团队目录未刷新', null, '先保存当前目录修改，再刷新。')
      return
    }
    void loadDirectory(directory.team_group_id, directory.team_space_id)
  }

  async function syncLoadedTeamHosts(loaded: boolean): Promise<void> {
    if (!loaded) {
      return
    }
    try {
      await syncTeamHosts()
    } catch (cause) {
      notifyWorkbenchError('团队主机同步失败', cause, '稍后从「管理远程主机」刷新团队主机。')
    }
  }

  async function loadDirectory(
    requestedGroupId: string,
    requestedSpaceId: string,
    switching = false
  ): Promise<boolean> {
    if (reading.current) {
      return false
    }
    const nextGroupId = requestedGroupId.trim()
    const nextSpaceId = requestedSpaceId.trim()
    if (!nextGroupId || !nextSpaceId) {
      notifyWorkbenchError('团队信息不完整', null, '重新选择 WeLink 群后重试。')
      return false
    }
    reading.current = true
    setLoading(true)
    setLoadFailed(false)
    setSwitchFailed(false)
    try {
      const result = await window.api.teamCollaboration.readDirectory({
        groupId: nextGroupId,
        spaceId: nextSpaceId,
        ...(switching ? { switching: true } : {})
      })
      directorySnapshot = {
        directory: result.directory,
        fileId: result.fileId,
        currentMemberId: result.currentMemberId
      }
      setDirectory(result.directory)
      setDirectoryBase(JSON.stringify(result.directory))
      directoryFileIdRef.current = result.fileId
      setCurrentMemberId(result.currentMemberId)
      rememberTeamBinding(result.directory.team_group_id, result.directory.team_space_id)
      if (switching) {
        setSelectedProjectId('')
        setProjectRegisterOpen(false)
        cancelSwitch()
      }
      return true
    } catch (cause) {
      if (switching) {
        logWorkbenchError('团队切换读取失败', cause)
        setLoadFailed(true)
        setSwitchFailed(true)
        return false
      }
      setLoadFailed(true)
      notifyWorkbenchError(
        '团队目录读取失败',
        cause,
        hasTeamBinding() ? '检查 WeLink 连接后重试。' : '检查 WeLink 连接，再重新选择 WeLink 群。'
      )
      return false
    } finally {
      reading.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const binding = rememberedTeamBinding()
    setPendingSelection(null)
    if (binding.groupId && binding.spaceId) {
      if (
        directorySnapshot?.directory.team_group_id === binding.groupId &&
        directorySnapshot.directory.team_space_id === binding.spaceId
      ) {
        setDirectory(directorySnapshot.directory)
        setDirectoryBase(JSON.stringify(directorySnapshot.directory))
        directoryFileIdRef.current = directorySnapshot.fileId
        setCurrentMemberId(directorySnapshot.currentMemberId)
      }
      void loadDirectory(binding.groupId, binding.spaceId).then(syncLoadedTeamHosts)
    }
    // The loader is intentionally stable for this open-session bootstrap; rerunning
    // it for every renderer callback would issue duplicate OneBox reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const saveDirectory = async (): Promise<void> => {
    if (!directory || !directory.team_group_id || !directory.team_space_id) {
      notifyWorkbenchError('团队信息不完整', null, '重新绑定团队后再保存。')
      return
    }
    setSaving(true)
    try {
      const written = await window.api.teamCollaboration.writeDirectory(
        directory,
        directoryFileIdRef.current
      )
      directoryFileIdRef.current = written.fileId
      setDirectoryBase(JSON.stringify(directory))
      rememberTeamBinding(directory.team_group_id, directory.team_space_id)
    } catch (cause) {
      notifyWorkbenchError('团队目录未保存', cause, '修改已保留；若接口限流，稍后再保存。')
    } finally {
      setSaving(false)
    }
  }

  const generateHostAddress = async (memberId: string): Promise<void> => {
    const host = directory?.hosts.find((candidate) => candidate.member_id === memberId)
    if (!directory?.team_group_id || currentMemberId !== memberId || !host) {
      return
    }
    setGeneratingHostId(memberId)
    try {
      const result = await window.api.mobile.getRuntimePairingUrl({
        // A fresh team-read link is the only link this host can safely mint.
        // The link is written to the team directory; this host must never
        // verify its own pairing code as a remote environment.
        rotate: false,
        reach: 'network',
        accessMode: 'team-read',
        teamBinding: { teamGroupId: directory.team_group_id, memberId },
        // Members connect under their own names; this name only labels the link until they do.
        name: `${host.name ?? memberId}的团队共享链接`,
        ...(host.avatar ? { avatar: host.avatar } : {})
      })
      if (!result.available) {
        throw new Error(result.guidance ?? '当前主机无法生成 Orca 共享地址。')
      }
      // The “共享此主机” page recalls the link from this reference, so the full link stays visible.
      const offer = parsePairingCode(result.pairingUrl)
      if (offer) {
        cacheGeneratedRuntimePairingLink({
          address: offer.endpoint,
          intent: 'another',
          pairingUrl: result.pairingUrl,
          webClientUrl: result.webClientUrl,
          deviceId: result.deviceId
        })
      }
      setDirectory((current) =>
        current
          ? {
              ...current,
              hosts: current.hosts.map((host) =>
                host.member_id === memberId
                  ? { ...host, host_id: result.deviceId, orca_endpoint: result.pairingUrl }
                  : host
              )
            }
          : current
      )
    } catch (cause) {
      notifyWorkbenchError('Orca 共享地址生成失败', cause, '检查共享主机配置后重试。')
    } finally {
      setGeneratingHostId(null)
    }
  }

  const registerProject = async (): Promise<void> => {
    if (!directory || !selectedProjectId) {
      return
    }
    const repo = repos.find((candidate) => candidate.id === selectedProjectId)
    const identity = repo?.gitRemoteIdentity
    if (!repo || !identity?.canonicalKey) {
      notifyWorkbenchError('无法登记项目', null, '选择带有远端仓库身份的本机项目。')
      return
    }
    if (!currentMemberId || !directory.hosts.some((host) => host.member_id === currentMemberId)) {
      notifyWorkbenchError(
        '无法登记项目',
        null,
        '未能确认当前 WeLink 成员身份，重新读取团队目录后重试。'
      )
      return
    }
    const alreadyRegistered = directory.projects.some(
      (project) => project.repo_id === identity.canonicalKey
    )
    setSaving(true)
    const nextDirectory: TeamDirectory = alreadyRegistered
      ? directory
      : {
          ...directory,
          projects: [
            ...directory.projects,
            {
              repo_id: identity.canonicalKey,
              name: repo.displayName,
              repository: identity.remoteUrl
            }
          ]
        }
    try {
      if (!alreadyRegistered) {
        const written = await window.api.teamCollaboration.writeDirectory(
          nextDirectory,
          directoryFileIdRef.current
        )
        directoryFileIdRef.current = written.fileId
      }
      const updated = await updateRepo(
        repo.id,
        { projectVisibility: 'team' },
        { hostId: repo.executionHostId ?? undefined }
      )
      if (!updated) {
        throw new Error('项目已写入群空间，但本机项目墙未能更新为团队项目。')
      }
      setDirectory(nextDirectory)
      setDirectoryBase(JSON.stringify(nextDirectory))
      setSelectedProjectId('')
      setProjectRegisterOpen(false)
      rememberTeamBinding(nextDirectory.team_group_id, nextDirectory.team_space_id)
    } catch (cause) {
      notifyWorkbenchError('团队项目登记失败', cause, '核对群空间和本机项目墙，稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  const availableProjects = directory
    ? repos.filter(
        (repo) =>
          getRepoExecutionHostId(repo) === 'local' &&
          Boolean(repo.gitRemoteIdentity?.canonicalKey) &&
          repo.projectVisibility !== 'team'
      )
    : []
  const savedBinding = rememberedTeamBinding()
  const hasSavedBinding = Boolean(savedBinding.groupId && savedBinding.spaceId)
  const checkingBinding = !directory && !loadFailed && hasSavedBinding
  const savedDirectoryFailed = !directory && loadFailed && hasSavedBinding && !switchingTeam
  const showSpinner = !directory && (loading || checkingBinding)
  const showDirectoryChrome =
    !switchingTeam && (Boolean(directory) || checkingBinding || savedDirectoryFailed)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent
        showCloseButton={false}
        className={showDirectoryChrome ? 'gap-3 sm:max-w-[920px]' : 'sm:max-w-[520px]'}
      >
        {showDirectoryChrome ? (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersRound className="size-4" /> 团队设置
            </DialogTitle>
            <DialogDescription className="sr-only">
              团队成员、主机和项目，来自 WeLink 群目录。
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <DialogTitle>{switchingTeam ? '切换团队' : '连接团队'}</DialogTitle>
            <DialogDescription className="sr-only">
              {switchingTeam
                ? '按名称选择新的 WeLink 群。'
                : '按名称选择 WeLink 群绑定团队，群 ID 与群空间 ID 自动获取。'}
            </DialogDescription>
          </DialogHeader>
        )}
        {showSpinner ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-label="正在读取团队目录" />
          </div>
        ) : savedDirectoryFailed ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive" role="alert">
              团队目录读取失败。已保留当前团队绑定。
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button ref={switchButton} type="button" variant="ghost" onClick={beginSwitch}>
                <ArrowRightLeft />
                切换团队
              </Button>
              <Button
                type="button"
                onClick={() =>
                  void loadDirectory(savedBinding.groupId, savedBinding.spaceId).then(
                    syncLoadedTeamHosts
                  )
                }
              >
                重试读取团队目录
              </Button>
            </div>
          </div>
        ) : !directory || switchingTeam ? (
          <TeamBindingForm
            selection={pendingSelection}
            onSelectionChange={setPendingSelection}
            switching={switchingTeam}
            editedLocally={editedLocally}
            loading={loading}
            failed={switchFailed}
            onCancel={cancelSwitch}
            onSubmit={enterTeam}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-2.5 py-2">
              <dl className="flex min-w-0 flex-wrap gap-x-6 gap-y-1.5">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">团队群 ID</dt>
                  <dd className="font-mono text-sm break-all">{directory.team_group_id}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">群空间 ID</dt>
                  <dd className="font-mono text-sm break-all">{directory.team_space_id}</dd>
                </div>
              </dl>
              <Button
                ref={switchButton}
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={busy}
                onClick={beginSwitch}
              >
                <ArrowRightLeft />
                切换团队
              </Button>
            </div>
            <div className="max-h-[58vh] space-y-3 overflow-y-auto scrollbar-sleek px-0.5">
              <TeamSettingsMembers
                hosts={directory.hosts}
                currentMemberId={currentMemberId}
                loading={loading}
                disabled={busy}
                generatingHostId={generatingHostId}
                onRefresh={refreshDirectory}
                onEndpointChange={(memberId, endpoint) => {
                  setDirectory((current) =>
                    current
                      ? {
                          ...current,
                          hosts: current.hosts.map((candidate) =>
                            candidate.member_id === memberId
                              ? { ...candidate, orca_endpoint: endpoint || undefined }
                              : candidate
                          )
                        }
                      : current
                  )
                }}
                onGenerateHostAddress={(memberId) => void generateHostAddress(memberId)}
              />
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">团队项目</h3>
                  <div className="flex items-center gap-2">
                    {projectRegisterOpen ? (
                      <>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                          <SelectTrigger className="h-8 w-56 text-xs" aria-label="选择本机项目">
                            <SelectValue placeholder="选择本机项目" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProjects.map((repo) => (
                              <SelectItem key={repo.id} value={repo.id}>
                                {repo.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProjectRegisterOpen(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void registerProject()}
                          disabled={!selectedProjectId || busy || !currentMemberId}
                        >
                          {saving ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Plus className="size-3.5" />
                          )}
                          添加
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setProjectRegisterOpen(true)}
                      >
                        <Plus className="size-3.5" />
                        登记项目
                      </Button>
                    )}
                  </div>
                </div>
                {directory.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">群空间还没有登记团队项目。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm" aria-label="团队项目目录">
                      <thead className="border-b border-border text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-medium">团队项目</th>
                        </tr>
                      </thead>
                      <tbody>
                        {directory.projects.map((project) => (
                          <tr
                            key={project.repo_id}
                            className="border-b border-border/60 last:border-b-0"
                          >
                            <td className="px-2 py-2.5">
                              <div className="text-[13px] font-semibold">
                                {project.name ?? project.repo_id}
                              </div>
                              <div className="mt-0.5 break-all text-xs text-muted-foreground">
                                {project.repository ?? project.repo_id}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" onClick={() => setFilePreviewOpen(true)}>
                  查看群空间文件
                </Button>
              </div>
              <Button type="button" onClick={() => void saveDirectory()} disabled={busy}>
                {saving ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                保存到群空间
              </Button>
            </div>
            <Dialog open={filePreviewOpen} onOpenChange={setFilePreviewOpen}>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>BW/team.json</DialogTitle>
                  <DialogDescription className="sr-only">
                    当前团队目录将写入群空间的内容。
                  </DialogDescription>
                </DialogHeader>
                <pre className="max-h-[50vh] overflow-auto scrollbar-sleek rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(directory, null, 2)}
                </pre>
              </DialogContent>
            </Dialog>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
          onClick={closeDialog}
          disabled={busy}
          aria-label={switchingTeam ? '取消切换团队' : '关闭团队设置'}
        >
          <X className="size-4" />
        </Button>
      </DialogContent>
    </Dialog>
  )
}
