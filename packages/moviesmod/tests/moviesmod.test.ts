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
      <a href="https://moviesmod.uk.com/interstellar-2014/" title="Download Interstellar (2014) Dual Audio [Hindi-English] 1080p">
        <div>
          <img src="https://img.example.com/interstellar.jpg" />
        </div>
      </a>
    </article>
    <article id="post-2" class="latestPost excerpt">
      <a href="https://moviesmod.uk.com/loki-season-1/" title="Download Loki Season 1 Hindi Dubbed 720p">
        <div>
          <img src="https://img.example.com/loki.jpg" />
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
  <meta property="og:title" content="Download Interstellar (2014) Hindi Dubbed | Moviesmod" />
  <meta property="og:image" content="https://img.example.com/interstellar.jpg" />
</head>
<body>
  <div class="thecontent">
    <a href="https://www.imdb.com/title/tt0816692/">IMDb</a>
    <div class="imdbwp__teaser">A team of explorers travel through a wormhole in space.</div>
    <a class="maxbutton-download-links" href="https://download.example.com/?url=aHR0cHM6Ly9kcml2ZWxlZWNoLmNsdWIvZmlsZS8xMjM0">Download 1080p</a>
  </div>
</body>
</html>
`;

describe('Moviesmod Extension - Unit & Fixture Tests', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'packages/moviesmod/manifest.json'), 'utf-8')
  );

  it('has a valid manifest conforming to Streamix SDK requirements', () => {
    assert.doesNotThrow(() => assertValidManifest(manifest));
    assert.equal(manifest.id, 'org.streamix.provider.moviesmod');
    assert.equal(manifest.displayName, 'Moviesmod');
  });

  it('searches via HTML article cards', async () => {
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
    const results = await runner.search('interstellar');

    assert.equal(results.length, 2);
    assert.equal(results[0].title, 'Interstellar (2014) Dual Audio [Hindi-English] 1080p');
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
                name: 'Interstellar',
                year: 2014,
                description: 'A team of explorers travel through a wormhole...',
                genres: ['Adventure', 'Drama', 'Sci-Fi'],
                poster: 'https://img.example.com/interstellar.jpg'
              }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(SAMPLE_DETAIL_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
      }
    });

    await runner.initialize();
    const details = await runner.getDetails('https://moviesmod.uk.com/interstellar-2014/');
    assert.equal(details.title, 'Interstellar');
    assert.equal(details.releaseYear, 2014);
    assert.ok(details.genres?.includes('Sci-Fi'));
  });

  it('resolves stream sources with base64 decoded redirect URL', async () => {
    const ext = createExtension();
    const runner = new ExtensionRunner({
      manifest,
      extension: ext,
      contextOptions: {
        customFetch: async (input: RequestInfo | URL) => {
          const urlStr = String(input);
          if (urlStr.includes('driveleech')) {
            return new Response(`
              <div>
                Name : Interstellar 1080p.mkv
                Size : 2.8 GB
                <div class="text-center">
                  <a href="https://dl.example.com/interstellar.mkv">Cloud Download</a>
                </div>
              </div>
            `, { status: 200, headers: { 'Content-Type': 'text/html' } });
          }
          return new Response('{}', { status: 200 });
        }
      }
    });

    await runner.initialize();
    const result = await runner.resolveSources({
      mediaId: 'https://download.example.com/?url=aHR0cHM6Ly9kcml2ZWxlZWNoLmNsdWIvZmlsZS8xMjM0'
    });

    assert.ok(result.sources.length > 0);
    assert.equal(result.sources[0].url, 'https://dl.example.com/interstellar.mkv');
  });
});
