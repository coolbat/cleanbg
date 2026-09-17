import type { RemovalErrorCode } from './types';

export class BackgroundRemovalError extends Error {
  readonly code: RemovalErrorCode;

  constructor(code: RemovalErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackgroundRemovalError';
    this.code = code;
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof BackgroundRemovalError && error.code === 'cancelled';
}
