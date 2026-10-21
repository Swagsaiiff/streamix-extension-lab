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
        post_title: 'Download Gladiator II (2024) Hindi Dubbed 1080p',
        permalink: '/gladiator-2-2024/',
        post_thumbnail: 'https://img.example.com/gladiator2.jpg'
      }
    },
    {
      document: {
        post_title: 'Download Game of Thrones Season 1',
        permalink: '/game-of-thrones-s1/',
        post_thumbnail: 'https://img.example.com/got.jpg'
      }
    }
  ]
});

const SAMPLE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Download Gladiator II (2024) Dual Audio Hindi | VegaMovies</title>
</head>
<body>
  <p>
    <img src="https://img.example.com/gladiator2.jpg" />
  </p>
  <a href="https://www.imdb.com/title/tt2104994/">IMDb Link</a>
  <h3>4K 2160p Links</h3>
  <p>
    <a href="https://vcloud.fit/drive/abc">V-Cloud 1080p Download</a>
  </p>
</body>
</html>
`;

describe('VegaMovies Extension - Unit & Fixture Tests', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/vegamovies/manifest.json'), 'utf-8')
  );

  it('has a valid manifest conforming to Streamix SDK requirements', () => {
    assert.doesNotThrow(() => assertValidManifest(manifest));
    assert.equal(manifest.id, 'org.streamix.provider.vegamovies');
    assert.equal(manifest.displayName, 'VegaMovies');
  });

  it('searches via JSON hits API', async () => {
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
    const results = await runner.search('gladiator');

    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Gladiator II (2024) Hindi Dubbed 1080p');
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
                name: 'Gladiator II',
                year: 2024,
                description: 'Years after witnessing the death of the revered hero Maximus...',
                genres: ['Action', 'Adventure', 'Drama'],
                poster: 'https://img.example.com/gladiator2.jpg'
              }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(SAMPLE_DETAIL_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }
    });

    await runner.initialize();
    const details = await runner.getDetails('https://1vegamovies.pics/gladiator-2-2024/');
    assert.equal(details.title, 'Gladiator II');
    assert.equal(details.releaseYear, 2024);
    assert.ok(details.genres?.includes('Action'));
  });

  it('resolves stream sources from V-Cloud / HubCloud link', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('vcloud')) {
            return new Response(`
              <div class="card-header">Gladiator II 1080p</div>
              <h2>
                <a class="btn" href="https://dl.example.com/gladiator2.mp4">FSL Server</a>
              </h2>
            `, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const result = await runner.resolveSources({
      mediaId: 'https://vcloud.fit/drive/abc'
    });

    assert.ok(result.sources.length > 0);
    assert.equal(result.sources[0].url, 'https://dl.example.com/gladiator2.mp4');
  });
});
