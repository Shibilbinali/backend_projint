/**
 * Retry-capable fetch wrapper with exponential backoff.
 * Used for external API calls (Google Books, Open Library, ISBNdb, publisher APIs).
 *
 * Retries on:  429 Rate Limit, 500 Internal Server Error,
 *              502 Bad Gateway, 503 Service Unavailable,
 *              Network Timeout / Connection Errors
 *
 * Backoff schedule: 2s → 4s → 8s → 16s (4 retries max)
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000; // 2 seconds
const REQUEST_TIMEOUT_MS = 15000; // 15 seconds per attempt

/**
 * Generates a short trace ID for log correlation.
 */
function generateTraceId() {
  return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sleep utility.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout using AbortController.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Performs a fetch request with automatic retry and exponential backoff.
 *
 * @param {string} url - The URL to fetch.
 * @param {object} options - Standard fetch options (method, headers, body, etc).
 * @param {object} retryOptions - Optional overrides.
 * @param {number} retryOptions.maxRetries - Max retry attempts (default 4).
 * @param {number} retryOptions.baseDelay - Base delay in ms (default 2000).
 * @param {number} retryOptions.timeout - Request timeout in ms (default 15000).
 * @param {string} retryOptions.label - Human-readable label for logs (e.g. "Google Books").
 * @returns {Promise<Response|null>} - The fetch Response, or null if all attempts fail.
 */
async function retryFetch(url, options = {}, retryOptions = {}) {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY_MS,
    timeout = REQUEST_TIMEOUT_MS,
    label = 'External API',
  } = retryOptions;

  const traceId = generateTraceId();
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timestamp = new Date().toISOString();

    try {
      const response = await fetchWithTimeout(url, options, timeout);

      // Success — return the response
      if (response.ok) {
        if (attempt > 0) {
          console.log(
            `[${label}] ✅ Request succeeded on retry #${attempt} | ` +
            `TraceID: ${traceId} | URL: ${url} | Status: ${response.status} | ${timestamp}`
          );
        }
        return response;
      }

      // Non-retryable error — return immediately (e.g. 404, 400)
      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        console.warn(
          `[${label}] ⚠️ Non-retryable HTTP ${response.status} | ` +
          `TraceID: ${traceId} | URL: ${url} | ${timestamp}`
        );
        return response;
      }

      // Retryable error
      lastError = new Error(`HTTP ${response.status}`);
      console.warn(
        `[${label}] ⚠️ Retryable HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}) | ` +
        `TraceID: ${traceId} | URL: ${url} | ${timestamp}`
      );

    } catch (err) {
      lastError = err;
      const isTimeout = err.name === 'AbortError';
      const errorType = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';

      console.warn(
        `[${label}] ⚠️ ${errorType}: ${err.message} (attempt ${attempt + 1}/${maxRetries + 1}) | ` +
        `TraceID: ${traceId} | URL: ${url} | ${timestamp}`
      );
    }

    // If we haven't exhausted retries, wait with exponential backoff
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      console.log(
        `[${label}] ⏳ Retrying in ${delay / 1000}s... | TraceID: ${traceId}`
      );
      await sleep(delay);
    }
  }

  // All retries exhausted
  console.error(
    `[${label}] ❌ All ${maxRetries + 1} attempts failed | ` +
    `TraceID: ${traceId} | URL: ${url} | ` +
    `Last error: ${lastError?.message || 'Unknown'} | ${new Date().toISOString()}`
  );

  return null;
}

module.exports = {
  retryFetch,
  RETRYABLE_STATUS_CODES,
  MAX_RETRIES,
  BASE_DELAY_MS,
  REQUEST_TIMEOUT_MS,
};
