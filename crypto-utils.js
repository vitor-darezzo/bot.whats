const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // ← mais direto agora
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) {
    throw new Error('encrypt(): o texto está vazio ou indefinido.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(algorithm, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text || !text.includes(':')) {
    throw new Error('decrypt(): formato inválido ou texto ausente.');
  }

  const [ivPart, encryptedPart] = text.split(':');
  const iv = Buffer.from(ivPart, 'hex');
  const encrypted = Buffer.from(encryptedPart, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };


