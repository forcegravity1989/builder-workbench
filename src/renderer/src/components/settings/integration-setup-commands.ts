// Install / sign-in commands the Integrations cards run in an inline terminal.
// Why a table: each provider documents one package-manager line per OS; when an
// OS has no single trusted line (Linux distros, codehub-cli outside its own
// distribution channel) the card keeps the docs link instead of guessing one.

export type IntegrationCliProvider = 'gh' | 'glab' | 'codehub'

type PlatformCommands = Partial<Record<NodeJS.Platform, string>>

const INSTALL: Record<IntegrationCliProvider, PlatformCommands> = {
  gh: { darwin: 'brew install gh', win32: 'winget install --id GitHub.cli -e' },
  glab: { darwin: 'brew install glab', win32: 'winget install --id glab.glab -e' },
  codehub: {}
}

const SIGN_IN: Record<IntegrationCliProvider, string> = {
  gh: 'gh auth login',
  glab: 'glab auth login',
  codehub: 'codehub-cli auth login'
}

export function integrationInstallCommand(
  provider: IntegrationCliProvider,
  platform: NodeJS.Platform
): string | null {
  return INSTALL[provider][platform] ?? null
}

export function integrationSignInCommand(provider: IntegrationCliProvider): string {
  return SIGN_IN[provider]
}

// Why codehub only: preflight probes gh / glab sign-in but only PATH for codehub-cli.
export const CODEHUB_AUTH_STATUS_COMMAND = 'codehub-cli auth status'
