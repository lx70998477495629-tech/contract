import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export function encrypt(plain: string, masterKeyBase64: string) {
  const key = Buffer.from(masterKeyBase64, 'base64'); if (key.length !== 32) throw new Error('APP_MASTER_KEY_BASE64 必须解码为 32 字节');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const value = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), value]).toString('base64');
}
export function decrypt(encoded: string, masterKeyBase64: string) {
  const raw = Buffer.from(encoded, 'base64'), key = Buffer.from(masterKeyBase64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0,12)); decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
