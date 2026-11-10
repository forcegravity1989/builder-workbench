// Ambient declarations for compile-time constants substituted by the build
// configs. The telemetry constants live in electron-vite's main `define`
// block; contributor / `pnpm dev` / third-party builds substitute literal
// `null`, which `IS_OFFICIAL_BUILD` in `src/main/telemetry/client.ts`
// evaluates to `false` at module load — such builds console-mirror only.
//
// The CI release workflow (and only the CI release workflow) provides real
// values via GitHub Actions secrets. There is no runtime env-var fallback;
// the substitution happens at compile time so a curious contributor cannot
// spoof transmission with a shell export.
//
declare const ORCA_BUILD_IDENTITY: 'stable' | 'rc' | null
declare const ORCA_POSTHOG_WRITE_KEY: string | null

// BW #553: the diagnostic-bundle token endpoint constant
// (ORCA_DIAGNOSTICS_TOKEN_URL) was removed together with the native HTTP
// upload path — the WeLink group-space sink in
// src/main/workbench/reporting/ is the single delivery path.

// WeLink group-space id for the BW reporting sink (Issue #553). Substituted
// from WORKBENCH_WELINK_SPACE_ID at build time; `null` when unset, at which
// point reporting entries fail with setup guidance instead of uploading.
// Unlike the native pin, the runtime env var intentionally wins over the
// build literal (see welink-report-config.ts for the rationale).
declare const WORKBENCH_WELINK_SPACE_ID: string | null
