import { describe, expect, expectTypeOf, it } from 'vitest';

import { ACTIONS, EVENTS, SCHEMA_VERSION } from '../constants/index.js';
import { encryptAesGcm } from '../crypto/aes-gcm.js';
import {
  MalformedEnvelopeError,
  NotEncryptedError,
  WrongKeyError,
} from '../crypto/errors.js';
import {
  type CreatePayload,
  type EncryptedEnvelope,
  EncryptedEnvelopeSchema,
  type Envelope,
  type NotifyPayload,
} from '../schemas/v1/index.js';
import { buildEnvelope, buildEncryptedEnvelope, parseEncryptedEnvelope } from '../webdav/index.js';

async function generateKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
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
  const validEncryptedEnvelope = {
    schema_version: 1,
    event_id: '20260517T143022Z-7f3a9c',
    emitted_at: '2026-05-17T14:30:22Z',
    emitted_by: 'app.lastglance',
    encrypted: true,
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
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key,
    );
    expect(result.encrypted).toBe(true);
    expectTypeOf(result).toEqualTypeOf<EncryptedEnvelope>();
  });

  it('envelope header fields are populated correctly', async () => {
    const key = await generateKey();
    const emittedAt = new Date('2026-05-17T14:30:22.000Z');
    const result = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: sampleCreatePayload,
        emittedBy: 'app.lastglance',
        emittedAt,
        eventId: '20260517T143022Z-7f3a9c',
      },
      key,
    );
    expect(result.schema_version).toBe(SCHEMA_VERSION);
    expect(result.event_id).toBe('20260517T143022Z-7f3a9c');
    expect(result.emitted_at).toBe('2026-05-17T14:30:22.000Z');
    expect(result.emitted_by).toBe('app.lastglance');
  });

  it('hoists source_app, source_entity_id, and due from a create payload', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key,
    );
    expect(result.source_app).toBe('app.lastglance');
    expect(result.source_entity_id).toBe('chore_42');
    expect(result.due).toBe('2026-05-20');
  });

  it('hoists source_app, source_entity_id, and due from a notify payload', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.NOTIFY, payload: sampleNotifyPayload, emittedBy: 'app.dayglance' },
      key,
    );
    expect(result.source_app).toBe('app.lastglance');
    expect(result.source_entity_id).toBe('chore_42');
    expect(result.due).toBe('2026-05-17');
  });

  it('does not hoist source_app or source_entity_id when absent from create payload', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'Buy milk' }, emittedBy: 'app.dayglance' },
      key,
    );
    expect(result.source_app).toBeUndefined();
    expect(result.source_entity_id).toBeUndefined();
    expect(result.due).toBeUndefined();
  });

  it('does not include action or payload in the plaintext header', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key,
    );
    expect(result).not.toHaveProperty('action');
    expect(result).not.toHaveProperty('payload');
  });

  it('produces base64-encoded iv and payload_ciphertext', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key,
    );
    expect(() => globalThis.atob(result.iv)).not.toThrow();
    expect(() => globalThis.atob(result.payload_ciphertext)).not.toThrow();
  });

  it('generates a unique event_id when not provided', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'x' }, emittedBy: 'app.dayglance' },
      key,
    );
    expect(result.event_id).toMatch(/^\d{8}T\d{6}Z-[a-f0-9]{6}$/);
  });

  it('uses the provided eventId', async () => {
    const key = await generateKey();
    const result = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: { title: 'x' },
        emittedBy: 'app.dayglance',
        eventId: '20260601T120000Z-deadbe',
      },
      key,
    );
    expect(result.event_id).toBe('20260601T120000Z-deadbe');
  });

  it('two calls with the same payload produce different ciphertext (random IV)', async () => {
    const key = await generateKey();
    const args = {
      action: 'create' as const,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
      eventId: '20260517T143022Z-aabbcc',
    };
    const r1 = await buildEncryptedEnvelope(args, key);
    const r2 = await buildEncryptedEnvelope(args, key);
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.payload_ciphertext).not.toBe(r2.payload_ciphertext);
  });
});

