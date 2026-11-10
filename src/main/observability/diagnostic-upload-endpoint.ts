// Build identity + channel resolution for diagnostics metadata. Kept outside
// ipc/diagnostics.ts so crash reporting can label bundles through the same
// rules. (BW #553: the native token-endpoint resolvers were removed with the
// reporting redirect — the WeLink group-space sink resolves its own config in
// src/main/workbench/reporting/welink-report-config.ts.)

export function resolveDiagnosticBuildIdentity(): 'stable' | 'rc' | null {
  const ident =
    typeof ORCA_BUILD_IDENTITY !== 'undefined'
      ? ORCA_BUILD_IDENTITY
      : ((globalThis as { ORCA_BUILD_IDENTITY?: 'stable' | 'rc' | null }).ORCA_BUILD_IDENTITY ??
        null)
  return ident === 'stable' || ident === 'rc' ? ident : null
}

export function resolveDiagnosticOrcaChannel(): 'stable' | 'rc' | 'dev' {
  const ident = resolveDiagnosticBuildIdentity()
  if (ident === 'stable' || ident === 'rc') {
    return ident
  }
  return 'dev'
}
