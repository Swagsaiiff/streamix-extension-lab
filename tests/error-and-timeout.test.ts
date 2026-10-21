import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionRunner } from '../sdk/src/runner.ts';
import { createExtensionContext } from '../sdk/src/context.ts';
import {
  ExtensionTimeoutError,
  PermissionDeniedError,
  ExtensionError
} from '../sdk/src/errors.ts';
import type { StreamixExtension, ExtensionManifest } from '../sdk/src/types.ts';

const PERMISSIONLESS_MANIFEST: ExtensionManifest = {
  id: 'org.streamix.test.permissionless',
  displayName: 'Permissionless Provider',
  version: '1.0.0',
  description: 'Provider without any permissions',
  author: 'Streamix Tester',
  streamixApiVersion: '^1.0.0',
  entrypoint: 'src/index.ts',
  contentTypes: ['movie'],
  languages: ['en'],
  permissions: [] // No permissions declared!
};

test('Permissions: fetch throws PermissionDeniedError when network:fetch is missing', async () => {
  const context = createExtensionContext({ manifest: PERMISSIONLESS_MANIFEST });
  await assert.rejects(
    async () => context.fetch('https://example.com'),
    (err: unknown) =>
      err instanceof PermissionDeniedError &&
      err.permission === 'network:fetch' &&
      err.code === 'PERMISSION_DENIED'
  );
});

test('Permissions: storage throws PermissionDeniedError when storage:local is missing', async () => {
  const context = createExtensionContext({ manifest: PERMISSIONLESS_MANIFEST });
  await assert.rejects(
    async () => context.storage.get('testKey'),
    (err: unknown) =>
      err instanceof PermissionDeniedError &&
      err.permission === 'storage:local' &&
      err.code === 'PERMISSION_DENIED'
  );

  await assert.rejects(
    async () => context.storage.set('testKey', 123),
    (err: unknown) =>
      err instanceof PermissionDeniedError &&
      err.permission === 'storage:local'
  );
});

test('Timeouts: runner aborts slow operations with ExtensionTimeoutError', async () => {
  const slowExtension: StreamixExtension = {
    initialize: async () => {},
    search: async () => {
      // Simulate hanging network request
      await new Promise(resolve => setTimeout(resolve, 500));
      return [];
    },
    getDetails: async () => { throw new Error('Unused'); },
    resolveSources: async () => { throw new Error('Unused'); }
  };

  const runner = new ExtensionRunner({
    manifest: PERMISSIONLESS_MANIFEST,
    extension: slowExtension,
    defaultTimeoutMs: 50 // Fast timeout
  });

  await runner.initialize();

  await assert.rejects(
    async () => runner.search('slow-query'),
    (err: unknown) =>
      err instanceof ExtensionTimeoutError &&
      err.code === 'EXTENSION_TIMEOUT' &&
      err.operation === 'search' &&
      err.timeoutMs === 50
  );
});

test('Runner: catches malformed provider responses', async () => {
  const brokenExtension: StreamixExtension = {
    initialize: async () => {},
    search: async () => {
      // Provider mistakenly returns object instead of array
      return { results: [] } as any;
    },
    getDetails: async () => { throw new Error('Unused'); },
    resolveSources: async () => { throw new Error('Unused'); }
  };

  const runner = new ExtensionRunner({
    manifest: PERMISSIONLESS_MANIFEST,
    extension: brokenExtension
  });

  await assert.rejects(
    async () => runner.search('broken'),
    (err: unknown) => err instanceof ExtensionError && err.code === 'MALFORMED_RESPONSE'
  );
});
