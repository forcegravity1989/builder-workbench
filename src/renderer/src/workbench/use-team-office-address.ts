import { useEffect, useState } from 'react'
import { selectTeamOfficeAddress } from '../../../shared/team-host-address'
import type { TeamNetworkInterface } from './TeamSettingsMembers'

export function useTeamOfficeAddress(open: boolean): {
  networkInterfaces: TeamNetworkInterface[]
  selectedAddress: string
  setSelectedAddress: (address: string) => void
} {
  const [networkInterfaces, setNetworkInterfaces] = useState<TeamNetworkInterface[]>([])
  const [selectedAddress, setSelectedAddress] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    void window.api.mobile
      .listNetworkInterfaces()
      .then((result) => {
        if (cancelled) {
          return
        }
        setNetworkInterfaces(result.interfaces)
        setSelectedAddress((current) => {
          if (current && result.interfaces.some((item) => item.address === current)) {
            return current
          }
          return selectTeamOfficeAddress(result.interfaces) ?? ''
        })
      })
      .catch(() => {
        if (!cancelled) {
          setNetworkInterfaces([])
          setSelectedAddress('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return { networkInterfaces, selectedAddress, setSelectedAddress }
}
