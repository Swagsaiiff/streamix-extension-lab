# Streamix Extension Lab — CloudStream Compatible Providers

This subproject provides CloudStream 3 compatible provider extensions migrated from the upstream [CSX repository](https://github.com/SaurabhKaperwan/CSX), built into `.cs3` packages, and published through a single repository URL that can be added directly into CloudStream.

---

## 1. CloudStream Single Repository URL

To install these extensions in CloudStream:

1. Open **CloudStream 3** on your Android device or Android emulator.
2. Go to **Settings** → **Extensions**.
3. Tap **Add Repository**.
4. In the Repository URL field, enter the single repository URL:
   ```text
   https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/builds/repo.json
   ```
   *(Alternative alias: `https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/builds/CS.json`)*
5. Tap **Download**.
6. The **Streamix Providers** repository will appear with all 5 available extensions ready for installation.

---

## 2. Provider Inventory & Upstream Provenance

The following 5 providers have been migrated from the upstream CSX repository (`SaurabhKaperwan/CSX`):

| Provider | Version | Language | Target Content Types | Upstream Base URL | Verification Status |
|---|---|---|---|---|---|
| **Bollyflix** | v33 | Hindi (`hi`) | Movies, TvSeries, Anime, AsianDrama | `https://bollyflix.frl` | Build-tested; requires VPN in regions blocking Indian piracy TLDs |
| **CineStream** | v487 | English (`en`) | Movies, TvSeries, Anime, AsianDrama, Torrent | `https://cinemeta-catalogs.strem.io` | Build-tested; connects to Cinemeta metadata API |
| **MoviesDrive** | v33 | Hindi (`hi`) | Movies, TvSeries, Anime, AsianDrama | `https://moviesdrive.forum` | Build-tested; requires VPN / active ISP mirror |
| **Moviesmod** | v33 | Multi (`en`/`hi`) | Movies, TvSeries, Anime, AsianDrama | `https://moviesleech.rest`, `topmovies.pet` | Build-tested; includes Topmovies mirror |
| **VegaMovies** | v82 | Hindi (`hi`) | Movies, TvSeries, Anime, AsianDrama | `https://vegamovies.mq`, `rogmovies.vip` | Build-tested; includes Rogmovies & LuxMovies |

### Upstream Attribution & Licensing
- **Original Author**: `megix` / Saurabh Kaperwan ([CSX Repository](https://github.com/SaurabhKaperwan/CSX))
- **License**: GNU General Public License v3.0 (GPLv3).
- Full license terms are preserved in [`LICENSE`](./LICENSE).
- All original copyrights, package class names (`com.megix.*`), and source headers are preserved in compliance with GPLv3 section 4 and 5.

---

## 3. Repository Architecture & Contract

CloudStream repositories follow a two-tier JSON architecture:

1. **Repository Manifest (`repo.json` / `CS.json`)**:
   ```json
   {
     "name": "Streamix Providers",
     "description": "CloudStream-compatible provider extensions",
     "manifestVersion": 1,
     "pluginLists": [
       "https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/builds/plugins.json"
     ]
   }
   ```
2. **Plugin Index (`plugins.json`)**:
   Contains an array of extension descriptor objects. Each entry specifies:
   - `url`: Direct raw URL to the compiled `.cs3` package.
   - `version`: Monotonically increasing version integer.
   - `fileSize`: Exact byte length of the package.
   - `fileHash`: Cryptographic `sha256-<hex>` checksum.
   - `apiVersion`: Target CloudStream plugin API version (e.g. `1`).
   - `tvTypes`, `language`, `authors`, and `iconUrl`.

### Package Format (`.cs3`)
A `.cs3` file is a ZIP archive containing:
- `manifest.json`: Defines `pluginClassName`, `version`, and `name`.
- `classes.dex`: Compiled Android Dalvik bytecode containing the plugin class and its dependencies.

---

## 4. Building and Publishing

### Automated CI/CD (GitHub Actions)
The repository includes an automated workflow at [`.github/workflows/build-cloudstream.yml`](../.github/workflows/build-cloudstream.yml).
When changes are pushed to `main`, the workflow:
1. Sets up JDK 17 and the Android SDK on Ubuntu.
2. Executes `./gradlew make makePluginsJson`.
3. Validates package sizes and SHA-256 hashes.
4. Publishes `.cs3` binaries, `plugins.json`, and `repo.json` directly to the `builds` branch.

### Local Builds (Windows)
To build locally on Windows:
```powershell
# Prerequisites: JDK 17 (e.g. Eclipse Temurin or OpenJDK) and Android SDK Command-line Tools
cd cloudstream-compatible

# Execute build with Gradle wrapper
.\gradlew.bat make makePluginsJson

# Verify packages and integrity hashes
node --experimental-strip-types tools/verify-repository.ts builds
```

---

## 5. Verification Tools

We provide Node.js diagnostic tools inside `cloudstream-compatible/tools/`:

- **Verify Repository Integrity**:
  ```powershell
  node --experimental-strip-types cloudstream-compatible/tools/verify-repository.ts
  ```
  Validates that every `.cs3` package matches its declared size, SHA-256 hash, and internal Dalvik bytecode.

- **Test Live Provider Endpoints**:
  ```powershell
  node --experimental-strip-types cloudstream-compatible/tools/test-providers.ts
  ```
  Audits the reachability of upstream domains, reporting ISP blocks or Cloudflare challenge requirements.
