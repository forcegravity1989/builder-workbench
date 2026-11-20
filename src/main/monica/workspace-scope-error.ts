export class WorkspaceScopeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
