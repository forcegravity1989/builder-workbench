import { useMountedRef } from '@/hooks/useMountedRef'
import { useEffect, useRef, useState } from 'react'
import {
  cacheGeneratedRuntimePairingLink,
  clearGeneratedRuntimePairingLink,
  loadRuntimePairingLinkReference,
  runtimePairingLinkCache,
  type RuntimePairingIntent
} from './runtime-pairing-link-state'

export function useRuntimePairingLinkRecall() {
  const [selectedAddress, setSelectedAddress] = useState(runtimePairingLinkCache.selectedAddress)
  const [intent, setIntent] = useState<RuntimePairingIntent>(runtimePairingLinkCache.intent)
  const [generatedAddress, setGeneratedAddress] = useState<string | null>(
    runtimePairingLinkCache.generatedAddress
  )
  const [runtimePairingUrl, setRuntimePairingUrl] = useState<string | null>(
    runtimePairingLinkCache.runtimePairingUrl
  )
  const [webClientUrl, setWebClientUrl] = useState<string | null>(
    runtimePairingLinkCache.webClientUrl
  )
  const [runtimePairingDeviceId, setRuntimePairingDeviceId] = useState<string | null>(
    runtimePairingLinkCache.runtimePairingDeviceId
  )
  const linkEditRevisionRef = useRef(0)
  const mountedRef = useMountedRef()
  useEffect(() => {
    const reference = loadRuntimePairingLinkReference()
    if (!reference) {
      return
    }
    const restoreSelection = runtimePairingLinkCache.runtimePairingUrl === null
    const revision = linkEditRevisionRef.current
    let cancelled = false
    let retryTimer: number | undefined
    const restore = (retries = 4): void => {
      void window.api.mobile
        .restoreRuntimePairingUrl(reference)
        .then((link) => {
          if (cancelled || linkEditRevisionRef.current !== revision) {
            return
          }
          if (!link) {
            // A missing in-memory grant can also mean the native registry could not be read.
            clearGeneratedRuntimePairingLink(false)
            setRuntimePairingUrl(null)
            setWebClientUrl(null)
            setRuntimePairingDeviceId(null)
            setGeneratedAddress(null)
            return
          }
          if (restoreSelection) {
            runtimePairingLinkCache.intent = reference.intent
            runtimePairingLinkCache.selectedAddress = reference.address
            if (reference.intent === 'custom') {
              runtimePairingLinkCache.customAddress = reference.address
            }
            setIntent(reference.intent)
            setSelectedAddress(reference.address)
          }
          cacheGeneratedRuntimePairingLink({
            ...link,
            address: reference.address,
            intent: reference.intent
          })
          setGeneratedAddress(reference.address)
          setRuntimePairingUrl(link.pairingUrl)
          setWebClientUrl(link.webClientUrl)
          setRuntimePairingDeviceId(link.deviceId)
        })
        .catch(() => {
          // The window can open before the runtime identity is loaded. Keep the reference on read failure.
          if (!cancelled && linkEditRevisionRef.current === revision && retries > 0) {
            retryTimer = window.setTimeout(() => restore(retries - 1), 1000)
          }
        })
    }
    restore()
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
    }
  }, [])

  const clearGeneratedUrls = (): void => {
    clearGeneratedRuntimePairingLink()
    if (mountedRef.current) {
      setRuntimePairingUrl(null)
      setWebClientUrl(null)
      setRuntimePairingDeviceId(null)
      setGeneratedAddress(null)
    }
  }

  return {
    selectedAddress,
    setSelectedAddress,
    intent,
    setIntent,
    generatedAddress,
    setGeneratedAddress,
    runtimePairingUrl,
    setRuntimePairingUrl,
    webClientUrl,
    setWebClientUrl,
    runtimePairingDeviceId,
    setRuntimePairingDeviceId,
    linkEditRevisionRef,
    clearGeneratedUrls
  }
}
