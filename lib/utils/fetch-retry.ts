import { logger } from '../utils/logger';

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 5000, retries = 2, retryDelayMs = 1000, ...fetchOptions } = options;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });

      // Optionally, throw on non-200 if appropriate. Here we let the caller handle 4xx/5xx if needed,
      // but for retries, maybe we should retry on 5xx?
      if (!response.ok && response.status >= 500) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error: any) {
      lastError = error;
      attempt++;
      if (attempt <= retries) {
        const backoffMs = retryDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`Fetch failed for ${url} (${error.message}). Retrying ${attempt}/${retries} in ${backoffMs}ms...`);
        await new Promise(res => setTimeout(res, backoffMs));
      }
    } finally {
      clearTimeout(id);
    }
  }

  throw new Error(`Fetch failed after ${retries} retries: ${lastError?.message}`);
}
