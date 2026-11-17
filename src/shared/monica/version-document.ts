export type VersionWorkflow = 'plan' | 'acceptance'

export type VersionDocumentIdentity = {
  schema_version: 3
  version: string
  cycleId: string
}

export type VersionDocumentSnapshot<T extends VersionDocumentIdentity> = {
  document: T
  revision: string
}

export type VersionDocumentSave<T extends VersionDocumentIdentity> = {
  version: string
  /** null means create only; an existing document requires its exact revision. */
  expectedRevision: string | null
  document: T
}

export type VersionDocumentPort<T extends VersionDocumentIdentity> = {
  read(version: string): Promise<VersionDocumentSnapshot<T> | null>
  save(input: VersionDocumentSave<T>): Promise<VersionDocumentSnapshot<T>>
}

export type VersionDocumentErrorCode =
  | 'invalid-version'
  | 'invalid-document'
  | 'migration-required'
  | 'revision-conflict'
  | 'unsafe-path'
  | 'lock-compromised'

export class VersionDocumentError extends Error {
  constructor(
    readonly code: VersionDocumentErrorCode,
    message: string,
    readonly currentRevision?: string | null
  ) {
    super(message)
    this.name = 'VersionDocumentError'
  }
}

export function validatePlanningVersion(version: string): void {
  // One portable directory name, including on Windows and in a project cloned on another OS.
  if (
    typeof version !== 'string' ||
    !version ||
    version !== version.trim() ||
    version.startsWith('.') ||
    version.endsWith('.') ||
    /[<>:"/\\|?*]/.test(version) ||
    Array.from(version).some((character) => character.charCodeAt(0) < 32) ||
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(version) ||
    version.toLowerCase() === 'template'
  ) {
    throw new VersionDocumentError(
      'invalid-version',
      'A confirmed version must be a valid directory name'
    )
  }
}
