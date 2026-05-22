export class NoKeyError extends Error {
  readonly name = 'NoKeyError' as const;
  constructor(message = 'no decryption key available') {
    super(message);
  }
}

export class WrongKeyError extends Error {
  readonly name = 'WrongKeyError' as const;
  constructor(message = 'decryption failed: wrong key or corrupted ciphertext') {
    super(message);
  }
}

export class NotEncryptedError extends Error {
  readonly name = 'NotEncryptedError' as const;
  constructor(message = 'envelope is not encrypted') {
    super(message);
  }
}

export class MalformedEnvelopeError extends Error {
  readonly name = 'MalformedEnvelopeError' as const;
  constructor(message: string) {
    super(message);
  }
}
