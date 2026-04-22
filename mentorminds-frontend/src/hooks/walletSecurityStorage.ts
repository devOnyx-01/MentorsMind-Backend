/**
 * walletSecurityStorage.ts
 *
 * Handles encrypted persistence of wallet security settings in localStorage.
 *
 * Encryption strategy:
 *   - AES-GCM 256-bit via the Web Crypto API (zero third-party deps)
 *   - Key is derived from a per-device secret using PBKDF2 (SHA-256, 100k iterations)
 *   - The device secret is a random 128-bit value stored in localStorage under a
 *     separate key — it never leaves the device and is not the encryption key itself
 *   - IV is random 12 bytes, prepended to the ciphertext before base64 encoding
 *   - Stored blob format: base64( iv[12 bytes] || ciphertext )
 *
 * Why encrypt at all?
 *   Security settings include a biometrics flag and session timeout. If tampered
 *   with in storage, an attacker could silently disable security controls. AES-GCM
 *   makes tampering detectable (auth tag) and prevents casual inspection.
 *
 * Limitations:
 *   - Protects against passive storage inspection and tampering.
 *   - Does NOT protect against a fully compromised JS runtime.
 *   - For stronger key protection, integrate with the Credential Management API
 *     or platform biometrics to bind the key to a user gesture.
 */

const STORAGE_KEY = 'mm_wallet_security_cfg';
const DEVICE_SECRET_KEY = 'mm_wallet_device_secret';
const PBKDF2_ITERATIONS = 100_000;
// Static salt — uniqueness comes from the per-device secret, not the salt
const PBKDF2_SALT = 'mentorminds-wallet-security-v1';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the per-device secret, generating and persisting one on first call.
 */
function getDeviceSecret(): string {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    secret = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from the device secret via PBKDF2.
 */
async function deriveKey(deviceSecret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(deviceSecret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WalletSecuritySettings {
  /** Auto-lock timeout in minutes. 0 = never lock. */
  timeoutMinutes: number;
  /** Whether biometric unlock is enabled on this device. */
  biometricsEnabled: boolean;
  /** Require explicit confirmation before submitting send transactions. */
  requireSendConfirmation: boolean;
  /** ISO timestamp of when settings were last persisted. */
  savedAt: string;
}

export const DEFAULT_SECURITY_SETTINGS: Readonly<WalletSecuritySettings> = {
  timeoutMinutes: 15,
  biometricsEnabled: false,
  requireSendConfirmation: true,
  savedAt: new Date(0).toISOString(), // epoch signals "never saved"
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt and persist wallet security settings to localStorage.
 *
 * @throws {Error} If the Web Crypto API is unavailable (non-HTTPS context).
 */
export async function saveSecuritySettings(
  settings: Omit<WalletSecuritySettings, 'savedAt'>,
): Promise<void> {
  const payload: WalletSecuritySettings = {
    ...settings,
    savedAt: new Date().toISOString(),
  };

  const key = await deriveKey(getDeviceSecret());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(payload)),
  );

  // Pack: iv (12 bytes) || ciphertext
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  localStorage.setItem(STORAGE_KEY, toBase64(combined.buffer));
}

/**
 * Decrypt and return wallet security settings from localStorage.
 *
 * Returns DEFAULT_SECURITY_SETTINGS when:
 *   - Nothing has been stored yet
 *   - Decryption fails (tampered data, device secret mismatch, corrupt blob)
 *
 * On decryption failure the corrupt entry is removed so the next save starts clean.
 */
export async function loadSecuritySettings(): Promise<WalletSecuritySettings> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SECURITY_SETTINGS };

  try {
    const combined = fromBase64(raw);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await deriveKey(getDeviceSecret());

    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    const parsed = JSON.parse(new TextDecoder().decode(plainBuffer)) as unknown;

    // Runtime shape validation — reject tampered / schema-drifted payloads
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as WalletSecuritySettings).timeoutMinutes !== 'number' ||
      typeof (parsed as WalletSecuritySettings).biometricsEnabled !== 'boolean' ||
      typeof (parsed as WalletSecuritySettings).requireSendConfirmation !== 'boolean'
    ) {
      throw new Error('Unexpected settings shape after decryption');
    }

    return parsed as WalletSecuritySettings;
  } catch {
    // Any failure (auth tag mismatch, JSON parse error, shape error) → safe defaults
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_SECURITY_SETTINGS };
  }
}

/**
 * Remove security settings from storage.
 * Call on logout or wallet reset to ensure no stale config lingers.
 */
export function clearSecuritySettings(): void {
  localStorage.removeItem(STORAGE_KEY);
  // Note: intentionally keep DEVICE_SECRET_KEY so re-login on the same device
  // can still decrypt any other encrypted blobs that share the same key.
}
