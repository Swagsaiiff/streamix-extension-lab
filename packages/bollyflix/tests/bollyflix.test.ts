import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExtensionRunner, assertValidManifest } from '../../../sdk/src/index.ts';
import createExtension from '../src/index.ts';

const SAMPLE_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="post-cards">
    <article id="post-1" class="latestPost excerpt">
      <a href="https://bollyflix.co.za/inception-2010/" title="Download Inception (2010) Dual Audio [Hindi-English] Movie 480p | 720p | 1080p BluRay ESub">
        <div class="featured-thumbnail">
          <img src="https://img.example.com/inception.jpg" />
        </div>
      </a>
    </article>
    <article id="post-2" class="latestPost excerpt">
      <a href="https://bollyflix.co.za/breaking-bad-season-1/" title="Download Breaking Bad Season 1 Complete [Hindi Dubbed]">
        <div class="featured-thumbnail">
          <img src="https://img.example.com/bb.jpg" />
        </div>
      </a>
    </article>
  </div>
</body>
</html>
`;

const SAMPLE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Download Inception (2010) Dual Audio Hindi | BollyFlix</title>
  <meta property="og:image" content="https://img.example.com/inception.jpg" />
</head>
<body>
  <div class="imdb_left">
    <a href="https://www.imdb.com/title/tt1375666/">IMDb</a>
  </div>
  <span id="summary">A thief who steals corporate secrets through the use of dream-sharing technology.</span>
  <a class="dl maxbutton-download-links" href="https://web.sidexfee.com/?id=test1234">Download 1080p</a>
</body>
</html>
`;

describe('Bollyflix Extension - Unit & Fixture Tests', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/bollyflix/manifest.json'), 'utf-8')
  );

  it('has a valid manifest conforming to Streamix SDK requirements', () => {
    assert.doesNotThrow(() => assertValidManifest(manifest));
    assert.equal(manifest.id, 'org.streamix.provider.bollyflix');
    assert.equal(manifest.displayName, 'BollyFlix');
  });

  it('initializes and executes search against mock HTTP responses', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('/search/')) {
            return new Response(SAMPLE_SEARCH_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const results = await runner.search('inception');

    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Inception (2010) Dual Audio [Hindi-English] Movie 480p | 720p | 1080p BluRay ESub');
    assert.equal(results[0].type, 'movie');
    assert.equal(results[0].posterUrl, 'https://img.example.com/inception.jpg');

    assert.equal(results[1].type, 'series');
  });

  it('parses details and resolves IMDb ID', async () => {
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
                description: 'A thief who steals corporate secrets...',
                genres: ['Action', 'Sci-Fi'],
                poster: 'https://img.example.com/cinemeta.jpg'
              }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(SAMPLE_DETAIL_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }
    });

    await runner.initialize();
    const details = await runner.getDetails('https://bollyflix.co.za/inception-2010/');
    assert.equal(details.title, 'Inception');
    assert.equal(details.releaseYear, 2010);
    assert.ok(details.genres?.includes('Action'));
  });

  it('resolves stream sources', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('sidexfee')) {
            return new Response('link":"aHR0cHM6Ly9nZGZsaXguaW8vZmlsZS94eXo="', { status: 200 });
          }
          if (urlStr.includes('gdflix') || urlStr.includes('new6.gdflix')) {
            return new Response(`
              <div>
                Name : Inception 1080p.mkv
                Size : 2.4 GB
                <div class="text-center">
                  <a href="https://dl.example.com/inception.mkv">DIRECT DL</a>
                </div>
              </div>
            `, { status: 200 });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const result = await runner.resolveSources({
      mediaId: 'https://web.sidexfee.com/?id=test1234'
    });

    assert.ok(result.sources.length > 0);
    assert.equal(result.sources[0].url, 'https://dl.example.com/inception.mkv');
  });
});
