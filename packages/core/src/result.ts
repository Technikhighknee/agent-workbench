/**
 * Result type for explicit error handling.
 * No exceptions crossing boundaries.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a success result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Create an error result.
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Lowercase aliases for compatibility
export const ok = Ok;
export const err = Err;
