import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Package5TeamObjectStore } from './package5-team-object-store';

import type {
  Package5Wave4ObjectStore,
  Package5Wave4StoredObject,
} from './package5-wave4.service';

const EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

/** Content-bound storage adapter: request identity fixes the object key. */
@Injectable()
export class Package5Wave4FileObjectStore implements Package5Wave4ObjectStore {
  constructor(private readonly config: ConfigService) {}

  /** R12 uses this same local storage surface, outside public upload roots. */
  privateTeam() {
    return new Package5TeamObjectStore(this.config.get<string>('UPLOAD_ROOT')?.trim() || join(process.cwd(), 'uploads'));
  }

  async put(input: {
    requestIdentityHash: string;
    contentHash: string;
    mimeType: string;
    bytes: Buffer;
  }): Promise<Package5Wave4StoredObject> {
    const extension = EXTENSIONS.get(input.mimeType);
    if (!extension) throw new Error('Unsupported provider avatar MIME type');
    if (this.hash(input.bytes) !== input.contentHash)
      throw new Error('Provider avatar content hash mismatch');
    const filename = this.filename(input.requestIdentityHash, extension);
    const directory = this.directory();
    const path = join(directory, filename);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(path, input.bytes, { flag: 'wx' });
    } catch (error) {
      const existing = await this.read(path);
      if (!existing || this.hash(existing) !== input.contentHash) throw error;
    }
    return {
      url: `/api/public/uploads/provider-avatars/${filename}`,
      contentHash: input.contentHash,
    };
  }

  async head(
    requestIdentityHash: string,
  ): Promise<Package5Wave4StoredObject | null> {
    for (const extension of EXTENSIONS.values()) {
      const filename = this.filename(requestIdentityHash, extension);
      const bytes = await this.read(join(this.directory(), filename));
      if (bytes) {
        return {
          url: `/api/public/uploads/provider-avatars/${filename}`,
          contentHash: this.hash(bytes),
        };
      }
    }
    return null;
  }

  private filename(requestIdentityHash: string, extension: string) {
    if (!/^[0-9a-f]{64}$/.test(requestIdentityHash))
      throw new Error('Provider avatar request identity is invalid');
    return `p5w4-${requestIdentityHash}.${extension}`;
  }

  private directory() {
    const root =
      this.config.get<string>('UPLOAD_ROOT')?.trim() ||
      join(process.cwd(), 'uploads');
    return resolve(root, 'provider-avatars');
  }

  private hash(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
  }

  private async read(path: string) {
    try {
      return await readFile(path);
    } catch (error) {
      const code: unknown =
        error && typeof error === 'object' ? Reflect.get(error, 'code') : null;
      if (code === 'ENOENT') return null;
      throw error;
    }
  }
}
