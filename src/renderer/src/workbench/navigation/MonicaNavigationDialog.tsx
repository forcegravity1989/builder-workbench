import { useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { getRepoRowIdentity } from '@/store/repos/repo-host-identity'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repository/repo-types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { openOverviewFromCatalog } from '../version-overview/open-version-overview'
import { openAddProject } from '../project-page-state'
import { useVersionCatalogForRepo } from '../use-version-catalog'
import { requestVersionSidebarFocus } from '../version-sidebar-state'
import { setBrowsedVersion } from '../version-context-state'
import { navigateVersionWorkflow } from '../version-nav-actions'
import { activateVersionWorktree } from '../version-worktree-host'
import { openMonicaProjectPage, followMonicaGuide } from './open-monica-destination'

function ChoiceDialog({
  title,
  description,
  children
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          useAppStore.getState().closeModal()
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-sleek flex max-h-80 flex-col gap-1 overflow-y-auto">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VersionChoice({
  repo,
  page,
  guide,
  version
}: {
  repo: Repo
  page: string
  guide: boolean
  version?: string
}) {
  const hostId = getRepoExecutionHostId(repo)
  const catalog = useVersionCatalogForRepo(repo.id, hostId, 0, true)
  const workspace = page === 'version-workspace'
  const requiresVersion = !workspace || Boolean(version)
  const error =
    workspace && !version && catalog.home ? null : (catalog.error ?? catalog.materialError)
  const reading = catalog.loading && requiresVersion
  const entries = !reading && !error ? (catalog.catalog?.entries ?? []) : []
  const match = version
    ? entries.find((entry) => entry.version === version)
    : entries.length === 1
      ? entries[0]
      : undefined
  const opened = useRef(false)

  function open(selected?: string): void {
    if (opened.current) {
      return
    }
    opened.current = true
    const state = useAppStore.getState()
    state.closeModal()
    const onOpened = () => {
      if (guide) {
        followMonicaGuide(page)
      }
    }
    if (workspace) {
      if (catalog.home && activateVersionWorktree(catalog.home)) {
        state.setSidebarOpen(true)
        state.setSidebarBody('workspaces')
        if (selected) {
          setBrowsedVersion(repo.id, selected)
          requestVersionSidebarFocus(repo.id, selected)
        }
        onOpened()
      } else {
        toast.error('未能进入项目工作区，请检查主机连接。')
      }
      return
    }
    if (!selected) {
      return
    }
    if (page === 'version-overview') {
      const entry = entries.find((item) => item.version === selected)
      if (entry) {
        openOverviewFromCatalog(repo, catalog.worktrees, entry, onOpened)
      }
    } else {
      navigateVersionWorkflow({
        catalog,
        version: selected,
        projectKey: repo.id,
        workflow: page === 'version-plan' ? 'plan' : 'acceptance',
        onOpened
      })
    }
  }
  useEffect(() => {
    if ((!requiresVersion && catalog.home) || (!reading && !error && requiresVersion && match)) {
      open(match?.version)
    }
  })
  return (
    <ChoiceDialog
      title={reading ? '正在读取版本' : '选择版本'}
      description={
        error ??
        (version && !match && !reading ? `未找到 ${version}，请选择可用版本。` : repo.displayName)
      }
    >
      {error && (
        <Button variant="outline" onClick={catalog.reload}>
          重新读取
        </Button>
      )}
      {requiresVersion &&
        entries.map((entry) => (
          <Button key={entry.version} variant="outline" onClick={() => open(entry.version)}>
            {entry.version}
          </Button>
        ))}
      {!reading && !error && requiresVersion && entries.length === 0 && (
        <p>这个项目还没有可打开的版本。</p>
      )}
    </ChoiceDialog>
  )
}

export function MonicaNavigationDialog() {
  const data = useAppStore((s) => (s.activeModal === 'monica-navigation' ? s.modalData : null))
  const repos = useAppStore((s) => s.repos)
  if (!data || typeof data.page !== 'string') {
    return null
  }
  const { page, projectRow } = data
  const guide = data.guide === true
  const version = typeof data.version === 'string' ? data.version : undefined
  const project = typeof data.project === 'string' ? data.project : undefined
  const visible = repos.filter(
    (repo) =>
      !repo.hiddenAt &&
      (!data.gitOnly || repo.kind !== 'folder') &&
      (!data.localOnly || getRepoExecutionHostId(repo) === 'local')
  )
  const selected =
    typeof projectRow === 'string' &&
    visible.find((repo) => getRepoRowIdentity(repo) === projectRow)
  if (selected) {
    return (
      <VersionChoice
        key={JSON.stringify([projectRow, page, version, guide])}
        repo={selected}
        page={page}
        guide={guide}
        version={version}
      />
    )
  }
  const matches = project ? visible.filter((repo) => repo.displayName === project) : []
  const candidates = matches.length ? matches : visible
  const reason = data.localOnly
    ? '知识库读取本机材料，请选择要查看的本机项目。'
    : projectRow
      ? '原项目已不可用，请重新选择。'
      : project && !matches.length
        ? '未找到回复指向的项目，请选择要打开的项目。'
        : '请选择这次操作对应的项目。'
  return (
    <ChoiceDialog title="选择项目" description={reason}>
      {candidates.map((repo) => (
        <Button
          variant="outline"
          className="h-auto flex-col items-start"
          key={getRepoRowIdentity(repo)}
          onClick={() => {
            useAppStore.getState().closeModal()
            openMonicaProjectPage(page, guide, repo, version)
          }}
        >
          <span>{repo.displayName}</span>
          <small>
            {getRepoExecutionHostId(repo)} · {repo.path}
          </small>
        </Button>
      ))}
      {!candidates.length && <Button onClick={openAddProject}>添加项目</Button>}
    </ChoiceDialog>
  )
}
