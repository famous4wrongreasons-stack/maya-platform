import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { structureGoodsPhotoOcrRows } from './goods-photo-ocr-rows';
import { runGoodsPhotoTesseract } from './goods-photo-tesseract';

const MAX_INPUT = 2 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;
const MAX_PNG = 16 * 1024 * 1024;
const MAX_OUTPUT = 256 * 1024;
const WORKER_TIMEOUT_MS = 15_000;
let processing = false;

function unavailable(code: string): ServiceUnavailableException {
  return new ServiceUnavailableException(code);
}

/** Fixed local executable, no shell, path/URL argument or inherited credentials.
 * The build script compiles only the reviewed Swift source, separately from requests.
 * Resolve relative to the backend working directory used by its existing start scripts. */
export async function runGoodsPhotoVision(png: Buffer): Promise<unknown> {
  if (!png.length || png.length > MAX_PNG)
    throw new BadRequestException('goods_photo_image_invalid');
  const chunks: Buffer[] = [];
  let joined: Buffer | undefined;
  try {
    await new Promise<void>((resolveDone, reject) => {
      const child = spawn(
        resolve(process.cwd(), 'dist/ocr/goods-photo-vision'),
        [],
        {
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            PATH: '/usr/bin:/bin',
            LANG: 'en_US.UTF-8',
            LC_ALL: 'en_US.UTF-8',
          },
        },
      );
      let failure: string | undefined;
      let size = 0;
      let stderrSize = 0;
      const stop = (code: string) => {
        failure ??= code;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(
        () => stop('goods_photo_ocr_timeout'),
        WORKER_TIMEOUT_MS,
      );
      child.on('error', () => {
        failure ??= 'goods_photo_parser_not_configured';
      });
      child.stdin.on('error', () => stop('goods_photo_ocr_unavailable'));
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_OUTPUT || failure) {
          chunk.fill(0);
          stop('goods_photo_ocr_output_limit');
        } else chunks.push(chunk);
      });
      // Native diagnostics may contain provider/framework details. Never log or forward them.
      child.stderr.on('data', (chunk: Buffer) => {
        stderrSize += chunk.length;
        chunk.fill(0);
        if (stderrSize > 4096) stop('goods_photo_ocr_unavailable');
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (failure || code !== 0 || !size)
          reject(unavailable(failure ?? 'goods_photo_ocr_unavailable'));
        else resolveDone();
      });
      child.stdin.end(png);
    });
    joined = Buffer.concat(chunks);
    try {
      return JSON.parse(joined.toString('utf8')) as unknown;
    } catch {
      throw unavailable('goods_photo_ocr_output_invalid');
    }
  } finally {
    joined?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

/** Executable opt-in local OCR. No external image/model transport or photo store. */
@Injectable()
export class GoodsPhotoParser {
  constructor(@Optional() private readonly config?: ConfigService) {}

  parse(bytes: Uint8Array): Promise<unknown> {
    const provider = this.config?.get<string>('GOODS_PHOTO_OCR_PROVIDER');
    if (
      (provider !== 'tesseract' && provider !== 'apple_vision') ||
      (provider === 'apple_vision' && process.platform !== 'darwin')
    )
      throw unavailable('goods_photo_parser_not_configured');
    if (processing) throw unavailable('goods_photo_ocr_busy');
    if (!bytes.length || bytes.length > MAX_INPUT)
      throw new BadRequestException('goods_photo_image_invalid');
    processing = true;
    return this.recognize(bytes, provider).finally(() => {
      processing = false;
    });
  }

  private async recognize(
    bytes: Uint8Array,
    provider: 'apple_vision' | 'tesseract',
  ) {
    const input = Buffer.from(bytes);
    let png: Buffer | undefined;
    try {
      try {
        const decoder = sharp(input, {
          limitInputPixels: MAX_PIXELS,
          failOn: 'warning',
          sequentialRead: true,
        });
        const metadata = await decoder.metadata();
        if (
          !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
          (metadata.pages ?? 1) !== 1 ||
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > MAX_PIXELS
        )
          throw new Error('unsupported_image');
        png = await decoder
          .rotate()
          .flatten({ background: '#ffffff' })
          .removeAlpha()
          .resize({
            width: 2600,
            height: 2600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png()
          .timeout({ seconds: 5 })
          .toBuffer();
        if (png.length > MAX_PNG) throw new Error('image_output_limit');
      } catch {
        throw new BadRequestException('goods_photo_image_invalid');
      }
      const words =
        provider === 'tesseract'
          ? await runGoodsPhotoTesseract(png)
          : await runGoodsPhotoVision(png);
      try {
        return structureGoodsPhotoOcrRows(words);
      } catch {
        throw new BadRequestException('goods_photo_ocr_table_unsupported');
      }
    } finally {
      input.fill(0);
      png?.fill(0);
    }
  }
}
