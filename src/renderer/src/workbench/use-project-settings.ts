import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import type { Repo } from '../../../shared/repo-types'
import type { CharterStatus } from '../../../shared/workbench/charter'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  parseExecutionHostId
} from '../../../shared/execution-host'
import { CHARTER_BRANCH, EMPTY_CHARTER, type ProjectCharter } from './project-charter'
import { EDITABLE_CHARTER_FIELDS } from '../../../shared/workbench/project-charter-edit'
import { readCharterPrStatus, readRepoCharter, submitProjectCharter } from './charter-port'
import { ensureNamedWorktree, nativeWorkspaceScope } from './version-cycle/native-workspace'
import { updateTrunkCode, trunkUpdateNotice } from './version-cycle/trunk-update-port'
import { useDefaultAgentForTarget } from './version-cycle/metrics-setup'
import type { AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import { openWorkflowDraft } from './open-workflow-draft'

export const CHARTER_LABELS = {
  name: '项目名称',
  owner: '项目负责人',
  brief: '想做什么',
  benchmark: '对标',
  opportunity: '愿景'
}
type Draft = {
  raw: string | null
  baseline: ProjectCharter
  value: ProjectCharter
  pending: boolean
}
// Transient form state survives native navigation; it is never written to project business storage.
const drafts = new Map<string, Draft>()

export function useProjectSettings(repo: Repo, onChanged: () => void) {
  const key = `${getRepoExecutionHostId(repo)}::${repo.id}`
  const [form, setForm] = useState<Draft | null>(null)
  const [status, setStatus] = useState<CharterStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const generation = useRef(0)
  const retry = useRef<() => unknown>(() => {})
  const lastOperation = useRef<'read' | 'submit' | 'update'>('read')
  const hostId = getRepoExecutionHostId(repo)
  const detectionTarget = useMemo<AgentDetectionTarget | undefined>(() => {
    const host = parseExecutionHostId(hostId)
    if (host?.kind === 'runtime') {
      return { kind: 'runtime', environmentId: host.environmentId }
    }
    if (host?.kind === 'ssh') {
      return { kind: 'ssh', connectionId: host.targetId }
    }
    return host?.kind === 'local' ? { kind: 'local' } : undefined
  }, [hostId])
  const agent = useDefaultAgentForTarget(detectionTarget)
  const reload = useCallback(async () => {
    lastOperation.current = 'read'
    const request = ++generation.current
    setLoading(true)
    setError(null)
    setNotice(null)
    if (repo.kind === 'folder') {
      setForm(null)
      setCanEdit(false)
      setLoading(false)
      return
    }
    try {
      const [read, nextStatus] = await Promise.all([
        readRepoCharter(repo),
        readCharterPrStatus(repo)
      ])
      if (request !== generation.current) {
        return
      }
      setStatus(nextStatus)
      if (read.error) {
        throw new Error(read.error)
      }
      const baseline = read.charter ?? { ...EMPTY_CHARTER, name: repo.displayName }
      const saved = drafts.get(key)
      const proposalReadBack =
        saved &&
        EDITABLE_CHARTER_FIELDS.every(
          (field) => (saved.value[field] ?? '').trim() === (baseline[field] ?? '').trim()
        )
      if (proposalReadBack && !nextStatus.queryFailed) {
        drafts.delete(key)
      }
      if (saved?.pending && !proposalReadBack && nextStatus.pr?.state === 'closed') {
        drafts.set(key, { ...saved, pending: false })
        setNotice('名片 PR 已关闭，草稿已保留，可核对后重新提交')
      }
      setForm(
        drafts.get(key) ?? {
          raw: read.raw ?? null,
          baseline,
          value: { ...baseline },
          pending: false
        }
      )
      setCanEdit(
        read.raw !== undefined && parseExecutionHostId(getRepoExecutionHostId(repo))?.kind !== 'ssh'
      )
      if (parseExecutionHostId(getRepoExecutionHostId(repo))?.kind === 'ssh') {
        setError('SSH 来源暂不支持在此编辑')
      }
      if (read.raw === undefined) {
        setError('更新该来源主机上的 Workbench 后再编辑项目信息')
      }
    } catch (cause) {
      if (request === generation.current) {
        setCanEdit(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (request === generation.current) {
        setLoading(false)
      }
    }
  }, [key, repo])
  const cancelPendingRead = useCallback(() => {
    generation.current += 1
  }, [])
  useEffect(() => {
    void reload()
    return cancelPendingRead
  }, [reload, cancelPendingRead])
  const changes = form
    ? EDITABLE_CHARTER_FIELDS.filter(
        (field) => (form.value[field] ?? '').trim() !== (form.baseline[field] ?? '').trim()
      )
    : []
  const dirty = changes.length > 0 && !form?.pending
  const pending = status?.pr?.state === 'open' || (form?.pending && status?.queryFailed)
  const awaitingReadback = Boolean(form?.pending && status && !status.queryFailed && !status.pr)
  const merged =
    (status?.pr?.state === 'merged' && status.headMatchesProposal !== true) || awaitingReadback
  const edit = (field: (typeof EDITABLE_CHARTER_FIELDS)[number], value: string) => {
    if (!form) {
      return
    }
    const next = { ...form, value: { ...form.value, [field]: value } }
    if (
      EDITABLE_CHARTER_FIELDS.some(
        (field) => (next.value[field] ?? '').trim() !== (next.baseline[field] ?? '').trim()
      )
    ) {
      drafts.set(key, next)
    } else {
      drafts.delete(key)
    }
    setForm(next)
  }
  const discard = () => {
    if (!form) {
      return
    }
    drafts.delete(key)
    setForm({ ...form, value: { ...form.baseline }, pending: false })
    setError(null)
  }
  const mainScope = async () => {
    const hostId = getRepoExecutionHostId(repo)
    const state = useAppStore.getState()
    const fetched = await state.fetchWorktrees(repo.id, {
      executionHostId: hostId,
      requireAuthoritative: true
    })
    if (!fetched) {
      throw new Error('未读到此来源的工作树，请恢复连接后重试')
    }
    const main = useAppStore
      .getState()
      .allWorktrees()
      .find(
        (tree) =>
          tree.repoId === repo.id &&
          tree.isMainWorktree &&
          getWorktreeExecutionHostId(tree, repo) === hostId
      )
    if (!main) {
      throw new Error('未找到此来源的主检出，请核对原生项目登记')
    }
    return { main, scope: nativeWorkspaceScope(main) }
  }
  const submit = async (): Promise<boolean> => {
    if (busy || !form || !dirty || !form.value.name.trim() || !canEdit || pending || merged) {
      return false
    }
    setBusy(true)
    lastOperation.current = 'submit'
    setError(null)
    setNotice(null)
    try {
      const { scope } = await mainScope()
      const tree = await ensureNamedWorktree(scope, CHARTER_BRANCH, 'project')
      const outcome = await submitProjectCharter(
        { ...scope, worktreeId: tree.id },
        scope.runtimeOwnerEnvironmentId,
        form.value,
        false,
        { expectedRaw: form.raw }
      )
      if (outcome.mode === 'failed') {
        throw new Error(outcome.error)
      }
      if (outcome.mode === 'local-only' && !outcome.saved) {
        throw new Error('此来源尚未支持保真编辑，更新 Workbench 后重试')
      }
      if (outcome.mode === 'pr') {
        const next = { ...form, pending: true }
        drafts.set(key, next)
        setForm(next)
        setStatus({ headHasCharter: Boolean(form.raw), pr: { ...outcome.pr, state: 'open' } })
        setNotice('已提交，等待合入')
      } else {
        drafts.delete(key)
        await reload()
        setNotice(
          outcome.mode === 'local-only' ? outcome.reason : (outcome.note ?? '没有需要提交的变更')
        )
      }
      onChanged()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setBusy(false)
    }
  }
  const update = async () => {
    if (busy) {
      return
    }
    if (parseExecutionHostId(getRepoExecutionHostId(repo))?.kind === 'ssh') {
      setError('SSH 来源暂不支持在此更新')
      return
    }
    setBusy(true)
    lastOperation.current = 'update'
    setError(null)
    setNotice(null)
    try {
      const { main, scope } = await mainScope()
      const result = await updateTrunkCode(
        { ...scope, worktreeId: main.id },
        scope.runtimeOwnerEnvironmentId
      )
      if (!result.updated) {
        throw new Error(trunkUpdateNotice(result))
      }
      await reload()
      onChanged()
      setNotice(trunkUpdateNotice(result))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!error) {
      return
    }
    toast.error('项目信息操作失败', {
      id: `project-info:${key}`,
      description: `${error}。可重试，或开会话让模型处理。`,
      duration: 60_000,
      action: {
        label: '开会话处理',
        onClick: () => {
          void (async () => {
            if (!agent) {
              throw new Error('请先在原生设置中配置可用会话工具')
            }
            const { main, scope } = await mainScope()
            useAppStore.getState().setActiveWorktree(main.id, scope.hostId)
            if (scope.runtimeOwnerEnvironmentId) {
              await activateWebRuntimeSessionWorktree({
                worktreeId: main.id,
                environmentId: scope.runtimeOwnerEnvironmentId
              })
            }
            await openWorkflowDraft(
              agent,
              main.id,
              [
                '请检查当前项目的项目信息提交失败，先读取仓库规则并确认已有 bw/project 分支和 PR/MR，避免重复提交。',
                `错误：${error}`,
                `用户保留的名片输入：${JSON.stringify(form?.value ?? null)}`,
                '仅处理 .bw/project.toml 的这次修改，沿现有评审流程；不要自动合入、覆盖其他改动或修改个人/团队本地属性。'
              ].join('\n')
            )
            useAppStore.getState().setActiveView('terminal')
          })().catch((cause) => toast.error(cause instanceof Error ? cause.message : String(cause)))
        }
      },
      cancel: {
        label: '重试',
        onClick: () => {
          void retry.current()
        }
      }
    })
    // The toast captures this failure and its draft; retry resolves the latest operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, key, agent])
  useEffect(() => {
    if (notice) {
      toast.success(notice, { id: `project-info:${key}` })
    }
  }, [notice, key])
  retry.current = async () => {
    if (busy) {
      return
    }
    if (lastOperation.current !== 'submit') {
      return lastOperation.current === 'update' ? update() : reload()
    }
    if (!dirty || !form?.value.name.trim() || !canEdit) {
      return
    }
    setBusy(true)
    const latest = await readCharterPrStatus(repo)
    setStatus(latest)
    setBusy(false)
    if (
      latest.pr?.state === 'open' ||
      (latest.pr?.state === 'merged' && latest.headMatchesProposal !== true)
    ) {
      setError(null)
      setNotice(
        latest.pr.state === 'open'
          ? '发现已有评审，可先查看；当前输入已保留'
          : '评审已合入，可以更新项目信息'
      )
      return
    }
    return submit()
  }
  useEffect(() => {
    if (!dirty) {
      return
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  return {
    form,
    status,
    loading,
    busy,
    error,
    notice,
    canEdit,
    changes,
    dirty,
    pending,
    localOnly: status?.remoteAvailable === false,
    awaitingReadback,
    merged,
    edit,
    discard,
    resume: () => {
      if (form) {
        const next = { ...form, pending: false }
        drafts.set(key, next)
        setForm(next)
      }
    },
    reload,
    submit,
    update
  }
}
