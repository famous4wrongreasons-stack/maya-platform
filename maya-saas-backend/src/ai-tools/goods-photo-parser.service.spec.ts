/** Actual Sharp decoder boundaries plus synthetic worker pipes. Neither proves
 * OCR; the separate local image probe invokes the compiled native recognizer. */
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  GoodsPhotoParser,
  runGoodsPhotoVision,
} from './goods-photo-parser.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
function worker(closeOnKill = true) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: jest.fn(() => {
      if (closeOnKill) queueMicrotask(() => child.emit('close', null));
      return true;
    }),
  });
  jest
    .mocked(spawn)
    .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}
const itOnMac = process.platform === 'darwin' ? it : it.skip;
const configuredParser = () =>
  new GoodsPhotoParser(
    new ConfigService({ GOODS_PHOTO_OCR_PROVIDER: 'apple_vision' }),
  );

describe('local goods image parser boundary [synthetic process pipes, not recognition]', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());
  it('has no automatic model, external or native activation', () => {
    expect(() => new GoodsPhotoParser().parse(new Uint8Array([1]))).toThrow(
      'goods_photo_parser_not_configured',
    );
    expect(spawn).not.toHaveBeenCalled();
  });
  itOnMac('refuses malformed decoded images before native OCR', async () => {
    const parser = configuredParser();
    await expect(parser.parse(Buffer.from('not an image'))).rejects.toThrow(
      'goods_photo_image_invalid',
    );
    expect(spawn).not.toHaveBeenCalled();
  });
  itOnMac(
    'rejects a valid low-byte PNG whose raster exceeds 12 MP before a worker starts',
    async () => {
      // A real solid-color raster, encoded by Sharp: tiny compressed bytes cannot
      // bypass the decoded-pixel limit. No invented PNG header or decoder mock.
      const bytes = await sharp({
        create: {
          width: 4001,
          height: 3000,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const metadata = await sharp(bytes).metadata();
      expect(metadata).toMatchObject({
        format: 'png',
        width: 4001,
        height: 3000,
      });
      expect(bytes.length).toBeLessThan(128 * 1024);
      expect(metadata.width * metadata.height).toBeGreaterThan(12_000_000);
      await expect(configuredParser().parse(bytes)).rejects.toThrow(
        'goods_photo_image_invalid',
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
  itOnMac(
    'rejects an actually truncated encoded raster before native OCR',
    async () => {
      // Generate an uncompressed valid 64×64 PNG, then remove its latter half.
      // The signature/IHDR remain intact while the actual image stream is cut.
      const complete = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#7b91ab' },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(await sharp(complete).metadata()).toMatchObject({
        format: 'png',
        width: 64,
        height: 64,
      });
      const truncated = complete.subarray(0, Math.floor(complete.length / 2));
      expect(truncated.length).toBeGreaterThan(33);
      expect(truncated.subarray(0, 33)).toEqual(complete.subarray(0, 33));
      await expect(configuredParser().parse(truncated)).rejects.toThrow(
        'goods_photo_image_invalid',
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
  itOnMac(
    'rejects a valid two-frame WebP instead of silently recognizing the first frame',
    async () => {
      // Two different 2×2 RGB frames in a 2×4 raw stack. pageHeight is the real
      // Sharp animation input; its decoder must report two pages in the encoded WebP.
      const pixels = Buffer.from([
        255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0,
        255, 0, 0, 255,
      ]);
      const bytes = await sharp(pixels, {
        raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
      })
        .webp({ lossless: true, loop: 0, delay: [100, 100] })
        .toBuffer();
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: 'webp',
        width: 2,
        pages: 2,
      });
      expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
      await expect(configuredParser().parse(bytes)).rejects.toThrow(
        'goods_photo_image_invalid',
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
  itOnMac(
    'refuses more than 2 MiB of valid raster bytes synchronously before worker dispatch',
    async () => {
      // Disabling PNG compression gives a bounded 1 MP raster a genuine >2 MiB
      // encoding. It is not a tiny image with arbitrary padding appended to it.
      const bytes = await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: 'png',
        width: 1024,
        height: 1024,
      });
      expect(bytes.length).toBeGreaterThan(2 * 1024 * 1024);
      expect(() => configuredParser().parse(bytes)).toThrow(
        'goods_photo_image_invalid',
      );
      expect(spawn).not.toHaveBeenCalled();
    },
  );
  it('uses one fixed executable with no shell, caller path or inherited secrets and wipes stdout bytes', async () => {
    const child = worker(),
      pending = runGoodsPhotoVision(Buffer.from('normalized-png'));
    expect(spawn).toHaveBeenCalledWith(
      expect.stringMatching(/\/dist\/ocr\/goods-photo-vision$/),
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
    const bytes = Buffer.from('{"result":"SYNTHETIC"}');
    child.stdout.write(bytes);
    child.emit('close', 0);
    await expect(pending).resolves.toEqual({ result: 'SYNTHETIC' });
    expect(bytes.every((value) => value === 0)).toBe(true);
  });
  it('withholds raw OCR/diagnostics when a local worker fails', async () => {
    const child = worker(),
      pending = runGoodsPhotoVision(Buffer.from('png'));
    const output = Buffer.from('PRIVATE_IMAGE_TEXT'),
      error = Buffer.from('PRIVATE_DIAGNOSTIC');
    child.stdout.write(output);
    child.stderr.write(error);
    child.emit('close', 1);
    await expect(pending).rejects.toThrow('goods_photo_ocr_unavailable');
    expect(output.every((value) => value === 0)).toBe(true);
    expect(error.every((value) => value === 0)).toBe(true);
  });
  it('bounds worker output and kills only that child', async () => {
    const child = worker(),
      pending = runGoodsPhotoVision(Buffer.from('png'));
    const output = Buffer.alloc(256 * 1024 + 1, 65);
    child.stdout.write(output);
    await expect(pending).rejects.toThrow('goods_photo_ocr_output_limit');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(output.every((value) => value === 0)).toBe(true);
  });
  it('does not retry or settle before its timed-out worker closes', async () => {
    jest.useFakeTimers();
    const child = worker(false),
      pending = runGoodsPhotoVision(Buffer.from('png'));
    let settled = false;
    const settlement = pending.then(
      () => {
        settled = true;
        return 'fulfilled';
      },
      () => {
        settled = true;
        return 'rejected';
      },
    );
    const rejected = expect(pending).rejects.toThrow('goods_photo_ocr_timeout');
    await jest.advanceTimersByTimeAsync(15_000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(settled).toBe(false);
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('close', null);
    await rejected;
    expect(await settlement).toBe('rejected');
    expect(settled).toBe(true);
  });
  it('refuses an absent executable without disclosing local paths', async () => {
    const child = worker(),
      pending = runGoodsPhotoVision(Buffer.from('png'));
    child.emit('error', new Error('ENOENT /PRIVATE_PATH'));
    child.emit('close', -2);
    await expect(pending).rejects.toThrow('goods_photo_parser_not_configured');
  });
  it('rejects non-JSON output without relaying it', async () => {
    const child = worker(),
      pending = runGoodsPhotoVision(Buffer.from('png'));
    child.stdout.write(Buffer.from('PRIVATE_NOT_JSON'));
    child.emit('close', 0);
    await expect(pending).rejects.toThrow('goods_photo_ocr_output_invalid');
  });
});
