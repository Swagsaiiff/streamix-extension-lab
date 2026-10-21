# MoviesDrive Streamix Native Extension

Streamix-native provider extension for MoviesDrive, ported from the CloudStream CSX provider repository.

## Metadata
- **Extension ID**: `org.streamix.provider.moviesdrive`
- **Version**: `1.0.0`
- **Languages**: Hindi (`hi`), English (`en`)
- **Content Types**: `movie`, `series`, `anime`
- **Upstream Source**: [CSX / MoviesDriveProvider.kt](https://github.com/SaurabhKaperwan/CSX)
- **Original Author**: `megix` / Saurabh Kaperwan
- **License**: GNU General Public License v3.0 (GPLv3)

## Capabilities
- Dynamic domain resolution via `urls.json` (`moviesdrive` key)
- Direct JSON search endpoint (`/search.php?q=`) with TMDB thumbnails and IMDb mapping
- Cinemeta / Stremio metadata integration
- HubCloud and GDFlix multi-server stream extraction (FSL, Pixeldrain, Direct, Cloud)
