import type { SessionError, SessionErrorCode, SessionResult } from './types';

export class SessionFault extends Error {
  constructor(
    readonly sessionError: SessionError,
  ) {
    super(sessionError.message);
    this.name = 'SessionFault';
  }
}

export const failure = <T>(code: SessionErrorCode, message: string, retryable = false): SessionResult<T> => ({
  ok: false,
  error: { code, message, retryable },
});

export const success = <T>(value: T): SessionResult<T> => ({ ok: true, value });

export const fault = (code: SessionErrorCode, message: string, retryable = false): SessionFault => new SessionFault({ code, message, retryable });

export const toSessionResult = <T>(callback: () => Promise<T>): Promise<SessionResult<T>> => callback()
  .then(success)
  .catch((caught: unknown) => {
    if (caught instanceof SessionFault) return { ok: false, error: caught.sessionError };
    return failure('unknown', 'Não foi possível concluir a operação.', true);
  });
