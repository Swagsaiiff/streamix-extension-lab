import type { MediaDetails, EpisodeItem, SearchResultItem, ContentType } from '../types.ts';

export interface CinemetaVideo {
  id: string;
  name?: string;
  title?: string;
  season: number;
  number: number;
  episode?: number;
  thumbnail?: string;
  overview?: string;
  description?: string;
  released?: string;
}

export interface CinemetaMeta {
  id: string;
  name: string;
  type: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: string | number;
  imdbRating?: string;
  genres?: string[];
  genre?: string[];
  cast?: string[];
  videos?: CinemetaVideo[];
}

export interface CinemetaResponse {
  meta?: CinemetaMeta;
}

export interface CinemetaCatalogResponse {
  metas?: CinemetaMeta[];
}

export const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io';

export async function fetchCinemetaMeta(
  type: 'movie' | 'series',
  imdbId: string,
  customFetch: typeof fetch = fetch
): Promise<Partial<MediaDetails> | null> {
  if (!imdbId) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `${CINEMETA_BASE_URL}/meta/${type}/${imdbId}.json`;
    const res = await customFetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json() as CinemetaResponse;
    const meta = data.meta;
    if (!meta) return null;

    const episodes: EpisodeItem[] = [];
    if (meta.videos && Array.isArray(meta.videos)) {
      for (const v of meta.videos) {
        const epNum = v.number ?? v.episode ?? 1;
        episodes.push({
          id: v.id || `${imdbId}:${v.season}:${epNum}`,
          seasonNumber: v.season,
          episodeNumber: epNum,
          title: v.name || v.title || `Episode ${epNum}`,
          description: v.overview || v.description,
          thumbnail: v.thumbnail,
          releaseDate: v.released
        });
      }
    }

    const yearNum = typeof meta.year === 'number'
      ? meta.year
      : meta.year ? parseInt(String(meta.year), 10) : undefined;

    return {
      title: meta.name,
      description: meta.description,
      posterUrl: meta.poster,
      bannerUrl: meta.background,
      releaseYear: isNaN(yearNum as number) ? undefined : yearNum,
      genres: meta.genres || meta.genre || [],
      episodes: episodes.length > 0 ? episodes : undefined
    };
  } catch {
    return null;
  }
}

export async function searchCinemeta(
  query: string,
  type: 'movie' | 'series' = 'movie',
  customFetch: typeof fetch = fetch
): Promise<SearchResultItem[]> {
  if (!query || !query.trim()) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const encoded = encodeURIComponent(query.trim());
    const url = `${CINEMETA_BASE_URL}/catalog/${type}/top/search=${encoded}.json`;
    const res = await customFetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json() as CinemetaCatalogResponse;
    if (!data.metas || !Array.isArray(data.metas)) return [];

    return data.metas.map((m): SearchResultItem => {
      const year = m.year ? parseInt(String(m.year), 10) : undefined;
      return {
        id: m.id,
        title: m.name,
        type: (m.type === 'series' ? 'series' : 'movie') as ContentType,
        posterUrl: m.poster,
        releaseYear: isNaN(year as number) ? undefined : year,
        languages: ['en'],
        providerContext: {
          imdbId: m.id,
          rating: m.imdbRating
        }
      };
    });
  } catch {
    return [];
  }
}
