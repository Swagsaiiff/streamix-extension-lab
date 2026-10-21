# VegaMovies Streamix Native Extension

Streamix-native provider extension for VegaMovies, ported from the CloudStream CSX provider repository.

## Metadata
- **Extension ID**: `org.streamix.provider.vegamovies`
- **Version**: `1.0.0`
- **Languages**: Hindi (`hi`), English (`en`)
- **Content Types**: `movie`, `series`, `anime`
- **Upstream Source**: [CSX / VegaMoviesProvider.kt](https://github.com/SaurabhKaperwan/CSX)
- **Original Author**: `megix` / Saurabh Kaperwan
- **License**: GNU General Public License v3.0 (GPLv3)

## Capabilities
- Dynamic domain resolution via `urls.json` (`vegamovies` key)
- Dual search pipeline: JSON API (`/search.php?q=`) with seamless fallback to HTML query (`/?s=`)
- Cinemeta / Stremio metadata integration via IMDb link resolution
- V-Cloud, HubCloud, and GDFlix multi-server stream extraction
