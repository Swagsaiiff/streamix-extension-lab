import type {
  ExtensionManifest,
  SearchResultItem,
  MediaDetails,
  ResolvedSourceResult,
  ContentType,
  ExtensionPermission,
  VideoQuality,
  VideoFormat,
  SubtitleFormat
} from './types.ts';
import {
  STREAMIX_CURRENT_API_VERSION,
  EXTENSION_ID_PATTERN,
  SEMVER_PATTERN,
  API_VERSION_SPEC_PATTERN,
  SUPPORTED_CONTENT_TYPES,
  SUPPORTED_PERMISSIONS,
  SUPPORTED_VIDEO_QUALITIES,
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_SUBTITLE_FORMATS
} from './constants.ts';
import {
  ManifestValidationError,
  ApiVersionMismatchError
} from './errors.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Checks compatibility between an extension's declared API version spec and the host API version.
 * Supports exact semver ('1.0.0'), caret ranges ('^1.0.0'), and tilde ranges ('~1.0.0').
 */
export function checkApiCompatibility(
  declaredSpec: string,
  hostVersion: string = STREAMIX_CURRENT_API_VERSION
): { compatible: boolean; reason?: string } {
  if (!declaredSpec || typeof declaredSpec !== 'string') {
    return { compatible: false, reason: 'Declared API version is missing or not a string' };
  }

  const match = declaredSpec.trim().match(API_VERSION_SPEC_PATTERN);
  if (!match) {
    return { compatible: false, reason: `Invalid API version format '${declaredSpec}'` };
  }

  const prefix = match[1] || '';
  const decMajor = parseInt(match[2], 10);
  const decMinor = parseInt(match[3], 10);
  const decPatch = parseInt(match[4], 10);

  const hostMatch = hostVersion.match(SEMVER_PATTERN);
  if (!hostMatch) {
    return { compatible: false, reason: `Invalid host API version '${hostVersion}'` };
  }

  const hostMajor = parseInt(hostMatch[1], 10);
  const hostMinor = parseInt(hostMatch[2], 10);
  const hostPatch = parseInt(hostMatch[3], 10);

  if (prefix === '^') {
    // Caret: must match major; host must be >= declared
    if (decMajor !== hostMajor) {
      return {
        compatible: false,
        reason: `Major version mismatch: extension requires ^${decMajor}, host is ${hostMajor}`
      };
    }
    if (hostMinor < decMinor || (hostMinor === decMinor && hostPatch < decPatch)) {
      return {
        compatible: false,
        reason: `Host version ${hostVersion} is older than minimum required ${decMajor}.${decMinor}.${decPatch}`
      };
    }
    return { compatible: true };
  }

  if (prefix === '~') {
    // Tilde: must match major and minor
    if (decMajor !== hostMajor || decMinor !== hostMinor) {
      return {
        compatible: false,
        reason: `Minor version mismatch: extension requires ~${decMajor}.${decMinor}, host is ${hostMajor}.${hostMinor}`
      };
    }
    if (hostPatch < decPatch) {
      return {
        compatible: false,
        reason: `Host patch ${hostPatch} is older than minimum required ${decPatch}`
      };
    }
    return { compatible: true };
  }

  // Exact version match required
  if (decMajor !== hostMajor || decMinor !== hostMinor || decPatch !== hostPatch) {
    return {
      compatible: false,
      reason: `Exact version mismatch: extension declared ${declaredSpec}, host is ${hostVersion}`
    };
  }

  return { compatible: true };
}

/**
 * Validates an extension manifest object against the Streamix Extension specification.
 */
