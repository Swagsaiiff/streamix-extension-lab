import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRepository,
  validateRepositoryIndex
} from '../tools/repo-builder.ts';
import {
  validateRepositoryManifest,
  assertValidRepositoryManifest,
  discoverCatalogUrl,
  resolveUrl,
  fetchRepositoryManifest,
  fetchRepositoryCatalog,
  resolvePackageUrl,
  verifyAndLoadPackage
} from '../sdk/src/repository.ts';
import {
  RepositoryError,
  RepositoryValidationError,
  PackageIntegrityError
} from '../sdk/src/errors.ts';

test('Repository Manifest: validateRepositoryManifest schema and validation', () => {
  const validManifest = {
    id: 'org.streamix.repository.test',
    name: 'Test Streamix Repository',
    version: '1.0.0',
    description: 'A test repository',
    manifestVersion: 1,
    homepageUrl: 'https://github.com/Swagsaiiff/streamix-extension-lab',
    pluginLists: ['plugins.json'],
    pluginsUrl: 'plugins.json'
  };

  const res = validateRepositoryManifest(validManifest);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);

  // Assert method should not throw
  assert.doesNotThrow(() => assertValidRepositoryManifest(validManifest));

  // Invalid id (not reverse-DNS)
  const invalidId = validateRepositoryManifest({ ...validManifest, id: 'INVALID ID' });
  assert.equal(invalidId.valid, false);

  // Missing name
  const missingName = validateRepositoryManifest({ ...validManifest, name: '' });
  assert.equal(missingName.valid, false);

  // Invalid manifestVersion
  const invalidVersion = validateRepositoryManifest({ ...validManifest, manifestVersion: 0 });
  assert.equal(invalidVersion.valid, false);

  // Invalid pluginLists
  const invalidList = validateRepositoryManifest({ ...validManifest, pluginLists: [''] });
  assert.equal(invalidList.valid, false);
});

test('Repository Discovery: URL resolution handles relative and absolute paths', () => {
  const repoManifestUrl = 'https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/main/repository/repository.json';

  // 1. Resolve relative catalog from repository manifest URL
  const catalogUrl = resolveUrl(repoManifestUrl, 'plugins.json');
  assert.equal(
    catalogUrl,
    'https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/main/repository/plugins.json'
  );

  // 2. Resolve relative package from catalog URL
  const packageRelative = 'packages/org.streamix.provider.bollyflix-1.0.0.streamix-ext';
  const resolvedPackageUrl = resolveUrl(catalogUrl, packageRelative);
  assert.equal(
    resolvedPackageUrl,
    'https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/main/repository/packages/org.streamix.provider.bollyflix-1.0.0.streamix-ext'
  );

  // 3. Absolute URL should remain unchanged
  const absoluteUrl = 'https://cdn.example.com/ext/org.streamix.provider.custom-1.0.0.streamix-ext';
  assert.equal(resolveUrl(catalogUrl, absoluteUrl), absoluteUrl);

  // 4. Local filesystem relative resolution
  const localRepoPath = 'repository/repository.json';
  assert.equal(resolveUrl(localRepoPath, 'plugins.json'), 'repository/plugins.json');
  assert.equal(
    resolveUrl('repository/plugins.json', 'packages/sample.streamix-ext'),
    'repository/packages/sample.streamix-ext'
  );
});

test('Repository Discovery: discoverCatalogUrl from repository manifest', () => {
  const repoManifestUrl = 'https://example.com/repo/repository.json';

  // Manifest with pluginLists
  const manifestWithLists = {
    id: 'org.streamix.repo',
    name: 'Repo',
    version: '1.0.0',
    manifestVersion: 1,
    pluginLists: ['custom-plugins.json']
  };
  assert.equal(
    discoverCatalogUrl(manifestWithLists, repoManifestUrl),
    'https://example.com/repo/custom-plugins.json'
  );

  // Manifest with pluginsUrl
  const manifestWithDirect = {
    id: 'org.streamix.repo',
    name: 'Repo',
    version: '1.0.0',
    manifestVersion: 1,
    pluginsUrl: 'plugins.json'
  };
  assert.equal(
    discoverCatalogUrl(manifestWithDirect, repoManifestUrl),
    'https://example.com/repo/plugins.json'
  );
});

test('Repository Index: validateRepositoryIndex structure checks', () => {
  const validIndex = {
    repository: {
      id: 'org.streamix.repo.test',
      name: 'Test Repo',
      version: '1.0.0',
      manifestVersion: 1,
      pluginLists: ['plugins.json']
    },
    updatedAt: new Date().toISOString(),
    extensions: [
      {
        id: 'org.streamix.provider.test',
        displayName: 'Test Ext',
        version: '1.0.0',
        streamixApiVersion: '^1.0.0',
        description: 'Test',
        author: 'Tester',
        contentTypes: ['movie'],
        languages: ['en'],
        packageUrl: 'packages/test.streamix-ext',
        packageSha256: 'a'.repeat(64),
        packageSizeBytes: 1024,
        permissions: [],
        releaseDate: new Date().toISOString()
      }
    ]
  };

  const validRes = validateRepositoryIndex(validIndex);
  assert.equal(validRes.valid, true);

  // Missing repository metadata
  const missingRepo = validateRepositoryIndex({ ...validIndex, repository: undefined });
  assert.equal(missingRepo.valid, false);

  // Missing extensions array
  const missingExts = validateRepositoryIndex({ ...validIndex, extensions: undefined });
  assert.equal(missingExts.valid, false);

  // Invalid SHA-256 length
  const invalidHash = validateRepositoryIndex({
    ...validIndex,
    extensions: [{ ...validIndex.extensions[0], packageSha256: 'short-hash' }]
  });
  assert.equal(invalidHash.valid, false);
});

