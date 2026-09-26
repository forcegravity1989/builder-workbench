import { useCallback, useEffect, useRef, useState } from 'react'
import type { createVersionMaterialPort } from '../../../../shared/workbench/version-material-client'

/** Native worktree preference shared with CLI; no session association or material creation. */
export function useWorkflowVersion(port: ReturnType<typeof createVersionMaterialPort> | null) {
  const [version, setVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = useRef(port)
  current.current = port
  const sequence = useRef(0)
  const selecting = useRef(false)
  useEffect(() => {
    setVersion(null)
    setError(null)
    if (!port) return
    let disposed = false
    const read = async () => {
      if (selecting.current) return
      const request = ++sequence.current
      try {
        const result = await port.context()
        if (!disposed && request === sequence.current) {
          setVersion(result.version)
          setError(null)
        }
      } catch (reason) {
        if (!disposed && request === sequence.current) setError(String(reason))
      }
    }
    void read()
    const timer = setInterval(() => void read(), 5000)
    window.addEventListener('focus', read)
    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener('focus', read)
    }
  }, [port])
  const selectVersion = useCallback(async (value: string) => {
    if (!port) throw new Error('工作区尚未就绪')
    if (selecting.current) throw new Error('正在选择版本，请稍后重试')
    selecting.current = true
    const request = ++sequence.current
    try {
      const result = await port.select(value)
      if (current.current === port && request === sequence.current) {
        setVersion(result.version)
        setError(null)
      }
    } finally {
      selecting.current = false
    }
  }, [port])
  return { version, error, selectVersion }
}
