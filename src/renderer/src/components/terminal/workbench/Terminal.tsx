import React from 'react'
import { TerminalSurface } from './TerminalSurface'
import { useTerminalController } from './use-terminal-controller'

function Terminal({
  reserveClosedExplorerToggleSpace = true
}: {
  reserveClosedExplorerToggleSpace?: boolean
}): React.JSX.Element | null {
  return (
    <TerminalSurface
      controller={useTerminalController()}
      reserveClosedExplorerToggleSpace={reserveClosedExplorerToggleSpace}
    />
  )
}

export default React.memo(Terminal)
