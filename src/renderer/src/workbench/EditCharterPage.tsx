import React, { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { submitProjectCharter } from './charter-port'
import {
  CHARTER_BRANCH,
  EMPTY_CHARTER,
  readProjectCharter,
  type ProjectCharter
} from './project-charter'
import { applyCharterOutcome, type OnboardLogLine } from './run-project-onboard'
import { OnboardCharterStep } from './OnboardCharterStep'
import { closeProjectPage, openProjectWall, type CharterEditOptions } from './project-page-state'
import { ensureNamedWorktree, nativeWorkspaceScope } from './version-cycle/native-workspace'
import './workbench-onboard.css'

function branchOf(tree: { branch?: string | null }): string {
  return (tree.branch ?? '').replace(/^refs\/heads\//, '')
}

/** 名片编辑/补录(spec 规则 2):主检出优先,未合入时读 bw/project 树 overlay。 */
export function EditCharterPage({
  options
}: {
  options: CharterEditOptions
}): React.JSX.Element {
  const repo = useAppStore((s) => s.repos.find((r) => r.id === options.repoId))
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const [name, setName] = useState(options.seedName ?? '')
  const [brief, setBrief] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [opportunity, setOpportunity] = useState('')
  const [probeNote, setProbeNote] = useState<string | null>('正在读名片…')
  const [log, setLog] = useState<OnboardLogLine[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!repo) {
      setProbeNote('找不到该项目')
      return
    }
    let cancelled = false
    void (async () => {
      const apply = (charter: ProjectCharter | null, note: string) => {
        if (cancelled) {
          return
        }
        const source = charter ?? EMPTY_CHARTER
        setName((prev) => prev.trim() || source.name)
        setBrief(source.brief)
        setBenchmark(source.benchmark)
        setOpportunity(source.opportunity)
        setProbeNote(note)
      }
      const local = await readProjectCharter(repo.path)
      if (cancelled) {
        return
      }
      if (local.charter) {
        apply(local.charter, '当前名片（主检出）。提交只补空字段，已有内容与注释不动。')
        return
      }
      await fetchWorktrees(repo.id)
      const trees = useAppStore.getState().worktreesByRepo[repo.id] ?? []
      const projectTree = trees.find((t) => branchOf(t) === CHARTER_BRANCH)
      if (projectTree) {
        const overlay = await readProjectCharter(projectTree.path)
        if (!cancelled && overlay.charter) {
          apply(overlay.charter, '名片在 bw/project 树上待合入，以下为树内内容；提交只补空字段。')
          return
        }
      }
      apply(
        null,
        local.error
          ? `名片读不到：${local.error}。提交只补空字段，不覆盖已有文件。`
          : '仓里还没有名片，提交后经 PR 新建。'
      )
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在项目切换时重读
  }, [repo?.id])

  const submit = async (): Promise<void> => {
    if (busy || !repo) {
      return
    }
    const intent: ProjectCharter = {
      name: name.trim(),
      kind: '',
      brief: brief.trim(),
      benchmark: benchmark.trim(),
      opportunity: opportunity.trim()
    }
    if (!intent.name) {
      setLog([{ kind: 'fail', text: '项目名称不能为空' }])
      return
    }
    setBusy(true)
    setLog([])
    const onLog = (line: OnboardLogLine) => setLog((prev) => [...prev, line])
    try {
      await fetchWorktrees(repo.id)
      const trees = useAppStore.getState().worktreesByRepo[repo.id] ?? []
      const mainTree = trees.find((w) => w.isMainWorktree) ?? trees[0]
      if (!mainTree) {
        onLog({ kind: 'fail', text: '仓里还没有可用工作树（可能没有第一条提交），走不了 PR' })
        return
      }
      const scope = nativeWorkspaceScope(mainTree)
      onLog({ kind: 'doing', text: '准备 bw/project 固定树…' })
      const projectTree = await ensureNamedWorktree(scope, CHARTER_BRANCH, 'project')
      onLog({ kind: 'doing', text: '提交并开 PR…' })
      const outcome = await submitProjectCharter(
        { ...scope, worktreeId: projectTree.id },
        scope.runtimeOwnerEnvironmentId,
        intent,
        false
      )
      await applyCharterOutcome({ outcome, repoPath: repo.path, intent, onLog })
    } catch (e) {
      onLog({ kind: 'fail', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wb-onboard-page" aria-label="编辑名片" data-screen="charter-edit">
      <div className="wb-onboard">
        <header className="page-head">
          <div>
            <h1>编辑名片</h1>
            <p className="page-desc">
              「{repo?.displayName || options.seedName || '项目'}」的项目信息；改动经 bw/project
              分支 PR 合入，主检出不直接写。
            </p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              onClick={() => {
                openProjectWall()
              }}
            >
              ← 项目墙
            </button>
            <button type="button" className="wb-btn wb-btn-ghost" onClick={closeProjectPage}>
              关闭
            </button>
          </div>
        </header>
        <div className="ob-cards">
          <OnboardCharterStep
            targetPath={repo?.path ?? ''}
            probeNote={probeNote}
            name={name}
            brief={brief}
            benchmark={benchmark}
            opportunity={opportunity}
            log={log}
            busy={busy}
            submitLabel="提交 PR"
            busyLabel="提交中…"
            onName={setName}
            onBrief={setBrief}
            onBenchmark={setBenchmark}
            onOpportunity={setOpportunity}
            onBack={() => {
              openProjectWall()
            }}
            onSubmit={() => {
              void submit()
            }}
          />
        </div>
      </div>
    </div>
  )
}
