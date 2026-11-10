// List saved headless browser tabs immediately; start pages lazily on first use, never merely on host restart.

import type { BrowserBackend } from '../../../browser/browser-backend'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { BrowserTabInfo } from '../../../../shared/runtime-browser-contracts'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'
import {
  findSavedBrowserPage,
  withClosedServeBrowserTab,
  withOpenedServeBrowserTab,
  withServeBrowserPageState,
  type ServeBrowserPageState
} from './serve-browser-tab-layout'

type RestorableBrowserPage = {
  /** The saved tab; a host's own tab is named by its page, a window's by its own id. */
  tabId: string
  pageId: string
  url: string
  title: string
  profileId: string | null
  worktreeId: string
}

export class ServeBrowserTabs {
  constructor(
    private readonly deps: {
      /** The page backend while no window hosts the browser tabs, else null. */
      backend: () => BrowserBackend | null
      livePageIds: (worktreeId: string) => ReadonlySet<string>
      /** Every workspace that holds a saved browser tab, whatever else it holds. */
      savedWorktreeIds: () => Iterable<string>
      session: (worktreeId: string) => WorkspaceSessionState | null
      hostId: (worktreeId: string) => ExecutionHostId
      save: (worktreeId: string, session: WorkspaceSessionState) => void
    }
  ) {}

  opened(page: ServeBrowserPageState & { profileId?: string; groupId?: string }): void {
    this.write(page.worktreeId, (hostId, session) =>
      withOpenedServeBrowserTab(hostId, session, page)
    )
  }

  /** A saved tab follows its page; a page whose tab was closed is not saved again. */
  navigated(page: ServeBrowserPageState): void {
    this.write(page.worktreeId, (_hostId, session) => withServeBrowserPageState(session, page))
  }

  /** A closed page's tab, true when one was saved; a page destroyed with the process is not a close. */
  closed(worktreeId: string, pageId: string): boolean {
    return this.write(worktreeId, (hostId, session) =>
      withClosedServeBrowserTab(hostId, session, worktreeId, pageId)
    )
  }

  /** The unified tab showing a page, which a window keys pin and colour by: the saved one, else the page's. */
  unifiedTabId(worktreeId: string, pageId: string): string {
    const session = this.deps.session(worktreeId)
    return (session && findSavedBrowserPage(session, worktreeId, pageId)?.tabId) ?? pageId
  }

  /** Saved tabs whose page has not started, listed as running tabs are. */
  listUnstarted(worktreeId: string): BrowserTabInfo[] {
    return this.listRestorable(worktreeId).map((page, index) => ({
      browserPageId: page.pageId,
      index,
      url: page.url,
      title: page.title,
      active: false,
      worktreeId,
      ...(page.profileId ? { profileId: page.profileId } : {})
    }))
  }

  /** Saved tabs whose page has not started; every worktree's when none is named. */
  private listRestorable(worktreeId: string | undefined): RestorableBrowserPage[] {
    if (!this.deps.backend()) {
      return []
    }
    const worktreeIds = worktreeId ? [worktreeId] : new Set(this.deps.savedWorktreeIds())
    return [...worktreeIds].flatMap((id) => {
      const live = this.deps.livePageIds(id)
      return this.startableIn(id).filter((page) => !live.has(page.pageId))
    })
  }

  /** Start the named saved page or active workspace tab; false means no tab to report. */
  async start(worktreeId: string | undefined, pageId: string | undefined): Promise<boolean> {
    const found = pageId
      ? this.listRestorable(worktreeId).find((page) => page.pageId === pageId)
      : worktreeId
        ? this.activeIn(worktreeId)
        : undefined
    return found ? this.restore(found) : false
  }

  /** Whether a saved tab could register once a window mounts it; every worktree's when none is named. */
  hasStartable(worktreeId: string | undefined): boolean {
    const worktreeIds = worktreeId ? [worktreeId] : this.deps.savedWorktreeIds()
    return [...worktreeIds].some((id) => this.startableIn(id).length > 0)
  }

  /** The tab a window shows for a worktree with no page running: the recorded one, else the first. */
  private activeIn(worktreeId: string): RestorableBrowserPage | undefined {
    if (this.deps.livePageIds(worktreeId).size > 0) {
      return undefined
    }
    const tabs = this.startableIn(worktreeId)
    const recorded = this.deps.session(worktreeId)?.activeBrowserTabIdByWorktree?.[worktreeId]
    return tabs.find((page) => page.tabId === recorded) ?? tabs[0]
  }

  private startableIn(worktreeId: string): RestorableBrowserPage[] {
    const session = this.deps.session(worktreeId)
    if (!session) {
      return []
    }
    return (session.browserTabsByWorktree?.[worktreeId] ?? []).flatMap((tab) => {
      const pageId = tab.activePageId ?? tab.pageIds?.[0]
      const page = pageId ? findSavedBrowserPage(session, worktreeId, pageId)?.page : undefined
      // A document page is one desktop's; a remote page belongs to the host that ran it.
      if (!page || page.docLocation || page.remoteBrowserPageId) {
        return []
      }
      return [
        {
          tabId: tab.id,
          pageId: page.id,
          url: page.url,
          title: page.title,
          profileId: tab.sessionProfileId ?? null,
          worktreeId
        }
      ]
    })
  }

  // The backend registers the page before it returns, so a second caller finds it running.
  private async restore(page: RestorableBrowserPage): Promise<boolean> {
    const backend = this.deps.backend()
    if (!backend) {
      return false
    }
    await backend.createTab({
      browserPageId: page.pageId,
      url: page.url,
      worktreeId: page.worktreeId,
      ...(page.profileId ? { profileId: page.profileId } : {})
    })
    return true
  }

  private write(
    worktreeId: string,
    change: (
      hostId: ExecutionHostId,
      session: WorkspaceSessionState
    ) => WorkspaceSessionState | null
  ): boolean {
    const session = this.deps.backend() ? this.deps.session(worktreeId) : null
    const next = session ? change(this.deps.hostId(worktreeId), session) : null
    if (!next) {
      return false
    }
    // Page events/close must tolerate refused saves while writes are frozen.
    try {
      this.deps.save(worktreeId, next)
      return true
    } catch (error) {
      console.warn('[serve-browser-tabs] could not save a browser tab:', error)
      return false
    }
  }
}
