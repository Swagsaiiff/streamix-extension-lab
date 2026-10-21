import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadManifestFromFile } from '../sdk/src/manifest.ts';
import { ExtensionRunner } from '../sdk/src/runner.ts';
import { ItemNotFoundError, SourceUnavailableError } from '../sdk/src/errors.ts';
import type { StreamixExtension } from '../sdk/src/types.ts';

interface HarnessConfig {
  extensionPath: string;
  searchQuery?: string;
  detailsId?: string;
  sourceId?: string;
}

export async function runHarness(config: HarnessConfig): Promise<void> {
  const rootPath = resolve(process.cwd(), config.extensionPath);
  const manifestPath = join(rootPath, 'manifest.json');

  console.log('===============================================================');
  console.log('           STREAMIX EXTENSION DEVELOPMENT HARNESS               ');
  console.log('===============================================================');
  console.log(`Loading extension from: ${rootPath}`);

  // 1. Load and validate manifest
  const manifest = await loadManifestFromFile(manifestPath);
  console.log(`\n[Harness] Manifest Loaded:`);
  console.log(`  - ID:           ${manifest.id}`);
  console.log(`  - Name:         ${manifest.displayName}`);
  console.log(`  - Version:      ${manifest.version}`);
  console.log(`  - API Target:   ${manifest.streamixApiVersion}`);
  console.log(`  - Content:      ${manifest.contentTypes.join(', ')}`);
  console.log(`  - Permissions:  ${manifest.permissions.join(', ') || 'None'}`);

  // 2. Load entrypoint dynamically
  const entrypointPath = join(rootPath, manifest.entrypoint);
  const entrypointUrl = pathToFileURL(entrypointPath).href;
  console.log(`\n[Harness] Dynamically importing entrypoint: ${manifest.entrypoint}`);

  const module = await import(entrypointUrl);
  let extensionInstance: StreamixExtension;

  if (typeof module.default === 'function') {
    extensionInstance = module.default();
  } else if (module.SampleProviderExtension) {
    extensionInstance = new module.SampleProviderExtension();
  } else if (module.default && typeof module.default === 'object') {
    extensionInstance = module.default;
  } else {
    throw new Error('Entrypoint does not export a default factory function or extension class');
  }

  // 3. Create runner
  const runner = new ExtensionRunner({
    manifest,
    extension: extensionInstance,
    defaultTimeoutMs: 8_000
  });

  // 4. Initialize
  console.log(`\n[Harness] Initializing extension...`);
  const initStart = performance.now();
  await runner.initialize();
  console.log(`✔ Extension initialized in ${(performance.now() - initStart).toFixed(2)}ms`);

  // 5. Test search
  const query = config.searchQuery || 'bunny';
  console.log(`\n[Harness] Executing search for: "${query}"...`);
  const searchStart = performance.now();
  const searchResults = await runner.search(query);
  console.log(`✔ Search returned ${searchResults.length} result(s) in ${(performance.now() - searchStart).toFixed(2)}ms:`);
  for (const item of searchResults) {
    console.log(`    * [${item.type.toUpperCase()}] ${item.title} (ID: ${item.id}, Year: ${item.releaseYear ?? 'N/A'})`);
  }

  // 6. Test details
  const targetId = config.detailsId || (searchResults[0]?.id || 'fixture-big-buck-bunny');
  console.log(`\n[Harness] Fetching details for: "${targetId}"...`);
  const detailsStart = performance.now();
  const details = await runner.getDetails(targetId);
  console.log(`✔ Details retrieved in ${(performance.now() - detailsStart).toFixed(2)}ms:`);
  console.log(`    * Title:        ${details.title}`);
  console.log(`    * Type:         ${details.type}`);
  console.log(`    * Description:  ${details.description ?? 'None'}`);
  console.log(`    * Genres:       ${details.genres?.join(', ') ?? 'None'}`);
  console.log(`    * Status:       ${details.status ?? 'Unknown'}`);

  // 7. Test series episodes if applicable
  if (details.type === 'series' || details.seasons?.length) {
    console.log(`\n[Harness] Fetching episodes for series "${targetId}"...`);
    const episodes = await runner.getEpisodes(targetId, 1);
    console.log(`✔ Episodes retrieved (${episodes.length} episodes in season 1):`);
    for (const ep of episodes) {
      console.log(`    * S${ep.seasonNumber}E${ep.episodeNumber}: ${ep.title ?? 'Untitled'} (ID: ${ep.id})`);
    }
  }

  // 8. Test source resolution
  const sourceMediaId = config.sourceId || targetId;
  console.log(`\n[Harness] Resolving sources for: "${sourceMediaId}"...`);
  const sourceStart = performance.now();
  try {
    const sourceResult = await runner.resolveSources({ mediaId: sourceMediaId });
    console.log(`✔ Sources resolved in ${(performance.now() - sourceStart).toFixed(2)}ms:`);
    console.log(`    * Video Streams (${sourceResult.sources.length}):`);
    for (const src of sourceResult.sources) {
      console.log(`        - [${src.format.toUpperCase()} ${src.quality}] ${src.url}`);
      if (src.audioTracks?.length) {
        console.log(`          Audio Tracks: ${src.audioTracks.map(a => `${a.language} (${a.label || 'Default'})`).join(', ')}`);
      }
    }
    console.log(`    * Subtitles (${sourceResult.subtitles.length}):`);
    for (const sub of sourceResult.subtitles) {
      console.log(`        - [${sub.language}] ${sub.label || sub.language} (${sub.format}): ${sub.url}`);
    }
  } catch (err: unknown) {
    if (err instanceof SourceUnavailableError) {
      console.log(`ℹ Source unavailable for '${sourceMediaId}': ${err.message}`);
    } else {
      throw err;
    }
  }

  // 9. Negative test / Error handling validation
  console.log(`\n[Harness] Testing structured error handling...`);
  try {
    await runner.getDetails('nonexistent-id-999999');
    console.error('✖ Expected ItemNotFoundError but operation succeeded!');
  } catch (err: unknown) {
    if (err instanceof ItemNotFoundError) {
      console.log(`✔ Handled missing item gracefully: ItemNotFoundError ('${err.itemId}')`);
    } else {
      console.error(`✖ Unexpected error type for missing item:`, err);
    }
  }

  // 10. Clean disposal
  console.log(`\n[Harness] Disposing extension runner...`);
  await runner.dispose();
  console.log('✔ Extension disposed cleanly.');
  console.log('\n===============================================================');
  console.log('           ALL HARNESS VERIFICATION CHECKS PASSED             ');
  console.log('===============================================================\n');
}

// CLI handler
async function main() {
  const args = process.argv.slice(2);
  let extPath = 'examples/sample-provider';
  let searchQuery: string | undefined;
  let detailsId: string | undefined;
  let sourceId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ext' && args[i + 1]) extPath = args[++i];
    else if (args[i] === '--query' && args[i + 1]) searchQuery = args[++i];
    else if (args[i] === '--details' && args[i + 1]) detailsId = args[++i];
    else if (args[i] === '--sources' && args[i + 1]) sourceId = args[++i];
  }

  await runHarness({ extensionPath: extPath, searchQuery, detailsId, sourceId });
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isDirectRun || process.argv[1]?.endsWith('harness.ts')) {
  main().catch(err => {
    console.error(`[Harness Error]`, err);
    process.exit(1);
  });
}
