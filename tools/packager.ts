import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { loadManifestFromFile } from '../sdk/src/manifest.ts';
import { assertValidManifest, assertApiCompatibility } from '../sdk/src/validator.ts';
import { STREAMIX_CURRENT_API_VERSION } from '../sdk/src/constants.ts';
import { PackageIntegrityError } from '../sdk/src/errors.ts';
import type { ExtensionManifest } from '../sdk/src/types.ts';

export interface PackageFileEntry {
  path: string; // Relative path inside the archive (forward slashes)
  data: Buffer;
}

export interface PackageResult {
  packagePath: string;
  manifest: ExtensionManifest;
  sha256: string;
  sizeBytes: number;
  files: string[];
}

/**
 * Computes SHA-256 hash (hex) of a buffer or file.
 */
export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verifies package buffer against expected SHA-256 hash.
 */
export function verifyPackageIntegrity(buffer: Buffer, expectedSha256: string, extensionId?: string): void {
  const actual = computeSha256(buffer);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new PackageIntegrityError(expectedSha256, actual, extensionId);
  }
}

/**
 * Lightweight, zero-dependency ZIP archive creator using built-in node:zlib.
 */
export function createZipArchive(entries: PackageFileEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.path.replace(/\\/g, '/'), 'utf-8');
    const uncompressedData = entry.data;
    const fileCrc = crc32(uncompressedData);

    // Deflate compression
    const compressedData = deflateRawSync(uncompressedData);
    const useDeflate = compressedData.length < uncompressedData.length;
    const finalData = useDeflate ? compressedData : uncompressedData;
    const method = useDeflate ? 8 : 0; // 8 = Deflate, 0 = Store

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + fileNameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(method, 8);     // compression method
    localHeader.writeUInt16LE(0, 10);         // last mod time
    localHeader.writeUInt16LE(0, 12);         // last mod date
    localHeader.writeUInt32LE(fileCrc, 14);   // crc32
    localHeader.writeUInt32LE(finalData.length, 18);        // compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(fileNameBuf.length, 26);      // filename length
    localHeader.writeUInt16LE(0, 28);                       // extra field length
    fileNameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, finalData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + fileNameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);         // version made by
    centralHeader.writeUInt16LE(20, 6);         // version needed
    centralHeader.writeUInt16LE(0, 8);          // flags
    centralHeader.writeUInt16LE(method, 10);    // method
    centralHeader.writeUInt16LE(0, 12);         // mod time
    centralHeader.writeUInt16LE(0, 14);         // mod date
    centralHeader.writeUInt32LE(fileCrc, 16);   // crc32
    centralHeader.writeUInt32LE(finalData.length, 20);        // compressed size
    centralHeader.writeUInt32LE(uncompressedData.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);      // filename length
    centralHeader.writeUInt16LE(0, 30);         // extra length
    centralHeader.writeUInt16LE(0, 32);         // comment length
    centralHeader.writeUInt16LE(0, 34);         // disk start
    centralHeader.writeUInt16LE(0, 36);         // internal attr
    centralHeader.writeUInt32LE(0, 38);         // external attr
    centralHeader.writeUInt32LE(offset, 42);    // relative offset of local header
    fileNameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + finalData.length;
  }

  const centralDirOffset = offset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);  // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12); // size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of central dir
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

/**
 * Extracts and parses a ZIP archive created by createZipArchive into in-memory file entries.
 */
