/**
 * VegaMovies Provider Extension for Streamix
 * Ported from CSX VegaMovies (com.megix.VegaMoviesProvider)
 * Original Author: megix / Saurabh Kaperwan
 * License: GNU General Public License v3.0 (GPLv3)
 */

import type {
  StreamixExtension,
  ExtensionContext,
  SearchOptions,
  SearchResultItem,
  DetailsOptions,
  MediaDetails,
  EpisodeItem,
  ResolveSourceRequest,
  ResolvedSourceResult,
  VideoSource
} from '../../../sdk/src/index.ts';
import {
  ItemNotFoundError,
  SourceUnavailableError,
  getProviderBaseUrl,
  fetchCinemetaMeta,
  extractImdbId,
  stripHtmlTags,
  extractHubCloudSources,
  extractGdflixSources,
  isVideoStreamUrl
} from '../../../sdk/src/index.ts';

interface VegaHit {
  document: {
    post_title?: string;
    permalink: string;
    post_thumbnail?: string;
  };
}

interface VegaApiResponse {
  hits?: VegaHit[];
}

export class VegaMoviesExtension implements StreamixExtension {
  private context?: ExtensionContext;
  private baseUrl = 'https://1vegamovies.pics';

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    try {
      this.baseUrl = await getProviderBaseUrl(
        'vegamovies',
        'https://1vegamovies.pics',
        this.context.fetch
      );
    } catch {
      this.baseUrl = 'https://1vegamovies.pics';
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    const page = options?.page || 1;
    const cleanQuery = encodeURIComponent(query.trim());
    const fetchFn = this.context?.fetch || fetch;

    // 1. Try search.php JSON endpoint first
    try {
      const jsonUrl = `${this.baseUrl}/search.php?q=${cleanQuery}&page=${page}`;
      const res = await fetchFn(jsonUrl, {
        signal: options?.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text) as VegaApiResponse;
          if (data.hits && Array.isArray(data.hits) && data.hits.length > 0) {
            const results: SearchResultItem[] = [];
            for (const hit of data.hits) {
              const doc = hit.document;
              if (!doc) continue;
              const rawTitle = doc.post_title || '';
              const cleanTitle = rawTitle.replace(/^Download\s+/i, '').trim();
              const permalink = doc.permalink.startsWith('http')
                ? doc.permalink
                : `${this.baseUrl}${doc.permalink.startsWith('/') ? '' : '/'}${doc.permalink}`;
              const isSeries = cleanTitle.toLowerCase().includes('series') || cleanTitle.toLowerCase().includes('season');

              results.push({
                id: permalink,
                title: cleanTitle,
                type: isSeries ? 'series' : 'movie',
                posterUrl: doc.post_thumbnail,
                languages: ['hi', 'en'],
                providerContext: { sourceUrl: permalink }
              });
            }
            return results;
          }
        }
      }
    } catch {
      // Fallback to HTML search
    }

