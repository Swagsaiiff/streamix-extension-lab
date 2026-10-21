/**
 * Core type definitions for the Streamix Extension SDK.
 * All models are normalized, strongly-typed, and independent of React/Electron UI layers.
 */

export type ContentType = 'movie' | 'series' | 'anime' | 'live';

export type VideoQuality = '360p' | '480p' | '720p' | '1080p' | '4k' | 'auto' | 'unknown';

export type VideoFormat = 'hls' | 'mp4' | 'mkv' | 'dash';

export type SubtitleFormat = 'vtt' | 'srt' | 'ass';

export type ExtensionPermission = 'network:fetch' | 'storage:local';

export interface ExtensionAuthorObject {
  name: string;
  url?: string;
  email?: string;
}

export type ExtensionAuthor = string | ExtensionAuthorObject;

export interface ExtensionManifest {
  id: string;
  displayName: string;
  version: string;
  description: string;
  author: ExtensionAuthor;
  streamixApiVersion: string;
  entrypoint: string;
  contentTypes: ContentType[];
  languages: string[];
  permissions: ExtensionPermission[];
  icon?: string;
  repositoryUrl?: string;
  issuesUrl?: string;
  homepageUrl?: string;
}

export interface SearchOptions {
  signal?: AbortSignal;
  page?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResultItem {
  id: string;
  title: string;
  type: ContentType;
  posterUrl?: string;
  releaseYear?: number;
  languages?: string[];
  providerContext?: Record<string, unknown>;
}

export interface DetailsOptions {
  signal?: AbortSignal;
}

export interface SeasonItem {
  seasonNumber: number;
  name?: string;
  episodeCount?: number;
}

export interface EpisodeItem {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: string;
  description?: string;
  thumbnail?: string;
  releaseDate?: string;
}

export interface MediaDetails {
  id: string;
  title: string;
  type: ContentType;
  description?: string;
  posterUrl?: string;
  bannerUrl?: string;
  releaseYear?: number;
  genres?: string[];
  status?: 'ongoing' | 'completed' | 'released';
  seasons?: SeasonItem[];
  episodes?: EpisodeItem[];
}

export interface ResolveSourceRequest {
  mediaId: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
  year?: number;
  signal?: AbortSignal;
}

export interface AudioTrackItem {
  language: string;
  label?: string;
  isDefault?: boolean;
}

export interface VideoSource {
  url: string;
  quality: VideoQuality;
  format: VideoFormat;
  isLive?: boolean;
  headers?: Record<string, string>;
  audioTracks?: AudioTrackItem[];
}

export interface SubtitleItem {
  language: string;
  url: string;
  format: SubtitleFormat;
  label?: string;
}

export interface ResolvedSourceResult {
  sources: VideoSource[];
  subtitles: SubtitleItem[];
  headers?: Record<string, string>;
}

export interface ExtensionLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface ExtensionStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExtensionContext {
  manifest: Readonly<ExtensionManifest>;
  logger: ExtensionLogger;
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  storage: ExtensionStorage;
  signal: AbortSignal;
}

export interface StreamixExtension {
  initialize(context: ExtensionContext): Promise<void> | void;
  search(query: string, options?: SearchOptions): Promise<SearchResultItem[]>;
  getDetails(id: string, options?: DetailsOptions): Promise<MediaDetails>;
  getEpisodes?(id: string, seasonNumber?: number): Promise<EpisodeItem[]>;
  resolveSources(request: ResolveSourceRequest): Promise<ResolvedSourceResult>;
  dispose?(): Promise<void> | void;
}

export interface RepositoryMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  manifestVersion: number;
  homepageUrl?: string;
}

export interface ExtensionIndexEntry {
  id: string;
  displayName: string;
  version: string;
  streamixApiVersion: string;
  description: string;
  author: ExtensionAuthor;
  contentTypes: ContentType[];
  languages: string[];
  packageUrl: string;
  packageSha256: string;
  packageSizeBytes: number;
  permissions: ExtensionPermission[];
  icon?: string;
  releaseDate: string;
  changelog?: string;
}

export interface RepositoryIndex {
  repository: RepositoryMetadata;
  updatedAt: string;
  extensions: ExtensionIndexEntry[];
}
