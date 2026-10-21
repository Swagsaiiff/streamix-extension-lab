import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  createZipArchive,
  unpackZipArchive,
  computeSha256,
  verifyPackageIntegrity,
  packageExtension
} from '../tools/packager.ts';
import { PackageIntegrityError } from '../sdk/src/errors.ts';

test('Packager: in-memory ZIP creation and unpacking', () => {
  const originalFiles = [
    { path: 'manifest.json', data: Buffer.from('{"id":"test.ext"}', 'utf-8') },
    { path: 'src/index.js', data: Buffer.from('console.log("hello");', 'utf-8') }
  ];

  const archive = createZipArchive(originalFiles);
  assert.ok(archive.length > 0);

  const unpacked = unpackZipArchive(archive);
  assert.equal(unpacked.size, 2);
  assert.equal(unpacked.get('manifest.json')?.toString('utf-8'), '{"id":"test.ext"}');
  assert.equal(unpacked.get('src/index.js')?.toString('utf-8'), 'console.log("hello");');
});

test('Packager: packageExtension generates valid .streamix-ext and computes SHA-256', async () => {
  const sampleDir = 'examples/sample-provider';
  const outDir = 'temp-test-packages';

  const res = await packageExtension(sampleDir, outDir);
  assert.equal(res.manifest.id, 'org.streamix.provider.sample');
  assert.equal(res.sha256.length, 64);
  assert.ok(res.sizeBytes > 0);

  // Read generated file and verify checksum
  const fileBuf = await readFile(res.packagePath);
  assert.equal(computeSha256(fileBuf), res.sha256);

  // Verify unpack
  const files = unpackZipArchive(fileBuf);
  assert.ok(files.has('manifest.json'));
  assert.ok(files.has('package-meta.json'));
});

test('Packager: integrity verification passes and fails correctly', () => {
  const data = Buffer.from('content to verify');
  const validHash = computeSha256(data);

  // Valid hash should not throw
  assert.doesNotThrow(() => verifyPackageIntegrity(data, validHash));

  // Tampered hash throws PackageIntegrityError
  const tamperedHash = '0000000000000000000000000000000000000000000000000000000000000000';
  assert.throws(
    () => verifyPackageIntegrity(data, tamperedHash, 'org.streamix.test'),
    (err: unknown) =>
      err instanceof PackageIntegrityError &&
      err.code === 'PACKAGE_INTEGRITY_MISMATCH' &&
      err.expectedSha256 === tamperedHash &&
      err.actualSha256 === validHash
  );
});
