import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ExtensionManifest } from './types.ts';
import { assertValidManifest, validateManifest, type ValidationResult } from './validator.ts';
import { ManifestValidationError } from './errors.ts';

/**
 * Loads and validates an extension manifest from a file path.
 */
export async function loadManifestFromFile(manifestPath: string): Promise<ExtensionManifest> {
  const fullPath = resolve(manifestPath);
  let content: string;
  try {
    content = await readFile(fullPath, 'utf-8');
  } catch (err) {
    throw new ManifestValidationError([`Could not read manifest at ${fullPath}: ${(err as Error).message}`]);
  }

  return parseAndValidateManifest(content, fullPath);
}

/**
 * Parses and validates an extension manifest JSON string.
 */
export function parseAndValidateManifest(jsonString: string, origin?: string): ExtensionManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ManifestValidationError([`Invalid JSON in manifest${origin ? ` (${origin})` : ''}: ${(err as Error).message}`]);
  }

  assertValidManifest(parsed);
  return parsed;
}

export { validateManifest, type ValidationResult };
