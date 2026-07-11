export async function fetchWithRetry(
  url: string,
  retries = 3
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      // Honor Sleeper's rate limiting: back off on 429 (and 5xx) using
      // Retry-After when provided, otherwise a growing delay. Ingesting a
      // multi-season league fires hundreds of calls, so this keeps us under
      // the limit instead of hard-failing the whole sync.
      if (response.status === 429 || response.status >= 500) {
        if (i === retries - 1) throw new Error(`HTTP ${response.status}`);
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * (i + 1) * 2;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