test('Repository Discovery & Verification: One-URL discovery of all published providers', async () => {
  // Rebuild repository to ensure disk state is fresh
  const repo = await buildRepository({
    repoDir: 'repository',
    packagesDir: 'packages'
  });

  assert.equal(repo.repository.id, 'org.streamix.repository.lab');
  assert.ok(Array.isArray(repo.repository.pluginLists));
  assert.equal(repo.repository.pluginLists[0], 'plugins.json');

  // Verify single repository URL discovery using local path
  const repoManifestPath = join('repository', 'repository.json');
  const manifest = await fetchRepositoryManifest(repoManifestPath);
  assert.equal(manifest.id, 'org.streamix.repository.lab');

  const { catalog, catalogUrl } = await fetchRepositoryCatalog(repoManifestPath);
  assert.equal(catalog.repository.id, 'org.streamix.repository.lab');
  assert.ok(catalog.extensions.length >= 6);

  // Expected providers
  const expectedProviders = [
    'org.streamix.provider.bollyflix',
    'org.streamix.provider.cinestream',
    'org.streamix.provider.moviesdrive',
    'org.streamix.provider.moviesmod',
    'org.streamix.provider.sample',
    'org.streamix.provider.vegamovies'
  ];

  for (const providerId of expectedProviders) {
    const entry = catalog.extensions.find(e => e.id === providerId);
    assert.ok(entry, `Catalog must contain provider: ${providerId}`);
    assert.equal(entry.version, '1.0.0');
    assert.equal(entry.streamixApiVersion, '^1.0.0');
    assert.equal(entry.packageSha256.length, 64);
    assert.ok(entry.packageSizeBytes > 0);

    // Resolve package URL
    const pkgUrl = resolvePackageUrl(entry, catalogUrl);
    assert.ok(existsSync(pkgUrl), `Resolved package file must exist: ${pkgUrl}`);

    // Verify package downloadability, SHA-256 integrity, manifest validity and API compatibility
    const loaded = await verifyAndLoadPackage(pkgUrl, entry.packageSha256);
    assert.equal(loaded.manifest.id, providerId);
    assert.equal(loaded.manifest.version, entry.version);
    assert.equal(loaded.buffer.length, entry.packageSizeBytes);
  }
});

test('Repository Discovery: Malformed and missing catalog handling', async () => {
  // Non-existent manifest
  await assert.rejects(
    () => fetchRepositoryManifest('repository/non-existent-repo.json'),
    (err: Error) => err instanceof Error
  );

  // Corrupted manifest
  const mockFetchCorrupted = async () => new Response('{"id": 12345}', { status: 200 });
  await assert.rejects(
    () => fetchRepositoryManifest('https://example.com/repo.json', mockFetchCorrupted as typeof fetch),
    RepositoryValidationError
  );

  // Integrity mismatch
  const samplePkgPath = join('repository', 'packages', 'org.streamix.provider.sample-1.0.0.streamix-ext');
  await assert.rejects(
    () => verifyAndLoadPackage(samplePkgPath, '0'.repeat(64)),
    PackageIntegrityError
  );
});

test('Repository Builder: Future providers are automatically packaged and indexed', async () => {
  const tempProviderDir = join('packages', '_temp_future_provider');
  const tempManifest = {
    id: 'org.streamix.provider.futuretest',
    displayName: 'Future Test Provider',
    version: '1.0.0',
    description: 'Auto-discovery test provider',
    author: {
      name: 'Streamix Team',
      url: 'https://github.com/Swagsaiiff/streamix-extension-lab'
    },
    streamixApiVersion: '^1.0.0',
    entrypoint: 'src/index.ts',
    contentTypes: ['movie'],
    languages: ['en'],
    permissions: ['network:fetch']
  };

  try {
    await mkdir(join(tempProviderDir, 'src'), { recursive: true });
    await writeFile(join(tempProviderDir, 'manifest.json'), JSON.stringify(tempManifest, null, 2), 'utf-8');
    await writeFile(
      join(tempProviderDir, 'src', 'index.ts'),
      'export class FutureProvider { async initialize() {} }',
      'utf-8'
    );

    // Rebuild repository - should automatically discover, package, and index _temp_future_provider
    const updatedRepo = await buildRepository({
      repoDir: 'repository',
      packagesDir: 'packages'
    });

    const futureEntry = updatedRepo.extensions.find(e => e.id === 'org.streamix.provider.futuretest');
    assert.ok(futureEntry, 'Future provider must be automatically discovered and added to plugins.json');
    assert.equal(futureEntry.displayName, 'Future Test Provider');
    assert.equal(futureEntry.packageSha256.length, 64);

    // Package file must have been generated
    const expectedPkg = join('repository', 'packages', 'org.streamix.provider.futuretest-1.0.0.streamix-ext');
    assert.ok(existsSync(expectedPkg), 'Future provider package archive must exist');
  } finally {
    // Clean up temporary files
    await rm(tempProviderDir, { recursive: true, force: true });
    await rm(join('packages', 'org.streamix.provider.futuretest-1.0.0.streamix-ext'), { force: true });
    await rm(join('repository', 'packages', 'org.streamix.provider.futuretest-1.0.0.streamix-ext'), { force: true });

    // Restore clean repository state
    await buildRepository({
      repoDir: 'repository',
      packagesDir: 'packages'
    });
  }
});
