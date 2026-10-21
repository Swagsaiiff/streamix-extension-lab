/**
 * Standardized error classes for the Streamix Extension System.
 */

export class ExtensionError extends Error {
  public readonly code: string;
  public readonly extensionId?: string;

  constructor(message: string, code: string = 'EXTENSION_ERROR', extensionId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.extensionId = extensionId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ManifestValidationError extends ExtensionError {
  public readonly errors: string[];

  constructor(errors: string[], extensionId?: string) {
    super(`Manifest validation failed: ${errors.join('; ')}`, 'MANIFEST_VALIDATION_ERROR', extensionId);
    this.errors = errors;
  }
}

export class ApiVersionMismatchError extends ExtensionError {
  public readonly declaredVersion: string;
  public readonly currentVersion: string;

  constructor(declaredVersion: string, currentVersion: string, extensionId?: string) {
    super(
      `Extension API version mismatch: declared '${declaredVersion}', but host supports '${currentVersion}'`,
      'API_VERSION_MISMATCH',
      extensionId
    );
    this.declaredVersion = declaredVersion;
    this.currentVersion = currentVersion;
  }
}

export class ItemNotFoundError extends ExtensionError {
  public readonly itemId: string;

  constructor(itemId: string, extensionId?: string) {
    super(`Item '${itemId}' not found in provider`, 'ITEM_NOT_FOUND', extensionId);
    this.itemId = itemId;
  }
}

export class SourceUnavailableError extends ExtensionError {
  public readonly reason?: string;

  constructor(message: string, reason?: string, extensionId?: string) {
    super(message, 'SOURCE_UNAVAILABLE', extensionId);
    this.reason = reason;
  }
}

export class ExtensionTimeoutError extends ExtensionError {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(operation: string, timeoutMs: number, extensionId?: string) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'EXTENSION_TIMEOUT',
      extensionId
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class PermissionDeniedError extends ExtensionError {
  public readonly permission: string;

  constructor(permission: string, extensionId?: string) {
    super(
      `Permission denied: extension did not declare permission '${permission}' in its manifest`,
      'PERMISSION_DENIED',
      extensionId
    );
    this.permission = permission;
  }
}

export class PackageIntegrityError extends ExtensionError {
  public readonly expectedSha256: string;
  public readonly actualSha256: string;

  constructor(expectedSha256: string, actualSha256: string, extensionId?: string) {
    super(
      `Package integrity verification failed: expected hash '${expectedSha256}', but got '${actualSha256}'`,
      'PACKAGE_INTEGRITY_MISMATCH',
      extensionId
    );
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}
