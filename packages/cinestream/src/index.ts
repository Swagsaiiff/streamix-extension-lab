/**
 * CineStream Provider Extension for Streamix
 * Ported from CSX CineStream (com.megix.CineStreamProvider)
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
  VideoSource,
  SubtitleItem,
  ContentType
} from '../../../sdk/src/index.ts';
import {
  ItemNotFoundError,
  SourceUnavailableError,
  searchCinemeta,
  fetchCinemetaMeta,
  extractImdbId,
  CINEMETA_BASE_URL
} from '../../../sdk/src/index.ts';

export class CineStreamExtension implements StreamixExtension {
  private context?: ExtensionContext;

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    const fetchFn = this.context?.fetch || fetch;

    try {
      const [movieResults, seriesResults] = await Promise.all([
        searchCinemeta(query, 'movie', fetchFn),
        searchCinemeta(query, 'series', fetchFn)
      ]);

      const combined: SearchResultItem[] = [];
      const maxLength = Math.max(movieResults.length, seriesResults.length);

      for (let i = 0; i < maxLength; i++) {
        if (i < movieResults.length) combined.push(movieResults[i]);
        if (i < seriesResults.length) combined.push(seriesResults[i]);
      }

      return combined;
    } catch {
      return [];
    }
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<MediaDetails> {
    const fetchFn = this.context?.fetch || fetch;
    const imdbId = extractImdbId(id) || id;

    // Check if type is specified (e.g. "series:tt12345" or "movie:tt12345")
    let targetType: 'movie' | 'series' = id.startsWith('series') ? 'series' : 'movie';

    let meta = await fetchCinemetaMeta(targetType, imdbId, fetchFn);
    if (!meta && targetType === 'movie') {
      // Try series if movie failed
      meta = await fetchCinemetaMeta('series', imdbId, fetchFn);
      if (meta) targetType = 'series';
    }

    if (!meta || !meta.title) {
      throw new ItemNotFoundError(id, this.context?.manifest.id);
    }

    return {
      id: `${targetType}:${imdbId}`,
      title: meta.title,
      type: targetType as ContentType,
      description: meta.description,
      posterUrl: meta.posterUrl,
      bannerUrl: meta.bannerUrl,
      releaseYear: meta.releaseYear,
      genres: meta.genres || ['Action', 'Drama'],
      episodes: meta.episodes
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
    const fetchFn = this.context?.fetch || fetch;
    const rawId = request.mediaId;
    const imdbId = extractImdbId(rawId) || rawId.replace(/^(?:movie|series):/, '');
    const isSeries = rawId.startsWith('series') || request.seasonNumber !== undefined;
    const season = request.seasonNumber || 1;
    const episode = request.episodeNumber || 1;

    const sources: VideoSource[] = [];
    const subtitles: SubtitleItem[] = [];

    // Query stream endpoints for playable video sources
    const streamEndpoints: string[] = [];

    if (isSeries) {
      streamEndpoints.push(
        `https://vidsrc.to/embed/tv/${imdbId}/${season}/${episode}`,
        `https://vidsrc.me/embed/tv?imdb=${imdbId}&season=${season}&episode=${episode}`
      );
    } else {
      streamEndpoints.push(
        `https://vidsrc.to/embed/movie/${imdbId}`,
        `https://vidsrc.me/embed/movie?imdb=${imdbId}`
      );
    }

    for (const endpoint of streamEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetchFn(endpoint, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://v3-cinemeta.strem.io'
          }
        });
        clearTimeout(timeout);

        if (res.ok) {
          const html = await res.text();
          // Extract direct video stream URLs only (m3u8 playlists or direct mp4/mkv files)
          const fileMatch = /file:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i.exec(html)
            || /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/i.exec(html);

          if (fileMatch) {
            const streamUrl = fileMatch[1] || fileMatch[0];
            sources.push({
              url: streamUrl,
              quality: '1080p',
              format: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': endpoint
              }
            });
            break;
          }
        }
      } catch {
        // Continue to next endpoint
      }
    }

    // Do NOT return unverified embed URLs as direct streams.
    // If no direct video streams were extracted, report honest availability error.
    if (sources.length === 0) {
      throw new SourceUnavailableError(
        `No direct playable video streams could be resolved for item '${rawId}' (IMDb: '${imdbId}')`,
        'STREAMS_EMPTY',
        this.context?.manifest.id
      );
    }

    return {
      sources,
      subtitles,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
  }

  async dispose(): Promise<void> {
    this.context = undefined;
  }
}

export default function createExtension(): StreamixExtension {
  return new CineStreamExtension();
}
