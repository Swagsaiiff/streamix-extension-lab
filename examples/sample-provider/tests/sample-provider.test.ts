import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleProviderExtension } from '../src/index.ts';
import { loadManifestFromFile } from '../../../sdk/src/manifest.ts';
import { createExtensionContext } from '../../../sdk/src/context.ts';
import { ItemNotFoundError, SourceUnavailableError } from '../../../sdk/src/errors.ts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const manifestPath = join(__dirname, '..', 'manifest.json');

test('SampleProviderExtension: lifecycle and provider operations', async (t) => {
  const manifest = await loadManifestFromFile(manifestPath);
  assert.equal(manifest.id, 'org.streamix.provider.sample');

  const provider = new SampleProviderExtension();
  const context = createExtensionContext({ manifest });

  await t.test('initializes cleanly', async () => {
    await provider.initialize(context);
    const storedAt = await context.storage.get('initializedAt');
    assert.ok(storedAt, 'Should set initialization timestamp in storage');
  });

  await t.test('searches fixtures by query case-insensitively', async () => {
    const results = await provider.search('bunny');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'fixture-big-buck-bunny');
    assert.equal(results[0].title, 'Big Buck Bunny');
    assert.equal(results[0].type, 'movie');
  });

  await t.test('returns empty array for empty search query', async () => {
    const results = await provider.search('   ');
    assert.deepEqual(results, []);
  });

  await t.test('retrieves movie details', async () => {
    const details = await provider.getDetails('fixture-big-buck-bunny');
    assert.equal(details.id, 'fixture-big-buck-bunny');
    assert.equal(details.title, 'Big Buck Bunny');
    assert.equal(details.type, 'movie');
    assert.ok(details.genres?.includes('Animation'));
  });

  await t.test('throws ItemNotFoundError for unknown details id', async () => {
    await assert.rejects(
      async () => provider.getDetails('unknown-id-12345'),
      (err: unknown) => err instanceof ItemNotFoundError && err.itemId === 'unknown-id-12345'
    );
  });

  await t.test('retrieves series details and episodes', async () => {
    const seriesDetails = await provider.getDetails('fixture-open-series-sample');
    assert.equal(seriesDetails.type, 'series');
    assert.equal(seriesDetails.seasons?.length, 1);

    const episodes = await provider.getEpisodes('fixture-open-series-sample', 1);
    assert.equal(episodes.length, 2);
    assert.equal(episodes[0].id, 'ep-s1e1');
    assert.equal(episodes[1].id, 'ep-s1e2');
  });

  await t.test('resolves sources for movie with subtitles and audio tracks', async () => {
    const res = await provider.resolveSources({ mediaId: 'fixture-big-buck-bunny' });
    assert.ok(res.sources.length >= 1);
    assert.equal(res.sources[0].format, 'hls');
    assert.ok(res.sources[0].audioTracks && res.sources[0].audioTracks.length > 0);
    assert.ok(res.subtitles.length > 0);
    assert.equal(res.subtitles[0].format, 'vtt');
  });

  await t.test('resolves sources for series episode', async () => {
    const res = await provider.resolveSources({
      mediaId: 'fixture-open-series-sample',
      episodeId: 'ep-s1e1'
    });
    assert.ok(res.sources.length >= 1);
    assert.equal(res.sources[0].format, 'hls');
  });

  await t.test('throws SourceUnavailableError for item with no sources', async () => {
    await assert.rejects(
      async () => provider.resolveSources({ mediaId: 'fixture-unplayable-media' }),
      (err: unknown) => err instanceof SourceUnavailableError && err.code === 'SOURCE_UNAVAILABLE'
    );
  });

  await t.test('disposes cleanly', async () => {
    await provider.dispose();
  });
});
