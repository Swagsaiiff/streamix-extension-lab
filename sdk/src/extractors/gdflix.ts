import type { VideoSource, VideoQuality } from '../types.ts';
import { parseVideoQuality, extractBaseUrl } from './html.ts';
import { getProviderBaseUrl } from './urls.ts';

export async function bypassSidexfee(
  id: string,
  customFetch: typeof fetch = fetch
): Promise<string | null> {
  try {
    const url = `https://web.sidexfee.com/?id=${id}`;
    const res = await customFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = /link["']?\s*:\s*["']([^"']+)["']/i.exec(text);
    if (!match) return null;
    const clean = match[1].replace(/\\\//g, '/');
    return Buffer.from(clean, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

export async function extractGdflixSources(
  initialUrl: string,
  customFetch: typeof fetch = fetch
): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    let currentUrl = initialUrl;
    const latestBase = await getProviderBaseUrl('gdflix', extractBaseUrl(initialUrl), customFetch);
    const origBase = extractBaseUrl(initialUrl);

    if (origBase && latestBase && origBase !== latestBase) {
      currentUrl = currentUrl.replace(origBase, latestBase);
    }

    const res = await customFetch(currentUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) return sources;
    const html = await res.text();

    const nameMatch = /Name\s*:\s*([^<]+)/i.exec(html);
    const fileName = nameMatch ? nameMatch[1].trim() : '';
    const quality: VideoQuality = parseVideoQuality(fileName);

    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = anchorRegex.exec(html)) !== null) {
      const link = match[1];
      const text = match[2];

      if (link.includes('pixeldra')) {
        const pxlId = link.split('/').pop()?.replace(/\?.*$/, '');
        if (pxlId) {
          sources.push({
            url: `https://pixeldrain.com/api/file/${pxlId}?download`,
            quality,
            format: 'mp4',
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
        }
      } else if (
        text.includes('DIRECT') ||
        text.includes('FSL V2') ||
        text.includes('CLOUD DOWNLOAD') ||
        text.includes('Download')
      ) {
        if (link.startsWith('http')) {
          sources.push({
            url: link,
            quality,
            format: link.includes('.m3u8') ? 'hls' : (link.includes('.mkv') ? 'mkv' : 'mp4'),
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
        }
      }
    }
  } catch {
    // Fail gracefully
  }

  return sources;
}
