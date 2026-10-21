/**
 * MoviesDrive Provider Extension for Streamix
 * Ported from CSX MoviesDrive (com.megix.MoviesDriveProvider)
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

interface SearchHit {
  document: {
    id?: string;
    postTitle?: string;
    post_title?: string;
    permalink: string;
    postThumbnail?: string;
    post_thumbnail?: string;
    imdb_id?: string;
  };
}

interface SearchApiResponse {
  hits?: SearchHit[];
}

export class MoviesDriveExtension implements StreamixExtension {
  private context?: ExtensionContext;
  private baseUrl = 'https://new3.moviesdrive.beer';

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    try {
      this.baseUrl = await getProviderBaseUrl(
        'moviesdrive',
        'https://new3.moviesdrive.beer',
        this.context.fetch
      );
    } catch {
      this.baseUrl = 'https://new3.moviesdrive.beer';
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    const page = options?.page || 1;
    const cleanQuery = encodeURIComponent(query.trim());
    const searchUrl = `${this.baseUrl}/search.php?q=${cleanQuery}&page=${page}`;

    const res = await (this.context?.fetch || fetch)(searchUrl, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return [];

    const text = await res.text();
    let data: SearchApiResponse;
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }

    if (!data.hits || !Array.isArray(data.hits)) return [];

    const results: SearchResultItem[] = [];

    for (const hit of data.hits) {
      const doc = hit.document;
      if (!doc) continue;

      const titleRaw = doc.postTitle || doc.post_title || '';
      const cleanTitle = titleRaw.replace(/^Download\s+/i, '').trim();
      const permalink = doc.permalink.startsWith('http')
        ? doc.permalink
        : `${this.baseUrl}${doc.permalink.startsWith('/') ? '' : '/'}${doc.permalink}`;

      const isSeries = cleanTitle.toLowerCase().includes('series') ||
        cleanTitle.toLowerCase().includes('season') ||
        cleanTitle.toLowerCase().includes('episode');

      results.push({
        id: permalink,
        title: cleanTitle,
        type: isSeries ? 'series' : 'movie',
        posterUrl: doc.postThumbnail || doc.post_thumbnail,
        languages: ['hi', 'en'],
        providerContext: {
          imdbId: doc.imdb_id,
          sourceUrl: permalink
        }
      });
    }

    return results;
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
      ? titleMatch[1].replace(/^Download\s+/i, '').replace(/\|\s*MoviesDrive.*$/i, '').trim()
      : 'Unknown';

    const posterMatch = /<main[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i.exec(html)
      || /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html);
    let posterUrl = posterMatch ? posterMatch[1] : undefined;

    const isSeries = /season\s*\d+/i.test(title) ||
      title.toLowerCase().includes('series') ||
      title.toLowerCase().includes('episode');
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

    // Extract download / episode links
    const btnRegex = /<h5[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
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
        title: `Episode ${epCount} (${text})`
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
      genres: cinemetaData?.genres || ['Action', 'Thriller'],
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

    // If targetUrl is an intermediate page or HubCloud/GDFlix link
    if (targetUrl.includes('hubcloud') || targetUrl.includes('vcloud')) {
      sources = await extractHubCloudSources(targetUrl, this.context?.fetch);
    } else if (targetUrl.includes('gdflix') || targetUrl.includes('gdlink')) {
      sources = await extractGdflixSources(targetUrl, this.context?.fetch);
    } else {
      // First fetch page to find HubCloud or GDFlix links
      try {
        const res = await (this.context?.fetch || fetch)(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (res.ok) {
          const html = await res.text();
          const linkRegex = /<a[^>]+href=["']([^"']*(?:hubcloud|vcloud|gdflix|gdlink)[^"']*)["']/gi;
          let m: RegExpExecArray | null;
          while ((m = linkRegex.exec(html)) !== null) {
            const innerLink = m[1];
            if (innerLink.includes('hubcloud') || innerLink.includes('vcloud')) {
              const extracted = await extractHubCloudSources(innerLink, this.context?.fetch);
              sources.push(...extracted);
            } else if (innerLink.includes('gdflix') || innerLink.includes('gdlink')) {
              const extracted = await extractGdflixSources(innerLink, this.context?.fetch);
              sources.push(...extracted);
            }
          }
        }
      } catch {
        // Continue fallback
      }

      if (sources.length === 0 && isVideoStreamUrl(targetUrl)) {
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
  return new MoviesDriveExtension();
}
