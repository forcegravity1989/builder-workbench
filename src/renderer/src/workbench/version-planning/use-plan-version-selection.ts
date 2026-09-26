import { useEffect, useRef, useState } from 'react'
import type { usePlanningMaterial } from './use-planning-material'

/** Selection belongs to the workflow, independently of the displayed native session. */
export function usePlanVersionSelection(
  material: ReturnType<typeof usePlanningMaterial>,
  selectVersion: (version: string) => Promise<void>
) {
  const lock = useRef(false)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return {
    busy,
    error,
    inProgress: () => lock.current,
    async select(version: string, create = false) {
      if (lock.current) {
        return false
      }
      lock.current = true
      setBusy(true)
      setError(null)
      try {
        const selected = await material.select(version, create)
        if (!selected || !mounted.current) {
          return false
        }
        await selectVersion(version)
        return mounted.current
      } catch (reason) {
        if (mounted.current) {
          material.clear()
          setError(`选版未保存，草稿已保留，请重选版本后继续：${String(reason)}`)
        }
        return false
      } finally {
        lock.current = false
        if (mounted.current) {
          setBusy(false)
        }
      }
    }
  }
}
