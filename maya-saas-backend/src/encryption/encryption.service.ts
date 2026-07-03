import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('CRM_ENCRYPTION_KEY');

    if (!secret) {
      throw new InternalServerErrorException(
        'CRM_ENCRYPTION_KEY is not configured',
      );
    }

    this.key = createHash('sha256').update(secret).digest();
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
}
