import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExtensionRunner, assertValidManifest } from '../../../sdk/src/index.ts';
import createExtension from '../src/index.ts';

const SAMPLE_SEARCH_JSON = JSON.stringify({
  hits: [
    {
      document: {
        id: '123',
        postTitle: 'Download Inception (2010) Dual Audio Hindi',
        permalink: '/inception-2010/',
        postThumbnail: 'https://img.example.com/inception.jpg',
        imdb_id: 'tt1375666'
      }
    },
    {
      document: {
        id: '456',
        postTitle: 'Download Stranger Things Season 1',
        permalink: '/stranger-things-s1/',
        postThumbnail: 'https://img.example.com/st.jpg',
        imdb_id: 'tt4574334'
      }
    }
  ]
});

const SAMPLE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Download Inception (2010) Hindi Dubbed | MoviesDrive</title>
</head>
<body>
  <main>
    <img src="https://img.example.com/inception.jpg" />
  </main>
  <a href="https://www.imdb.com/title/tt1375666/">IMDb Info</a>
  <h5>
    <a href="https://hubcloud.ist/drive/xyz">Download 1080p [HubCloud]</a>
  </h5>
</body>
</html>
`;

describe('MoviesDrive Extension - Unit & Fixture Tests', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/moviesdrive/manifest.json'), 'utf-8')
  );

  it('has a valid manifest conforming to Streamix SDK requirements', () => {
    assert.doesNotThrow(() => assertValidManifest(manifest));
    assert.equal(manifest.id, 'org.streamix.provider.moviesdrive');
    assert.equal(manifest.displayName, 'MoviesDrive');
  });

  it('searches via JSON search API', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('search.php')) {
            return new Response(SAMPLE_SEARCH_JSON, { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const results = await runner.search('inception');

    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Inception (2010) Dual Audio Hindi');
    assert.equal(results[0].type, 'movie');
    assert.equal(results[1].type, 'series');
  });

  it('retrieves details and Cinemeta metadata', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('cinemeta')) {
            return new Response(JSON.stringify({
              meta: {
                name: 'Inception',
                year: 2010,
                description: 'A thief who enters dreams...',
                genres: ['Action', 'Sci-Fi'],
                poster: 'https://img.example.com/inception.jpg'
              }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(SAMPLE_DETAIL_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }
    });

    await runner.initialize();
    const details = await runner.getDetails('https://new3.moviesdrive.beer/inception-2010/');
    assert.equal(details.title, 'Inception');
    assert.equal(details.releaseYear, 2010);
    assert.ok(details.genres?.includes('Action'));
  });

  it('resolves stream sources from HubCloud link', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('hubcloud')) {
            return new Response(`
              <div class="card-header">Inception 1080p BluRay</div>
              <h2>
                <a class="btn btn-primary" href="https://fsl.example.com/stream.mp4">FSL Server</a>
              </h2>
            `, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const result = await runner.resolveSources({
      mediaId: 'https://hubcloud.ist/drive/xyz'
    });

    assert.ok(result.sources.length > 0);
    assert.equal(result.sources[0].url, 'https://fsl.example.com/stream.mp4');
    assert.equal(result.sources[0].quality, '1080p');
  });
});
