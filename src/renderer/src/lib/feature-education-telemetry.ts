import type { EventName, EventProps } from '../../../shared/telemetry-events'
import type { TerminalPaneSplitSource } from '../../../shared/feature-education-telemetry'
import { track } from './telemetry'

const TERMINAL_PANE_SPLIT_TELEMETRY_STORAGE_KEY = 'orca.terminalPaneSplitTelemetry.v1'

type FeatureEducationTelemetryEventName = Extract<EventName, 'terminal_pane_split'>

export function trackTerminalPaneSplit(args: {
  source: TerminalPaneSplitSource
  direction: 'vertical' | 'horizontal'
}): void {
  if (!reserveTerminalPaneSplitTelemetry(args.source, args.direction)) {
    return
  }
  emitFeatureEducationTelemetry('terminal_pane_split', {
    source: args.source,
    direction: args.direction
  })
}

export function reserveTerminalPaneSplitTelemetry(
  source: TerminalPaneSplitSource,
  direction: 'vertical' | 'horizontal'
): boolean {
  if (globalThis.localStorage === undefined) {
    return true
  }
  try {
    const emitted = readTerminalPaneSplitTelemetryKeys()
    const key = getTerminalPaneSplitTelemetryKey(source, direction, new Date())
    if (emitted.has(key)) {
      return false
    }
    emitted.add(key)
    globalThis.localStorage.setItem(
      TERMINAL_PANE_SPLIT_TELEMETRY_STORAGE_KEY,
      JSON.stringify([...emitted].slice(-32))
    )
    return true
  } catch {
    // Telemetry cost controls are best-effort; storage failures must not block split behavior.
    return true
  }
}

function emitFeatureEducationTelemetry<N extends FeatureEducationTelemetryEventName>(
  name: N,
  props: EventProps<N>
): void {
  track(name, props)
}

function readTerminalPaneSplitTelemetryKeys(): Set<string> {
  const raw = JSON.parse(
    globalThis.localStorage?.getItem(TERMINAL_PANE_SPLIT_TELEMETRY_STORAGE_KEY) ?? '[]'
  )
  if (!Array.isArray(raw)) {
    return new Set()
  }
  return new Set(raw.filter((value): value is string => typeof value === 'string'))
}

function getTerminalPaneSplitTelemetryKey(
  source: TerminalPaneSplitSource,
  direction: 'vertical' | 'horizontal',
  date: Date
): string {
  const day = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : new Date(0).toISOString().slice(0, 10)
  return `${day}:${source}:${direction}`
}
