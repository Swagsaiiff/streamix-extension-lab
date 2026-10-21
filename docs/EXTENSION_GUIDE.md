# Streamix Extension Authoring Guide

This guide explains how to develop a new provider extension for the Streamix ecosystem.

---

## 1. Extension Anatomy

A Streamix extension is a self-contained module with a clear structure:

```text
my-provider/
├── manifest.json         # Extension metadata, permissions & entrypoint
├── package.json          # Node/npm development metadata
├── tsconfig.json         # TypeScript compiler configuration
├── src/
│   ├── index.ts          # Extension entrypoint implementing StreamixExtension
│   └── parser.ts         # Scraper or API parsing logic
└── tests/
    └── provider.test.ts  # Automated unit tests
```

---

## 2. Manifest Specification

Create `manifest.json` at the root of your extension:

```json
{
  "id": "org.streamix.provider.myprovider",
  "displayName": "My Custom Provider",
  "version": "1.0.0",
  "description": "Provides movie and series media streams from MyProvider API.",
  "author": {
    "name": "Jane Developer",
    "url": "https://github.com/janedev"
  },
  "streamixApiVersion": "^1.0.0",
  "entrypoint": "src/index.ts",
  "contentTypes": ["movie", "series"],
  "languages": ["en"],
  "permissions": [
    "network:fetch",
    "storage:local"
  ],
  "icon": "assets/icon.png",
  "homepageUrl": "https://example.com"
}
```

### Manifest Rules
- `id`: Must be lower-case reverse-DNS (letters, numbers, dots, dashes).
- `streamixApiVersion`: Use `^1.0.0` to indicate compatibility with Streamix SDK v1.x.
- `permissions`: Declare only what you use. If your extension calls `context.fetch()` without declaring `"network:fetch"`, the SDK will reject the call with a `PermissionDeniedError`.

---

## 3. Implementing the Extension Interface

Your extension entrypoint must implement `StreamixExtension`:

```typescript
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
} from '../../sdk/src/types.ts';
import {
  ItemNotFoundError,
  SourceUnavailableError
} from '../../sdk/src/errors.ts';

export class MyProviderExtension implements StreamixExtension {
  private context?: ExtensionContext;

  /**
   * Called once when the extension is loaded.
   */
  async initialize(context: ExtensionContext): Promise<void> {
    this.context = context;
    this.context.logger.info(`Initialized ${context.manifest.displayName}`);
  }

  /**
   * Searches for titles matching the query.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResultItem[]> {
    if (!query || !query.trim()) return [];

    // Use context.fetch to make network requests (carries timeouts and permissions)
    const response = await this.context!.fetch(
      `https://api.myprovider.test/search?q=${encodeURIComponent(query)}`,
      { signal: options?.signal }
    );
    const data = await response.json();

    return data.items.map((item: any) => ({
      id: String(item.id),
      title: String(item.title),
      type: item.isSeries ? 'series' : 'movie',
      releaseYear: item.year ? Number(item.year) : undefined,
      posterUrl: item.poster || undefined
    }));
  }

  /**
   * Retrieves full details, synopsis, genres, and season/episode hierarchy.
   */
  async getDetails(id: string, options?: DetailsOptions): Promise<MediaDetails> {
    const response = await this.context!.fetch(`https://api.myprovider.test/title/${id}`, {
      signal: options?.signal
    });

    if (response.status === 404) {
      throw new ItemNotFoundError(id, this.context?.manifest.id);
    }

    const data = await response.json();

    return {
      id: String(data.id),
      title: String(data.title),
      type: data.isSeries ? 'series' : 'movie',
      description: data.synopsis,
      posterUrl: data.poster,
      releaseYear: data.year,
      genres: data.genres,
      status: data.isCompleted ? 'completed' : 'ongoing',
      seasons: data.seasons?.map((s: any) => ({
        seasonNumber: s.number,
        name: s.title,
        episodeCount: s.episodes?.length
      })),
      episodes: data.episodes?.map((e: any) => ({
        id: String(e.id),
        seasonNumber: e.season,
        episodeNumber: e.episode,
        title: e.title,
        description: e.overview
      }))
    };
  }

  /**
   * Optional helper to fetch episodes for a specific season.
   */
  async getEpisodes(id: string, seasonNumber?: number): Promise<EpisodeItem[]> {
    const details = await this.getDetails(id);
    const eps = details.episodes || [];
    return seasonNumber !== undefined ? eps.filter(e => e.seasonNumber === seasonNumber) : eps;
  }

  /**
   * Resolves playable video sources (HLS, MP4) and subtitles.
   */
  async resolveSources(request: ResolveSourceRequest): Promise<ResolvedSourceResult> {
    const endpoint = request.episodeId
      ? `https://api.myprovider.test/streams/${request.mediaId}/${request.episodeId}`
      : `https://api.myprovider.test/streams/${request.mediaId}`;

    const res = await this.context!.fetch(endpoint, { signal: request.signal });
    const data = await res.json();

    if (!data.streams || data.streams.length === 0) {
      throw new SourceUnavailableError(
        `No video sources found for ${request.mediaId}`,
        'NO_STREAMS',
        this.context?.manifest.id
      );
    }

    return {
      sources: data.streams.map((s: any) => ({
        url: s.url,
        quality: s.quality || '1080p',
        format: s.format || 'hls',
        headers: s.headers
      })),
      subtitles: (data.subtitles || []).map((sub: any) => ({
        url: sub.url,
        language: sub.lang,
        label: sub.label,
        format: sub.format || 'vtt'
      }))
    };
  }

  /**
   * Called when the extension is unloaded or reloaded.
   */
  async dispose(): Promise<void> {
    this.context?.logger.info('Cleaned up resources');
    this.context = undefined;
  }
}

