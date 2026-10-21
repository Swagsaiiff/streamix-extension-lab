import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, assertValidManifest } from '../sdk/src/validator.ts';
import { ManifestValidationError } from '../sdk/src/errors.ts';
import type { ExtensionManifest } from '../sdk/src/types.ts';

const VALID_MANIFEST: ExtensionManifest = {
  id: 'org.streamix.provider.test',
  displayName: 'Test Provider',
  version: '1.2.3',
  description: 'A test extension for unit testing',
  author: 'Streamix Tester',
  streamixApiVersion: '^1.0.0',
  entrypoint: 'src/index.ts',
  contentTypes: ['movie', 'series'],
  languages: ['en'],
  permissions: ['network:fetch', 'storage:local']
};

test('Manifest Validation: valid manifests', () => {
  const res = validateManifest(VALID_MANIFEST);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.doesNotThrow(() => assertValidManifest(VALID_MANIFEST));
});

test('Manifest Validation: author object format', () => {
  const manifestWithObjAuthor = {
    ...VALID_MANIFEST,
    author: {
      name: 'Streamix Team',
      url: 'https://streamix.org',
      email: 'dev@streamix.org'
    }
  };
  const res = validateManifest(manifestWithObjAuthor);
  assert.equal(res.valid, true);
});

test('Manifest Validation: missing required fields', () => {
  const requiredKeys = [
    'id',
    'displayName',
    'version',
    'description',
    'author',
    'streamixApiVersion',
    'entrypoint',
    'contentTypes',
    'languages',
    'permissions'
  ] as const;

  for (const key of requiredKeys) {
    const invalid = { ...VALID_MANIFEST };
    delete (invalid as any)[key];
    const res = validateManifest(invalid);
    assert.equal(res.valid, false, `Should fail when '${key}' is missing`);
    assert.ok(res.errors.some(e => e.toLowerCase().includes(key.toLowerCase())));
  }
});

test('Manifest Validation: invalid ID formats', () => {
  const badIds = [
    'invalid-no-dot',
    'INVALID.UPPERCASE',
    'org.streamix space',
    '',
    '.starts.with.dot',
    'ends.with.dot.'
  ];

  for (const id of badIds) {
    const res = validateManifest({ ...VALID_MANIFEST, id });
    assert.equal(res.valid, false, `ID '${id}' should be invalid`);
  }
});

test('Manifest Validation: invalid SemVer versions', () => {
  const badVersions = ['1.0', 'v1.0.0', 'alpha', '1.0.0.0', ''];
  for (const version of badVersions) {
    const res = validateManifest({ ...VALID_MANIFEST, version });
    assert.equal(res.valid, false, `Version '${version}' should be invalid SemVer`);
  }
});

test('Manifest Validation: unsupported content types', () => {
  const res = validateManifest({
    ...VALID_MANIFEST,
    contentTypes: ['movie', 'audiobook' as any]
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('audiobook')));
});

test('Manifest Validation: unsupported permissions', () => {
  const res = validateManifest({
    ...VALID_MANIFEST,
    permissions: ['network:fetch', 'system:filesystem-root' as any]
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('system:filesystem-root')));
});

test('assertValidManifest throws structured ManifestValidationError', () => {
  assert.throws(
    () => assertValidManifest({ id: 'bad' }),
    (err: unknown) => err instanceof ManifestValidationError && err.code === 'MANIFEST_VALIDATION_ERROR'
  );
});