    // 2. Fallback to HTML search `/?s=`
    try {
      const htmlUrl = `${this.baseUrl}/?s=${cleanQuery}`;
      const res = await fetchFn(htmlUrl, {
        signal: options?.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      if (res.ok) {
        const html = await res.text();
        const results: SearchResultItem[] = [];

        // Match card links
        const cardRegex = /<article[\s\S]*?<\/article>|<div[^>]+class=["'][^"']*blog-item[^"']*["'][\s\S]*?<\/div>/gi;
        let match: RegExpExecArray | null;

        while ((match = cardRegex.exec(html)) !== null) {
          const block = match[0];
          const aMatch = /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i.exec(block)
            || /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]+alt=["']([^"']*)["']/i.exec(block);
          if (!aMatch) continue;

          const rawHref = aMatch[1];
          const rawTitle = aMatch[2] || 'Unknown';
          const cleanTitle = rawTitle.replace(/^Download\s+/i, '').trim();

          const imgMatch = /<img[^>]+(?:data-src|src)=["']([^"']+)["']/i.exec(block);
          const posterUrl = imgMatch ? imgMatch[1] : undefined;
          const isSeries = cleanTitle.toLowerCase().includes('series') || cleanTitle.toLowerCase().includes('season');

          results.push({
            id: rawHref,
            title: cleanTitle,
            type: isSeries ? 'series' : 'movie',
            posterUrl,
            languages: ['hi', 'en'],
            providerContext: { sourceUrl: rawHref }
          });
        }
        return results;
      }
    } catch {
      // Return empty array
    }

    return [];
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<MediaDetails> {
    const res = await (this.context?.fetch || fetch)(id, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      throw new ItemNotFoundError(id, this.context?.manifest.id);
    }

    const html = await res.text();

    const titleMatch = /<title>([^<]+)<\/title>/i.exec(html);
    let title = titleMatch
      ? titleMatch[1].replace(/^Download\s+/i, '').replace(/\|\s*VegaMovies.*$/i, '').trim()
      : 'Unknown';

    const posterMatch = /<p[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i.exec(html)
      || /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html);
    let posterUrl = posterMatch ? posterMatch[1] : undefined;

    const isSeries = /season\s*\d+/i.test(title) ||
      html.toLowerCase().includes('series info') ||
      html.toLowerCase().includes('series-synopsis') ||
      id.includes('series');
    const contentType = isSeries ? 'series' : 'movie';

    const imdbId = extractImdbId(html);
    let cinemetaData: Partial<MediaDetails> | null = null;
    let description = '';

    if (imdbId) {
      cinemetaData = await fetchCinemetaMeta(contentType, imdbId, this.context?.fetch);
      if (cinemetaData) {
        if (cinemetaData.title) title = cinemetaData.title;
        if (cinemetaData.description) description = cinemetaData.description;
        if (cinemetaData.posterUrl) posterUrl = cinemetaData.posterUrl;
      }
    }

    const episodes: EpisodeItem[] = [];

    // Extract V-Cloud / HubCloud / download links
    const btnRegex = /<a[^>]+href=["']([^"']*(?:vcloud|hubcloud|gdflix|drive|download)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let btnMatch: RegExpExecArray | null;
    let epCount = 1;

    while ((btnMatch = btnRegex.exec(html)) !== null) {
      const link = btnMatch[1];
      const text = stripHtmlTags(btnMatch[2]);
      if (text.toLowerCase().includes('zip')) continue;

      const sMatch = /Season\s*(\d+)|S(\d+)/i.exec(text) || /Season\s*(\d+)/i.exec(title);
      const seasonNum = sMatch ? parseInt(sMatch[1] || sMatch[2], 10) : 1;

      episodes.push({
        id: link,
        seasonNumber: isNaN(seasonNum) ? 1 : seasonNum,
        episodeNumber: epCount,
        title: `Episode ${epCount} (${text || 'Stream'})`
      });
      epCount++;
    }

    return {
      id,
      title,
      type: contentType,
      description,
      posterUrl,
      bannerUrl: cinemetaData?.bannerUrl || posterUrl,
      releaseYear: cinemetaData?.releaseYear,
      genres: cinemetaData?.genres || ['Action', 'Drama'],
      episodes: episodes.length > 0 ? episodes : (cinemetaData?.episodes || undefined)
    };
  }

  async getEpisodes(id: string, seasonNumber?: number): Promise<EpisodeItem[]> {
    const details = await this.getDetails(id);
    const all = details.episodes || [];
    if (seasonNumber !== undefined) {
      return all.filter(e => e.seasonNumber === seasonNumber);
    }
    return all;
  }

  async resolveSources(request: ResolveSourceRequest): Promise<ResolvedSourceResult> {
    const targetUrl = request.episodeId || request.mediaId;
    if (!targetUrl) {
      throw new SourceUnavailableError("No URL specified in resolveSourceRequest", 'UNKNOWN', this.context?.manifest.id);
    }

    let sources: VideoSource[] = [];

    if (targetUrl.includes('vcloud') || targetUrl.includes('hubcloud')) {
      sources = await extractHubCloudSources(targetUrl, this.context?.fetch);
    } else if (targetUrl.includes('gdflix') || targetUrl.includes('gdlink')) {
      sources = await extractGdflixSources(targetUrl, this.context?.fetch);
    } else if (targetUrl.startsWith('http') && isVideoStreamUrl(targetUrl)) {
      sources.push({
        url: targetUrl,
        quality: '1080p',
        format: targetUrl.includes('.m3u8') ? 'hls' : 'mp4',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': this.baseUrl
        }
      });
    }

    if (sources.length === 0) {
      throw new SourceUnavailableError(
        `Unable to resolve streams from ${targetUrl}`,
        'STREAMS_EMPTY',
        this.context?.manifest.id
      );
    }

    return {
      sources,
      subtitles: [],
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': this.baseUrl
      }
    };
  }

  async dispose(): Promise<void> {
    this.context = undefined;
  }
}

export default function createExtension(): StreamixExtension {
  return new VegaMoviesExtension();
}
