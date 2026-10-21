# Streamix Extension Lab & SDK

The **Streamix Extension Lab** is an isolated, standalone extension development project for building, packaging, testing, and distributing native video provider extensions for Streamix Desktop.

Inspired by CloudStream's modular architecture, this project allows video providers to be authored, versioned, updated, and tested completely independently of the Streamix Desktop application and UI internals.

> **Important**: This project is strictly isolated inside `streamix-extension-lab/`. It does not modify existing Streamix application files, provider registries, or dependency lockfiles.

---

## Key Features

- **Native TypeScript SDK**: Modern, typed interfaces (`StreamixExtension`, `ExtensionContext`, normalized media models).
- **Zero-Dependency Core Tools**: Manifest validation, package creation, ZIP compression/decompression, and repository indexing implemented using standard Node.js built-ins (`node:zlib`, `node:crypto`, `node:fs`).
- **Comprehensive Manifest Schema**: Strict schema validation (`schemas/extension-manifest.schema.json`) with declared permissions (`network:fetch`, `storage:local`), content types, and SemVer compatibility.
- **Controlled Sample Extension**: A runnable reference provider (`examples/sample-provider`) using legitimate open media fixtures (Blender Foundation films and open HLS/VTT test streams).
- **Independent Development Harness**: Test search, details, episode navigation, and source resolution without launching Electron or the React UI.
- **Package & Integrity Verification**: Bundles extensions into `.streamix-ext` packages with cryptographic SHA-256 verification.
- **Repository Ecosystem**: CloudStream-inspired repository manifest (`repository.json`) and plugin index (`plugins.json`) for distributing extensions.
- **Documented Security Architecture**: Thorough threat analysis, permission gates, timeouts, cancellation, and production sandboxing roadmap.

---

## Directory Structure

```text
streamix-extension-lab/
├── sdk/                         # Streamix Extension SDK source
│   └── src/
│       ├── types.ts             # Normalized data models and interfaces
│       ├── constants.ts         # Supported formats, qualities, versions
│       ├── errors.ts            # Standardized error hierarchy
│       ├── validator.ts         # Schema, SemVer, and model validators
│       ├── context.ts           # Permission-gated execution context
│       ├── runner.ts            # Operation runner with timeouts & aborts
│       ├── manifest.ts          # Manifest file loader and parser
│       └── index.ts             # Public SDK entrypoint
├── schemas/
│   ├── extension-manifest.schema.json # Extension manifest JSON schema
│   └── repository-index.schema.json   # Repository plugins.json schema
├── examples/
│   └── sample-provider/         # Reference sample extension
│       ├── manifest.json        # Extension manifest
│       ├── package.json         # Extension package metadata
│       ├── tsconfig.json        # TypeScript configuration
│       ├── src/
│       │   ├── fixtures.ts      # Open media fixtures & public test streams
│       │   └── index.ts         # StreamixExtension implementation
│       └── tests/
│           └── sample-provider.test.ts # Provider unit tests
├── packages/                    # Built .streamix-ext distribution packages
├── repository/                  # Local sample extension repository
│   ├── repository.json          # Repository manifest
│   ├── plugins.json             # Extension index with SHA-256 hashes
│   └── packages/                # Hosted .streamix-ext packages
├── tools/
│   ├── validator-cli.ts         # CLI tool to validate extension manifests
│   ├── packager.ts              # Bundles and computes SHA-256 checksums
│   ├── repo-builder.ts          # Generates plugins.json repository index
│   └── harness.ts               # Local development testing harness
├── docs/
│   ├── EXTENSION_GUIDE.md       # Guide for extension authors
│   ├── SECURITY_AND_EXECUTION_MODEL.md # Threat model & sandboxing
│   └── STREAMIX_INTEGRATION_SPEC.md    # Integration plan for Streamix
├── tests/                       # Automated test suite
│   ├── manifest-validation.test.ts
│   ├── api-compatibility.test.ts
│   ├── normalized-models.test.ts
│   ├── error-and-timeout.test.ts
│   ├── packager-and-integrity.test.ts
│   └── repository-index.test.ts
├── package.json                 # Project configuration & npm scripts
├── tsconfig.json                # Project TypeScript configuration
└── README.md                    # This documentation file
```

---

## Developer Workflow Commands

All commands are run from inside the `streamix-extension-lab/` directory:

| Command | Description |
|---|---|
| `npm run build:sdk` | Validates TypeScript types across the SDK and tools (`tsc --noEmit`). |
| `npm run validate:manifest` | Validates an extension's `manifest.json` against schema and API compatibility. |
| `npm run harness` | Runs the local development harness to test the sample provider. |
| `npm run package:sample` | Bundles the sample extension into `packages/*.streamix-ext` with SHA-256. |
| `npm run build:repo` | Updates the local sample repository (`repository/plugins.json`). |
| `npm test` | Executes the complete automated test suite (35+ test cases). |
| `npm run check` | Runs full typecheck and automated test suite. |

---

## The Extension Manifest

Each extension requires a `manifest.json` at its root:

```json
{
  "id": "org.streamix.provider.sample",
  "displayName": "Streamix Open Lab Fixture Provider",
  "version": "1.0.0",
  "description": "Reference development sample provider for testing extension SDK interfaces.",
  "author": {
    "name": "Streamix Core Team",
    "url": "https://github.com/recloudstream/cloudstream"
  },
  "streamixApiVersion": "^1.0.0",
  "entrypoint": "src/index.ts",
  "contentTypes": ["movie", "series"],
  "languages": ["en"],
  "permissions": ["network:fetch", "storage:local"],
  "icon": "assets/icon.png",
  "repositoryUrl": "https://github.com/Swagsaiiff/streamix-desktop"
}
```