// Export default factory function
export default function createExtension(): StreamixExtension {
  return new MyProviderExtension();
}
```

---

## 4. Local Testing with the Harness

You do not need to start the main Streamix Desktop app to test your extension.

From the `streamix-extension-lab/` directory, run:

```bash
node --experimental-strip-types tools/harness.ts --ext examples/my-provider --query "Inception"
```

The harness runs your extension in a realistic environment and verifies:
- Validation of returned data models.
- Handling of timeouts.
- Proper throwing of `ItemNotFoundError` on unknown IDs.
- Proper throwing of `SourceUnavailableError` when streams are missing.

---

## 5. Packaging Your Extension

When ready to publish or test distribution:

```bash
node --experimental-strip-types tools/packager.ts examples/my-provider packages
```

This creates `packages/org.streamix.provider.myprovider-1.0.0.streamix-ext` and prints its SHA-256 hash.

---

## 6. Porting Providers from Upstream Ecosystems

When porting a provider into native Streamix TypeScript extensions:
1. **Inspect the Upstream Source**: Read the actual provider logic (e.g. from CSX or scraper repositories) to understand genuine base URLs, search endpoints, and stream extractors.
2. **Reimplement in Native TypeScript**: Use Streamix SDK helpers (`fetch`, `extractHubCloudSources`, `extractGdflixSources`, `isVideoStreamUrl`, etc.). Never depend on Android runtimes, Gradle plugins, or CloudStream Java/Kotlin classes.
3. **Replicate Headers Exactly**: Upstream providers frequently depend on exact `User-Agent`, `Referer`, and `Origin` headers. Ensure your `resolveSources()` implementation attaches required headers to `VideoSource.headers`.
4. **Direct Video Streams Only**: Only return verified direct stream URLs (`.m3u8`, `.mp4`). Never treat embed URLs, intermediate redirectors, or HTML pages as direct video streams. Throw `SourceUnavailableError` if no direct streams can be resolved.
5. **Multi-Audio and Subtitles**: If the provider returns multiple audio tracks or subtitles, map them honestly to `audioTracks` and `subtitles`. Do not drop them or fabricate non-existent tracks.
