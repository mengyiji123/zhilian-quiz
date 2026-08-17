import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { config } from './config.js'

export interface EncryptedSecret {
  ciphertext: string
  iv: string
  tag: string
}

function keyBuffer(): Buffer {
  if (!config.encryptionKey) {
    throw new Error('APP_ENCRYPTION_KEY 未配置，无法保存或读取 AI Key')
  }
  return Buffer.from(config.encryptionKey, 'hex')
}

export function encryptSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  }
}

export function decryptSecret(value: EncryptedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer(), Buffer.from(value.iv, 'hex'))
  decipher.setAuthTag(Buffer.from(value.tag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
