import { describe, expect, expectTypeOf, it } from 'vitest';

import { ACTIONS, EVENTS, SCHEMA_VERSION } from '../constants/index.js';
import { encryptAesGcm } from '../crypto/aes-gcm.js';
import {
  MalformedEnvelopeError,
  NotEncryptedError,
  WrongKeyError,
} from '../crypto/errors.js';
import { deriveEnvelopeKey, deriveIntentsRootKey } from '../crypto/hkdf.js';
import {
  type CreatePayload,
  type EncryptedEnvelope,
  EncryptedEnvelopeSchema,
  type Envelope,
  type NotifyPayload,
} from '../schemas/v1/index.js';
import { buildEnvelope, buildEncryptedEnvelope, parseEncryptedEnvelope } from '../webdav/index.js';

// Returns a deriveKey function that always returns the same pre-generated key,
// ignoring the salt. Fast for tests that verify API plumbing rather than
// cross-passphrase derivation correctness.
async function generateDeriveKey(): Promise<(salt: Uint8Array) => Promise<CryptoKey>> {
  const key = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  return (_salt: Uint8Array) => Promise.resolve(key);
}

// Returns a proper PBKDF2-based deriveKey function for a given passphrase.
// Two calls with the same passphrase produce independent deriveKey functions
// that derive the same key for the same salt — mirroring the cross-app scenario.
async function makePbkdf2DeriveKey(
  passphrase: string,
): Promise<(salt: Uint8Array<ArrayBuffer>) => Promise<CryptoKey>> {
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return (salt: Uint8Array<ArrayBuffer>) =>
    globalThis.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 1, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
}

const sampleCreatePayload: CreatePayload = {
  title: 'Replace HVAC filter',
  due: '2026-05-20',
  source_app: 'app.lastglance',
  source_entity_id: 'chore_42',
};

const sampleNotifyPayload: NotifyPayload = {
  event_id: 'evt_1',
  source_app: 'app.lastglance',
  source_entity_id: 'chore_42',
  event: EVENTS.COMPLETED,
  task_id: 'tsk_8a91',
  title: 'Replace HVAC filter',
  timestamp: '2026-05-17T14:30:22Z',
  due: '2026-05-17',
};

