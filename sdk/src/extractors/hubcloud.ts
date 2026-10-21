import type { VideoSource, VideoQuality } from '../types.ts';
import { parseVideoQuality, extractBaseUrl } from './html.ts';
import { getProviderBaseUrl } from './urls.ts';

export function extractDoubleAtob(str: string): string | null {
  try {
    const match = /var\s+url\s*=\s*atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/i.exec(str);
    if (!match) return null;
    const first = Buffer.from(match[1], 'base64').toString('utf-8');
    return Buffer.from(first, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

export function extractPxlUrl(html: string): string | null {
  const match = /var\s+pxl\s*=\s*["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

export async function extractHubCloudSources(
  initialUrl: string,
  customFetch: typeof fetch = fetch
): Promise<VideoSource[]> {
  const sources: VideoSource[] = [];
  try {
    let currentUrl = initialUrl;
    const isVcloud = initialUrl.includes('vcloud');
    const sourceKey = isVcloud ? 'vcloud' : 'hubcloud';
    const latestBase = await getProviderBaseUrl(sourceKey, extractBaseUrl(initialUrl), customFetch);
    const origBase = extractBaseUrl(initialUrl);

    if (origBase && latestBase && origBase !== latestBase) {
      currentUrl = currentUrl.replace(origBase, latestBase);
    }

    const res1 = await customFetch(currentUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res1.ok) return sources;
    const html1 = await res1.text();

    let targetLink = '';
    if (currentUrl.includes('/video/')) {
      const match = /<div class="vd"[^>]*>[\s\S]*?<center>[\s\S]*?<a[^>]+href=["']([^"']+)["']/i.exec(html1);
      targetLink = match ? match[1] : '';
    } else {
      if (isVcloud) {
        targetLink = extractDoubleAtob(html1) || '';
      }
      if (!targetLink) {
        const match = /var\s+url\s*=\s*['"]([^'"]*)['"]/i.exec(html1);
        targetLink = match ? match[1] : '';
      }
    }

    if (!targetLink) {
      // If no redirect link found, try using current URL directly
      targetLink = currentUrl;
    } else if (!targetLink.startsWith('http')) {
      targetLink = latestBase + (targetLink.startsWith('/') ? '' : '/') + targetLink;
    }

    const res2 = await customFetch(targetLink, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res2.ok) return sources;
    const html2 = await res2.text();

    const headerMatch = /<div class="card-header"[^>]*>([\s\S]*?)<\/div>/i.exec(html2);
    const headerText = headerMatch ? headerMatch[1].trim() : '';
    const quality: VideoQuality = parseVideoQuality(headerText);

    // Extract all anchor buttons
    const btnRegex = /<a[^>]+class=["'][^"']*btn[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = btnRegex.exec(html2)) !== null) {
      const link = match[1];
      const text = match[2];

      if (link.includes('pixeldra')) {
        const pxl = extractPxlUrl(html2) || link;
        const pxlId = pxl.split('/').pop()?.replace(/\?.*$/, '');
        if (pxlId) {
          sources.push({
            url: `https://pixeldrain.com/api/file/${pxlId}?download`,
            quality,
            format: 'mp4',
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
        }
      } else if (text.includes('FSL') || text.includes('Mega') || text.includes('Download File')) {
        sources.push({
          url: link,
          quality,
          format: link.includes('.m3u8') ? 'hls' : (link.includes('.mkv') ? 'mkv' : 'mp4'),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
      }
    }
  } catch {
    // Fail gracefully on network or parse errors
  }

  return sources;
}
