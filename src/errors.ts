export class HdcError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'HdcError'
  }
}

export function explainHdcError(error: unknown): string {
  if (error instanceof HdcError) return error.message
  if (error instanceof Error && error.message.includes('ENOENT')) return 'HDC executable was not found. Set HDC or add hdc to PATH.'
  return error instanceof Error ? error.message : String(error)
}
