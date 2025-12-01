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

// ============================================================================
// Utility functions for working with Results
// ============================================================================

/**
 * Type guard: check if Result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/**
 * Type guard: check if Result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Transform the value inside a success Result.
 * If the Result is an error, returns it unchanged.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return Ok(fn(result.value));
  }
  return result;
}

/**
 * Transform the error inside a failure Result.
 * If the Result is a success, returns it unchanged.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return Err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations that return Results (flatMap).
 * If the Result is an error, returns it unchanged.
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Get the value or return a default.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Get the value or compute a default lazily.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Get the value or throw the error.
 * Use sparingly - prefer handling errors explicitly.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Combine multiple Results into one.
 * Returns Ok with array of values if all succeed, or first Err.
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

/**
 * Try to execute a function and wrap result/exception in Result.
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return Ok(fn());
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Try to execute an async function and wrap result/exception in Result.
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await fn());
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)));
  }
}
