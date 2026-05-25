import { describe, expect, it } from 'vitest';

import { decryptAesGcm, encryptAesGcm } from '../crypto/aes-gcm.js';
import { deriveEnvelopeKey, deriveIntentsRootKey } from '../crypto/hkdf.js';

const PASSPHRASE = 'correct horse battery staple';

async function makeRootKey(passphrase = PASSPHRASE, salt = new Uint8Array(16)): Promise<CryptoKey> {
  return deriveIntentsRootKey(passphrase, salt);
}

describe('deriveIntentsRootKey', () => {
  it('returns a CryptoKey', async () => {
    const key = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16));
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('returns a key with algorithm HKDF', async () => {
    const key = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16));
    expect(key.algorithm.name).toBe('HKDF');
  });

  it('returns a non-extractable key', async () => {
    const key = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16));
    expect(key.extractable).toBe(false);
  });

  it('key has usages [deriveKey]', async () => {
    const key = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16));
    expect(key.usages).toEqual(['deriveKey']);
  });

  it('non-extractable key cannot be exported', async () => {
    const key = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16));
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  // Core Phase 2.7 requirement: same passphrase + same shared salt → same root key.
  // Two independent derivations (simulating two apps) must produce equivalent keys.
  it('same passphrase + same salt → agreement (cross-app core requirement)', async () => {
    const sharedSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const rootKey1 = await deriveIntentsRootKey(PASSPHRASE, sharedSalt);
    const rootKey2 = await deriveIntentsRootKey(PASSPHRASE, sharedSalt);
    // Verify agreement indirectly: derive the same envelope key from both roots
    // and confirm encrypt-in-1 / decrypt-in-2 works.
    const envelopeSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const envKey1 = await deriveEnvelopeKey(rootKey1, envelopeSalt);
    const envKey2 = await deriveEnvelopeKey(rootKey2, envelopeSalt);
    const plaintext = 'cross-app agreement test';
    const { ciphertext, iv } = await encryptAesGcm(plaintext, envKey1);
    expect(await decryptAesGcm(ciphertext, iv, envKey2)).toBe(plaintext);
  });

  it('different passphrase → different root key (decryption fails)', async () => {
    const sharedSalt = new Uint8Array(16);
    const rootA = await deriveIntentsRootKey('passphrase-A', sharedSalt);
    const rootB = await deriveIntentsRootKey('passphrase-B', sharedSalt);
    const envelopeSalt = new Uint8Array(16);
    const keyA = await deriveEnvelopeKey(rootA, envelopeSalt);
    const keyB = await deriveEnvelopeKey(rootB, envelopeSalt);
    const { ciphertext, iv } = await encryptAesGcm('secret', keyA);
    await expect(decryptAesGcm(ciphertext, iv, keyB)).rejects.toThrow();
  });

  it('different shared root salt → different root key (decryption fails)', async () => {
    const rootA = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16).fill(0));
    const rootB = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16).fill(1));
    const envelopeSalt = new Uint8Array(16);
    const keyA = await deriveEnvelopeKey(rootA, envelopeSalt);
    const keyB = await deriveEnvelopeKey(rootB, envelopeSalt);
    const { ciphertext, iv } = await encryptAesGcm('secret', keyA);
    await expect(decryptAesGcm(ciphertext, iv, keyB)).rejects.toThrow();
  });
});

describe('deriveEnvelopeKey', () => {
  it('returns a CryptoKey', async () => {
    const rootKey = await makeRootKey();
    const key = await deriveEnvelopeKey(rootKey, new Uint8Array(16));
    expect(key).toBeInstanceOf(CryptoKey);
  });

  it('returns a key with algorithm AES-GCM', async () => {
    const rootKey = await makeRootKey();
    const key = await deriveEnvelopeKey(rootKey, new Uint8Array(16));
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('AES-GCM key is 256-bit', async () => {
    const rootKey = await makeRootKey();
    const key = await deriveEnvelopeKey(rootKey, new Uint8Array(16));
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('returns a non-extractable key', async () => {
    const rootKey = await makeRootKey();
    const key = await deriveEnvelopeKey(rootKey, new Uint8Array(16));
    expect(key.extractable).toBe(false);
  });

  it('key has usages [encrypt, decrypt]', async () => {
    const rootKey = await makeRootKey();
    const key = await deriveEnvelopeKey(rootKey, new Uint8Array(16));
    expect(key.usages).toContain('encrypt');
    expect(key.usages).toContain('decrypt');
  });

  it('same root key + same envelope salt → same derived key (deterministic)', async () => {
    const rootKey = await deriveIntentsRootKey(PASSPHRASE, new Uint8Array(16).fill(42));
    const envelopeSalt = new Uint8Array(16).fill(7);
    const key1 = await deriveEnvelopeKey(rootKey, envelopeSalt);
    const key2 = await deriveEnvelopeKey(rootKey, envelopeSalt);
    const { ciphertext, iv } = await encryptAesGcm('hello', key1);
    expect(await decryptAesGcm(ciphertext, iv, key2)).toBe('hello');
  });

  it('different envelope salts → different derived keys (per-envelope isolation)', async () => {
    const rootKey = await makeRootKey();
    const key1 = await deriveEnvelopeKey(rootKey, new Uint8Array(16).fill(1));
    const key2 = await deriveEnvelopeKey(rootKey, new Uint8Array(16).fill(2));
    const { ciphertext, iv } = await encryptAesGcm('secret', key1);
    await expect(decryptAesGcm(ciphertext, iv, key2)).rejects.toThrow();
  });

  it('full round-trip: encrypt with derived key and decrypt', async () => {
    const sharedRootSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const rootKey = await deriveIntentsRootKey(PASSPHRASE, sharedRootSalt);
    const envelopeSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const envelopeKey = await deriveEnvelopeKey(rootKey, envelopeSalt);
    const payload = JSON.stringify({ action: 'create', payload: { title: 'Test task' } });
    const { ciphertext, iv } = await encryptAesGcm(payload, envelopeKey);
    expect(await decryptAesGcm(ciphertext, iv, envelopeKey)).toBe(payload);
  });
});
