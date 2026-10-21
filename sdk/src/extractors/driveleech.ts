import type { VideoSource, VideoQuality } from '../types.ts';
import { parseVideoQuality } from './html.ts';

export function decodeUrlParam(urlWithParam: string): string | null {
  try {
    if (urlWithParam.includes('url=')) {
      const b64 = urlWithParam.substring(urlWithParam.indexOf('url=') + 4);
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
    return urlWithParam;
  } catch {
    return null;
  }
}

export async function extractDriveleechSources(
  initialUrl: string,
  customFetch: typeof fetch = fetch
): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    const res = await customFetch(initialUrl, {
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

      if (
        text.includes('Cloud Download') ||
        text.includes('Direct Links') ||
        text.includes('Instant Download') ||
        text.includes('Resume Cloud')
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
