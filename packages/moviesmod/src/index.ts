/**
 * Moviesmod Provider Extension for Streamix
 * Ported from CSX Moviesmod (com.megix.MoviesmodProvider)
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
  decodeUrlParam,
  extractDriveleechSources,
  extractGdflixSources
} from '../../../sdk/src/index.ts';

export class MoviesmodExtension implements StreamixExtension {
  private context?: ExtensionContext;
  private baseUrl = 'https://moviesmod.uk.com';

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    try {
      this.baseUrl = await getProviderBaseUrl(
        'moviesmod',
        'https://moviesmod.uk.com',
        this.context.fetch
      );
    } catch {
      this.baseUrl = 'https://moviesmod.uk.com';
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    const page = options?.page || 1;
    const cleanQuery = encodeURIComponent(query.trim());
    const searchUrl = `${this.baseUrl}/search/${cleanQuery}/page/${page}`;

    const res = await (this.context?.fetch || fetch)(searchUrl, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResultItem[] = [];

    const articleRegex = /<article[\s\S]*?<\/article>/gi;
    let match: RegExpExecArray | null;

    while ((match = articleRegex.exec(html)) !== null) {
      const articleHtml = match[0];
      const linkMatch = /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']*)["']/i.exec(articleHtml)
        || /<a[^>]+title=["']([^"']*)["'][^>]*href=["']([^"']+)["']/i.exec(articleHtml);
      if (!linkMatch) continue;

      const rawHref = linkMatch[1].startsWith('http') ? linkMatch[1] : linkMatch[2];
      const rawTitle = linkMatch[1].startsWith('http') ? linkMatch[2] : linkMatch[1];
      const cleanTitle = rawTitle.replace(/^Download\s+/i, '').trim();

      const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(articleHtml);
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

    const titleMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html)
      || /<title>([^<]+)<\/title>/i.exec(html);
    let title = titleMatch
      ? titleMatch[1].replace(/^Download\s+/i, '').replace(/\|\s*Moviesmod.*$/i, '').trim()
      : 'Unknown';

    const ogImg = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html);
    let posterUrl = ogImg ? ogImg[1] : undefined;

    const teaserMatch = /<div[^>]+class=["']imdbwp__teaser["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
    let description = teaserMatch ? stripHtmlTags(teaserMatch[1]) : '';

    const isSeries = /season\s*\d+/i.test(title) ||
      html.includes('Season') ||
      id.includes('web-series');
    const contentType = isSeries ? 'series' : 'movie';

    const imdbId = extractImdbId(html);
    let cinemetaData: Partial<MediaDetails> | null = null;
    if (imdbId) {
      cinemetaData = await fetchCinemetaMeta(contentType, imdbId, this.context?.fetch);
      if (cinemetaData) {
        if (cinemetaData.title) title = cinemetaData.title;
        if (cinemetaData.description) description = cinemetaData.description;
        if (cinemetaData.posterUrl) posterUrl = cinemetaData.posterUrl;
      }
    }

    const episodes: EpisodeItem[] = [];

    if (isSeries) {
      const btnRegex = /<a[^>]+class=["'][^"']*(?:maxbutton-episode-links|maxbutton-g-drive|maxbutton-af-download|maxbutton)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let btnMatch: RegExpExecArray | null;
      let epIndex = 1;

      while ((btnMatch = btnRegex.exec(html)) !== null) {
        let rawLink = btnMatch[1];
        const text = stripHtmlTags(btnMatch[2]);
        if (text.toLowerCase().includes('zip')) continue;

        const decoded = decodeUrlParam(rawLink);
        if (decoded) rawLink = decoded;

        const sMatch = /Season\s*(\d+)|S(\d+)/i.exec(text) || /Season\s*(\d+)/i.exec(title);
        const seasonNum = sMatch ? parseInt(sMatch[1] || sMatch[2], 10) : 1;

        episodes.push({
          id: rawLink,
          seasonNumber: isNaN(seasonNum) ? 1 : seasonNum,
          episodeNumber: epIndex,
          title: `Episode ${epIndex} (${text})`
        });
        epIndex++;
      }
    }

    return {
      id,
      title,
      type: contentType,
      description,
      posterUrl,
      bannerUrl: cinemetaData?.bannerUrl || posterUrl,
      releaseYear: cinemetaData?.releaseYear,
      genres: cinemetaData?.genres || ['Action', 'Adventure'],
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

    let decodedUrl = decodeUrlParam(targetUrl) || targetUrl;
    let sources: VideoSource[] = [];

    if (decodedUrl.includes('driveleech') || decodedUrl.includes('driveseed')) {
      sources = await extractDriveleechSources(decodedUrl, this.context?.fetch);
    } else if (decodedUrl.includes('gdflix') || decodedUrl.includes('gdlink')) {
      sources = await extractGdflixSources(decodedUrl, this.context?.fetch);
    } else {
      // Try fetching intermediate page to find download buttons
      try {
        const res = await (this.context?.fetch || fetch)(decodedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (res.ok) {
          const html = await res.text();
          const btnMatch = /<a[^>]+class=["'][^"']*(?:maxbutton-1|maxbutton-5|btn)[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html);
          if (btnMatch) {
            const innerLink = btnMatch[1];
            if (innerLink.includes('driveleech') || innerLink.includes('driveseed')) {
              sources = await extractDriveleechSources(innerLink, this.context?.fetch);
            } else if (innerLink.includes('gdflix')) {
              sources = await extractGdflixSources(innerLink, this.context?.fetch);
            }
          }
        }
      } catch {
        // Fallback
      }

      if (sources.length === 0 && decodedUrl.startsWith('http')) {
        sources.push({
          url: decodedUrl,
          quality: '1080p',
          format: decodedUrl.includes('.m3u8') ? 'hls' : 'mp4',
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
  return new MoviesmodExtension();
}
