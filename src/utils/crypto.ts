export interface EncryptedPackage {
  format: 'DEPED-AOII-ENCRYPTED-PACKAGE';
  version: 1;
  type: 'DATABASE_EXPORT' | 'SINGLE_PERSONNEL_EXPORT';
  timestamp: string;
  metadata: {
    exportDate: string;
    itemCount: number;
    description: string;
  };
  salt: string; // Base64
  iv: string; // Base64
  ciphertext: string; // Base64
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptDataWithPIN(
  data: unknown,
  pin: string,
  type: 'DATABASE_EXPORT' | 'SINGLE_PERSONNEL_EXPORT',
  itemCount = 1,
  description = 'DepEd Zamboanga Division Secure Portable Record'
): Promise<EncryptedPackage> {
  if (!pin || pin.length < 4) {
    throw new Error('PIN code must be at least 4 digits.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);

  const jsonString = JSON.stringify(data);
  const enc = new TextEncoder();
  const encodedData = enc.encode(jsonString);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encodedData
  );

  return {
    format: 'DEPED-AOII-ENCRYPTED-PACKAGE',
    version: 1,
    type,
    timestamp: new Date().toISOString(),
    metadata: {
      exportDate: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' }),
      itemCount,
      description,
    },
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(encryptedBuffer),
  };
}

export async function decryptDataWithPIN<T = unknown>(
  pkg: EncryptedPackage,
  pin: string
): Promise<T> {
  if (pkg.format !== 'DEPED-AOII-ENCRYPTED-PACKAGE') {
    throw new Error('Invalid file format. Not an authorized DepEd AOII Encrypted Package.');
  }

  if (!pin || pin.length < 4) {
    throw new Error('PIN code must be at least 4 digits.');
  }

  try {
    const saltBuffer = new Uint8Array(base64ToBuffer(pkg.salt));
    const ivBuffer = new Uint8Array(base64ToBuffer(pkg.iv));
    const ciphertextBuffer = base64ToBuffer(pkg.ciphertext);

    const key = await deriveKey(pin, saltBuffer);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer,
      },
      key,
      ciphertextBuffer
    );

    const dec = new TextDecoder();
    const jsonString = dec.decode(decryptedBuffer);
    return JSON.parse(jsonString) as T;
  } catch {
    throw new Error('Decryption failed! Incorrect PIN code or corrupted package data.');
  }
}
