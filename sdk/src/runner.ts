import type {
  StreamixExtension,
  ExtensionManifest,
  SearchResultItem,
  MediaDetails,
  EpisodeItem,
  ResolveSourceRequest,
  ResolvedSourceResult,
  SearchOptions,
  DetailsOptions
} from './types.ts';
import {
  assertValidManifest,
  assertApiCompatibility,
  validateSearchResultItem,
  validateMediaDetails,
  validateResolvedSourceResult
} from './validator.ts';
import { createExtensionContext, type CreateContextOptions } from './context.ts';
import { ExtensionTimeoutError, ExtensionError } from './errors.ts';

export interface RunnerOptions {
  manifest: ExtensionManifest;
  extension: StreamixExtension;
  defaultTimeoutMs?: number;
  hostApiVersion?: string;
  contextOptions?: Partial<CreateContextOptions>;
}

export class ExtensionRunner {
  public readonly manifest: ExtensionManifest;
  private readonly extension: StreamixExtension;
  private readonly defaultTimeoutMs: number;
  private isInitialized = false;

  constructor(options: RunnerOptions) {
    assertValidManifest(options.manifest);
    assertApiCompatibility(options.manifest, options.hostApiVersion);

    this.manifest = options.manifest;
    this.extension = options.extension;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
  }

  private async withTimeout<T>(
    operationName: string,
    action: (signal: AbortSignal) => Promise<T>,
    customTimeoutMs?: number,
    externalSignal?: AbortSignal
  ): Promise<T> {
    const timeoutMs = customTimeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
      }
    }

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new ExtensionTimeoutError(operationName, timeoutMs, this.manifest.id));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([action(controller.signal), timeoutPromise]);
      return result;
    } catch (err: unknown) {
      if (err instanceof ExtensionError) throw err;
      if (err instanceof Error) {
        throw new ExtensionError(err.message, 'OPERATION_FAILED', this.manifest.id);
      }
      throw new ExtensionError(String(err), 'OPERATION_FAILED', this.manifest.id);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async initialize(contextOverrides?: Partial<CreateContextOptions>): Promise<void> {
    const context = createExtensionContext({
      manifest: this.manifest,
      ...contextOverrides
    });

    await this.withTimeout('initialize', async () => {
      await this.extension.initialize(context);
      this.isInitialized = true;
    });
  }

  async search(query: string, options?: SearchOptions, timeoutMs?: number): Promise<SearchResultItem[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const raw = await this.withTimeout(
      'search',
      async (signal) => {
        return this.extension.search(query, { ...options, signal });
      },
      timeoutMs,
      options?.signal
    );

    if (!Array.isArray(raw)) {
      throw new ExtensionError("Provider search() must return an array", 'MALFORMED_RESPONSE', this.manifest.id);
    }

    return raw.map((item, idx) => validateSearchResultItem(item, idx));
  }

  async getDetails(id: string, options?: DetailsOptions, timeoutMs?: number): Promise<MediaDetails> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const raw = await this.withTimeout(
      'getDetails',
      async (signal) => {
        return this.extension.getDetails(id, { ...options, signal });
      },
      timeoutMs,
      options?.signal
    );

    return validateMediaDetails(raw);
  }

  async getEpisodes(id: string, seasonNumber?: number, timeoutMs?: number): Promise<EpisodeItem[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.extension.getEpisodes) {
      // If getEpisodes is not implemented by the extension, fallback to details.episodes
      const details = await this.getDetails(id, undefined, timeoutMs);
      const allEpisodes = details.episodes || [];
      if (seasonNumber !== undefined) {
        return allEpisodes.filter(e => e.seasonNumber === seasonNumber);
      }
      return allEpisodes;
    }

    const raw = await this.withTimeout(
      'getEpisodes',
      async () => {
        return this.extension.getEpisodes!(id, seasonNumber);
      },
      timeoutMs
    );

    if (!Array.isArray(raw)) {
      throw new ExtensionError("Provider getEpisodes() must return an array", 'MALFORMED_RESPONSE', this.manifest.id);
    }

    return raw;
  }

  async resolveSources(request: ResolveSourceRequest, timeoutMs?: number): Promise<ResolvedSourceResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const raw = await this.withTimeout(
      'resolveSources',
      async (signal) => {
        return this.extension.resolveSources({ ...request, signal });
      },
      timeoutMs,
      request.signal
    );

    return validateResolvedSourceResult(raw);
  }

  async dispose(): Promise<void> {
    if (this.extension.dispose) {
      try {
        await this.withTimeout('dispose', async () => {
          await this.extension.dispose!();
        }, 5_000);
      } catch (err) {
        console.warn(`[Runner] Error during dispose for ${this.manifest.id}:`, err);
      }
    }
    this.isInitialized = false;
  }
}