describe('parseEncryptedEnvelope', () => {
  it('round-trips a create envelope through build → parse', async () => {
    const key = await generateKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key,
    );
    const envelope = await parseEncryptedEnvelope(JSON.parse(JSON.stringify(encrypted)), key);
    expect(envelope.action).toBe('create');
    expect(envelope.payload).toEqual(sampleCreatePayload);
    expectTypeOf(envelope).toEqualTypeOf<Envelope>();
  });

  it('round-trips a notify envelope through build → parse', async () => {
    const key = await generateKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.NOTIFY, payload: sampleNotifyPayload, emittedBy: 'app.dayglance' },
      key,
    );
    const envelope = await parseEncryptedEnvelope(JSON.parse(JSON.stringify(encrypted)), key);
    expect(envelope.action).toBe('notify');
    expect(envelope.payload).toEqual(sampleNotifyPayload);
  });

  it('decrypted envelope has the original envelope header fields', async () => {
    const key = await generateKey();
    const emittedAt = new Date('2026-05-17T14:30:22.000Z');
    const encrypted = await buildEncryptedEnvelope(
      {
        action: ACTIONS.CREATE,
        payload: sampleCreatePayload,
        emittedBy: 'app.lastglance',
        emittedAt,
        eventId: '20260517T143022Z-7f3a9c',
      },
      key,
    );
    const envelope = await parseEncryptedEnvelope(encrypted, key);
    expect(envelope.schema_version).toBe(SCHEMA_VERSION);
    expect(envelope.event_id).toBe('20260517T143022Z-7f3a9c');
    expect(envelope.emitted_at).toBe('2026-05-17T14:30:22.000Z');
    expect(envelope.emitted_by).toBe('app.lastglance');
  });

  it('decrypted result equals what buildEnvelope would have produced', async () => {
    const key = await generateKey();
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
      key,
    );

    const decrypted = await parseEncryptedEnvelope(encrypted, key);
    expect(decrypted).toEqual(plainEnvelope);
  });

  it('throws WrongKeyError when decrypting with the wrong key', async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: sampleCreatePayload, emittedBy: 'app.lastglance' },
      key1,
    );
    await expect(parseEncryptedEnvelope(encrypted, key2)).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('throws NotEncryptedError for a plaintext envelope', async () => {
    const key = await generateKey();
    const plaintext = buildEnvelope({
      action: ACTIONS.CREATE,
      payload: sampleCreatePayload,
      emittedBy: 'app.lastglance',
    });
    await expect(parseEncryptedEnvelope(plaintext, key)).rejects.toBeInstanceOf(NotEncryptedError);
  });

  it('throws NotEncryptedError for a non-envelope object without encrypted field', async () => {
    const key = await generateKey();
    await expect(
      parseEncryptedEnvelope({ some: 'random object' }, key),
    ).rejects.toBeInstanceOf(NotEncryptedError);
  });

  it('throws MalformedEnvelopeError for a non-object input', async () => {
    const key = await generateKey();
    await expect(parseEncryptedEnvelope('string input', key)).rejects.toBeInstanceOf(
      MalformedEnvelopeError,
    );
    await expect(parseEncryptedEnvelope(null, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    await expect(parseEncryptedEnvelope(42, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
  });

  it('throws MalformedEnvelopeError for an object with encrypted: true but missing required fields', async () => {
    const key = await generateKey();
    await expect(
      parseEncryptedEnvelope({ encrypted: true, iv: 'AAAA', payload_ciphertext: 'BBBB' }, key),
    ).rejects.toBeInstanceOf(MalformedEnvelopeError);
  });

  it('throws WrongKeyError (GCM auth tag) when ciphertext is replaced with garbage base64', async () => {
    const key = await generateKey();
    const encrypted = await buildEncryptedEnvelope(
      { action: ACTIONS.CREATE, payload: { title: 'x' }, emittedBy: 'app.dayglance' },
      key,
    );
    const tampered = { ...encrypted, payload_ciphertext: globalThis.btoa('not ciphertext!!!') };
    await expect(parseEncryptedEnvelope(tampered, key)).rejects.toBeInstanceOf(WrongKeyError);
  });

  it('throws MalformedEnvelopeError when decrypted content is not valid JSON', async () => {
    const key = await generateKey();
    // Craft an envelope whose ciphertext decrypts to a non-JSON string
    const { ciphertext, iv } = await encryptAesGcm('not json at all }{', key);
    const base = {
      schema_version: SCHEMA_VERSION,
      event_id: '20260517T143022Z-7f3a9c',
      emitted_at: '2026-05-17T14:30:22Z',
      emitted_by: 'app.lastglance',
      encrypted: true,
      iv,
      payload_ciphertext: ciphertext,
    };
    await expect(parseEncryptedEnvelope(base, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    await expect(parseEncryptedEnvelope(base, key)).rejects.toThrow('not valid JSON');
  });

  it('throws MalformedEnvelopeError when decrypted JSON does not match the envelope schema', async () => {
    const key = await generateKey();
    // Craft an envelope whose ciphertext decrypts to valid JSON but not a valid envelope
    const { ciphertext, iv } = await encryptAesGcm(JSON.stringify({ foo: 'bar' }), key);
    const base = {
      schema_version: SCHEMA_VERSION,
      event_id: '20260517T143022Z-7f3a9c',
      emitted_at: '2026-05-17T14:30:22Z',
      emitted_by: 'app.lastglance',
      encrypted: true,
      iv,
      payload_ciphertext: ciphertext,
    };
    await expect(parseEncryptedEnvelope(base, key)).rejects.toBeInstanceOf(MalformedEnvelopeError);
    await expect(parseEncryptedEnvelope(base, key)).rejects.toThrow('invalid decrypted envelope');
  });
});
