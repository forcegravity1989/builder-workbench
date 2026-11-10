import { overlayRuntimeEnvironmentSidecar, readRuntimeEnvironmentSidecar, RuntimeEnvironmentSidecarInvalidError, type RuntimeEnvironmentSidecar } from './remote-runtime/host-store/runtime-environment-sidecar'
import type { KnownRuntimeEnvironment } from './runtime-environments'
import {
  JsonStringifyByteLimitError,
  stringifyJsonWithinByteLimit
} from './node-bounded-json-stringify'
import { writeSecureFile } from './secure-file'
import {
  RuntimeEnvironmentStoreSchema,
  type RuntimeEnvironmentStore
} from './runtime-environments'
import {
  getEnvironmentStorePath,
  MAX_RUNTIME_ENVIRONMENT_STORE_FILE_BYTES,
  readEnvironmentStoreRecords,
  backUpBlankEnvironmentStore,
  remoteServerPairingStoreError,
  RuntimeEnvironmentStoreError,
  type EnvironmentStoreRecordsReadOptions,
  warnUnreadableEnvironmentState
} from './runtime-environment-store-records'

/** Readable records only; writeEnvironmentStore preserves unreadable corrupt/newer records verbatim. */
export function readPersistedEnvironmentStore(
  userDataPath: string,
  options: EnvironmentStoreRecordsReadOptions = {}
): RuntimeEnvironmentStore {
  const { environments, unreadable } = readEnvironmentStoreRecords(userDataPath, options)
  if (unreadable.length > 0) {
    warnUnreadableEnvironmentState(
      `Skipping ${unreadable.length} unreadable server record(s) in ${getEnvironmentStorePath(userDataPath)} (ids: ${unreadable.map((record) => record.id ?? '<none>').join(', ')}); they may need a newer version of Orca and are kept on disk.`
    )
  }
  return {
    version: 1,
    environments: environments.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export function readEnvironmentStore(
  userDataPath: string,
  options: EnvironmentStoreRecordsReadOptions = {}
): { version: 1; environments: KnownRuntimeEnvironment[] } {
  const store = readPersistedEnvironmentStore(userDataPath, options)
  let sidecar: RuntimeEnvironmentSidecar
  try {
    sidecar = readRuntimeEnvironmentSidecar(userDataPath)
  } catch (error) {
    if (error instanceof RuntimeEnvironmentSidecarInvalidError) {
      throw new RuntimeEnvironmentStoreError('runtime_error', error.message)
    }
    throw error
  }
  const hidden = store.environments.filter((environment) => Object.hasOwn(sidecar.unreadable, environment.id))
  if (hidden.length > 0) {
    warnUnreadableEnvironmentState(`Hiding ${hidden.length} server(s) whose links cannot be read (ids: ${hidden.map((environment) => environment.id).join(', ')}); they may need a newer version of Orca.`)
  }
  return {
    version: 1,
    environments: store.environments.filter((environment) => !Object.hasOwn(sidecar.unreadable, environment.id))
      .map((environment) => overlayRuntimeEnvironmentSidecar(environment, sidecar.entries[environment.id]))
  }
}

/** Write persisted fields only; preserve unreadable on-disk records verbatim/in order. */
export function writeEnvironmentStore(userDataPath: string, store: RuntimeEnvironmentStore): void {
  const path = getEnvironmentStorePath(userDataPath)
  const environments = RuntimeEnvironmentStoreSchema.parse(store).environments
  // The new registry replaces a blank file in one atomic write, so no reader sees it emptied early.
  const onDisk = readEnvironmentStoreRecords(userDataPath, { recoverBlankStore: true })
  const readableIds = new Set(onDisk.environments.map((environment) => environment.id))
  const unreadableIds = new Set(onDisk.unreadable.map((record) => record.id))
  // A new readable record must not shadow one a newer build owns under the same id.
  if (environments.some(({ id }) => unreadableIds.has(id) && !readableIds.has(id))) {
    throw remoteServerPairingStoreError('idNeedsNewerOrca')
  }
  let serialized: string
  try {
    serialized = stringifyJsonWithinByteLimit(
      {
        version: 1,
        environments: [...environments, ...onDisk.unreadable.map((record) => record.raw)]
      },
      MAX_RUNTIME_ENVIRONMENT_STORE_FILE_BYTES
    ).serialized
  } catch (error) {
    if (error instanceof JsonStringifyByteLimitError) {
      throw new RuntimeEnvironmentStoreError(
        'runtime_error',
        `Could not write Orca environments at ${path}; the store exceeds its durable capacity.`
      )
    }
    throw error
  }
  // Copied only once the write is certain to be attempted, so rejected saves leave no copies.
  if (onDisk.blankFile) {
    backUpBlankEnvironmentStore(userDataPath)
  }
  // Without fsync before the rename, a crash can publish the name over NUL-filled data (#18766).
  writeSecureFile(path, serialized, { durable: true })
}
