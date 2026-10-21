import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { computeSha256, unpackZipArchive, packageExtension } from './packager.ts';
import type { RepositoryIndex, ExtensionIndexEntry, RepositoryMetadata } from '../sdk/src/types.ts';
import {
  assertValidManifest,
  assertValidRepositoryManifest,
  validateRepositoryIndex
} from '../sdk/src/index.ts';

export interface RepoBuilderOptions {
  repoDir?: string;
  packagesDir?: string;
  autoPackage?: boolean;
  sourceDirs?: string[];
}

export const DEFAULT_REPO_METADATA: RepositoryMetadata = {
  id: 'org.streamix.repository.lab',
  name: 'Streamix Lab Local Repository',
  version: '1.0.0',
  description: 'Reference extension repository for Streamix Desktop extension lab testing',
  manifestVersion: 1,
  homepageUrl: 'https://github.com/Swagsaiiff/streamix-extension-lab',
  pluginLists: ['plugins.json'],
  pluginsUrl: 'plugins.json'
};

export { validateRepositoryIndex };

/**
 * Builds the repository metadata, plugins.json, and copies packages into the repository directory.
 * Automatically discovers source provider packages and packages missing archives.
 */
export async function buildRepository(options?: RepoBuilderOptions): Promise<RepositoryIndex> {
  const repoDir = resolve(process.cwd(), options?.repoDir || 'repository');
  const packagesDir = resolve(process.cwd(), options?.packagesDir || 'packages');
  const targetPackagesDir = join(repoDir, 'packages');
  const autoPackage = options?.autoPackage !== false;
  const sourceDirs = options?.sourceDirs || ['packages', 'examples'];

  await mkdir(repoDir, { recursive: true });
  await mkdir(packagesDir, { recursive: true });
  await mkdir(targetPackagesDir, { recursive: true });

  // 1. Auto-discover provider directories and package any missing or unbuilt providers
  if (autoPackage) {
    for (const srcDirName of sourceDirs) {
      const srcDirPath = resolve(process.cwd(), srcDirName);
      if (!existsSync(srcDirPath)) continue;

      const entries = await readdir(srcDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const providerPath = join(srcDirPath, entry.name);
        const manifestPath = join(providerPath, 'manifest.json');

        if (existsSync(manifestPath)) {
          try {
            const raw = await readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(raw);
            assertValidManifest(manifest);

            const expectedPackageName = `${manifest.id}-${manifest.version}.streamix-ext`;
            const expectedPackagePath = join(packagesDir, expectedPackageName);

            if (!existsSync(expectedPackagePath)) {
              await packageExtension(providerPath, packagesDir);
            }
          } catch (err) {
            throw new Error(`Failed to validate or package provider at '${providerPath}': ${(err as Error).message}`);
          }
        }
      }
    }
  }

  // 2. Read or initialize repository.json
  const repoJsonPath = join(repoDir, 'repository.json');
  let repoMeta: RepositoryMetadata = { ...DEFAULT_REPO_METADATA };
  if (existsSync(repoJsonPath)) {
    try {
      const raw = await readFile(repoJsonPath, 'utf-8');
      const loaded = JSON.parse(raw);
      repoMeta = {
        ...loaded,
        pluginLists: loaded.pluginLists && loaded.pluginLists.length > 0
          ? loaded.pluginLists
          : (DEFAULT_REPO_METADATA.pluginLists || ['plugins.json']),
        pluginsUrl: loaded.pluginsUrl || DEFAULT_REPO_METADATA.pluginsUrl || 'plugins.json'
      };
    } catch {
      // Use default if corrupted or missing
    }
  }

  assertValidRepositoryManifest(repoMeta);
  await writeFile(repoJsonPath, JSON.stringify(repoMeta, null, 2), 'utf-8');

  // 3. Find and index all .streamix-ext packages
  const indexedExtensions: ExtensionIndexEntry[] = [];
  if (existsSync(packagesDir)) {
    const files = await readdir(packagesDir);
    // Sort files to ensure deterministic index ordering
    files.sort();

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
        throw new Error(`Package '${file}' is corrupted or missing manifest.json`);
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

  // 4. Generate and validate plugins.json
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
    console.log(`Catalog Entrypoint: ${index.repository.pluginLists?.[0] || 'plugins.json'}`);
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
