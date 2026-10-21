import type { VideoQuality } from '../types.ts';

/**
 * Lightweight, zero-dependency HTML extraction utilities for provider parsing.
 */

export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function extractTagContent(html: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = regex.exec(html);
  return match ? match[1].trim() : null;
}

export function extractMetaContent(html: string, propertyOrName: string): string | null {
  const regex1 = new RegExp(`<meta\\s+[^>]*property=["']${propertyOrName}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match1 = regex1.exec(html);
  if (match1) return decodeHtmlEntities(match1[1]);

  const regex2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${propertyOrName}["']`, 'i');
  const match2 = regex2.exec(html);
  if (match2) return decodeHtmlEntities(match2[1]);

  const regex3 = new RegExp(`<meta\\s+[^>]*name=["']${propertyOrName}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match3 = regex3.exec(html);
  if (match3) return decodeHtmlEntities(match3[1]);

  return null;
}

export function extractAttribute(tagHtml: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
  const match = regex.exec(tagHtml);
  return match ? decodeHtmlEntities(match[1]) : null;
}

export function extractImdbId(text: string): string | null {
  if (!text) return null;
  const match = /tt\d{7,10}/i.exec(text);
  return match ? match[0] : null;
}

export function parseVideoQuality(text: string): VideoQuality {
  if (!text) return 'unknown';
  const clean = text.toLowerCase();
  if (clean.includes('2160p') || clean.includes('4k')) return '4k';
  if (clean.includes('1080p') || clean.includes('fhd')) return '1080p';
  if (clean.includes('720p') || clean.includes('hd')) return '720p';
  if (clean.includes('480p') || clean.includes('sd')) return '480p';
  if (clean.includes('360p')) return '360p';
  return 'unknown';
}

export function extractBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

export function isVideoStreamUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.toLowerCase().split('?')[0];
  if (
    clean.includes('/embed/') ||
    clean.includes('/video/') ||
    clean.endsWith('.html') ||
    clean.endsWith('.htm') ||
    clean.endsWith('.php')
  ) {
    return false;
  }
  return (
    clean.endsWith('.m3u8') ||
    clean.endsWith('.mp4') ||
    clean.endsWith('.mkv') ||
    clean.endsWith('.webm') ||
    url.includes('pixeldrain.com/api/file/')
  );
}
