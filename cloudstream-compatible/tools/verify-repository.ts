import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { unpackZipArchive } from '../../tools/packager.ts';

interface PluginEntry {
  url: string;
  status: number;
  version: number;
  name: string;
  internalName: string;
  authors: string[];
  description: string;
  fileSize: number;
  repositoryUrl: string;
  language?: string;
  tvTypes: string[];
  iconUrl: string;
  apiVersion: number;
  fileHash: string;
}

interface RepoManifest {
  name: string;
  description: string;
  manifestVersion: number;
  pluginLists: string[];
}

export async function verifyCloudStreamRepo(buildsDir: string): Promise<boolean> {
  const fullPath = resolve(process.cwd(), buildsDir);
  console.log('===============================================================');
  console.log('     CLOUDSTREAM REPOSITORY & ARTIFACT INTEGRITY VERIFIER      ');
  console.log('===============================================================');
  console.log(`Directory: ${fullPath}\n`);

  let allPassed = true;

  // 1. Verify repo.json
  const repoPath = join(fullPath, 'repo.json');
  if (!existsSync(repoPath)) {
    console.error('✖ Missing repo.json');
    allPassed = false;
  } else {
    try {
      const repoContent: RepoManifest = JSON.parse(await readFile(repoPath, 'utf-8'));
      console.log(`✔ repo.json loaded:`);
      console.log(`    Name:             ${repoContent.name}`);
      console.log(`    Description:      ${repoContent.description}`);
      console.log(`    Manifest Version: ${repoContent.manifestVersion}`);
      console.log(`    Plugin Lists (${repoContent.pluginLists.length}):`);
      for (const listUrl of repoContent.pluginLists) {
        console.log(`      * ${listUrl}`);
      }
      if (!repoContent.pluginLists || repoContent.pluginLists.length === 0) {
        console.error('✖ repo.json pluginLists must not be empty');
        allPassed = false;
      }
    } catch (err) {
      console.error(`✖ Error parsing repo.json: ${(err as Error).message}`);
      allPassed = false;
    }
  }

  // 2. Verify plugins.json and packages
  const pluginsPath = join(fullPath, 'plugins.json');
  if (!existsSync(pluginsPath)) {
    console.error('✖ Missing plugins.json');
    return false;
  }

  const plugins: PluginEntry[] = JSON.parse(await readFile(pluginsPath, 'utf-8'));
  console.log(`\n✔ plugins.json loaded with ${plugins.length} extension(s):\n`);

  for (const plugin of plugins) {
    const filename = `${plugin.internalName}.cs3`;
    const cs3Path = join(fullPath, filename);

    console.log(`--- [${plugin.name} v${plugin.version}] ---`);
    console.log(`  Target File:     ${filename}`);
    console.log(`  Download URL:    ${plugin.url}`);
    console.log(`  Declared Size:   ${plugin.fileSize} bytes`);
    console.log(`  Declared Hash:   ${plugin.fileHash}`);
    console.log(`  Authors:         ${plugin.authors.join(', ')}`);
    console.log(`  Supported Types: ${plugin.tvTypes.join(', ')}`);

    if (!existsSync(cs3Path)) {
      console.error(`  ✖ ERROR: File does not exist: ${cs3Path}`);
      allPassed = false;
      continue;
    }

    const fileBuffer = await readFile(cs3Path);
    const actualSize = fileBuffer.length;
    const actualHash = 'sha256-' + createHash('sha256').update(fileBuffer).digest('hex');

    // Verify Size
    if (actualSize !== plugin.fileSize) {
      console.error(`  ✖ Size mismatch: expected ${plugin.fileSize}, got ${actualSize}`);
      allPassed = false;
    } else {
      console.log(`  ✔ Size verified: ${actualSize} bytes`);
    }

    // Verify Hash
    if (actualHash.toLowerCase() !== plugin.fileHash.toLowerCase()) {
      console.error(`  ✖ SHA-256 hash mismatch:`);
      console.error(`      Expected: ${plugin.fileHash}`);
      console.error(`      Actual:   ${actualHash}`);
      allPassed = false;
    } else {
      console.log(`  ✔ SHA-256 integrity hash verified`);
    }

    // Inspect internal .cs3 zip package contents
    try {
      const unpacked = unpackZipArchive(fileBuffer);
      const manifestFile = unpacked.get('manifest.json');
      const dexFile = unpacked.get('classes.dex');

      if (!manifestFile) {
        console.error(`  ✖ Missing internal manifest.json in ${filename}`);
        allPassed = false;
      } else {
        const cs3Manifest = JSON.parse(manifestFile.toString('utf-8'));
        console.log(`  ✔ Internal manifest.json: pluginClassName="${cs3Manifest.pluginClassName}"`);
      }

      if (!dexFile) {
        console.error(`  ✖ Missing classes.dex in ${filename}`);
        allPassed = false;
      } else {
        console.log(`  ✔ Dalvik bytecode present: classes.dex (${dexFile.length} bytes)`);
      }
    } catch (err) {
      console.error(`  ✖ Error reading .cs3 archive: ${(err as Error).message}`);
      allPassed = false;
    }
  }

  console.log('\n===============================================================');
  if (allPassed) {
    console.log('       ALL CLOUDSTREAM REPOSITORY VERIFICATIONS PASSED        ');
  } else {
    console.error('       SOME CLOUDSTREAM VERIFICATION CHECKS FAILED           ');
  }
  console.log('===============================================================\n');

  return allPassed;
}

// Direct CLI run
const isDirectRun = process.argv[1]?.endsWith('verify-repository.ts');
if (isDirectRun) {
  const dir = process.argv[2] || 'cloudstream-compatible/builds';
  verifyCloudStreamRepo(dir).then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
