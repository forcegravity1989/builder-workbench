export type TaskProvider = 'github' | 'gitlab' | 'codehub' | 'linear' | 'jira'

export const TASK_PROVIDERS: readonly TaskProvider[] = [
  'github',
  'gitlab',
  'codehub',
  'linear',
  'jira'
]

const TASK_PROVIDER_SET = new Set<TaskProvider>(TASK_PROVIDERS)

export function isTaskProvider(value: unknown): value is TaskProvider {
  return TASK_PROVIDER_SET.has(value as TaskProvider)
}

export function normalizeTaskProviderSettings(value: {
  visibleTaskProviders: unknown
  defaultTaskSource: unknown
}): { visibleTaskProviders: TaskProvider[]; defaultTaskSource: TaskProvider } {
  const visibleTaskProviders = normalizeVisibleTaskProviders(value.visibleTaskProviders)
  const defaultTaskSource = isTaskProvider(value.defaultTaskSource)
    ? value.defaultTaskSource
    : resolveVisibleTaskProvider('github', visibleTaskProviders)

  if (visibleTaskProviders.includes(defaultTaskSource)) {
    return { visibleTaskProviders, defaultTaskSource }
  }

  // Repair older/drifted profiles whose saved default disappeared from the visible list.
  return {
    defaultTaskSource,
    visibleTaskProviders: TASK_PROVIDERS.filter(
      (provider) => provider === defaultTaskSource || visibleTaskProviders.includes(provider)
    )
  }
}

export function normalizeVisibleTaskProviders(value: unknown): TaskProvider[] {
  if (!Array.isArray(value)) {
    return [...TASK_PROVIDERS]
  }

  const normalized: TaskProvider[] = []
  for (const provider of value) {
    if (!TASK_PROVIDER_SET.has(provider as TaskProvider)) {
      continue
    }
    if (!normalized.includes(provider as TaskProvider)) {
      normalized.push(provider as TaskProvider)
    }
  }

  // Keep a selectable source after hydration or manual settings edits.
  return normalized.length > 0 ? normalized : [...TASK_PROVIDERS]
}

/** Insert a provider once, immediately after `after` when that provider is present. */
export function ensureDefaultedTaskProvider(
  providers: readonly TaskProvider[],
  provider: TaskProvider,
  after: TaskProvider
): TaskProvider[] {
  if (providers.includes(provider)) {
    return [...providers]
  }
  const next = [...providers]
  const afterIndex = next.indexOf(after)
  next.splice(afterIndex !== -1 ? afterIndex + 1 : next.length, 0, provider)
  return next
}

export type TaskProviderAvailability = {
  gitlabInstalled: boolean
  linearConnected: boolean
}

export function filterAvailableTaskProviders(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability
): TaskProvider[] {
  const available = visibleProviders.filter((provider) =>
    isTaskProviderAvailable(provider, availability)
  )

  return available.length > 0 ? available : ['github']
}

export function restoreAvailableDefaultTaskProvider(
  visibleProviders: readonly TaskProvider[],
  availability: TaskProviderAvailability,
  preferredProvider: unknown
): TaskProvider[] {
  const available = filterAvailableTaskProviders(visibleProviders, availability)

  // Retain access to a saved default even when other providers become available.
  if (
    isTaskProvider(preferredProvider) &&
    isTaskProviderAvailable(preferredProvider, availability) &&
    !available.includes(preferredProvider)
  ) {
    return TASK_PROVIDERS.filter(
      (provider) => provider === preferredProvider || available.includes(provider)
    )
  }

  return available
}

function isTaskProviderAvailable(
  provider: TaskProvider,
  availability: TaskProviderAvailability
): boolean {
  if (provider === 'github') {
    return true
  }
  if (provider === 'gitlab') {
    return availability.gitlabInstalled
  }
  // Why: CodeHub availability is decided by actually invoking codehub-cli — a
  // preflight verdict conflates transient probe failures with "not installed"
  // and caches it for the whole session. A missing CLI surfaces as a typed
  // codehubError on the task page instead of hiding the source upfront.
  if (provider === 'codehub') {
    return true
  }
  // Why: Jira can be connected from the Tasks surface itself, so hiding it
  // when disconnected would remove the entry point for first-time setup.
  if (provider === 'jira') {
    return true
  }
  return availability.linearConnected
}

export function resolveVisibleTaskProvider(
  preferred: TaskProvider | null | undefined,
  visibleProviders: readonly TaskProvider[]
): TaskProvider {
  if (preferred && visibleProviders.includes(preferred)) {
    return preferred
  }
  return visibleProviders[0] ?? 'github'
}
