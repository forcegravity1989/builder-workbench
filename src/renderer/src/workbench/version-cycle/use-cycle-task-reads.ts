import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createSnapshotCache, useSnapshotCache, type SnapshotEntry } from '../snapshot-cache'
import type { CycleScope, CycleTaskRead, CycleTaskReference, TaskPort } from './ports'

/** 计划屏与验收屏共享的 Issue 读数缓存（#432）：同一 scope + 序列化引用集合一个
 * 渲染进程生命周期条目，切屏/材料保存重挂载立即回显上次读数，不再整列闪
 * 「状态未知」；挂载即后台静默重读并原地替换（行为契约与逐次重读一致），
 * 「刷新 Issue」按钮走 refresh() 强制重读。条目随渲染进程消亡，重启全部现算
 * （铁律一）；读不到仍如实 Unknown（铁律二），缓存只是上次真实读数的回显。 */
type ReadsState = {
  /** null = 该引用集合从未读到过结果（行显示状态未知）。 */
  reads: CycleTaskRead[] | null
  error: string | null
  busy: boolean
}

const cache = createSnapshotCache<ReadsState>(() => ({ reads: null, error: null, busy: false }))

/** scope/tasks 缺席时的稳定空条目：无引用 = 空读数，有引用无 scope = 诚实未知。 */
const NO_KEY_STATE: ReadsState = { reads: [], error: null, busy: false }
const noKeyEntry: SnapshotEntry<ReadsState> = {
  pending: null,
  read: () => NO_KEY_STATE,
  publish: () => {},
  subscribe: () => () => {},
  subscribed: () => false
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/** scope.workflow 刻意不进 key：单条读取只按仓库身份解析（resolveReferenceRepo
 * 用 repoId/hostId 决胜），键入 workflow 会把两屏拆成两个条目、失去共享。 */
function keyFor(
  scope: CycleScope | null,
  tasks: readonly CycleTaskReference[] | undefined,
  taskPort: TaskPort
): string | null {
  if (!scope || !tasks?.length) {
    return null
  }
  return JSON.stringify([
    scope.projectId,
    scope.repoId,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId ?? null,
    // 序列化引用而非数组身份：材料保存后重读每次交回新数组，身份进 key 会闪读
    //（验收屏旧 tasksRef 模式的动机，这里对两屏一并结构化解决）。
    JSON.stringify(tasks),
    taskPort.cacheKey?.(scope, tasks)
  ])
}

export function useCycleTaskReads(args: {
  scope: CycleScope | null
  tasks: readonly CycleTaskReference[] | undefined
  taskPort: TaskPort
  /** 每次读取落地（后台或强制）后以新鲜读数回调——验收屏在此喂材料
   * taskSnapshot（新读数即新证据）；缓存回显本身不触发，保存快照改文档也不会
   * 重触发读取（effect 只认 key）。 */
  onFreshReads?: (reads: CycleTaskRead[]) => void
}) {
  const { scope, tasks } = args
  const key = keyFor(scope, tasks, args.taskPort)
  const entry = useMemo(() => (key ? cache(key) : noKeyEntry), [key])
  const cachedReads = useMemo(
    () => (scope && tasks ? args.taskPort.cached?.(scope, tasks) : null),
    // Source identity and serialized references fully determine the display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )
  const view = useSnapshotCache(entry)
  // 读取时值走 ref：effect 只认 key，scope/tasks/taskPort 的身份抖动不重跑。
  const latest = useRef(args)
  latest.current = args

  const startRead = useCallback((target: SnapshotEntry<ReadsState>, force: boolean) => {
    // 调用时刻捕获 scope/tasks/port：强制读在途切版本时，链后的重读必须仍属于
    // 被点的条目，不得把新版本读数写进旧 key。
    const { scope: captured, tasks: references, taskPort: port } = latest.current
    if (!captured || !references?.length) {
      return Promise.resolve()
    }
    const run = (): Promise<void> => {
      target.publish({ ...target.read(), busy: true })
      const pending = (
        force ? port.refresh(captured, references) : port.listVersion(captured, references)
      )
        .then(
          (items) => {
            target.publish({ reads: items, error: null, busy: false })
          },
          (reason) => {
            // 整批读取被拒（防御路径：readAll 单条失败已归 unavailable 条目）时
            // 保留旧读数、如实报错——总览 sdlc 的 retain 模式。
            target.publish({ ...target.read(), error: errorMessage(reason), busy: false })
          }
        )
        .finally(() => {
          target.pending = null
        })
      target.pending = pending
      return pending
    }
    const inflight = target.pending
    if (!inflight) {
      return run()
    }
    // 非强制：并入在途读取。强制：排在在途之后再读一轮——用户明确要新状态
    //（语义同 Orca 列表链的 noCache 逃生口），不因在途而被吞掉。
    return force ? inflight.then(run, run) : inflight
  }, [])

  useEffect(() => {
    if (!key) {
      return
    }
    let active = true
    if (cachedReads) {
      entry.publish({ ...entry.read(), reads: cachedReads })
    }
    void startRead(entry, false).then(() => {
      if (!active) {
        return
      }
      const state = entry.read()
      if (state.reads && !state.error) {
        latest.current.onFreshReads?.(state.reads)
      }
    })
    return () => {
      active = false
    }
  }, [key, entry, startRead, cachedReads])

  const refresh = useCallback(async () => {
    if (!key) {
      return
    }
    const requestedKey = key
    await startRead(entry, true)
    // 在途切版本守卫：旧版本的强制读数不得喂给新版本的快照（同旧组件守卫，
    // 读数落点本身已按条目键控，这里只挡 onFreshReads）。
    const { scope: nowScope, tasks: nowTasks } = latest.current
    if (keyFor(nowScope, nowTasks, latest.current.taskPort) !== requestedKey) {
      return
    }
    const state = entry.read()
    if (state.reads && !state.error) {
      latest.current.onFreshReads?.(state.reads)
    }
  }, [key, entry, startRead])

  if (!key) {
    // 与两屏旧初始化同一分野：有引用但 scope 未就绪 = null（行显示状态未知），
    // 无引用 = 空列表。
    return {
      reads: (tasks?.length ?? 0) > 0 ? null : [],
      error: null,
      busy: false,
      refresh
    }
  }
  return { reads: view.reads ?? cachedReads ?? null, error: view.error, busy: view.busy, refresh }
}
