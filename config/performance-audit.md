# Performance regression checks

`pnpm --silent audit:perf > performance-audit.json` scans production `src/` with
the existing app-store and buffer-concatenation rules plus the sort-comparator
rule. Warnings are advisory in this full inventory; tool/parser failures fail.
New warning findings on changed lines fail `pnpm check:code-quality:changed`.
Tests, generated files, `mobile/` and `cloud/` are outside this source audit.

The sort rule detects optioned `localeCompare` and `Intl.Collator` construction
inside inline `sort`/`toSorted` callbacks. Construct one collator outside the
callback, preserving locale, options and tie-breakers. If the locale changes at
runtime, reconstruct at the next sort or key the cache by locale. Bare comparisons
and standalone equality checks are allowed. There is no autofix or interprocedural
analysis: named comparators, aliases, custom methods and deferred callbacks need
manual review. A warning identifies repeated setup, not proof of visible lag.

`pnpm test:perf:contracts` runs the explicit selection in
`vitest.performance.config.ts`: SQLite statement reuse and schema parity, relay
filesystem concurrency, tokenizer rejection, highlighting cache, queued
cancellation, terminal backing-memory retention and detector fixtures. Missing
listed files fail configuration loading. Tests run serially, without retries,
and inherit the full suite's setup and forced-GC support. This makes existing
regression coverage easy to run and attribute; it does not create new workload
coverage by itself.

Since the Orca CI/E2E isolation (see `ref/upstream.md`), `performance-contracts.yml`
is retained as a dispatch-only historical workflow, and the terminal/SSH E2E entry
commands it referenced are gone from `package.json`. The current Workbench PR check
does not claim to measure rendered frame budgets, SSH RTT, WSL scheduling or a
packaged Electron renderer; those require a separately reintroduced, scoped
performance lane.

To extend coverage, select a production-path regression with an operation-count,
identity, queue-admission or retained-memory oracle. Confirm it fails with the
old behavior. Use controlled, counterbalanced benchmark samples for timings;
avoid new machine-dependent millisecond gates in the normal unit suite. A green
source scan and these contracts cannot establish that the whole app is fast.