export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a non-null JSON object'] };
  }

  const m = manifest as Record<string, unknown>;

  // id
  if (typeof m.id !== 'string' || !m.id) {
    errors.push("Missing or non-string 'id'");
  } else if (!EXTENSION_ID_PATTERN.test(m.id)) {
    errors.push(`Invalid 'id' format: '${m.id}'. Must be reverse-DNS, e.g. 'org.streamix.provider.sample'`);
  }

  // displayName
  if (typeof m.displayName !== 'string' || !m.displayName.trim()) {
    errors.push("Missing or empty 'displayName'");
  } else if (m.displayName.length > 100) {
    errors.push("'displayName' exceeds maximum length of 100 characters");
  }

  // version
  if (typeof m.version !== 'string' || !m.version) {
    errors.push("Missing or non-string 'version'");
  } else if (!SEMVER_PATTERN.test(m.version)) {
    errors.push(`Invalid 'version' semver format: '${m.version}'`);
  }

  // description
  if (typeof m.description !== 'string' || !m.description.trim()) {
    errors.push("Missing or empty 'description'");
  } else if (m.description.length > 500) {
    errors.push("'description' exceeds maximum length of 500 characters");
  }

  // author
  if (!m.author) {
    errors.push("Missing 'author'");
  } else if (typeof m.author === 'string') {
    if (!m.author.trim()) errors.push("'author' string cannot be empty");
  } else if (typeof m.author === 'object') {
    const authObj = m.author as Record<string, unknown>;
    if (typeof authObj.name !== 'string' || !authObj.name.trim()) {
      errors.push("Author object must contain a non-empty 'name' property");
    }
  } else {
    errors.push("'author' must be a string or author object");
  }

  // streamixApiVersion
  if (typeof m.streamixApiVersion !== 'string' || !m.streamixApiVersion) {
    errors.push("Missing or non-string 'streamixApiVersion'");
  } else if (!API_VERSION_SPEC_PATTERN.test(m.streamixApiVersion)) {
    errors.push(`Invalid 'streamixApiVersion' format: '${m.streamixApiVersion}'`);
  }

  // entrypoint
  if (typeof m.entrypoint !== 'string' || !m.entrypoint.trim()) {
    errors.push("Missing or empty 'entrypoint'");
  }

  // contentTypes
  if (!Array.isArray(m.contentTypes) || m.contentTypes.length === 0) {
    errors.push("'contentTypes' must be a non-empty array");
  } else {
    for (const ct of m.contentTypes) {
      if (!SUPPORTED_CONTENT_TYPES.includes(ct as ContentType)) {
        errors.push(`Unsupported content type '${ct}'. Allowed: ${SUPPORTED_CONTENT_TYPES.join(', ')}`);
      }
    }
  }

  // languages
  if (!Array.isArray(m.languages) || m.languages.length === 0) {
    errors.push("'languages' must be a non-empty array of ISO language codes");
  } else {
    for (const lang of m.languages) {
      if (typeof lang !== 'string' || !lang.trim()) {
        errors.push("Each entry in 'languages' must be a non-empty string");
      }
    }
  }

  // permissions
  if (!Array.isArray(m.permissions)) {
    errors.push("'permissions' must be an array of permissions");
  } else {
    for (const p of m.permissions) {
      if (!SUPPORTED_PERMISSIONS.includes(p as ExtensionPermission)) {
        errors.push(`Unsupported permission '${p}'. Allowed: ${SUPPORTED_PERMISSIONS.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Asserts that the given manifest object is valid, or throws ManifestValidationError.
 */
export function assertValidManifest(manifest: unknown): asserts manifest is ExtensionManifest {
  const result = validateManifest(manifest);
  if (!result.valid) {
    const extId = (manifest && typeof manifest === 'object' && 'id' in manifest)
      ? String((manifest as Record<string, unknown>).id)
      : undefined;
    throw new ManifestValidationError(result.errors, extId);
  }
}

/**
 * Asserts API compatibility, throwing ApiVersionMismatchError if incompatible.
 */
export function assertApiCompatibility(
  manifest: ExtensionManifest,
  hostVersion: string = STREAMIX_CURRENT_API_VERSION
): void {
  const comp = checkApiCompatibility(manifest.streamixApiVersion, hostVersion);
  if (!comp.compatible) {
    throw new ApiVersionMismatchError(manifest.streamixApiVersion, hostVersion, manifest.id);
  }
}

/**
 * Normalizes and validates a search result item.
 */
export function validateSearchResultItem(item: unknown, index?: number): SearchResultItem {
  if (!item || typeof item !== 'object') {
    throw new Error(`Search result at index ${index ?? 0} must be a non-null object`);
  }
  const i = item as Record<string, unknown>;
  if (typeof i.id !== 'string' || !i.id.trim()) {
    throw new Error(`Search result item missing or invalid 'id' at index ${index ?? 0}`);
  }
  if (typeof i.title !== 'string' || !i.title.trim()) {
    throw new Error(`Search result item missing or invalid 'title' for id '${i.id}'`);
  }
  if (!SUPPORTED_CONTENT_TYPES.includes(i.type as ContentType)) {
    throw new Error(`Search result item has unsupported type '${i.type}' for id '${i.id}'`);
  }

  return {
    id: i.id.trim(),
    title: i.title.trim(),
    type: i.type as ContentType,
    ...(typeof i.posterUrl === 'string' && i.posterUrl.trim() ? { posterUrl: i.posterUrl.trim() } : {}),
    ...(typeof i.releaseYear === 'number' && Number.isFinite(i.releaseYear) ? { releaseYear: i.releaseYear } : {}),
    ...(Array.isArray(i.languages) ? { languages: i.languages.filter(l => typeof l === 'string') } : {}),
    ...(i.providerContext && typeof i.providerContext === 'object' ? { providerContext: i.providerContext as Record<string, unknown> } : {})
  };
}

/**
 * Normalizes and validates media details.
 */
export function validateMediaDetails(details: unknown): MediaDetails {
  if (!details || typeof details !== 'object') {
    throw new Error('Media details must be a non-null object');
  }
  const d = details as Record<string, unknown>;
  if (typeof d.id !== 'string' || !d.id.trim()) {
    throw new Error("Media details missing or invalid 'id'");
  }
  if (typeof d.title !== 'string' || !d.title.trim()) {
    throw new Error("Media details missing or invalid 'title'");
  }
  if (!SUPPORTED_CONTENT_TYPES.includes(d.type as ContentType)) {
    throw new Error(`Media details has unsupported type '${d.type}'`);
  }

  const normalized: MediaDetails = {
    id: d.id.trim(),
    title: d.title.trim(),
    type: d.type as ContentType,
    ...(typeof d.description === 'string' && d.description.trim() ? { description: d.description.trim() } : {}),
    ...(typeof d.posterUrl === 'string' && d.posterUrl.trim() ? { posterUrl: d.posterUrl.trim() } : {}),
    ...(typeof d.bannerUrl === 'string' && d.bannerUrl.trim() ? { bannerUrl: d.bannerUrl.trim() } : {}),
    ...(typeof d.releaseYear === 'number' && Number.isFinite(d.releaseYear) ? { releaseYear: d.releaseYear } : {}),
    ...(Array.isArray(d.genres) ? { genres: d.genres.filter(g => typeof g === 'string') } : {}),
    ...(d.status === 'ongoing' || d.status === 'completed' || d.status === 'released' ? { status: d.status } : {})
  };

  if (Array.isArray(d.seasons)) {
    normalized.seasons = d.seasons.map((s, idx) => {
      const so = s as Record<string, unknown>;
      return {
        seasonNumber: typeof so.seasonNumber === 'number' ? so.seasonNumber : idx + 1,
        ...(typeof so.name === 'string' ? { name: so.name } : {}),
        ...(typeof so.episodeCount === 'number' ? { episodeCount: so.episodeCount } : {})
      };
    });
  }

  if (Array.isArray(d.episodes)) {
    normalized.episodes = d.episodes.map((ep, idx) => {
      const epo = ep as Record<string, unknown>;
      return {
        id: typeof epo.id === 'string' ? epo.id : `ep-${idx + 1}`,
        seasonNumber: typeof epo.seasonNumber === 'number' ? epo.seasonNumber : 1,
        episodeNumber: typeof epo.episodeNumber === 'number' ? epo.episodeNumber : idx + 1,
        ...(typeof epo.title === 'string' ? { title: epo.title } : {}),
        ...(typeof epo.description === 'string' ? { description: epo.description } : {}),
        ...(typeof epo.thumbnail === 'string' ? { thumbnail: epo.thumbnail } : {}),
        ...(typeof epo.releaseDate === 'string' ? { releaseDate: epo.releaseDate } : {})
      };
    });
  }

  return normalized;
}

/**
 * Normalizes and validates resolved sources.
 */
export function validateResolvedSourceResult(result: unknown): ResolvedSourceResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Resolved source result must be a non-null object');
  }
  const r = result as Record<string, unknown>;

  if (!Array.isArray(r.sources)) {
    throw new Error("Resolved sources must contain a 'sources' array");
  }

  const validSources = r.sources.map((s, idx) => {
    if (!s || typeof s !== 'object') {
      throw new Error(`Video source at index ${idx} must be an object`);
    }
    const so = s as Record<string, unknown>;
    if (typeof so.url !== 'string' || !so.url.trim()) {
      throw new Error(`Video source at index ${idx} missing or invalid 'url'`);
    }
    const quality = (so.quality as VideoQuality) || 'auto';
    if (!SUPPORTED_VIDEO_QUALITIES.includes(quality)) {
      throw new Error(`Invalid video quality '${so.quality}' at index ${idx}`);
    }
    const format = (so.format as VideoFormat) || 'hls';
    if (!SUPPORTED_VIDEO_FORMATS.includes(format)) {
      throw new Error(`Invalid video format '${so.format}' at index ${idx}`);
    }

    return {
      url: so.url.trim(),
      quality,
      format,
      ...(typeof so.isLive === 'boolean' ? { isLive: so.isLive } : {}),
      ...(so.headers && typeof so.headers === 'object' ? { headers: so.headers as Record<string, string> } : {}),
      ...(Array.isArray(so.audioTracks) ? { audioTracks: so.audioTracks as any[] } : {})
    };
  });

  const validSubtitles = Array.isArray(r.subtitles)
    ? r.subtitles.map((sub, idx) => {
        if (!sub || typeof sub !== 'object') {
          throw new Error(`Subtitle at index ${idx} must be an object`);
        }
        const subo = sub as Record<string, unknown>;
        if (typeof subo.url !== 'string' || !subo.url.trim()) {
          throw new Error(`Subtitle at index ${idx} missing 'url'`);
        }
        if (typeof subo.language !== 'string' || !subo.language.trim()) {
          throw new Error(`Subtitle at index ${idx} missing 'language'`);
        }
        const format = (subo.format as SubtitleFormat) || 'vtt';
        if (!SUPPORTED_SUBTITLE_FORMATS.includes(format)) {
          throw new Error(`Unsupported subtitle format '${subo.format}' at index ${idx}`);
        }
        return {
          url: subo.url.trim(),
          language: subo.language.trim(),
          format,
          ...(typeof subo.label === 'string' ? { label: subo.label } : {})
        };
      })
    : [];

  return {
    sources: validSources,
    subtitles: validSubtitles,
    ...(r.headers && typeof r.headers === 'object' ? { headers: r.headers as Record<string, string> } : {})
  };
}
