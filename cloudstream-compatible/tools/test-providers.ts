/**
 * Live provider endpoint diagnostic tool for CloudStream providers.
 * Tests network reachability, HTTP headers, catalog endpoints, and reports honest capabilities.
 */

interface EndpointTest {
  provider: string;
  url: string;
  searchUrl?: string;
  notes: string;
}

const PROVIDER_ENDPOINTS: EndpointTest[] = [
  {
    provider: 'Bollyflix',
    url: 'https://bollyflix.frl',
    searchUrl: 'https://bollyflix.frl/?s=batman',
    notes: 'Direct movie/series catalog; Cloudflare DDoS protection active.'
  },
  {
    provider: 'CineStream (Cinemeta)',
    url: 'https://cinemeta-catalogs.strem.io',
    searchUrl: 'https://cinemeta-catalogs.strem.io/catalog/movie/top.json',
    notes: 'Public Stremio/Cinemeta metadata catalog; very high reliability.'
  },
  {
    provider: 'MoviesDrive',
    url: 'https://moviesdrive.forum',
    searchUrl: 'https://moviesdrive.forum/?s=batman',
    notes: 'Hub for Bollywood and Hollywood movies in Hindi.'
  },
  {
    provider: 'Moviesmod',
    url: 'https://moviesleech.rest',
    searchUrl: 'https://moviesleech.rest/?s=batman',
    notes: 'Mirrors Topmovies and Moviesleech.'
  },
  {
    provider: 'VegaMovies',
    url: 'https://vegamovies.mq',
    searchUrl: 'https://vegamovies.mq/?s=batman',
    notes: 'Mirrors Rogmovies & LuxMovies.'
  }
];

export async function testEndpoints(): Promise<void> {
  console.log('===============================================================');
  console.log('     CLOUDSTREAM PROVIDER LIVE STATUS & ENDPOINT AUDIT         ');
  console.log('===============================================================');

  for (const ep of PROVIDER_ENDPOINTS) {
    console.log(`\nTesting Provider: ${ep.provider}`);
    console.log(`  Base URL:  ${ep.url}`);
    console.log(`  Notes:     ${ep.notes}`);

    const targetUrl = ep.searchUrl || ep.url;
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);
      const elapsed = (performance.now() - startTime).toFixed(0);

      console.log(`  Status:    HTTP ${resp.status} ${resp.statusText} (${elapsed}ms)`);
      if (resp.status >= 200 && resp.status < 400) {
        console.log(`  Verdict:   ONLINE & REACHABLE (Extraction testable)`);
      } else if (resp.status === 403 || resp.status === 503) {
        console.log(`  Verdict:   CLOUDFLARE / ANTI-BOT CHALLENGE (Requires mobile browser/webview cookies)`);
      } else {
        console.log(`  Verdict:   HTTP ${resp.status} - Requires domain update or VPN in some regions`);
      }
    } catch (err: unknown) {
      const elapsed = (performance.now() - startTime).toFixed(0);
      const msg = (err as Error).message || String(err);
      console.log(`  Error:     ${msg} (${elapsed}ms)`);
      console.log(`  Verdict:   DOMAIN_BLOCKED_OR_DNS_FAILED (Common with ISP piracy blocks; VPN required)`);
    }
  }

  console.log('\n===============================================================');
  console.log('                 ENDPOINT AUDIT COMPLETE                       ');
  console.log('===============================================================\n');
}

testEndpoints().catch(console.error);
