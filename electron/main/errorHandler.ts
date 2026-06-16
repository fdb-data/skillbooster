import log from 'electron-log'
import type { AppError, IpcResult } from '../../src/contracts/ipc-types'

export function normalizeError(err: unknown): AppError {
  if (err instanceof Error) {
    return {
      code: (err as { code?: string }).code || 'UNKNOWN_ERROR',
      message: err.message,
      details: err.stack
    }
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: String(err)
  }
}

export function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

export function fail(err: unknown): IpcResult<never> {
  const appErr = normalizeError(err)
  log.error('IPC error:', JSON.stringify(appErr))
  return { success: false, error: appErr }
}

export function wrapHandler<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<IpcResult<TResult>> {
  return async (...args: TArgs) => {
    try {
      const result = await handler(...args)
      return ok(result)
    } catch (err) {
      return fail(err)
    }
  }
}