import type {
  StreamixExtension,
  ExtensionContext,
  SearchOptions,
  SearchResultItem,
  DetailsOptions,
  MediaDetails,
  EpisodeItem,
  ResolveSourceRequest,
  ResolvedSourceResult
} from '../../../sdk/src/index.ts';
import {
  ItemNotFoundError,
  SourceUnavailableError
} from '../../../sdk/src/index.ts';
import { SAMPLE_FIXTURES } from './fixtures.ts';

export class SampleProviderExtension implements StreamixExtension {
  private context?: ExtensionContext;

  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    this.context.logger.info(`Initializing ${context.manifest.displayName} (v${context.manifest.version})`);

    // Verify storage capability if permitted
    try {
      await this.context.storage.set('initializedAt', new Date().toISOString());
    } catch {
      // Storage might not be configured in some test environments
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) {
      return [];
    }

    if (options?.signal?.aborted) {
      throw new Error('Search operation aborted');
    }

    const clean = query.trim().toLowerCase();
    const results: SearchResultItem[] = [];

    for (const fixture of Object.values(SAMPLE_FIXTURES)) {
      if (fixture.searchItem.title.toLowerCase().includes(clean)) {
        results.push(fixture.searchItem);
      }
    }

    return results;
  }

  async getDetails(id: string, options?: DetailsOptions): Promise<MediaDetails> {
    if (options?.signal?.aborted) {
      throw new Error('Details operation aborted');
    }

    const fixture = SAMPLE_FIXTURES[id];
    if (!fixture) {
      throw new ItemNotFoundError(id, this.context?.manifest.id);
    }

    return fixture.details;
  }

  async getEpisodes(id: string, seasonNumber?: number): Promise<EpisodeItem[]> {
    const fixture = SAMPLE_FIXTURES[id];
    if (!fixture) {
      throw new ItemNotFoundError(id, this.context?.manifest.id);
    }

    const episodes = fixture.details.episodes || [];
    if (seasonNumber !== undefined) {
      return episodes.filter(ep => ep.seasonNumber === seasonNumber);
    }
    return episodes;
  }

  async resolveSources(request: ResolveSourceRequest): Promise<ResolvedSourceResult> {
    if (request.signal?.aborted) {
      throw new Error('Resolve sources operation aborted');
    }

    const fixture = SAMPLE_FIXTURES[request.mediaId];
    if (!fixture) {
      throw new ItemNotFoundError(request.mediaId, this.context?.manifest.id);
    }

    const sourceKey = request.episodeId || 'default';
    const sourceResult = fixture.sources[sourceKey];

    if (!sourceResult || !sourceResult.sources || sourceResult.sources.length === 0) {
      throw new SourceUnavailableError(
        `No video sources available for item '${request.mediaId}' (key: '${sourceKey}')`,
        'STREAMS_EMPTY',
        this.context?.manifest.id
      );
    }

    return sourceResult;
  }

  async dispose(): Promise<void> {
    this.context?.logger.info('Disposing SampleProviderExtension');
    this.context = undefined;
  }
}

// Default export for dynamic loading
export default function createExtension(): StreamixExtension {
  return new SampleProviderExtension();
}
