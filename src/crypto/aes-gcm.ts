const IV_BYTE_LENGTH = 12;

export async function encryptAesGcm(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(encrypted)),
    iv: uint8ArrayToBase64(iv),
  };
}

export async function decryptAesGcm(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const ivBytes = base64ToUint8Array(iv);
  const ciphertextBytes = base64ToUint8Array(ciphertext);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertextBytes,
  );
  return new TextDecoder().decode(decrypted);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
