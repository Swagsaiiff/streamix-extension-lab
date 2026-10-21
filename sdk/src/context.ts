import type {
  ExtensionContext,
  ExtensionManifest,
  ExtensionLogger,
  ExtensionStorage
} from './types.ts';
import { PermissionDeniedError } from './errors.ts';

export interface CreateContextOptions {
  manifest: ExtensionManifest;
  signal?: AbortSignal;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  initialStorage?: Record<string, unknown>;
  onStorageChange?: (key: string, value: unknown) => void;
  customFetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export class MemoryExtensionStorage implements ExtensionStorage {
  private readonly data: Map<string, unknown>;
  private readonly onChange?: (key: string, value: unknown) => void;

  constructor(initialData?: Record<string, unknown>, onChange?: (key: string, value: unknown) => void) {
    this.data = new Map(Object.entries(initialData || {}));
    this.onChange = onChange;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const val = this.data.get(key);
    return val !== undefined ? (structuredClone(val) as T) : null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const cloned = structuredClone(value);
    this.data.set(key, cloned);
    this.onChange?.(key, cloned);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.onChange?.(key, undefined);
  }

  dump(): Record<string, unknown> {
    return Object.fromEntries(this.data.entries());
  }
}

export class ScopedExtensionLogger implements ExtensionLogger {
  private readonly prefix: string;
  private readonly level: 'debug' | 'info' | 'warn' | 'error';

  private static readonly LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(extensionId: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.prefix = `[ext:${extensionId}]`;
    this.level = level;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    return ScopedExtensionLogger.LEVELS[level] >= ScopedExtensionLogger.LEVELS[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`${this.prefix} [DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`${this.prefix} [INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`${this.prefix} [WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`${this.prefix} [ERROR] ${message}`, ...args);
    }
  }
}

/**
 * Creates an ExtensionContext for an extension, enforcing declared permissions
 * for network and local storage operations.
 */
export function createExtensionContext(options: CreateContextOptions): ExtensionContext {
  const { manifest, signal = new AbortController().signal, logLevel = 'info' } = options;

  const hasFetchPerm = manifest.permissions.includes('network:fetch');
  const hasStoragePerm = manifest.permissions.includes('storage:local');

  const logger = new ScopedExtensionLogger(manifest.id, logLevel);
  const internalStorage = new MemoryExtensionStorage(options.initialStorage, options.onStorageChange);

  const safeStorage: ExtensionStorage = {
    async get<T = unknown>(key: string): Promise<T | null> {
      if (!hasStoragePerm) {
        throw new PermissionDeniedError('storage:local', manifest.id);
      }
      return internalStorage.get<T>(key);
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      if (!hasStoragePerm) {
        throw new PermissionDeniedError('storage:local', manifest.id);
      }
      return internalStorage.set(key, value);
    },
    async delete(key: string): Promise<void> {
      if (!hasStoragePerm) {
        throw new PermissionDeniedError('storage:local', manifest.id);
      }
      return internalStorage.delete(key);
    }
  };

  const safeFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    if (!hasFetchPerm) {
      throw new PermissionDeniedError('network:fetch', manifest.id);
    }
    const fetchFn = options.customFetch || globalThis.fetch;
    return fetchFn(input, init);
  };

  return {
    manifest: Object.freeze({ ...manifest }),
    logger,
    storage: safeStorage,
    fetch: safeFetch,
    signal
  };
}
