/**
 * Dynamic URL Resolution Service
 * Fetches and caches mirror domains from upstream CSX URLs repository.
 */

let cachedUrls: Record<string, string> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const DEFAULT_FALLBACK_URLS: Record<string, string> = {
  bollyflix: 'https://bollyflix.co.za',
  moviesdrive: 'https://new3.moviesdrive.beer',
  moviesmod: 'https://moviesmod.uk.com',
  vegamovies: 'https://1vegamovies.pics',
  gdflix: 'https://new6.gdflix.io',
  hubcloud: 'https://hubcloud.ist',
  vcloud: 'https://vcloud.fit',
  cinemeta: 'https://v3-cinemeta.strem.io'
};

export async function getLatestDynamicUrls(
  customFetch: typeof fetch = fetch
): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedUrls && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedUrls;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await customFetch(
      'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json',
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json() as Record<string, string>;
      cachedUrls = { ...DEFAULT_FALLBACK_URLS, ...data };
      lastFetchTime = now;
      return cachedUrls;
    }
  } catch {
    // Return fallback on network error or timeout
  }

  return cachedUrls || DEFAULT_FALLBACK_URLS;
}

export async function getProviderBaseUrl(
  key: string,
  defaultUrl: string,
  customFetch: typeof fetch = fetch
): Promise<string> {
  const urls = await getLatestDynamicUrls(customFetch);
  const resolved = urls[key.toLowerCase()];
  if (resolved && resolved.startsWith('http')) {
    return resolved.replace(/\/+$/, '');
  }
  return defaultUrl.replace(/\/+$/, '');
}