### Key Fields:
- **`id`**: Reverse-DNS format (e.g. `org.streamix.provider.<name>`).
- **`streamixApiVersion`**: Host API compatibility range (`^1.0.0`, `~1.0.0`, or exact `1.0.0`).
- **`contentTypes`**: Allowed: `"movie"`, `"series"`, `"anime"`, `"live"`.
- **`permissions`**: Required access declarations (`"network:fetch"`, `"storage:local"`). Unrequested access will be denied at runtime.

---

## Local Development Harness

The development harness allows testing providers without running the desktop app or backend servers:

```bash
# Test default sample provider
node --experimental-strip-types tools/harness.ts

# Test a custom extension directory
node --experimental-strip-types tools/harness.ts --ext path/to/my-extension

# Query a specific term and inspect details
node --experimental-strip-types tools/harness.ts --query "steel" --details "fixture-tears-of-steel"
```

The harness exercises:
1. Manifest parsing and schema validation
2. Dynamic entrypoint loading
3. Extension `initialize()` lifecycle
4. Search result normalization
5. Media details retrieval
6. Season & episode tree resolution
7. Video source & subtitle extraction
8. Structured error handling (`ItemNotFoundError`, `SourceUnavailableError`)
9. Clean resource disposal (`dispose()`)

---

## Packaging and Repository Model

### 1. Packaging
Extensions are packaged into `.streamix-ext` archives (standard ZIP format with uncompressed or deflate streams):
```bash
node --experimental-strip-types tools/packager.ts examples/sample-provider packages
```
The output file is named `<id>-<version>.streamix-ext` and outputs its cryptographic SHA-256 hash and byte size.

### 2. Repository Index
Repositories maintain a `plugins.json` index:
```bash
node --experimental-strip-types tools/repo-builder.ts repository packages
```
The resulting `plugins.json` lists extension metadata, download URLs, and SHA-256 checksums to guarantee package integrity.

---

## Native Streamix Ported Providers

All 5 providers from the upstream CSX repository have been ported into the native Streamix TypeScript extension ecosystem under `packages/`:

| Provider | Extension ID | Target Types | Source Base URL | Status | Package |
|---|---|---|---|---|---|
| **Bollyflix** | `org.streamix.provider.bollyflix` | `movie`, `series`, `anime` | `https://bollyflix.co.za` | Build & Fixture Tested; Live tested | `packages/org.streamix.provider.bollyflix-1.0.0.streamix-ext` |
| **CineStream** | `org.streamix.provider.cinestream` | `movie`, `series`, `anime` | `https://v3-cinemeta.strem.io` | Build & Fixture Tested; Live tested | `packages/org.streamix.provider.cinestream-1.0.0.streamix-ext` |
| **MoviesDrive** | `org.streamix.provider.moviesdrive` | `movie`, `series`, `anime` | `https://new3.moviesdrive.beer` | Build & Fixture Tested; Live tested | `packages/org.streamix.provider.moviesdrive-1.0.0.streamix-ext` |
| **Moviesmod** | `org.streamix.provider.moviesmod` | `movie`, `series`, `anime` | `https://moviesmod.uk.com` | Build & Fixture Tested; Live tested | `packages/org.streamix.provider.moviesmod-1.0.0.streamix-ext` |
| **VegaMovies** | `org.streamix.provider.vegamovies` | `movie`, `series`, `anime` | `https://1vegamovies.pics` | Build & Fixture Tested; Live tested | `packages/org.streamix.provider.vegamovies-1.0.0.streamix-ext` |

### Upstream Attribution and License
- **Original Implementations**: `megix` / Saurabh Kaperwan ([CSX Repository](https://github.com/SaurabhKaperwan/CSX))
- **License**: GNU General Public License v3.0 (GPLv3).
- Attribution and corresponding source availability are preserved in each package (`manifest.json`, `README.md`, `src/index.ts`).

---

## Native Streamix Repository Manifest & Index

The native Streamix repository is generated directly from build artifacts in `repository/`:
- **Repository Manifest**: `repository/repository.json`
- **Extension Index**: `repository/plugins.json` (lists metadata, versions, SHA-256 checksums, and package byte sizes)
- **Built Packages**: `repository/packages/*.streamix-ext`

### Hosting Instructions:
To host the Streamix native repository on GitHub Pages or GitHub Raw:
1. Push `repository/` to GitHub (`main` or `gh-pages` branch).
2. The single Streamix repository manifest URL is:
   ```text
   https://raw.githubusercontent.com/<owner>/<repo>/main/repository/repository.json
   ```
   Or GitHub Pages URL:
   ```text
   https://<owner>.github.io/<repo>/repository.json
   ```

---

## CloudStream-Compatible Extensions & Single Repository URL

The lab also includes a CloudStream 3 compatible subproject in [`cloudstream-compatible/`](./cloudstream-compatible/README.md) hosting `.cs3` packages:
- **Single CloudStream Repository URL**:
  ```text
  https://raw.githubusercontent.com/Swagsaiiff/streamix-extension-lab/builds/repo.json
  ```

---

## Future Streamix Application Integration

This lab provides the foundation for future integration into Streamix Desktop:
1. **Main Process Extension Host**: Electron main process will manage downloading, verifying (SHA-256), and staging extension bundles in user data directories.
2. **Server-Side Execution**: Node server will execute extensions in an isolated runner with timeouts and permission gates, mapping results to the internal Streamix playback pipeline.
3. **Desktop Settings UI**: An "Extensions" panel will allow users to add repository URLs and install/update extensions with one click.

