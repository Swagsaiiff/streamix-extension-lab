import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { computeSha256, unpackZipArchive } from './packager.ts';
import type { RepositoryIndex, ExtensionIndexEntry, RepositoryMetadata } from '../sdk/src/types.ts';
import { assertValidManifest } from '../sdk/src/validator.ts';

export interface RepoBuilderOptions {
  repoDir?: string;
  packagesDir?: string;
}

export const DEFAULT_REPO_METADATA: RepositoryMetadata = {
  id: 'org.streamix.repository.lab',
  name: 'Streamix Lab Local Repository',
  version: '1.0.0',
  description: 'Reference extension repository for Streamix Desktop extension lab testing',
  manifestVersion: 1,
  homepageUrl: 'https://github.com/Swagsaiiff/streamix-desktop/tree/main/streamix-extension-lab'
};

/**
 * Validates a repository index against basic structural requirements.
 */
export function validateRepositoryIndex(index: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!index || typeof index !== 'object') {
    return { valid: false, errors: ['Repository index must be a non-null object'] };
  }

  const idx = index as Record<string, unknown>;
  if (!idx.repository || typeof idx.repository !== 'object') {
    errors.push("Missing 'repository' metadata object");
  } else {
    const repo = idx.repository as Record<string, unknown>;
    if (!repo.id || typeof repo.id !== 'string') errors.push("Repository missing 'id'");
    if (!repo.name || typeof repo.name !== 'string') errors.push("Repository missing 'name'");
    if (typeof repo.manifestVersion !== 'number') errors.push("Repository missing numeric 'manifestVersion'");
  }

  if (!idx.updatedAt || typeof idx.updatedAt !== 'string') {
    errors.push("Missing 'updatedAt' ISO timestamp string");
  }

  if (!Array.isArray(idx.extensions)) {
    errors.push("Missing 'extensions' array");
  } else {
    for (let i = 0; i < idx.extensions.length; i++) {
      const ext = idx.extensions[i];
      if (!ext || typeof ext !== 'object') {
        errors.push(`Extension at index ${i} must be an object`);
        continue;
      }
      if (!ext.id || typeof ext.id !== 'string') errors.push(`Extension at index ${i} missing 'id'`);
      if (!ext.version || typeof ext.version !== 'string') errors.push(`Extension at index ${i} missing 'version'`);
      if (!ext.packageUrl || typeof ext.packageUrl !== 'string') errors.push(`Extension at index ${i} missing 'packageUrl'`);
      if (!ext.packageSha256 || typeof ext.packageSha256 !== 'string' || ext.packageSha256.length !== 64) {
        errors.push(`Extension at index ${i} invalid 'packageSha256'`);
      }
      if (typeof ext.packageSizeBytes !== 'number' || ext.packageSizeBytes <= 0) {
        errors.push(`Extension at index ${i} invalid 'packageSizeBytes'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds the repository metadata, plugins.json, and copies packages into the repository directory.
 */
export async function buildRepository(options?: RepoBuilderOptions): Promise<RepositoryIndex> {
  const repoDir = resolve(process.cwd(), options?.repoDir || 'repository');
  const packagesDir = resolve(process.cwd(), options?.packagesDir || 'packages');
  const targetPackagesDir = join(repoDir, 'packages');

  await mkdir(repoDir, { recursive: true });
  await mkdir(targetPackagesDir, { recursive: true });

  // Read or create repository.json
  const repoJsonPath = join(repoDir, 'repository.json');
  let repoMeta: RepositoryMetadata = DEFAULT_REPO_METADATA;
  if (existsSync(repoJsonPath)) {
    try {
      const raw = await readFile(repoJsonPath, 'utf-8');
      repoMeta = JSON.parse(raw);
    } catch {
      // Use default if corrupted or missing
    }
  } else {
    await writeFile(repoJsonPath, JSON.stringify(DEFAULT_REPO_METADATA, null, 2), 'utf-8');
  }

  // Find all .streamix-ext packages
  const indexedExtensions: ExtensionIndexEntry[] = [];
  if (existsSync(packagesDir)) {
    const files = await readdir(packagesDir);
    for (const file of files) {
      if (!file.endsWith('.streamix-ext') && !file.endsWith('.zip')) continue;

      const packagePath = join(packagesDir, file);
      const targetPackagePath = join(targetPackagesDir, file);

      // Copy package into repo/packages
      if (packagePath !== targetPackagePath) {
        await copyFile(packagePath, targetPackagePath);
      }

      const fileBuf = await readFile(targetPackagePath);
      const sha256 = computeSha256(fileBuf);
      const stats = await stat(targetPackagePath);

      // Unpack archive to read internal manifest.json
      const unpacked = unpackZipArchive(fileBuf);
      const manifestBuf = unpacked.get('manifest.json');
      if (!manifestBuf) {
        console.warn(`[RepoBuilder] Skipping ${file}: no manifest.json found in package`);
        continue;
      }

      const manifest = JSON.parse(manifestBuf.toString('utf-8'));
      assertValidManifest(manifest);

      const entry: ExtensionIndexEntry = {
        id: manifest.id,
        displayName: manifest.displayName,
        version: manifest.version,
        streamixApiVersion: manifest.streamixApiVersion,
        description: manifest.description,
        author: manifest.author,
        contentTypes: manifest.contentTypes,
        languages: manifest.languages,
        packageUrl: `packages/${file}`,
        packageSha256: sha256,
        packageSizeBytes: stats.size,
        permissions: manifest.permissions,
        releaseDate: new Date().toISOString(),
        ...(manifest.icon ? { icon: manifest.icon } : {})
      };

      indexedExtensions.push(entry);
    }
  }

  const repoIndex: RepositoryIndex = {
    repository: repoMeta,
    updatedAt: new Date().toISOString(),
    extensions: indexedExtensions
  };

  const validation = validateRepositoryIndex(repoIndex);
  if (!validation.valid) {
    throw new Error(`Generated repository index is invalid: ${validation.errors.join('; ')}`);
  }

  const pluginsJsonPath = join(repoDir, 'plugins.json');
  await writeFile(pluginsJsonPath, JSON.stringify(repoIndex, null, 2), 'utf-8');

  return repoIndex;
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const repoDir = args[0] || 'repository';
  const packagesDir = args[1] || 'packages';

  console.log('--------------------------------------------------');
  console.log(`Streamix Extension Repository Builder`);
  console.log(`Repository Directory: ${repoDir}`);
  console.log(`Packages Directory: ${packagesDir}`);
  console.log('--------------------------------------------------');

  try {
    const index = await buildRepository({ repoDir, packagesDir });
    console.log(`\nRepository built successfully!`);
    console.log(`Repository Name: ${index.repository.name} (${index.repository.id})`);
    console.log(`Total Extensions Indexed: ${index.extensions.length}`);
    for (const ext of index.extensions) {
      console.log(`  - [${ext.id} v${ext.version}] ${ext.displayName} -> ${ext.packageUrl} (SHA: ${ext.packageSha256.substring(0, 12)}...)`);
    }
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error(`Repository build FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isDirectRun || process.argv[1]?.endsWith('repo-builder.ts')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
