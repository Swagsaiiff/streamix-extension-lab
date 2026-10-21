/**
 * Streamix Extension Repository Discovery & Consumer SDK
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  RepositoryMetadata,
  RepositoryIndex,
  ExtensionIndexEntry,
  ExtensionManifest
} from './types.ts';
import {
  RepositoryError,
  RepositoryValidationError,
  PackageIntegrityError
} from './errors.ts';
import { assertValidManifest, assertApiCompatibility } from './validator.ts';
import { computeSha256, unpackZipArchive, verifyPackageIntegrity } from '../../tools/packager.ts';

const REVERSE_DNS_REGEX = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;

/**
 * Safely resolves relative or absolute URLs/paths against a base URL or file path.
 */
export function resolveUrl(baseUrl: string, relativeOrAbsolute: string): string {
  if (!relativeOrAbsolute) return baseUrl;

  // If already an absolute URI with protocol (e.g. https://, http://, file://)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }

  // HTTP or HTTPS base URL
  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return new URL(relativeOrAbsolute, baseUrl).href;
  }

  // File URI
  if (baseUrl.startsWith('file://')) {
    return new URL(relativeOrAbsolute, baseUrl).href;
  }

  // Local filesystem path
  const baseDir = (baseUrl.endsWith('.json') || baseUrl.endsWith('.streamix-ext'))
    ? dirname(baseUrl)
    : baseUrl;
  return join(baseDir, relativeOrAbsolute).replace(/\\/g, '/');
}

/**
 * Validates a repository manifest against structural requirements.
 */
export function validateRepositoryManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Repository manifest must be a non-null object'] };
  }

  const m = manifest as Record<string, unknown>;
  if (!m.id || typeof m.id !== 'string') {
    errors.push("Missing or invalid 'id' string");
  } else if (!REVERSE_DNS_REGEX.test(m.id)) {
    errors.push(`Invalid repository 'id' format: '${m.id}'. Must be reverse-DNS.`);
  }

  if (!m.name || typeof m.name !== 'string' || !m.name.trim()) {
    errors.push("Missing or invalid 'name' string");
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push("Missing or invalid 'version' string");
  }

  if (typeof m.manifestVersion !== 'number' || m.manifestVersion < 1) {
    errors.push("Missing or invalid numeric 'manifestVersion'");
  }

  if (m.pluginLists !== undefined) {
    if (!Array.isArray(m.pluginLists) || m.pluginLists.some(p => typeof p !== 'string' || !p.trim())) {
      errors.push("'pluginLists' must be an array of non-empty strings");
    }
  }

  if (m.pluginsUrl !== undefined && (typeof m.pluginsUrl !== 'string' || !m.pluginsUrl.trim())) {
    errors.push("'pluginsUrl' must be a non-empty string");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Asserts that a value conforms to RepositoryMetadata.
 */
export function assertValidRepositoryManifest(manifest: unknown): asserts manifest is RepositoryMetadata {
  const result = validateRepositoryManifest(manifest);
  if (!result.valid) {
    throw new RepositoryValidationError(result.errors);
  }
}

/**
 * Validates a repository catalog index (plugins.json).
 */
export function validateRepositoryIndex(index: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!index || typeof index !== 'object') {
    return { valid: false, errors: ['Repository index must be a non-null object'] };
  }

  const idx = index as Record<string, unknown>;
  const repoValidation = validateRepositoryManifest(idx.repository);
  if (!repoValidation.valid) {
    errors.push(...repoValidation.errors.map(e => `repository.${e}`));
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
      if (!ext.displayName || typeof ext.displayName !== 'string') errors.push(`Extension at index ${i} missing 'displayName'`);
      if (!ext.version || typeof ext.version !== 'string') errors.push(`Extension at index ${i} missing 'version'`);
      if (!ext.streamixApiVersion || typeof ext.streamixApiVersion !== 'string') errors.push(`Extension at index ${i} missing 'streamixApiVersion'`);
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
 * Asserts that a value conforms to RepositoryIndex.
 */
export function assertValidRepositoryIndex(index: unknown): asserts index is RepositoryIndex {
  const result = validateRepositoryIndex(index);
  if (!result.valid) {
    throw new RepositoryValidationError(result.errors);
  }
}

/**
 * Discovers the catalog (plugins.json) URL from a repository manifest.
 */
export function discoverCatalogUrl(repoManifest: RepositoryMetadata, repoManifestUrl: string): string {
  const catalogPath = (repoManifest.pluginLists && repoManifest.pluginLists.length > 0)
    ? repoManifest.pluginLists[0]
    : (repoManifest.pluginsUrl || 'plugins.json');

  return resolveUrl(repoManifestUrl, catalogPath);
}

/**
 * Helper to fetch text or buffer from either HTTP/HTTPS or local filesystem.
 */
async function fetchResource(
  urlOrPath: string,
  customFetch: typeof fetch = fetch
): Promise<{ text: () => Promise<string>; buffer: () => Promise<Buffer> }> {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const res = await customFetch(urlOrPath);
    if (!res.ok) {
      throw new RepositoryError(`HTTP request failed for '${urlOrPath}' with status ${res.status} ${res.statusText}`);
    }
    return {
      text: () => res.text(),
      buffer: async () => Buffer.from(await res.arrayBuffer())
    };
  }

  // Local filesystem path or file:// URL
  const localPath = urlOrPath.startsWith('file://') ? fileURLToPath(urlOrPath) : urlOrPath;
  const buf = await readFile(localPath);
  return {
    text: async () => buf.toString('utf-8'),
    buffer: async () => buf
  };
}

/**
 * Fetches and validates a repository manifest (repository.json).
 */
export async function fetchRepositoryManifest(
  repoUrl: string,
  customFetch: typeof fetch = fetch
): Promise<RepositoryMetadata> {
  const resource = await fetchResource(repoUrl, customFetch);
  const rawText = await resource.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new RepositoryError(`Failed to parse repository manifest JSON from '${repoUrl}': ${(err as Error).message}`);
  }

  assertValidRepositoryManifest(parsed);
  return parsed;
}

