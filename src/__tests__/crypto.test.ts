import { describe, expect, it } from 'vitest';

import { decryptAesGcm, encryptAesGcm } from '../crypto/aes-gcm.js';
import {
  MalformedEnvelopeError,
  NoKeyError,
  NotEncryptedError,
  WrongKeyError,
} from '../crypto/errors.js';

async function generateKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

describe('encryptAesGcm / decryptAesGcm', () => {
  it('round-trips plaintext through encrypt then decrypt', async () => {
    const key = await generateKey();
    const plaintext = 'hello, world';
    const { ciphertext, iv } = await encryptAesGcm(plaintext, key);
    const decrypted = await decryptAesGcm(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips a JSON string', async () => {
    const key = await generateKey();
    const payload = JSON.stringify({ action: 'create', payload: { title: 'Buy milk', due: '2026-06-01' } });
    const { ciphertext, iv } = await encryptAesGcm(payload, key);
    expect(await decryptAesGcm(ciphertext, iv, key)).toBe(payload);
  });

  it('produces base64-encoded output', async () => {
    const key = await generateKey();
    const { ciphertext, iv } = await encryptAesGcm('test', key);
    expect(() => globalThis.atob(ciphertext)).not.toThrow();
    expect(() => globalThis.atob(iv)).not.toThrow();
  });

  it('IV is 12 bytes (96-bit), base64-encoded to 16 characters', async () => {
    const key = await generateKey();
    const { iv } = await encryptAesGcm('test', key);
    const ivBytes = globalThis.atob(iv);
    expect(ivBytes.length).toBe(12);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const key = await generateKey();
    const { ciphertext: c1, iv: iv1 } = await encryptAesGcm('same plaintext', key);
    const { ciphertext: c2, iv: iv2 } = await encryptAesGcm('same plaintext', key);
    expect(iv1).not.toBe(iv2);
    expect(c1).not.toBe(c2);
  });

  it('throws when decrypting with the wrong key', async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const { ciphertext, iv } = await encryptAesGcm('secret', key1);
    await expect(decryptAesGcm(ciphertext, iv, key2)).rejects.toThrow();
  });

  it('throws when decrypting with a tampered IV', async () => {
    const key = await generateKey();
    const { ciphertext } = await encryptAesGcm('secret', key);
    const badIv = globalThis.btoa('AAAAAAAAAAAA'); // 12 bytes of 'A', not the original IV
    await expect(decryptAesGcm(ciphertext, badIv, key)).rejects.toThrow();
  });

  it('throws when decrypting tampered ciphertext (GCM authentication tag check)', async () => {
    const key = await generateKey();
    const { iv } = await encryptAesGcm('secret', key);
    const badCiphertext = globalThis.btoa('this is not valid ciphertext at all aaaaaaaaaaaaaaa');
    await expect(decryptAesGcm(badCiphertext, iv, key)).rejects.toThrow();
  });

  it('handles unicode plaintext', async () => {
    const key = await generateKey();
    const plaintext = '日本語テスト 🔒';
    const { ciphertext, iv } = await encryptAesGcm(plaintext, key);
    expect(await decryptAesGcm(ciphertext, iv, key)).toBe(plaintext);
  });

  it('handles empty string', async () => {
    const key = await generateKey();
    const { ciphertext, iv } = await encryptAesGcm('', key);
    expect(await decryptAesGcm(ciphertext, iv, key)).toBe('');
  });
});

describe('error classes', () => {
  it('NoKeyError has the right name and extends Error', () => {
    const e = new NoKeyError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NoKeyError');
    expect(e.message).toMatch(/key/i);
  });

  it('NoKeyError accepts a custom message', () => {
    const e = new NoKeyError('custom msg');
    expect(e.message).toBe('custom msg');
  });

  it('WrongKeyError has the right name and extends Error', () => {
    const e = new WrongKeyError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('WrongKeyError');
  });

  it('NotEncryptedError has the right name and extends Error', () => {
    const e = new NotEncryptedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NotEncryptedError');
  });

  it('MalformedEnvelopeError has the right name and extends Error', () => {
    const e = new MalformedEnvelopeError('bad structure');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('MalformedEnvelopeError');
    expect(e.message).toBe('bad structure');
  });

  it('error classes are distinguishable via instanceof', () => {
    expect(new NoKeyError()).toBeInstanceOf(NoKeyError);
    expect(new WrongKeyError()).toBeInstanceOf(WrongKeyError);
    expect(new NotEncryptedError()).toBeInstanceOf(NotEncryptedError);
    expect(new MalformedEnvelopeError('x')).toBeInstanceOf(MalformedEnvelopeError);

    expect(new WrongKeyError()).not.toBeInstanceOf(NoKeyError);
    expect(new NotEncryptedError()).not.toBeInstanceOf(WrongKeyError);
  });
});
