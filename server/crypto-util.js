import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SALT_LEN = 32;

function getKey(secret) {
  if (!secret || secret.length < 32) {
    throw new Error('CRYPTO_SECRET must be set and at least 32 characters');
  }
  return crypto.scryptSync(secret.slice(0, 64), 'messenger-salt', KEY_LEN);
}

export function encrypt(text, secret) {
  if (!text) return { encrypted: '', iv: '', tag: '' };
  const key = getKey(secret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decrypt(encrypted, iv, tag, secret) {
  if (!encrypted) return '';
  const key = getKey(secret);
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return decipher.update(Buffer.from(encrypted, 'base64'), undefined, 'utf8') + decipher.final('utf8');
}
