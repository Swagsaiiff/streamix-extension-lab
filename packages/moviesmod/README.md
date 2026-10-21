# Moviesmod Streamix Native Extension

Streamix-native provider extension for Moviesmod, ported from the CloudStream CSX provider repository.

## Metadata
- **Extension ID**: `org.streamix.provider.moviesmod`
- **Version**: `1.0.0`
- **Languages**: Hindi (`hi`), English (`en`)
- **Content Types**: `movie`, `series`, `anime`
- **Upstream Source**: [CSX / MoviesmodProvider.kt](https://github.com/SaurabhKaperwan/CSX)
- **Original Author**: `megix` / Saurabh Kaperwan
- **License**: GNU General Public License v3.0 (GPLv3)

## Capabilities
- Dynamic domain resolution via `urls.json` (`moviesmod` key)
- Search parsing of post cards (`<article>`)
- Cinemeta / Stremio metadata integration via IMDb link resolution
- Base64 URL parameter decoding for intermediate redirects
- Driveleech / Driveseed / GDFlix multi-server stream extraction
