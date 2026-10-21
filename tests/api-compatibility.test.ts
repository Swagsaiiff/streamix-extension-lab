import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApiCompatibility, assertApiCompatibility } from '../sdk/src/validator.ts';
import { ApiVersionMismatchError } from '../sdk/src/errors.ts';
import type { ExtensionManifest } from '../sdk/src/types.ts';

test('API Compatibility: exact version matching', () => {
  const match = checkApiCompatibility('1.0.0', '1.0.0');
  assert.equal(match.compatible, true);

  const mismatch = checkApiCompatibility('1.1.0', '1.0.0');
  assert.equal(mismatch.compatible, false);
});

test('API Compatibility: caret (^) range handling', () => {
  // Compatible: same major, host minor/patch >= declared
  assert.equal(checkApiCompatibility('^1.0.0', '1.0.0').compatible, true);
  assert.equal(checkApiCompatibility('^1.0.0', '1.2.5').compatible, true);
  assert.equal(checkApiCompatibility('^1.1.0', '1.1.2').compatible, true);

  // Incompatible: major differs
  assert.equal(checkApiCompatibility('^1.0.0', '2.0.0').compatible, false);
  assert.equal(checkApiCompatibility('^2.0.0', '1.0.0').compatible, false);

  // Incompatible: host is older than required minimum
  assert.equal(checkApiCompatibility('^1.2.0', '1.1.0').compatible, false);
});

test('API Compatibility: tilde (~) range handling', () => {
  // Same major and minor, patch >= declared
  assert.equal(checkApiCompatibility('~1.0.0', '1.0.3').compatible, true);
  assert.equal(checkApiCompatibility('~1.0.2', '1.0.5').compatible, true);

  // Incompatible: minor differs
  assert.equal(checkApiCompatibility('~1.0.0', '1.1.0').compatible, false);
  assert.equal(checkApiCompatibility('~1.0.5', '1.0.2').compatible, false);
});

test('assertApiCompatibility throws ApiVersionMismatchError', () => {
  const dummyManifest = {
    id: 'org.streamix.test',
    streamixApiVersion: '^2.0.0'
  } as unknown as ExtensionManifest;

  assert.throws(
    () => assertApiCompatibility(dummyManifest, '1.0.0'),
    (err: unknown) =>
      err instanceof ApiVersionMismatchError &&
      err.declaredVersion === '^2.0.0' &&
      err.currentVersion === '1.0.0'
  );
});