describe('EncryptedEnvelopeSchema', () => {
  // salt: base64 of 16 zero bytes (AAAAAAAAAAAAAAAAAAAAAA==)
  const validEncryptedEnvelope = {
    schema_version: 1,
    event_id: '20260517T143022Z-7f3a9c',
    emitted_at: '2026-05-17T14:30:22Z',
    emitted_by: 'app.lastglance',
    encrypted: true,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    iv: 'AAAAAAAAAAAAAAAA',
    payload_ciphertext: 'c29tZWNpcGhlcnRleHQ=',
  };

  it('accepts a minimal encrypted envelope (no hoisted fields)', () => {
    expect(EncryptedEnvelopeSchema.safeParse(validEncryptedEnvelope).success).toBe(true);
  });

  it('accepts optional hoisted fields', () => {
    const result = EncryptedEnvelopeSchema.safeParse({
      ...validEncryptedEnvelope,
      source_app: 'app.lastglance',
      source_entity_id: 'chore_42',
      due: '2026-05-20',
    });
    expect(result.success).toBe(true);
  });

  it('rejects encrypted: false', () => {
    expect(
      EncryptedEnvelopeSchema.safeParse({ ...validEncryptedEnvelope, encrypted: false }).success,
    ).toBe(false);
  });

  it('rejects missing payload_ciphertext', () => {
    const { payload_ciphertext: _, ...rest } = validEncryptedEnvelope;
    expect(EncryptedEnvelopeSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing iv', () => {
    const { iv: _, ...rest } = validEncryptedEnvelope;
    expect(EncryptedEnvelopeSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing salt', () => {
    const { salt: _, ...rest } = validEncryptedEnvelope;
    expect(EncryptedEnvelopeSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects salt that decodes to fewer than 16 bytes', () => {
    // 'AAAA' base64-decodes to 3 bytes
    expect(
      EncryptedEnvelopeSchema.safeParse({ ...validEncryptedEnvelope, salt: 'AAAA' }).success,
    ).toBe(false);
  });

  it('rejects salt that decodes to more than 16 bytes', () => {
    // btoa('\x00'.repeat(17)) decodes to 17 bytes
    expect(
      EncryptedEnvelopeSchema.safeParse({
        ...validEncryptedEnvelope,
        salt: 'AAAAAAAAAAAAAAAAAAAAAAAAA=',
      }).success,
    ).toBe(false);
  });

  it('rejects salt that is not valid base64', () => {
    expect(
      EncryptedEnvelopeSchema.safeParse({ ...validEncryptedEnvelope, salt: 'not-base64!!!' })
        .success,
    ).toBe(false);
  });

  it('rejects wrong schema_version', () => {
    expect(
      EncryptedEnvelopeSchema.safeParse({ ...validEncryptedEnvelope, schema_version: 2 }).success,
    ).toBe(false);
  });

  it('rejects extra unknown fields (strict)', () => {
    expect(
      EncryptedEnvelopeSchema.safeParse({ ...validEncryptedEnvelope, action: 'create' }).success,
    ).toBe(false);
  });

  it('type is EncryptedEnvelope', () => {
    const result = EncryptedEnvelopeSchema.safeParse(validEncryptedEnvelope);
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<EncryptedEnvelope>();
    }
  });
});

describe('buildEncryptedEnvelope', () => {
  it('returns an EncryptedEnvelope with encrypted: true', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    expect(result.encrypted).toBe(true);
    expectTypeOf(result).toEqualTypeOf<EncryptedEnvelope>();
  });

  it('envelope header fields are populated correctly', async () => {
    const deriveKey = await generateDeriveKey();
    const emittedAt = new Date('2026-05-17T14:30:22.000Z');
    const result = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: sampleCreatePayload,
        emittedBy: 'app.lastglance',
        emittedAt,
        eventId: '20260517T143022Z-7f3a9c',
      },
      deriveKey,
    );
    expect(result.schema_version).toBe(SCHEMA_VERSION);
    expect(result.event_id).toBe('20260517T143022Z-7f3a9c');
    expect(result.emitted_at).toBe('2026-05-17T14:30:22.000Z');
    expect(result.emitted_by).toBe('app.lastglance');
  });

  it('envelope includes a base64-encoded 16-byte salt', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    expect(() => globalThis.atob(result.salt)).not.toThrow();
    expect(globalThis.atob(result.salt).length).toBe(16);
  });

  it('two calls produce different salts', async () => {
    const deriveKey = await generateDeriveKey();
    const args = {
      action: 'create' as const,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
      eventId: '20260517T143022Z-aabbcc',
    };
    const r1 = await buildEncryptedEnvelope(args, deriveKey);
    const r2 = await buildEncryptedEnvelope(args, deriveKey);
    expect(r1.salt).not.toBe(r2.salt);
  });

  it('hoists source_app, source_entity_id, and due from a create payload', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    expect(result.source_app).toBe('app.lastglance');
    expect(result.source_entity_id).toBe('chore_42');
    expect(result.due).toBe('2026-05-20');
  });

  it('hoists source_app, source_entity_id, and due from a notify payload', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.NOTIFY, payload: sampleNotifyPayload, emittedBy: 'app.dayglance' },
      deriveKey,
    );
    expect(result.source_app).toBe('app.lastglance');
    expect(result.source_entity_id).toBe('chore_42');
    expect(result.due).toBe('2026-05-17');
  });

  it('does not hoist source_app or source_entity_id when absent from create payload', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'Buy milk' }, emittedBy: 'app.dayglance' },
      deriveKey,
    );
    expect(result.source_app).toBeUndefined();
    expect(result.source_entity_id).toBeUndefined();
    expect(result.due).toBeUndefined();
  });

  it('does not include action or payload in the plaintext header', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    expect(result).not.toHaveProperty('action');
    expect(result).not.toHaveProperty('payload');
  });

  it('produces base64-encoded iv and payload_ciphertext', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    expect(() => globalThis.atob(result.iv)).not.toThrow();
    expect(() => globalThis.atob(result.payload_ciphertext)).not.toThrow();
  });

  it('generates a unique event_id when not provided', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'x' }, emittedBy: 'app.dayglance' },
      deriveKey,
    );
    expect(result.event_id).toMatch(/^\d{8}T\d{6}Z-[a-f0-9]{6}$/);
  });

  it('uses the provided eventId', async () => {
    const deriveKey = await generateDeriveKey();
    const result = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: { title: 'x' },
        emittedBy: 'app.dayglance',
        eventId: '20260601T120000Z-deadbe',
      },
      deriveKey,
    );
    expect(result.event_id).toBe('20260601T120000Z-deadbe');
  });

  it('two calls with the same payload produce different ciphertext (random IV and salt)', async () => {
    const deriveKey = await generateDeriveKey();
    const args = {
      action: 'create' as const,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
      eventId: '20260517T143022Z-aabbcc',
    };
    const r1 = await buildEncryptedEnvelope(args, deriveKey);
    const r2 = await buildEncryptedEnvelope(args, deriveKey);
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.salt).not.toBe(r2.salt);
    expect(r1.payload_ciphertext).not.toBe(r2.payload_ciphertext);
  });
});

