import type {
  MediaDetails,
  ResolvedSourceResult,
  SearchResultItem
} from '../../../sdk/src/types.ts';

export interface FixtureMediaItem {
  searchItem: SearchResultItem;
  details: MediaDetails;
  sources: Record<string, ResolvedSourceResult>;
}

/**
 * Legitimate open-content public media fixtures for extension validation and testing.
 * Uses public domain / Creative Commons media from the Blender Foundation and Mux test streams.
 */
export const SAMPLE_FIXTURES: Record<string, FixtureMediaItem> = {
  'fixture-big-buck-bunny': {
    searchItem: {
      id: 'fixture-big-buck-bunny',
      title: 'Big Buck Bunny',
      type: 'movie',
      releaseYear: 2008,
      posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
      languages: ['en'],
      providerContext: {
        license: 'Creative Commons Attribution 3.0'
      }
    },
    details: {
      id: 'fixture-big-buck-bunny',
      title: 'Big Buck Bunny',
      type: 'movie',
      description: 'A large and lovable rabbit deals with bullying forest creatures in this classic open-source animated short film.',
      posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
      bannerUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/1200px-Big_buck_bunny_poster_big.jpg',
      releaseYear: 2008,
      genres: ['Animation', 'Comedy', 'Short'],
      status: 'released'
    },
    sources: {
      'default': {
        sources: [
          {
            url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            quality: 'auto',
            format: 'hls',
            isLive: false,
            headers: {
              'User-Agent': 'StreamixExtensionLab/1.0.0'
            },
            audioTracks: [
              { language: 'en', label: 'English Stereo', isDefault: true }
            ]
          },
          {
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            quality: '1080p',
            format: 'mp4',
            isLive: false
          }
        ],
        subtitles: [
          {
            language: 'en',
            label: 'English SDH',
            url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles-en.vtt',
            format: 'vtt'
          }
        ]
      }
    }
  },

  'fixture-tears-of-steel': {
    searchItem: {
      id: 'fixture-tears-of-steel',
      title: 'Tears of Steel',
      type: 'movie',
      releaseYear: 2012,
      posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Tears_of_Steel_poster.jpg',
      languages: ['en']
    },
    details: {
      id: 'fixture-tears-of-steel',
      title: 'Tears of Steel',
      type: 'movie',
      description: 'Set in a dystopian future Amsterdam, a group of scientists attempts to save the world using time manipulation and robotics.',
      posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Tears_of_Steel_poster.jpg',
      releaseYear: 2012,
      genres: ['Sci-Fi', 'Action', 'Short'],
      status: 'released'
    },
    sources: {
      'default': {
        sources: [
          {
            url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
            quality: '1080p',
            format: 'hls',
            isLive: false,
            headers: {
              'Origin': 'https://demo.unified-streaming.com'
            }
          }
        ],
        subtitles: [
          {
            language: 'en',
            label: 'English Subtitles',
            url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.vtt',
            format: 'vtt'
          }
        ]
      }
    }
  },

  'fixture-open-series-sample': {
    searchItem: {
      id: 'fixture-open-series-sample',
      title: 'Open Cinema Lab Anthology',
      type: 'series',
      releaseYear: 2024,
      languages: ['en']
    },
    details: {
      id: 'fixture-open-series-sample',
      title: 'Open Cinema Lab Anthology',
      type: 'series',
      description: 'An episodic test showcase demonstrating multi-season and episodic navigation in Streamix extensions.',
      releaseYear: 2024,
      genres: ['Documentary', 'Anthology'],
      status: 'completed',
      seasons: [
        { seasonNumber: 1, name: 'Pilot Season', episodeCount: 2 }
      ],
      episodes: [
        {
          id: 'ep-s1e1',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Bunny Chronicles',
          description: 'Episode 1 featuring the forest creature saga.',
          releaseDate: '2024-01-01'
        },
        {
          id: 'ep-s1e2',
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'Steel Horizons',
          description: 'Episode 2 featuring futuristic Amsterdam.',
          releaseDate: '2024-01-08'
        }
      ]
    },
    sources: {
      'ep-s1e1': {
        sources: [
          {
            url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            quality: 'auto',
            format: 'hls'
          }
        ],
        subtitles: []
      },
      'ep-s1e2': {
        sources: [
          {
            url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
            quality: '720p',
            format: 'hls'
          }
        ],
        subtitles: []
      }
    }
  },

  'fixture-unplayable-media': {
    searchItem: {
      id: 'fixture-unplayable-media',
      title: 'Unavailable Media Item (Test)',
      type: 'movie',
      releaseYear: 2023,
      languages: ['en']
    },
    details: {
      id: 'fixture-unplayable-media',
      title: 'Unavailable Media Item (Test)',
      type: 'movie',
      description: 'Controlled fixture item specifically configured without playable video streams to verify error handling.',
      releaseYear: 2023,
      genres: ['Test'],
      status: 'released'
    },
    sources: {}
  }
};