/**
 * Discovers and fetches the complete repository catalog (plugins.json) using a single repository URL or manifest.
 */
export async function fetchRepositoryCatalog(
  manifestOrUrl: RepositoryMetadata | string,
  repoBaseUrl?: string,
  customFetch: typeof fetch = fetch
): Promise<{ catalog: RepositoryIndex; catalogUrl: string }> {
  let manifest: RepositoryMetadata;
  let manifestUrl: string;

  if (typeof manifestOrUrl === 'string') {
    manifestUrl = manifestOrUrl;
    manifest = await fetchRepositoryManifest(manifestUrl, customFetch);
  } else {
    manifest = manifestOrUrl;
    manifestUrl = repoBaseUrl || manifest.homepageUrl || 'repository.json';
  }

  const catalogUrl = discoverCatalogUrl(manifest, manifestUrl);
  const resource = await fetchResource(catalogUrl, customFetch);
  const rawText = await resource.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new RepositoryError(`Failed to parse repository catalog JSON from '${catalogUrl}': ${(err as Error).message}`);
  }

  assertValidRepositoryIndex(parsed);
  return { catalog: parsed, catalogUrl };
}

/**
 * Resolves a package URL for a given catalog entry against the catalog URL.
 */
export function resolvePackageUrl(entry: ExtensionIndexEntry, catalogUrl: string): string {
  return resolveUrl(catalogUrl, entry.packageUrl);
}

/**
 * Downloads a package, verifies cryptographic SHA-256 integrity, extracts manifest, and checks API compatibility.
 */
export async function verifyAndLoadPackage(
  packageUrl: string,
  expectedSha256: string,
  customFetch: typeof fetch = fetch
): Promise<{ buffer: Buffer; manifest: ExtensionManifest }> {
  const resource = await fetchResource(packageUrl, customFetch);
  const buffer = await resource.buffer();

  // 1. Verify SHA-256 integrity
  verifyPackageIntegrity(buffer, expectedSha256);

  // 2. Unpack archive to read manifest.json
  const unpacked = unpackZipArchive(buffer);
  const manifestBuf = unpacked.get('manifest.json');
  if (!manifestBuf) {
    throw new RepositoryError(`Corrupted extension package at '${packageUrl}': missing manifest.json`);
  }

  const manifest = JSON.parse(manifestBuf.toString('utf-8'));
  assertValidManifest(manifest);
  assertApiCompatibility(manifest);

  return { buffer, manifest };
}
