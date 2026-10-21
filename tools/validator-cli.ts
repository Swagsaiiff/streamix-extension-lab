import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadManifestFromFile } from '../sdk/src/manifest.ts';
import { validateManifest, checkApiCompatibility } from '../sdk/src/validator.ts';
import { STREAMIX_CURRENT_API_VERSION } from '../sdk/src/constants.ts';

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args[0] || 'examples/sample-provider/manifest.json';
  const fullPath = resolve(process.cwd(), manifestPath);

  console.log('--------------------------------------------------');
  console.log(`Streamix Extension Manifest Validator`);
  console.log(`Target: ${fullPath}`);
  console.log(`Host API Version: ${STREAMIX_CURRENT_API_VERSION}`);
  console.log('--------------------------------------------------');

  if (!existsSync(fullPath)) {
    console.error(`ERROR: Manifest file not found at: ${fullPath}`);
    process.exit(1);
  }

  try {
    const manifest = await loadManifestFromFile(fullPath);
    const result = validateManifest(manifest);

    if (!result.valid) {
      console.error(`\nValidation FAILED with ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }

    // Check API version compatibility
    const compat = checkApiCompatibility(manifest.streamixApiVersion, STREAMIX_CURRENT_API_VERSION);
    if (!compat.compatible) {
      console.error(`\nAPI Compatibility FAILED:`);
      console.error(`  - ${compat.reason}`);
      process.exit(1);
    }

    // Check entrypoint existence relative to manifest location
    const manifestDir = dirname(fullPath);
    const entrypointPath = join(manifestDir, manifest.entrypoint);
    if (!existsSync(entrypointPath)) {
      console.warn(`\nWARNING: Entrypoint file '${manifest.entrypoint}' does not currently exist at: ${entrypointPath}`);
    } else {
      console.log(`Entrypoint verified: ${manifest.entrypoint}`);
    }

    console.log('\nManifest is VALID and compatible!');
    console.log(`ID: ${manifest.id}`);
    console.log(`Name: ${manifest.displayName}`);
    console.log(`Version: ${manifest.version}`);
    console.log(`API Spec: ${manifest.streamixApiVersion} (Compatible with Host ${STREAMIX_CURRENT_API_VERSION})`);
    console.log(`Content Types: ${manifest.contentTypes.join(', ')}`);
    console.log(`Permissions: ${manifest.permissions.length > 0 ? manifest.permissions.join(', ') : 'None'}`);
    console.log('--------------------------------------------------');
  } catch (err: unknown) {
    console.error(`\nFatal error validating manifest: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
