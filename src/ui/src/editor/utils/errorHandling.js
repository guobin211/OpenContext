/**
 * Centralized error handling utilities for the editor.
 *
 * ## Design
 * - Provides consistent error handling patterns
 * - Supports optional logging/reporting
 * - Keeps component code clean by abstracting try/catch boilerplate
 */

/**
 * @typedef {object} ErrorContext
 * @property {string} [operation] - What operation was being attempted
 * @property {string} [component] - Which component the error occurred in
 * @property {object} [metadata] - Additional context data
 */

/**
 * Log an error with context.
 * In production, this could send errors to a monitoring service.
 *
 * @param {Error|unknown} error - The error that occurred
 * @param {ErrorContext} [context] - Additional context about the error
 */
export function logEditorError(error, context = {}) {
  // In development, log to console
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Editor Error]', {
      error,
      ...context,
      timestamp: new Date().toISOString(),
    });
  }

  // In production, you might want to send to a monitoring service:
  // sendToMonitoring({ error, context });
}

/**
 * Safely execute an editor operation with error handling.
 * Returns the result on success, or undefined on failure.
 *
 * @template T
 * @param {() => T} operation - The operation to execute
 * @param {ErrorContext} [context] - Context for error reporting
 * @returns {T | undefined}
 */
export function safeEditorOp(operation, context = {}) {
  try {
    return operation();
  } catch (error) {
    logEditorError(error, context);
    return undefined;
  }
}

/**
 * Safely execute an async editor operation with error handling.
 *
 * @template T
 * @param {() => Promise<T>} operation - The async operation to execute
 * @param {ErrorContext} [context] - Context for error reporting
 * @returns {Promise<T | undefined>}
 */
export async function safeAsyncEditorOp(operation, context = {}) {
  try {
    return await operation();
  } catch (error) {
    logEditorError(error, context);
    return undefined;
  }
}

/**
 * Create a wrapped function that catches errors silently.
 * Useful for event handlers where you want to suppress errors.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn - The function to wrap
 * @param {ErrorContext} [context] - Context for error reporting
 * @returns {T}
 */
export function withErrorBoundary(fn, context = {}) {
  return ((...args) => {
    try {
      return fn(...args);
    } catch (error) {
      logEditorError(error, context);
      return undefined;
    }
  });
}

/**
 * Wrap an async function with error handling.
 *
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} fn - The async function to wrap
 * @param {ErrorContext} [context] - Context for error reporting
 * @returns {T}
 */
export function withAsyncErrorBoundary(fn, context = {}) {
  return (async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logEditorError(error, context);
      return undefined;
    }
  });
}

export default {
  logEditorError,
  safeEditorOp,
  safeAsyncEditorOp,
  withErrorBoundary,
  withAsyncErrorBoundary,
};

