/**
 * SDK constants and versioning details.
 */

export const STREAMIX_CURRENT_API_VERSION = '1.0.0';

export const SUPPORTED_CONTENT_TYPES = ['movie', 'series', 'anime', 'live'] as const;

export const SUPPORTED_PERMISSIONS = ['network:fetch', 'storage:local'] as const;

export const SUPPORTED_VIDEO_QUALITIES = ['360p', '480p', '720p', '1080p', '4k', 'auto', 'unknown'] as const;

export const SUPPORTED_VIDEO_FORMATS = ['hls', 'mp4', 'mkv', 'dash'] as const;

export const SUPPORTED_SUBTITLE_FORMATS = ['vtt', 'srt', 'ass'] as const;

export const EXTENSION_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;

export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const API_VERSION_SPEC_PATTERN = /^(\^|~)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
