import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly opaqueReferenceKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('CRM_ENCRYPTION_KEY');

    if (!secret) {
      throw new InternalServerErrorException(
        'CRM_ENCRYPTION_KEY is not configured',
      );
    }

    this.key = createHash('sha256').update(secret).digest();
    this.opaqueReferenceKey = createHmac('sha256', this.key)
      .update('maya:opaque-reference:v1', 'utf8')
      .digest();
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivPart, authTagPart, encryptedPart] = payload.split('.');

    if (!ivPart || !authTagPart || !encryptedPart) {
      throw new InternalServerErrorException(
        'Invalid encrypted payload format',
      );
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Stable blind reference for identity/fingerprint use. The original value is
   * not recoverable and never appears in an ActionExecution target reference.
   */
  opaqueReference(namespace: string, value: string): string {
    const normalizedNamespace = namespace.trim();
    const normalizedValue = value.trim();
    if (!normalizedNamespace || !normalizedValue) {
      throw new InternalServerErrorException(
        'Opaque reference namespace and value are required',
      );
    }
    return createHmac('sha256', this.opaqueReferenceKey)
      .update(normalizedNamespace, 'utf8')
      .update('\0', 'utf8')
      .update(normalizedValue, 'utf8')
      .digest('hex');
  }
}