export function unpackZipArchive(archiveBuffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // Find EOCD (search from back)
  let eocdOffset = -1;
  for (let i = archiveBuffer.length - 22; i >= 0; i--) {
    if (archiveBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid archive: End of Central Directory (EOCD) not found');
  }

  const totalEntries = archiveBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = archiveBuffer.readUInt32LE(eocdOffset + 16);

  let currentOffset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    const signature = archiveBuffer.readUInt32LE(currentOffset);
    if (signature !== 0x02014b50) {
      throw new Error(`Invalid central directory header signature at offset ${currentOffset}`);
    }

    const method = archiveBuffer.readUInt16LE(currentOffset + 10);
    const compressedSize = archiveBuffer.readUInt32LE(currentOffset + 20);
    const uncompressedSize = archiveBuffer.readUInt32LE(currentOffset + 24);
    const nameLen = archiveBuffer.readUInt16LE(currentOffset + 28);
    const extraLen = archiveBuffer.readUInt16LE(currentOffset + 30);
    const commentLen = archiveBuffer.readUInt16LE(currentOffset + 32);
    const localHeaderOffset = archiveBuffer.readUInt32LE(currentOffset + 42);

    const name = archiveBuffer.toString('utf-8', currentOffset + 46, currentOffset + 46 + nameLen);

    // Read local header to locate data
    const localNameLen = archiveBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = archiveBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawData = archiveBuffer.subarray(dataStart, dataStart + compressedSize);

    let extractedData: Buffer;
    if (method === 0) {
      extractedData = Buffer.from(rawData);
    } else if (method === 8) {
      extractedData = inflateRawSync(rawData);
    } else {
      throw new Error(`Unsupported compression method ${method} for file ${name}`);
    }

    files.set(name, extractedData);
    currentOffset += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

/**
 * Packages an extension directory into a .streamix-ext package file.
 */
export async function packageExtension(
  extensionDir: string,
  outputDir: string
): Promise<PackageResult> {
  const extPath = resolve(process.cwd(), extensionDir);
  const manifestPath = join(extPath, 'manifest.json');

  const manifest = await loadManifestFromFile(manifestPath);
  assertValidManifest(manifest);
  assertApiCompatibility(manifest, STREAMIX_CURRENT_API_VERSION);

  const entries: PackageFileEntry[] = [];

  // Add manifest.json
  const manifestContent = await readFile(manifestPath);
  entries.push({ path: 'manifest.json', data: manifestContent });

  // Add entrypoint file and its surrounding sources/dist
  const entrypointFull = join(extPath, manifest.entrypoint);
  if (!existsSync(entrypointFull)) {
    throw new Error(`Extension entrypoint '${manifest.entrypoint}' does not exist at: ${entrypointFull}`);
  }

  // Helper to recursively collect files
  async function collectFiles(dir: string, baseDir: string) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === 'node_modules' || item.name === 'tests' || item.name === '.git') {
          continue;
        }
        await collectFiles(full, baseDir);
      } else {
        if (item.name === 'manifest.json') continue; // already added at root
        const rel = relative(baseDir, full).replace(/\\/g, '/');
        const buf = await readFile(full);
        entries.push({ path: rel, data: buf });
      }
    }
  }

  // Include src/ (or dist/), assets if present, and README.md
  if (existsSync(join(extPath, 'src'))) {
    await collectFiles(join(extPath, 'src'), extPath);
  }
  if (existsSync(join(extPath, 'dist'))) {
    await collectFiles(join(extPath, 'dist'), extPath);
  }
  if (existsSync(join(extPath, 'assets'))) {
    await collectFiles(join(extPath, 'assets'), extPath);
  }
  if (existsSync(join(extPath, 'README.md'))) {
    const readmeBuf = await readFile(join(extPath, 'README.md'));
    entries.push({ path: 'README.md', data: readmeBuf });
  }

  // Create package-meta.json
  const meta = {
    packageVersion: '1.0.0',
    extensionId: manifest.id,
    extensionVersion: manifest.version,
    streamixApiVersion: manifest.streamixApiVersion,
    buildTimestamp: new Date().toISOString(),
    files: entries.map(e => e.path)
  };
  entries.push({
    path: 'package-meta.json',
    data: Buffer.from(JSON.stringify(meta, null, 2), 'utf-8')
  });

  const archiveBuffer = createZipArchive(entries);
  const sha256 = computeSha256(archiveBuffer);

  const outDir = resolve(process.cwd(), outputDir);
  await mkdir(outDir, { recursive: true });

  const packageFileName = `${manifest.id}-${manifest.version}.streamix-ext`;
  const packagePath = join(outDir, packageFileName);
  await writeFile(packagePath, archiveBuffer);

  return {
    packagePath,
    manifest,
    sha256,
    sizeBytes: archiveBuffer.length,
    files: entries.map(e => e.path)
  };
}

// CLI execution if called directly
async function main() {
  const args = process.argv.slice(2);
  const extDir = args[0] || 'examples/sample-provider';
  const outDir = args[1] || 'packages';

  console.log('--------------------------------------------------');
  console.log(`Streamix Extension Packager`);
  console.log(`Source: ${extDir}`);
  console.log(`Output: ${outDir}`);
  console.log('--------------------------------------------------');

  try {
    const result = await packageExtension(extDir, outDir);
    console.log(`\nPackage created successfully!`);
    console.log(`File: ${result.packagePath}`);
    console.log(`Size: ${result.sizeBytes} bytes`);
    console.log(`SHA-256: ${result.sha256}`);
    console.log(`Files included (${result.files.length}):`);
    for (const f of result.files) {
      console.log(`  - ${f}`);
    }
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error(`\nPackaging FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isDirectRun || process.argv[1]?.endsWith('packager.ts')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
