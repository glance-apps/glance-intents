const PBKDF2_ITERATIONS = 310_000;

// Fixed info string for HKDF per-envelope key derivation. Both apps must use
// the same value; keeping it in the package ensures agreement without manual
// coordination by consumers.
const HKDF_INFO_ENVELOPE: Uint8Array<ArrayBuffer> = new TextEncoder().encode(
  'glance-intents-envelope-v1',
);

/**
 * Derives the intents root key from the cloud sync passphrase and the shared
 * WebDAV root salt. Both apps derive the same root key when given the same
 * passphrase and the same salt (read from a fixed file on the shared WebDAV
 * endpoint). Called once at intents-encryption setup; result is cached
 * non-extractably in the consumer's IndexedDB.
 *
 * Returns a non-extractable CryptoKey with algorithm 'HKDF' and
 * usages ['deriveKey']. Pass it to deriveEnvelopeKey() per envelope.
 */
export async function deriveIntentsRootKey(
  passphrase: string,
  sharedRootSalt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const pbkdf2Key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as Uint8Array<ArrayBuffer>,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sharedRootSalt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    pbkdf2Key,
    256,
  );
  return globalThis.crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
}

/**
 * Derives a per-envelope AES-256-GCM key from the cached intents root key and
 * the per-envelope salt embedded in the encrypted envelope. Deterministic:
 * same root key + same salt always produces the same envelope key, so both
 * apps can decrypt each other's envelopes.
 *
 * Use this to implement the deriveKey callback for buildEncryptedEnvelope()
 * and parseEncryptedEnvelope():
 *   const deriveKey = (salt) => deriveEnvelopeKey(cachedRootKey, salt);
 */
export async function deriveEnvelopeKey(
  rootKey: CryptoKey,
  envelopeSalt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: envelopeSalt, info: HKDF_INFO_ENVELOPE },
    rootKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
