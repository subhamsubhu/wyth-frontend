/**
 * API Retry Utility with Exponential Backoff
 *
 * Handles Railway backend cold starts (5-10s warmup time)
 * Implements exponential backoff with jitter for optimal retry timing.
 *
 * NOTE (fix): previous version reported "Still trying... (X/undefined)" because
 * the `maxRetries` value wasn't forwarded into every onRetry callback. We now
 * pass it through everywhere and surface a sane bounded retry count to the UI.
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const DEFAULT_MAX_RETRIES = 4;          // total retries (so up to 5 attempts)
const DEFAULT_BASE_DELAY  = 800;        // start at 0.8s
const DEFAULT_MAX_DELAY   = 4000;       // cap each wait at 4s
const HEALTH_TIMEOUT_MS   = 4000;       // single health check timeout
const HEALTH_WAIT_MAX     = 6;          // max health check polls (~12s)

/**
 * Check if backend is healthy and ready
 * @returns {Promise<boolean>} true if backend is ready
 */
export async function checkBackendHealth() {
  if (!BACKEND_URL) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const response = await fetch(`${BACKEND_URL}/api/public/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (_err) {
    return false;
  }
}

/**
 * Wait for backend to become healthy. Bounded — never loops forever.
 * @param {Function} onProgress - Callback (receives {attempt, maxAttempts, message})
 * @returns {Promise<boolean>} true if backend became healthy
 */
export async function waitForBackend(onProgress = null) {
  const maxAttempts = HEALTH_WAIT_MAX;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onProgress) {
      onProgress({
        attempt,
        maxAttempts,
        maxRetries: maxAttempts,
        message: attempt === 1 ? 'Checking server...' : 'Waking up server...',
      });
    }

    const isHealthy = await checkBackendHealth();
    if (isHealthy) return true;

    if (attempt < maxAttempts) {
      const delay = Math.min(DEFAULT_BASE_DELAY * Math.pow(2, attempt - 1), DEFAULT_MAX_DELAY);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return false;
}

/**
 * Retry an async function with exponential backoff (bounded).
 * @param {Function} fn
 * @param {Object} options
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay  = DEFAULT_BASE_DELAY,
    maxDelay   = DEFAULT_MAX_DELAY,
    onRetry    = null,
    checkHealth = false, // disabled by default — fail fast, retry transparently
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isConnectionError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ERR_NETWORK' ||
        error.code === 'ECONNABORTED' ||
        error.message?.includes('Network Error') ||
        error.message?.includes('timeout') ||
        error.message?.includes('Failed to fetch') ||
        !error.response;

      // Bail immediately on real HTTP errors (auth/permission/not-found)
      if (!isConnectionError && error.response) {
        throw error;
      }

      // Out of attempts
      if (attempt >= maxRetries) {
        throw error;
      }

      // Tell the UI what's happening — always include maxRetries
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          maxAttempts: maxRetries,
          error,
          isConnectionError,
        });
      }

      // Optional: probe health once on first failure to detect cold start
      if (checkHealth && attempt === 0) {
        const healthy = await checkBackendHealth();
        if (!healthy) {
          const becameHealthy = await waitForBackend((p) =>
            onRetry && onRetry({ ...p, maxRetries })
          );
          if (becameHealthy) continue;
          // Backend never came up — throw the original network error
          throw error;
        }
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

/**
 * Wrap axios request with retry logic
 */
export async function retryAxiosRequest(requestFn, retryOptions = {}) {
  return retryWithBackoff(requestFn, {
    maxRetries: DEFAULT_MAX_RETRIES,
    baseDelay: DEFAULT_BASE_DELAY,
    maxDelay: DEFAULT_MAX_DELAY,
    checkHealth: false,
    ...retryOptions,
  });
}

/**
 * User-friendly progress message. Robust against missing maxAttempts.
 */
export function getLoadingMessage(attempt, maxAttempts) {
  const total = Number.isFinite(maxAttempts) && maxAttempts > 0
    ? maxAttempts
    : DEFAULT_MAX_RETRIES;
  const a = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;

  if (a === 1) return 'Loading...';
  if (a <= Math.ceil(total / 2)) return 'Waking up server...';
  if (a < total) return 'Server is starting, please wait...';
  return `Still trying... (${a}/${total})`;
}
