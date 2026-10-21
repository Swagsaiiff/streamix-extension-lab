/**
 * Bollyflix Provider Extension for Streamix
 * Ported from CSX Bollyflix (com.megix.BollyflixProvider)
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
  extractAttribute,
  stripHtmlTags,
  extractGdflixSources,
  bypassSidexfee,
  isVideoStreamUrl
} from '../../../sdk/src/index.ts';

export class BollyflixExtension implements StreamixExtension {
  private context?: ExtensionContext;
  private baseUrl = 'https://bollyflix.co.za';

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    try {
      this.baseUrl = await getProviderBaseUrl(
        'bollyflix',
        'https://bollyflix.co.za',
        this.context.fetch
      );
    } catch {
      this.baseUrl = 'https://bollyflix.co.za';
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    const page = options?.page || 1;
    const cleanQuery = encodeURIComponent(query.trim());
    const searchUrl = `${this.baseUrl}/search/${cleanQuery}/page/${page}/`;

    const res = await (this.context?.fetch || fetch)(searchUrl, {
      signal: options?.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      return [];
    }

    const html = await res.text();
    const results: SearchResultItem[] = [];

    // Parse <article ...> blocks
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

    const titleMatch = /<title>([^<]+)<\/title>/i.exec(html);
    let title = titleMatch ? titleMatch[1].replace(/^Download\s+/i, '').replace(/\|\s*BollyFlix.*$/i, '').trim() : 'Unknown';

    const ogImg = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html);
    let posterUrl = ogImg ? ogImg[1] : undefined;

    const summaryMatch = /<span\s+id=["']summary["'][^>]*>([\s\S]*?)<\/span>/i.exec(html)
      || /<div\s+class=["']imdbwp__teaser["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
    let description = summaryMatch ? stripHtmlTags(summaryMatch[1]) : '';

    const isSeries = title.toLowerCase().includes('series') || title.toLowerCase().includes('season') || id.includes('web-series');
    const contentType = isSeries ? 'series' : 'movie';

    // Check for IMDb metadata
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
      // Find download buttons for episodes
      const btnRegex = /<a[^>]+class=["'][^"']*(?:maxbutton|dl|btnn)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let btnMatch: RegExpExecArray | null;
      let epIdx = 1;

      while ((btnMatch = btnRegex.exec(html)) !== null) {
        const href = btnMatch[1];
        const btnText = stripHtmlTags(btnMatch[2]);
        if (btnText.toLowerCase().includes('zip')) continue;

        const seasonMatch = /Season\s*(\d+)|S(\d+)/i.exec(btnText) || /Season\s*(\d+)/i.exec(html);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2], 10) : 1;

        episodes.push({
          id: href,
          seasonNumber: isNaN(seasonNum) ? 1 : seasonNum,
          episodeNumber: epIdx,
          title: `Episode ${epIdx} (${btnText})`
        });
        epIdx++;
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
    let targetUrl = request.episodeId || request.mediaId;
    if (!targetUrl) {
      throw new SourceUnavailableError("No URL specified in resolveSourceRequest", 'UNKNOWN', this.context?.manifest.id);
    }

    // Handle sidexfee bypass if present
    if (targetUrl.includes('id=')) {
      const idParam = targetUrl.substring(targetUrl.lastIndexOf('id=') + 3).split('&')[0];
      const bypassed = await bypassSidexfee(idParam, this.context?.fetch);
      if (bypassed) {
        targetUrl = bypassed;
      }
    }

    let sources: VideoSource[] = [];

    if (targetUrl.includes('gdflix') || targetUrl.includes('gdlink') || targetUrl.includes('fastdl')) {
      sources = await extractGdflixSources(targetUrl, this.context?.fetch);
    } else if (targetUrl.startsWith('http')) {
      // If direct or intermediate HTML page, try extracting
      sources = await extractGdflixSources(targetUrl, this.context?.fetch);
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
  return new BollyflixExtension();
}
