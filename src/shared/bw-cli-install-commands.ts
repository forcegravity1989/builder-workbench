// Why (BW #323): one source of truth for the npm install commands
// (user-confirmed 2026-10-15/16, cloudbuild 2026-10-19 per #366) — the main
// process spawns exactly what the integration cards display, so the visible
// command can never drift from the executed one. codehub/welink stay
// self-contained: the registry flag acts on this command only, never on the
// machine's npm configuration (the public npm welink-cli is an unrelated
// tool). cloudbuild is the deliberate exception: its口径 persists the scoped
// @hw-cloudbuild registry in the machine npm config first, because `cb
// upgrade` re-installs from npm and needs that registry to resolve.

export const BW_CLI_INSTALL_COMMANDS = {
  codehub: [
    [
      'npm',
      'install',
      '-g',
      '@codehub/codehub-cli',
      '--registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/',
      '--strict-ssl=false'
    ]
  ],
  welink: [
    [
      'npm',
      'install',
      '-g',
      '@welink/welink-cli',
      '--registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/',
      '--strict-ssl=false'
    ]
  ],
  // Why (BW #366): two steps, in order — the scoped registry must be set
  // before install resolves @hw-cloudbuild/cloudbuild-cli from the product
  // npm; no --strict-ssl=false in this口径 (user-specified 2026-10-19).
  cloudbuild: [
    [
      'npm',
      'config',
      'set',
      '@hw-cloudbuild:registry',
      'https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/'
    ],
    ['npm', 'install', '-g', '@hw-cloudbuild/cloudbuild-cli']
  ]
} as const satisfies Record<string, readonly (readonly string[])[]>

export type BwCliInstallId = keyof typeof BW_CLI_INSTALL_COMMANDS

export type BwCliInstallFinishedPayload = {
  cli: BwCliInstallId
  ok: boolean
  /** Human-readable failure reason; empty on success. */
  reason: string
  /** Tail of the install output for the failure notification. */
  tail: string
}

export function isBwCliInstallId(value: unknown): value is BwCliInstallId {
  return value === 'codehub' || value === 'welink' || value === 'cloudbuild'
}

/** One display line per command — the cards render each as its own command row. */
export function formatBwCliInstallCommandLines(cli: BwCliInstallId): string[] {
  return BW_CLI_INSTALL_COMMANDS[cli].map((argv) => argv.join(' '))
}