describe('parseEncryptedEnvelope', () => {
  it('round-trips a create envelope through build → parse', async () => {
    const deriveKey = await generateDeriveKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    const envelope = await parseEncryptedEnvelope(JSON.parse(JSON.stringify(encrypted)), deriveKey);
    expect(envelope.action).toBe('create');
    expect(envelope.payload).toEqual(sampleCreatePayload);
    expectTypeOf(envelope).toEqualTypeOf<Envelope>();
  });

  it('round-trips a notify envelope through build → parse', async () => {
    const deriveKey = await generateDeriveKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.NOTIFY, payload: sampleNotifyPayload, emittedBy: 'app.dayglance' },
      deriveKey,
    );
    const envelope = await parseEncryptedEnvelope(JSON.parse(JSON.stringify(encrypted)), deriveKey);
    expect(envelope.action).toBe('notify');
    expect(envelope.payload).toEqual(sampleNotifyPayload);
  });

  it('decrypted envelope has the original envelope header fields', async () => {
    const deriveKey = await generateDeriveKey();
    const emittedAt = new Date('2026-05-17T14:30:22.000Z');
    const encrypted = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: sampleCreatePayload,
        emittedBy: 'app.lastglance',
        emittedAt,
        eventId: '20260517T143022Z-7f3a9c',
      },
      deriveKey,
    );
    const envelope = await parseEncryptedEnvelope(encrypted, deriveKey);
    expect(envelope.schema_version).toBe(SCHEMA_VERSION);
    expect(envelope.event_id).toBe('20260517T143022Z-7f3a9c');
    expect(envelope.emitted_at).toBe('2026-05-17T14:30:22.000Z');
    expect(envelope.emitted_by).toBe('app.lastglance');
  });

  it('decrypted result equals what buildEnvelope would have produced', async () => {
    const deriveKey = await generateDeriveKey();
    const emittedAt = new Date('2026-05-20T10:00:00.000Z');
    const eventIdStr = '20260520T100000Z-abc123';

    const plainEnvelope = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
      emittedAt,
      eventId: eventIdStr,
    });

    const encrypted = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: sampleCreatePayload,
        emittedBy: 'app.lastglance',
        emittedAt,
        eventId: eventIdStr,
      },
      deriveKey,
    );

    const decrypted = await parseEncryptedEnvelope(encrypted, deriveKey);
    expect(decrypted).toEqual(plainEnvelope);
  });

  // Phase 2.6 core scenario: two independent deriveKey closures for the same
  // passphrase must agree because the salt is embedded in the envelope.
  it('cross-app round-trip: same passphrase, independent deriveKey closures', async () => {
    const passphrase = 'correct horse battery staple';
    const deriveKeyApp1 = await makePbkdf2DeriveKey(passphrase);
    const deriveKeyApp2 = await makePbkdf2DeriveKey(passphrase);

    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKeyApp1,
    );
    const envelope = await parseEncryptedEnvelope(encrypted, deriveKeyApp2);
    expect(envelope.action).toBe('create');
    expect(envelope.payload).toEqual(sampleCreatePayload);
  });

  // Phase 2.7 core scenario: two apps derive independent root keys from the
  // same passphrase + shared WebDAV root salt, then use HKDF per envelope.
  // No passphrase access needed after setup — only the cached root keys.
  it('cross-app round-trip: HKDF-based deriveKey from shared root key (Phase 2.7)', async () => {
    const passphrase = 'correct horse battery staple';
    const sharedRootSalt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const rootKey1 = await deriveIntentsRootKey(passphrase, sharedRootSalt);
    const rootKey2 = await deriveIntentsRootKey(passphrase, sharedRootSalt);
    const deriveKeyApp1 = (salt: Uint8Array<ArrayBuffer>) => deriveEnvelopeKey(rootKey1, salt);
    const deriveKeyApp2 = (salt: Uint8Array<ArrayBuffer>) => deriveEnvelopeKey(rootKey2, salt);

    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKeyApp1,
    );
    const envelope = await parseEncryptedEnvelope(encrypted, deriveKeyApp2);
    expect(envelope.action).toBe('create');
    expect(envelope.payload).toEqual(sampleCreatePayload);
  });

  it('HKDF cross-app: mismatched passphrase produces WrongKeyError', async () => {
    const sharedRootSalt = new Uint8Array(16);
    const rootKey1 = await deriveIntentsRootKey('correct-passphrase', sharedRootSalt);
    const rootKey2 = await deriveIntentsRootKey('wrong-passphrase', sharedRootSalt);
    const deriveKeyApp1 = (salt: Uint8Array<ArrayBuffer>) => deriveEnvelopeKey(rootKey1, salt);
    const deriveKeyApp2 = (salt: Uint8Array<ArrayBuffer>) => deriveEnvelopeKey(rootKey2, salt);

    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKeyApp1,
    );
    await expect(parseEncryptedEnvelope(encrypted, deriveKeyApp2)).rejects.toBeInstanceOf(
      WrongKeyError,
    );
  });

  it('throws WrongKeyError when passphrases differ (cross-app mismatch)', async () => {
    const deriveKeyApp1 = await makePbkdf2DeriveKey('correct-passphrase');
    const deriveKeyApp2 = await makePbkdf2DeriveKey('wrong-passphrase');

    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKeyApp1,
    );
    await expect(parseEncryptedEnvelope(encrypted, deriveKeyApp2)).rejects.toBeInstanceOf(
      WrongKeyError,
    );
  });

  it('throws NotEncryptedError for a plaintext envelope', async () => {
    const deriveKey = await generateDeriveKey();
    const plaintext = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
    });
    await expect(parseEncryptedEnvelope(plaintext, deriveKey)).rejects.toBeInstanceOf(
      NotEncryptedError,
    );
  });

  it('throws NotEncryptedError for a non-envelope object without encrypted field', async () => {
    const deriveKey = await generateDeriveKey();
    await expect(
      parseEncryptedEnvelope({ some: 'random object' }, deriveKey),
    ).rejects.toBeInstanceOf(NotEncryptedError);
  });

  it('throws MalformedEnvelopeError for a non-object input', async () => {
    const deriveKey = await generateDeriveKey();
    await expect(parseEncryptedEnvelope('string input', deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
    await expect(parseEncryptedEnvelope(null, deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
    await expect(parseEncryptedEnvelope(42, deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
  });

  it('throws MalformedEnvelopeError for an object with encrypted: true but missing required fields', async () => {
    const deriveKey = await generateDeriveKey();
    await expect(
      parseEncryptedEnvelope({ encrypted: true, iv: 'AAAA', payload_ciphertext: 'BBBB' }, deriveKey),
    ).rejects.toBeInstanceOf(MalformedEnvelopeError);
  });

  it('throws MalformedEnvelopeError when salt field is missing from an otherwise valid encrypted envelope', async () => {
    const deriveKey = await generateDeriveKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      deriveKey,
    );
    const { salt: _, ...withoutSalt } = encrypted;
    await expect(parseEncryptedEnvelope(withoutSalt, deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
  });

  it('throws WrongKeyError (GCM auth tag) when ciphertext is replaced with garbage base64', async () => {
    const deriveKey = await generateDeriveKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'x' }, emittedBy: 'app.dayglance' },
      deriveKey,
    );
    const tampered = { ...encrypted, payload_ciphertext: globalThis.btoa('not ciphertext!!!') };
    await expect(parseEncryptedEnvelope(tampered, deriveKey)).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('throws MalformedEnvelopeError when decrypted content is not valid JSON', async () => {
    const deriveKey = await generateDeriveKey();
    // Craft an envelope whose ciphertext decrypts to a non-JSON string using
    // the same key that deriveKey returns (salt ignored by generateDeriveKey).
    const fakeKey = await deriveKey(new Uint8Array(16));
    const fakeSalt = globalThis.btoa('a'.repeat(16)); // 16 ASCII bytes
    const { ciphertext, iv } = await encryptAesGcm('not json at all }{', fakeKey);
    const base = {
      schema_version: SCHEMA_VERSION,
      event_id: '20260517T143022Z-7f3a9c',
      emitted_at: '2026-05-17T14:30:22Z',
      emitted_by: 'app.lastglance',
      encrypted: true,
      salt: fakeSalt,
      iv,
      payload_ciphertext: ciphertext,
    };
    await expect(parseEncryptedEnvelope(base, deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
    await expect(parseEncryptedEnvelope(base, deriveKey)).rejects.toThrow('not valid JSON');
  });

  it('throws MalformedEnvelopeError when decrypted JSON does not match the envelope schema', async () => {
    const deriveKey = await generateDeriveKey();
    const fakeKey = await deriveKey(new Uint8Array(16));
    const fakeSalt = globalThis.btoa('b'.repeat(16));
    const { ciphertext, iv } = await encryptAesGcm(JSON.stringify({ foo: 'bar' }), fakeKey);
    const base = {
      schema_version: SCHEMA_VERSION,
      event_id: '20260517T143022Z-7f3a9c',
      emitted_at: '2026-05-17T14:30:22Z',
      emitted_by: 'app.lastglance',
      encrypted: true,
      salt: fakeSalt,
      iv,
      payload_ciphertext: ciphertext,
    };
    await expect(parseEncryptedEnvelope(base, deriveKey)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
    await expect(parseEncryptedEnvelope(base, deriveKey)).rejects.toThrow('invalid decrypted envelope');
  });
});
