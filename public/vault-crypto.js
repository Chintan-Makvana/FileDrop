/**
 * Friend Vault - Zero-Knowledge Client-Side Cryptography
 * Uses the Web Crypto API (AES-256-GCM + PBKDF2)
 *
 * All encryption and decryption happens exclusively in the user's browser.
 * Friend hosts and server relays never possess or see the encryption keys or plaintext.
 */

const VaultCrypto = (() => {
  const MAGIC = new TextEncoder().encode('FVAULT01'); // 8 bytes magic header
  const PBKDF2_ITERATIONS = 100000;

  /**
   * Derive a 256-bit AES-GCM key from a passphrase and salt using PBKDF2
   */
  async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt a File object with AES-256-GCM
   * Returns a self-contained opaque Blob ready for vault deposit
   */
  async function encryptFile(file, passphrase) {
    if (!passphrase || passphrase.length < 4) {
      throw new Error('Vault passphrase must be at least 4 characters');
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const fileIv = window.crypto.getRandomValues(new Uint8Array(12));
    const metaIv = window.crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(passphrase, salt);

    // Prepare metadata
    const metadata = {
      originalName: file.name,
      mimetype: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      encryptedAt: new Date().toISOString(),
    };
    const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));

    // Encrypt metadata
    const encMetaBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: metaIv },
      key,
      metaBytes
    );
    const encMetaArray = new Uint8Array(encMetaBuffer);

    // Read and encrypt file content
    const fileBuffer = await file.arrayBuffer();
    const encFileBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: fileIv },
      key,
      fileBuffer
    );
    const encFileArray = new Uint8Array(encFileBuffer);

    // Package into binary format:
    // [MAGIC (8B)] + [SALT (16B)] + [FILE_IV (12B)] + [META_IV (12B)] + [META_LEN (4B)] + [ENC_META] + [ENC_FILE]
    const headerLen = 8 + 16 + 12 + 12 + 4;
    const totalLen = headerLen + encMetaArray.byteLength + encFileArray.byteLength;
    const packaged = new Uint8Array(totalLen);

    let offset = 0;
    packaged.set(MAGIC, offset);
    offset += 8;

    packaged.set(salt, offset);
    offset += 16;

    packaged.set(fileIv, offset);
    offset += 12;

    packaged.set(metaIv, offset);
    offset += 12;

    const view = new DataView(packaged.buffer);
    view.setUint32(offset, encMetaArray.byteLength, false); // Big endian
    offset += 4;

    packaged.set(encMetaArray, offset);
    offset += encMetaArray.byteLength;

    packaged.set(encFileArray, offset);

    return {
      encryptedBlob: new Blob([packaged], { type: 'application/octet-stream' }),
      metadataSummary: {
        approxSize: totalLen,
        isEncrypted: true,
      },
    };
  }

  /**
   * Peek at encrypted metadata using passphrase (returns originalName and mimetype without downloading/decrypting entire large payload)
   */
  async function decryptVaultMetadata(headerBuffer, passphrase) {
    const bytes = new Uint8Array(headerBuffer);
    if (bytes.byteLength < 52) throw new Error('Invalid vault header');

    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== MAGIC[i]) throw new Error('Invalid vault header magic');
    }

    let offset = 8;
    const salt = bytes.slice(offset, offset + 16);
    offset += 16;
    offset += 12; // skip fileIv

    const metaIv = bytes.slice(offset, offset + 12);
    offset += 12;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const metaLen = view.getUint32(offset, false);
    offset += 4;

    const encMeta = bytes.slice(offset, offset + metaLen);
    const key = await deriveKey(passphrase, salt);

    const decMetaBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: metaIv },
      key,
      encMeta
    );
    return JSON.parse(new TextDecoder().decode(decMetaBuffer));
  }

  /**
   * Decrypt a packaged Vault ArrayBuffer back to the original File / Blob
   */
  async function decryptVaultBuffer(arrayBuffer, passphrase) {
    if (!passphrase) {
      throw new Error('Please provide the Vault Passphrase to decrypt this file');
    }

    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength < 52) {
      throw new Error('Corrupted or invalid encrypted vault payload');
    }

    // Verify magic bytes
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== MAGIC[i]) {
        throw new Error('Not a recognized Friend Vault encrypted file');
      }
    }

    let offset = 8;
    const salt = bytes.slice(offset, offset + 16);
    offset += 16;

    const fileIv = bytes.slice(offset, offset + 12);
    offset += 12;

    const metaIv = bytes.slice(offset, offset + 12);
    offset += 12;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const metaLen = view.getUint32(offset, false);
    offset += 4;

    if (offset + metaLen > bytes.byteLength) {
      throw new Error('Corrupted vault metadata segment');
    }

    const encMeta = bytes.slice(offset, offset + metaLen);
    offset += metaLen;

    const encFile = bytes.slice(offset);

    // Derive key
    const key = await deriveKey(passphrase, salt);

    // Decrypt metadata
    let metadata;
    try {
      const decMetaBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: metaIv },
        key,
        encMeta
      );
      const metaString = new TextDecoder().decode(decMetaBuffer);
      metadata = JSON.parse(metaString);
    } catch (err) {
      throw new Error('Incorrect passphrase or corrupted metadata encryption');
    }

    // Decrypt file payload
    try {
      const decFileBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fileIv },
        key,
        encFile
      );

      const decryptedBlob = new Blob([decFileBuffer], {
        type: metadata.mimetype || 'application/octet-stream',
      });

      return {
        blob: decryptedBlob,
        metadata: metadata,
        originalName: metadata.originalName || 'decrypted_file',
      };
    } catch (err) {
      throw new Error('Failed to decrypt file: Invalid passphrase or corrupted data');
    }
  }

  return {
    encryptFile,
    decryptVaultMetadata,
    decryptVaultBuffer,
  };
})();

if (typeof window !== 'undefined') {
  window.VaultCrypto = VaultCrypto;
}
