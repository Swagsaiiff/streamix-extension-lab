import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExtensionRunner, assertValidManifest } from '../../../sdk/src/index.ts';
import createExtension from '../src/index.ts';

const SAMPLE_SEARCH_CATALOG_JSON = JSON.stringify({
  metas: [
    {
      id: 'tt1375666',
      name: 'Inception',
      type: 'movie',
      year: '2010',
      poster: 'https://img.example.com/inception.jpg',
      imdbRating: '8.8'
    }
  ]
});

const SAMPLE_META_JSON = JSON.stringify({
  meta: {
    id: 'tt0903747',
    name: 'Breaking Bad',
    type: 'series',
    year: '2008',
    imdbRating: '9.5',
    poster: 'https://img.example.com/bb.jpg',
    background: 'https://img.example.com/bb-bg.jpg',
    description: 'A chemistry teacher diagnosed with lung cancer turns to manufacturing meth.',
    genres: ['Crime', 'Drama', 'Thriller'],
    videos: [
      {
        id: 'tt0903747:1:1',
        season: 1,
        number: 1,
        name: 'Pilot',
        overview: 'Walter White begins his secret transformation.',
        thumbnail: 'https://img.example.com/pilot.jpg'
      },
      {
        id: 'tt0903747:1:2',
        season: 1,
        number: 2,
        name: "Cat's in the Bag...",
        overview: 'Walt and Jesse attempt to dispose of two bodies.',
        thumbnail: 'https://img.example.com/e2.jpg'
      }
    ]
  }
});

describe('CineStream Extension - Unit & Fixture Tests', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/cinestream/manifest.json'), 'utf-8')
  );

  it('has a valid manifest conforming to Streamix SDK requirements', () => {
    assert.doesNotThrow(() => assertValidManifest(manifest));
    assert.equal(manifest.id, 'org.streamix.provider.cinestream');
    assert.equal(manifest.displayName, 'CineStream');
  });

  it('searches movies and series across Cinemeta catalogs', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('/catalog/')) {
            return new Response(SAMPLE_SEARCH_CATALOG_JSON, {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const results = await runner.search('inception');

    assert.ok(results.length > 0);
    assert.equal(results[0].title, 'Inception');
    assert.equal(results[0].id, 'tt1375666');
    assert.equal(results[0].releaseYear, 2010);
  });

  it('retrieves series details and parses seasons and episodes', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('/meta/')) {
            return new Response(SAMPLE_META_JSON, {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const details = await runner.getDetails('series:tt0903747');

    assert.equal(details.title, 'Breaking Bad');
    assert.equal(details.releaseYear, 2008);
    assert.ok(details.episodes && details.episodes.length === 2);
    assert.equal(details.episodes[0].title, 'Pilot');
    assert.equal(details.episodes[0].seasonNumber, 1);
    assert.equal(details.episodes[0].episodeNumber, 1);
  });

  it('retrieves episode list filtered by seasonNumber', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('/meta/')) {
            return new Response(SAMPLE_META_JSON, {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const episodes = await runner.getEpisodes('series:tt0903747', 1);

    assert.equal(episodes.length, 2);
    assert.equal(episodes[1].title, "Cat's in the Bag...");
  });

  it('resolves stream sources', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('vidsrc')) {
            return new Response(`
              <html>
                <body>
                  <iframe src="https://stream.example.com/master.m3u8"></iframe>
                </body>
              </html>
            `, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const result = await runner.resolveSources({
      mediaId: 'movie:tt1375666'
    });

    assert.ok(result.sources.length > 0);
    assert.equal(result.sources[0].url, 'https://stream.example.com/master.m3u8');
    assert.equal(result.sources[0].format, 'hls');
  });
});
