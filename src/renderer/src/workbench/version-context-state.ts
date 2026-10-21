import { useSyncExternalStore } from 'react'

/**
 * G2 侧栏决定的「当前浏览版本」（P3a）：UI 偏好，不是任务归属、材料状态或
 * 定时执行的正本（绑定树读写哪版材料永远由登记上的绑定决定）。按项目隔离，
 * localStorage 持久化；存储不可用时退化为内存态（导航仍可用）。
 */

const storageKey = (projectKey: string) => `workbench.browsed-version:${projectKey}`

let memory: { projectKey: string; version: string } | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function readBrowsedVersion(projectKey: string | null): string | null {
  if (!projectKey) {
    return null
  }
  if (memory?.projectKey === projectKey) {
    return memory.version
  }
  try {
    return window.localStorage.getItem(storageKey(projectKey))
  } catch {
    return memory?.projectKey === projectKey ? memory.version : null
  }
}

export function setBrowsedVersion(projectKey: string | null, version: string | null): void {
  if (!projectKey) {
    return
  }
  memory = version ? { projectKey, version } : null
  try {
    if (version) {
      window.localStorage.setItem(storageKey(projectKey), version)
    } else {
      window.localStorage.removeItem(storageKey(projectKey))
    }
  } catch {
    // 存储被拒时内存态继续可用（本会话导航不受影响）。
  }
  emit()
}

export function useBrowsedVersion(projectKey: string | null): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => readBrowsedVersion(projectKey),
    () => null
  )
}
