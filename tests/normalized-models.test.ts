import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSearchResultItem,
  validateMediaDetails,
  validateResolvedSourceResult
} from '../sdk/src/validator.ts';

test('Normalized Models: SearchResultItem validation and normalization', () => {
  const valid = validateSearchResultItem({
    id: '  test-item-1  ',
    title: '  Test Title  ',
    type: 'movie',
    releaseYear: 2021,
    posterUrl: 'https://example.com/poster.jpg',
    languages: ['en', 'fr']
  });

  assert.equal(valid.id, 'test-item-1');
  assert.equal(valid.title, 'Test Title');
  assert.equal(valid.type, 'movie');
  assert.equal(valid.releaseYear, 2021);
  assert.equal(valid.posterUrl, 'https://example.com/poster.jpg');
  assert.deepEqual(valid.languages, ['en', 'fr']);

  // Missing optional fields are not invented
  const minimal = validateSearchResultItem({
    id: 'min-1',
    title: 'Minimal',
    type: 'series'
  });
  assert.equal(minimal.releaseYear, undefined);
  assert.equal(minimal.posterUrl, undefined);

  // Missing required throws
  assert.throws(() => validateSearchResultItem({ id: '', title: 'Test', type: 'movie' }));
  assert.throws(() => validateSearchResultItem({ id: '1', title: '', type: 'movie' }));
  assert.throws(() => validateSearchResultItem({ id: '1', title: 'Test', type: 'invalid' as any }));
});

test('Normalized Models: MediaDetails validation and normalization', () => {
  const details = validateMediaDetails({
    id: 'details-1',
    title: 'Series Title',
    type: 'series',
    description: 'A great show',
    genres: ['Action', 'Drama'],
    status: 'ongoing',
    seasons: [
      { seasonNumber: 1, name: 'Season One', episodeCount: 10 }
    ],
    episodes: [
      { id: 'ep-1', seasonNumber: 1, episodeNumber: 1, title: 'Pilot' }
    ]
  });

  assert.equal(details.id, 'details-1');
  assert.equal(details.type, 'series');
  assert.equal(details.status, 'ongoing');
  assert.equal(details.seasons?.[0].name, 'Season One');
  assert.equal(details.episodes?.[0].title, 'Pilot');

  // Missing required throws
  assert.throws(() => validateMediaDetails({ title: 'No ID', type: 'movie' }));
  assert.throws(() => validateMediaDetails({ id: 'id-1', type: 'movie' }));
});

test('Normalized Models: ResolvedSourceResult validation and normalization', () => {
  const res = validateResolvedSourceResult({
    sources: [
      {
        url: 'https://example.com/stream.m3u8',
        quality: '1080p',
        format: 'hls',
        isLive: false,
        audioTracks: [{ language: 'en', label: 'English' }]
      }
    ],
    subtitles: [
      {
        url: 'https://example.com/sub.vtt',
        language: 'en',
        format: 'vtt'
      }
    ]
  });

  assert.equal(res.sources.length, 1);
  assert.equal(res.sources[0].quality, '1080p');
  assert.equal(res.sources[0].format, 'hls');
  assert.equal(res.subtitles.length, 1);
  assert.equal(res.subtitles[0].format, 'vtt');

  // Invalid stream format throws
  assert.throws(() =>
    validateResolvedSourceResult({
      sources: [{ url: 'https://example.com/vid.flv', format: 'flv' as any }]
    })
  );

  // Invalid subtitle format throws
  assert.throws(() =>
    validateResolvedSourceResult({
      sources: [{ url: 'https://example.com/stream.m3u8', quality: '720p', format: 'hls' }],
      subtitles: [{ url: 'https://example.com/sub.txt', language: 'en', format: 'txt' as any }]
    })
  );
});
