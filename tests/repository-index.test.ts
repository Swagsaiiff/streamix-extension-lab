import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRepository, validateRepositoryIndex } from '../tools/repo-builder.ts';

test('Repository Index: validateRepositoryIndex structure checks', () => {
  const validIndex = {
    repository: {
      id: 'org.streamix.repo.test',
      name: 'Test Repo',
      version: '1.0.0',
      manifestVersion: 1
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

test('Repository Index: buildRepository generates valid plugins.json', async () => {
  const repo = await buildRepository({
    repoDir: 'repository',
    packagesDir: 'packages'
  });

  assert.equal(repo.repository.id, 'org.streamix.repository.lab');
  assert.ok(repo.extensions.length >= 1);

  const sampleEntry = repo.extensions.find(e => e.id === 'org.streamix.provider.sample');
  assert.ok(sampleEntry, 'Repository index must include sample provider');
  assert.equal(sampleEntry.version, '1.0.0');
  assert.equal(sampleEntry.packageSha256.length, 64);
  assert.ok(sampleEntry.packageSizeBytes > 0);

  // Check actual plugins.json file on disk
  const diskIndex = JSON.parse(await readFile(join('repository', 'plugins.json'), 'utf-8'));
  assert.equal(diskIndex.repository.id, 'org.streamix.repository.lab');
});
