# Streamix Extension Security & Execution Model

This document outlines the security architecture, threat model, permission system, and execution boundaries for Streamix Desktop extensions.

---

## 1. Threat Model & Untrusted Inputs

In a decentralized extension ecosystem like CloudStream or Streamix:
- Extensions are authored by third-party community developers.
- Repositories host user-contributed plugins over public HTTP/HTTPS endpoints.
- Attack vectors include:
  1. **Malicious code execution**: Attempting to read user files, SSH keys, or environment secrets (`.env`).
  2. **Denial of service / Resource exhaustion**: Infinite loops, unconstrained heap allocation, memory leaks.
  3. **Man-in-the-middle / Tampering**: Intercepted repository packages with altered source code.
  4. **Network abuse**: Sending unsolicited background traffic or port-scanning the local network.
  5. **Data fabrication**: Returning fake URLs or phishing prompts to the user.

Therefore, **all downloaded extensions, manifests, and package archives must be treated as untrusted input**.

---

## 2. Core Security Mitigations

### 2.1 Package Integrity & Verification
Every package published to a repository is hashed with SHA-256. 
1. When downloading an extension package, the host computes the SHA-256 hash of the incoming archive bytes.
2. If the computed hash does not match `packageSha256` in `plugins.json`, the package is immediately deleted and discarded (`PackageIntegrityError`).
3. Future updates will also support asymmetric signature validation (`Ed25519` / `RSA`) where the repository key signs the package hash.

### 2.2 Declared Permissions Model
Extensions must declare required capabilities in their manifest `permissions` list:
- `network:fetch`: Allows outgoing HTTP/HTTPS calls through the controlled `context.fetch()` wrapper.
- `storage:local`: Allows persistent key-value caching scoped strictly to the extension's isolated storage namespace.

**Runtime Enforcement**:
If an extension attempts to invoke `context.fetch()` or `context.storage` without the declared manifest permission, the SDK throws `PermissionDeniedError` immediately.

### 2.3 Operation Timeouts & AbortSignals
Third-party providers frequently hang due to dead mirrors or slow scrapers.
- All provider operations (`initialize`, `search`, `getDetails`, `resolveSources`) are executed inside the `ExtensionRunner` with an enforced timeout (default: 8–10 seconds).
- An internal `AbortController` is signaled when the timeout expires or when the user navigates away/cancels the request.
- Hanging operations throw a structured `ExtensionTimeoutError`.

### 2.4 Prevention of Secret Leakage
- Extension code does **not** have direct access to the application's root `.env` or process environment variables.
- Host credentials (such as user TMDB keys, internal session tokens) live server-side and are never injected into the `ExtensionContext`.

---

## 3. Sandboxing & Execution Isolation

### 3.1 Development Harness Environment
In the local development harness (`tools/harness.ts`), extensions run within the Node.js process using typed wrapper barriers (`ExtensionRunner`, `createExtensionContext`). 
While sufficient for rapid local development by trusted authors, **this in-process execution is not a security sandbox for untrusted third-party code**.

### 3.2 The Reality of JavaScript Workers & Node `vm`
It is a common misconception that Node.js `worker_threads` or the built-in `vm` module provide a security sandbox. **They do not**:
- **Node `vm`**: Explicitly documented by Node.js: *"The node:vm module is not a security mechanism. Do not use it to run untrusted code."* Attackers can easily escape the context via object prototype manipulation (`constructor.constructor('return process')()`).
- **`worker_threads`**: Runs in the same operating system process. A worker thread can crash the entire host process with `process.exit()`, corrupt shared buffers, or consume 100% of the host CPU without OS-level limits.

### 3.3 Proposed Production Architecture for Untrusted Extensions

To safely execute untrusted extensions in production, Streamix should adopt a multi-tier sandboxing model:

```text
┌────────────────────────────────────────────────────────┐
│               Streamix Main Application                │
│            (Electron Main + Express Server)            │
└──────────────────────────┬─────────────────────────────┘
                           │ IPC RPC (JSON-RPC over pipe)
┌──────────────────────────▼─────────────────────────────┐
│             Sandboxed Runner Process                   │
│  - OS-Level Isolation (Windows Job Object / AppContainer)
│  - Restricted tokens (No filesystem read/write except   │
│    isolated extension folder)                          │
│  - Network mediation (Only allowed outbound domains)    │
│  - V8 Memory Limit (--max-old-space-size=128)          │
│  - Strict CPU quota & hard process kill on timeout     │
└────────────────────────────────────────────────────────┘
```

#### Key Elements of the Production Architecture:
1. **Isolated Subprocess with Windows Job Objects**:
   Run the extension runner in a dedicated worker subprocess assigned to a Windows Job Object with memory limits (e.g. max 128 MB RAM) and CPU percentage limits.
2. **Restricted File System Access**:
   The worker subprocess is launched with a restricted token (or AppContainer isolation) preventing access to user documents, system directories, and Streamix application source files.
3. **RPC Communication**:
   The main process and the sandbox communicate purely through standard input/output streams using typed JSON-RPC. The extension never touches Node's `fs` module directly.
4. **V8 Engine Isolates (e.g. `isolated-vm`)**:
   Alternatively, run extension scripts in distinct V8 isolates using libraries like `isolated-vm`, where JavaScript contexts have no access to Node's C++ bindings, `process`, or global scope.

---

## 4. Legal & Content Safety Boundaries

Streamix extensions are strictly metadata scrapers and direct stream resolvers.
- Extensions **must not** contain DRM-circumvention tools, Widevine exploit code, or access-control bypasses.
- Extensions must only expose streams and subtitles that are publicly available from their respective providers.
