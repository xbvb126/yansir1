export async function isExpectedApi(url, options = {}) {
  const response = await fetchWithTimeout(url, options.timeoutMs);
  if (!response?.ok) {
    return false;
  }
  try {
    const payload = await response.json();
    return payload?.status === 'ok' && payload.database !== null && typeof payload.database === 'object';
  } catch {
    return false;
  }
}

export async function isExpectedWeb(url, options = {}) {
  const response = await fetchWithTimeout(url, options.timeoutMs);
  if (!response?.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    return false;
  }
  const html = await response.text();
  return /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+\.js(?:\?[^"']*)?["'][^>]*>/i.test(html)
    || /<script\b[^>]*\bsrc=["'][^"']+\.js(?:\?[^"']*)?["'][^>]*\btype=["']module["'][^>]*>/i.test(html);
}

async function fetchWithTimeout(url, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
