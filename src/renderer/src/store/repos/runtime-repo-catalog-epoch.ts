const epochs = new Map<string, number>()

export function getRuntimeRepoCatalogEpoch(environmentId: string): number {
  return epochs.get(environmentId) ?? 0
}

export function advanceRuntimeRepoCatalogEpoch(environmentId: string): void {
  epochs.set(environmentId, getRuntimeRepoCatalogEpoch(environmentId) + 1)
}
