import type { ApiErrorPayload } from './types';

export async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function resolveApiErrorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  if (!payload) {
    return fallback;
  }

  const { error, message } = payload;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object') {
    const nested = error as { message?: unknown; code?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return fallback;
}
