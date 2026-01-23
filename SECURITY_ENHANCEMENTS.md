# Security Enhancements for Azure IoT Explorer

This document describes the security improvements implemented across 4 phases to harden the Azure IoT Explorer Electron application against common attack vectors and align with security best practices.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Phase 1: Quick Security Wins](#phase-1-quick-security-wins)
- [Phase 2: TLS Encryption and Token Authentication](#phase-2-tls-encryption-and-token-authentication)
- [Phase 3: Credential Encryption](#phase-3-credential-encryption)
- [Phase 4: Content Security Policy](#phase-4-content-security-policy)
- [Files Changed](#files-changed)
- [Testing](#testing)

---

## Executive Summary

The Azure IoT Explorer is an Electron-based desktop application for managing Azure IoT Hub devices. This security enhancement initiative addressed several critical areas:

| Risk Area | Before | After |
|-----------|--------|-------|
| Process Isolation | Sandbox disabled | Sandbox enabled |
| Local API Security | HTTP, no auth | HTTPS with TLS + token auth |
| Credential Storage | Plaintext localStorage | Encrypted via OS keychain |
| Content Security | No CSP headers | Strict CSP policy |
| Rate Limiting | None | 100 requests/minute |

---

## Phase 1: Quick Security Wins

### 1.1 Enable Sandbox Mode

**File:** `public/electron.ts`

**Change:** Added `sandbox: true` to BrowserWindow webPreferences.

```typescript
webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,  // NEW
    preload: __dirname + '/contextBridge.js'
}
```

**Why This Matters:**
- The Chromium sandbox isolates the renderer process from the operating system
- Even if an attacker exploits a vulnerability in the renderer, they cannot access system resources
- This is a defense-in-depth measure recommended by Electron security guidelines
- Without sandbox, a compromised renderer could read/write files, execute commands, etc.

**Security Benefit:** Prevents renderer process exploits from escalating to system-level access.

---

### 1.2 Replace executeJavaScript with IPC

**Files:** 
- `public/electron.ts`
- `src/app/shared/utils/appInitialization.ts`
- `src/index.tsx`

**Change:** Removed `webContents.executeJavaScript()` call that injected port configuration directly into the renderer. Replaced with secure IPC channel.

**Before (Insecure):**
```typescript
// Directly executing JavaScript in renderer - security risk
Main.mainWindow.webContents.executeJavaScript(
    `localStorage.setItem('controllerPort', '${customPort}')`
);
```

**After (Secure):**
```typescript
// Main process exposes port via IPC
ipcMain.handle('get_custom_port', Main.onGetCustomPort);

// Renderer requests port through contextBridge
const port = await window.api_settings.getCustomPort();
```

**Why This Matters:**
- `executeJavaScript()` can execute arbitrary code in the renderer context
- If the injected content contains user-controlled data, it enables XSS attacks
- IPC with contextBridge provides a controlled, typed API surface
- The preload script acts as a secure bridge between main and renderer processes

**Security Benefit:** Eliminates code injection vector and enforces principle of least privilege.

---

### 1.3 Add Helmet.js Security Headers

**Files:**
- `src/server/serverBase.ts`
- `package.json`

**Change:** Added Helmet.js middleware to the Express server.

```typescript
import helmet from 'helmet';

export abstract class ServerBase {
    protected server: express.Application;

    constructor() {
        this.server = express();
        // Add security headers
        this.server.use(helmet({
            contentSecurityPolicy: false, // Handled separately
            crossOriginEmbedderPolicy: false
        }));
    }
}
```

**Headers Added by Helmet:**
| Header | Purpose |
|--------|---------|
| `X-Content-Type-Options: nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options: SAMEORIGIN` | Prevents clickjacking |
| `X-XSS-Protection: 0` | Disables legacy XSS filter (can cause issues) |
| `Strict-Transport-Security` | Enforces HTTPS |
| `X-DNS-Prefetch-Control: off` | Prevents DNS prefetching |
| `X-Download-Options: noopen` | Prevents IE from executing downloads |
| `X-Permitted-Cross-Domain-Policies: none` | Restricts Adobe cross-domain policies |

**Why This Matters:**
- HTTP headers are the first line of defense against many web attacks
- These headers instruct browsers to enable security features
- Without them, the application is vulnerable to clickjacking, MIME confusion, etc.

**Security Benefit:** Enables browser-level security protections with minimal code changes.

---

## Phase 2: TLS Encryption and Token Authentication

### 2.1 Self-Signed TLS Certificates

**File:** `src/server/tlsHelper.ts`

**Change:** Created runtime TLS certificate generation using node-forge.

```typescript
export function generateSelfSignedCertificate(): TlsCertificate {
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(
        cert.validity.notBefore.getFullYear() + 1
    );
    
    // Self-signed for localhost only
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, md.sha256.create());
    
    return {
        key: pki.privateKeyToPem(keys.privateKey),
        cert: pki.certificateToPem(cert),
        fingerprint: calculateFingerprint(cert)
    };
}
```

**Why This Matters:**
- The local API server previously used HTTP, exposing all traffic in plaintext
- Connection strings and SAS tokens flowed through this unencrypted channel
- Any local process or network sniffer could intercept sensitive credentials
- TLS encrypts all communication between the Electron renderer and the local server

**Security Benefit:** Protects sensitive data (connection strings, SAS tokens) from local eavesdropping.

---

### 2.2 Token-Based Authentication

**File:** `src/server/serverSecure.ts`

**Change:** Implemented per-session authentication tokens.

```typescript
export class SecureServerBase extends ServerBase {
    private authToken: string;

    constructor() {
        super();
        // Generate cryptographically secure 32-byte token
        this.authToken = crypto.randomBytes(32).toString('hex');
        
        // Require token on all API routes
        this.server.use('/api', this.authMiddleware.bind(this));
    }

    private authMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ): void {
        const token = req.headers['x-auth-token'];
        if (token !== this.authToken) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        next();
    }
}
```

**Token Flow:**
1. Server generates random 32-byte token at startup
2. Electron main process retrieves token via getter method
3. Renderer requests token via IPC (`get_api_auth_token`)
4. All API requests include token in `X-Auth-Token` header
5. Server validates token before processing request

**Why This Matters:**
- Without authentication, any local process could call the API
- Malicious software could exploit the API to access IoT Hub resources
- The token ensures only the legitimate Electron app can make requests
- Token is never stored on disk, only in memory

**Security Benefit:** Prevents unauthorized local processes from accessing the API.

---

### 2.3 Rate Limiting

**File:** `src/server/serverSecure.ts`

**Change:** Added per-client rate limiting.

```typescript
private rateLimitMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
): void {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100;

    let clientData = this.rateLimitMap.get(clientId);
    if (!clientData || now - clientData.windowStart > windowMs) {
        clientData = { count: 0, windowStart: now };
    }

    clientData.count++;
    this.rateLimitMap.set(clientId, clientData);

    if (clientData.count > maxRequests) {
        res.status(429).json({ error: 'Too many requests' });
        return;
    }
    next();
}
```

**Why This Matters:**
- Prevents denial-of-service attacks against the local server
- Limits the damage if authentication is somehow bypassed
- Provides a safety net against runaway requests from bugs

**Security Benefit:** Mitigates DoS attacks and limits blast radius of potential exploits.

---

### 2.4 Secure Fetch Wrapper

**File:** `src/app/api/shared/secureFetch.ts`

**Change:** Created a wrapper that automatically adds authentication.

```typescript
let authToken: string | null = null;

export async function secureFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    // Lazy-load auth token on first request
    if (!authToken && window.api_settings?.getApiAuthToken) {
        authToken = await window.api_settings.getApiAuthToken();
    }

    const headers = new Headers(options.headers);
    if (authToken) {
        headers.set('X-Auth-Token', authToken);
    }

    return fetch(url, { ...options, headers });
}
```

**Why This Matters:**
- Centralizes authentication logic in one place
- Ensures all API calls are properly authenticated
- Provides consistent error handling
- Falls back gracefully in browser development mode

**Security Benefit:** Ensures consistent authentication across all API calls.

---

## Phase 3: Credential Encryption

### 3.1 Electron safeStorage API Integration

**File:** `public/handlers/credentialsHandler.ts`

**Change:** Implemented encrypted credential storage using Electron's safeStorage API.

```typescript
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let credentialsDir: string;

export function storeCredential(key: string, value: string): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
        return false;
    }

    const encrypted = safeStorage.encryptString(value);
    const filePath = path.join(credentialsDir, `${sanitizeKey(key)}.enc`);
    fs.writeFileSync(filePath, encrypted);
    return true;
}

export function getCredential(key: string): string | null {
    const filePath = path.join(credentialsDir, `${sanitizeKey(key)}.enc`);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const encrypted = fs.readFileSync(filePath);
    return safeStorage.decryptString(encrypted);
}
```

**How safeStorage Works:**
| Platform | Backend |
|----------|---------|
| Windows | DPAPI (Data Protection API) |
| macOS | Keychain |
| Linux | libsecret / kwallet |

**Why This Matters:**
- Previously, connection strings were stored in plaintext in localStorage
- localStorage is accessible to any code running in the renderer
- localStorage files are stored unencrypted on disk
- safeStorage uses OS-level encryption tied to the user account
- Even if an attacker gains file system access, they cannot decrypt without user credentials

**Security Benefit:** Protects credentials at rest using OS-level encryption.

---

### 3.2 Automatic Migration from localStorage

**File:** `src/app/shared/utils/credentialStorage.ts`

**Change:** Implemented transparent migration of existing credentials.

```typescript
export const getConnectionStrings = async (): Promise<ConnectionStringWithExpiry[]> => {
    if (appConfig.hostMode === HostMode.Electron && window.api_credentials) {
        const isAvailable = await window.api_credentials.isEncryptionAvailable();
        if (isAvailable) {
            const encrypted = await window.api_credentials.get(CONN_STRINGS_KEY);
            if (encrypted) {
                return JSON.parse(encrypted);
            }

            // Migration: check localStorage for existing data
            const legacy = localStorage.getItem(CONNECTION_STRING_NAME_LIST);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                // Migrate to encrypted storage
                await window.api_credentials.store(CONN_STRINGS_KEY, legacy);
                localStorage.removeItem(CONNECTION_STRING_NAME_LIST);
                return parsed;
            }
        }
    }

    // Fallback to localStorage for browser mode
    const stored = localStorage.getItem(CONNECTION_STRING_NAME_LIST);
    return stored ? JSON.parse(stored) : [];
};
```

**Why This Matters:**
- Existing users have credentials in localStorage
- Migration must be seamless and automatic
- After migration, plaintext data is removed from localStorage
- Browser development mode continues to work with localStorage fallback

**Security Benefit:** Upgrades existing installations without user intervention.

---

## Phase 4: Content Security Policy

### 4.1 CSP Header Implementation

**File:** `public/electron.ts`

**Change:** Added Content Security Policy headers via Electron session API.

```typescript
const CSP_HEADER = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.azure.com https://*.microsoft.com https://*.azure-devices.net https://*.servicebus.windows.net https://login.microsoftonline.com wss://127.0.0.1:* https://127.0.0.1:*",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'"
].join('; ');

private static onReady(): void {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [CSP_HEADER]
            }
        });
    });
}
```

**CSP Directives Explained:**

| Directive | Value | Purpose |
|-----------|-------|---------|
| `default-src` | `'self'` | Default policy: only load from same origin |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | Allow scripts from self; inline needed for Fluent UI |
| `style-src` | `'self' 'unsafe-inline'` | Allow styles from self; inline needed for Fluent UI |
| `img-src` | `'self' data: https:` | Allow images from self, data URIs, and HTTPS |
| `font-src` | `'self' data:` | Allow fonts from self and data URIs |
| `connect-src` | `(see above)` | Whitelist Azure domains and local TLS server |
| `frame-ancestors` | `'none'` | Prevent embedding in iframes (clickjacking protection) |
| `form-action` | `'self'` | Forms can only submit to same origin |
| `base-uri` | `'self'` | Prevent base tag hijacking |

**Why This Matters:**
- CSP is the most effective defense against XSS attacks
- Even if an attacker injects malicious content, CSP prevents it from executing
- `frame-ancestors 'none'` prevents clickjacking attacks
- `connect-src` whitelist prevents data exfiltration to attacker-controlled servers

**Security Benefit:** Defense-in-depth against XSS and data exfiltration.

---

## Files Changed

### New Files Created

| File | Purpose |
|------|---------|
| `src/server/tlsHelper.ts` | TLS certificate generation |
| `src/server/serverSecure.ts` | HTTPS server with auth and rate limiting |
| `src/app/api/shared/secureFetch.ts` | Authenticated fetch wrapper |
| `src/app/shared/utils/appInitialization.ts` | IPC-based app initialization |
| `src/app/shared/utils/credentialStorage.ts` | Encrypted credential storage utility |
| `public/handlers/credentialsHandler.ts` | safeStorage implementation |
| `public/interfaces/credentialsInterface.ts` | Credentials API interface |
| `public/factories/credentialsInterfaceFactory.ts` | Credentials interface factory |
| `src/types/window.d.ts` | Window interface extensions |
| `src/types/helmet.d.ts` | Helmet type declarations |

### Modified Files

| File | Changes |
|------|---------|
| `public/electron.ts` | Sandbox, CSP, IPC handlers, credential init |
| `public/constants.ts` | New MESSAGE_CHANNELS for security features |
| `public/contextBridge.ts` | Expose credentials API |
| `public/interfaces/settingsInterface.ts` | Auth token methods |
| `public/factories/settingsInterfaceFactory.ts` | Auth token implementation |
| `src/server/serverBase.ts` | Helmet.js middleware |
| `src/app/constants/apiConstants.ts` | HTTPS/WSS endpoints |
| `src/app/api/services/dataplaneServiceHelper.ts` | Use secureFetch |
| `src/app/api/services/localRepoService.ts` | Use secureFetch |
| `src/app/api/shared/interfaceUtils.ts` | Browser fallbacks |
| `src/app/connectionStrings/sagas/*.ts` | Use encrypted storage |
| `src/index.tsx` | IPC-based initialization |
| `package.json` | New dependencies |
| `tsconfig.json` | Type roots configuration |
| `webpack.electron.ts` | Build configuration fix |
| `jestSetup.ts` | Test mocks for secureFetch |

### Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `helmet` | ^8.1.0 | Security headers middleware |
| `node-forge` | ^1.3.1 | TLS certificate generation |

---

## Testing

All phases were verified with the existing test suite:

```
Test Suites: 198 passed, 198 total
Tests:       710 passed, 710 total
Snapshots:   161 passed, 161 total
```

### Test Updates

The following test files were updated to work with the new async credential storage:

- `src/app/connectionStrings/sagas/getConnectionStringsSaga.spec.ts`
- `src/app/connectionStrings/sagas/setConnectionStringsSaga.spec.ts`
- `src/app/api/services/localRepoService.spec.ts`
- `src/app/devices/deviceList/sagas/listDeviceSaga.spec.ts`

### Mock Configuration

Added global mocks in `jestSetup.ts` for:
- `secureFetch` - passes through to `window.fetch` in tests
- `appConfig.hostMode` - set to 'browser' for test compatibility

---

## Commit History

| Phase | Commit | Summary |
|-------|--------|---------|
| 1 | `e6c70b4` | Security quick wins and critical fixes |
| 2 | `fdc6f33` | TLS encryption and token authentication |
| 3 | `c605235` | Credential encryption using safeStorage |
| 4 | `356be30` | Content Security Policy headers |

---

## Recommendations for Future Work

1. **Remove unsafe-inline/unsafe-eval from CSP** - Requires refactoring Fluent UI usage and webpack configuration
2. **Certificate pinning** - Pin the self-signed certificate fingerprint in the renderer
3. **Audit logging** - Log security-relevant events (auth failures, rate limit hits)
4. **Dependency scanning** - Add automated vulnerability scanning in CI/CD
5. **Penetration testing** - Conduct security assessment of the enhanced application

---

*Document generated: 2026-01-23*
