/** Synthetic mechanical contract tests only: fake filesystem, digest results and
 * child-process pipes. No model assets, native OCR, downloads or real image
 * decoding are used. Actual asset SHA verification and pixel recognition belong
 * to the separate native proof; these tests prove refusal/cleanup mechanics. */
import { spawn } from 'node:child_process';
import { createHash, type BinaryLike, type Hash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  type ReadOptions,
  type ReadPosition,
} from 'node:fs';
import { resolve } from 'node:path';
import { runGoodsPhotoTesseract } from './goods-photo-tesseract';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs', () => ({
  ...jest.requireActual<typeof import('node:fs')>('node:fs'),
  closeSync: jest.fn(),
  fstatSync: jest.fn(),
  lstatSync: jest.fn(),
  openSync: jest.fn(),
  readSync: jest.fn(),
  realpathSync: jest.fn(),
}));
jest.mock('node:crypto', () => ({
  ...jest.requireActual<typeof import('node:crypto')>('node:crypto'),
  createHash: jest.fn(),
}));

const MODELS = [
  {
    fd: 101,
    name: 'eng.traineddata',
    bytes: 4113088,
    sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
  {
    fd: 102,
    name: 'rus.traineddata',
    bytes: 3861738,
    sha256: 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225',
  },
] as const;
const directory = () => resolve(process.cwd(), 'ocr-assets');
const HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const blankTsv = () =>
  Buffer.from(`${HEADER}\n1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t\n`);

// A runner-level header fixture, deliberately not a decodable image. The real
// Sharp boundary and actual encoded images are covered separately.
function normalizedHeader(): Buffer {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(100, 16);
  png.writeUInt32BE(100, 20);
  return png;
}

function fileStat(size: number, nlink = 1): ReturnType<typeof fstatSync> {
  return {
    isFile: () => true,
    nlink,
    size,
  } as ReturnType<typeof fstatSync>;
}
function directoryStat(symlink = false): ReturnType<typeof lstatSync> {
  return {
    isDirectory: () => true,
    isSymbolicLink: () => symlink,
  } as ReturnType<typeof lstatSync>;
}

let actualSizes: Map<number, number>;
let mismatchedDigestSize: number | undefined;
let reads: { fd: number; capacity: number; offset: number; length: number }[];

function readModel(
  fd: number,
  buffer: NodeJS.ArrayBufferView,
  offsetOrOptions?: number | ReadOptions,
  length?: number,
  position?: ReadPosition | null,
): number {
  if (
    !Buffer.isBuffer(buffer) ||
    typeof offsetOrOptions !== 'number' ||
    typeof length !== 'number' ||
    typeof position !== 'number'
  )
    throw new Error('fixture_expected_bounded_positional_read');
  reads.push({ fd, capacity: buffer.length, offset: offsetOrOptions, length });
  const size = actualSizes.get(fd);
  if (size === undefined) throw new Error('fixture_unknown_fd');
  const count = Math.min(length, Math.max(0, size - position));
  buffer.fill(65, offsetOrOptions, offsetOrOptions + count);
  return count;
}

function validSyntheticAssets(): void {
  actualSizes = new Map(MODELS.map((model) => [model.fd, model.bytes]));
  mismatchedDigestSize = undefined;
  reads = [];
  jest.mocked(lstatSync).mockReturnValue(directoryStat());
  jest.mocked(realpathSync).mockImplementation((path) => String(path));
  jest.mocked(openSync).mockImplementation((path) => {
    const model = MODELS.find(
      (candidate) => String(path) === resolve(directory(), candidate.name),
    );
    if (!model) throw new Error('fixture_unexpected_path');
    return model.fd;
  });
  jest.mocked(fstatSync).mockImplementation((fd) => {
    const model = MODELS.find((candidate) => candidate.fd === fd);
    if (!model) throw new Error('fixture_unknown_fd');
    return fileStat(model.bytes);
  });
  jest.mocked(readSync).mockImplementation(readModel);
  // This mock certifies no model bytes. It controls only the digest comparison
  // branch after the runner has read the exact bounded synthetic file length.
  jest.mocked(createHash).mockImplementation((algorithm) => {
    if (algorithm !== 'sha256') throw new Error('fixture_unexpected_digest');
    let size = -1;
    const hash = {
      update: jest.fn<unknown, [BinaryLike]>(),
      digest: jest.fn((encoding: string) => {
        if (encoding !== 'hex') throw new Error('fixture_expected_hex');
        const model = MODELS.find((candidate) => candidate.bytes === size);
        return size === mismatchedDigestSize ? '0'.repeat(64) : model?.sha256;
      }),
    };
    hash.update.mockImplementation((bytes) => {
      if (!Buffer.isBuffer(bytes)) throw new Error('fixture_expected_buffer');
      size = bytes.length;
      return hash;
    });
    return hash as unknown as Hash;
  });
}

function worker() {
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), {
      end: jest.fn<void, [Buffer]>(),
    }),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn<boolean, [NodeJS.Signals]>(() => true),
  });
  jest
    .mocked(spawn)
    .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}

function refused(pending: Promise<unknown>, message: string) {
  return expect(pending).rejects.toMatchObject({
    response: { message, error: 'Service Unavailable', statusCode: 503 },
  });
}

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const archDescriptor = Object.getOwnPropertyDescriptor(process, 'arch');
function platformFixture(key: 'platform' | 'arch', value: string): void {
  Object.defineProperty(process, key, { configurable: true, value });
}

describe('Tesseract runner [synthetic process/assets/digest contract only]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    platformFixture('platform', 'linux');
    validSyntheticAssets();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (platformDescriptor)
      Object.defineProperty(process, 'platform', platformDescriptor);
    if (archDescriptor) Object.defineProperty(process, 'arch', archDescriptor);
  });

  it.each<[NodeJS.Platform, NodeJS.Architecture, string]>([
    ['linux', 'x64', '/usr/bin/tesseract'],
    ['darwin', 'arm64', '/opt/homebrew/bin/tesseract'],
    ['darwin', 'x64', '/usr/local/bin/tesseract'],
  ])(
    'uses the fixed %s/%s binary, bounded argv and a clean environment',
    async (platform, arch, executable) => {
      platformFixture('platform', platform);
      platformFixture('arch', arch);
      jest.replaceProperty(process, 'env', {
        ...process.env,
        PRIVATE_SYNTHETIC_CREDENTIAL: 'DO_NOT_INHERIT',
        TESSDATA_PREFIX: '/PRIVATE_OVERRIDE',
      });
      const child = worker();
      const input = normalizedHeader();
      const pending = runGoodsPhotoTesseract(input);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(spawn).toHaveBeenCalledWith(
        executable,
        [
          'stdin',
          'stdout',
          '--tessdata-dir',
          directory(),
          '-l',
          'rus+eng',
          '--oem',
          '1',
          '--psm',
          '6',
          '--dpi',
          '300',
          '-c',
          'tessedit_create_tsv=1',
        ],
        {
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            PATH: '/usr/bin:/bin',
            LANG: 'C',
            LC_ALL: 'C',
            OMP_THREAD_LIMIT: '1',
            OMP_NUM_THREADS: '1',
          },
        },
      );
      expect(child.stdin.end).toHaveBeenCalledWith(input);
      for (const model of MODELS) {
        expect(openSync).toHaveBeenCalledWith(
          resolve(directory(), model.name),
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        expect(closeSync).toHaveBeenCalledWith(model.fd);
        expect(reads.filter((read) => read.fd === model.fd)).toEqual([
          {
            fd: model.fd,
            capacity: model.bytes + 1,
            offset: 0,
            length: model.bytes + 1,
          },
          {
            fd: model.fd,
            capacity: model.bytes + 1,
            offset: model.bytes,
            length: 1,
          },
        ]);
      }
      const bytes = blankTsv();
      child.stdout.emit('data', bytes);
      child.emit('close', 0);
      await expect(pending).resolves.toMatchObject({
        contract: 'maya.tesseract.words/1',
        words: [],
      });
      expect(bytes.every((byte) => byte === 0)).toBe(true);
      expect(child.kill).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('refuses unsupported hosts before touching assets or spawning a worker', async () => {
    platformFixture('platform', 'win32');
    await refused(
      runGoodsPhotoTesseract(normalizedHeader()),
      'goods_photo_parser_not_configured',
    );
    expect(lstatSync).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses missing assets without spawning, leaking paths or leaving an opened first file', async () => {
    jest
      .mocked(openSync)
      .mockImplementationOnce(() => MODELS[0].fd)
      .mockImplementationOnce(() => {
        throw new Error('ENOENT /PRIVATE_MODEL');
      });
    await refused(
      runGoodsPhotoTesseract(normalizedHeader()),
      'goods_photo_parser_not_configured',
    );
    expect(closeSync).toHaveBeenCalledTimes(1);
    expect(closeSync).toHaveBeenCalledWith(MODELS[0].fd);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['directory symlink', 'symlink parent'])(
    'refuses a %s before opening model files',
    async (kind) => {
      if (kind === 'directory symlink')
        jest.mocked(lstatSync).mockReturnValue(directoryStat(true));
      else jest.mocked(realpathSync).mockReturnValue('/PRIVATE_OTHER_ASSETS');
      await refused(
        runGoodsPhotoTesseract(normalizedHeader()),
        'goods_photo_parser_not_configured',
      );
      expect(openSync).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it.each(['hardlink', 'wrong size'])(
    'refuses asset metadata %s before reading its bytes',
    async (kind) => {
      jest
        .mocked(fstatSync)
        .mockReturnValueOnce(
          fileStat(
            MODELS[0].bytes + (kind === 'wrong size' ? 1 : 0),
            kind === 'hardlink' ? 2 : 1,
          ),
        );
      await refused(
        runGoodsPhotoTesseract(normalizedHeader()),
        'goods_photo_parser_not_configured',
      );
      expect(readSync).not.toHaveBeenCalled();
      expect(closeSync).toHaveBeenCalledWith(MODELS[0].fd);
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('refuses a digest mismatch on the second model and closes both descriptors', async () => {
    mismatchedDigestSize = MODELS[1].bytes;
    await refused(
      runGoodsPhotoTesseract(normalizedHeader()),
      'goods_photo_parser_not_configured',
    );
    expect(closeSync).toHaveBeenCalledTimes(2);
    expect(closeSync).toHaveBeenCalledWith(MODELS[0].fd);
    expect(closeSync).toHaveBeenCalledWith(MODELS[1].fd);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([-1, 1000])(
    'refuses a file changing size by %s bytes during bounded reading',
    async (change) => {
      actualSizes.set(MODELS[0].fd, MODELS[0].bytes + change);
      await refused(
        runGoodsPhotoTesseract(normalizedHeader()),
        'goods_photo_parser_not_configured',
      );
      expect(reads.every((read) => read.capacity === MODELS[0].bytes + 1)).toBe(
        true,
      );
      expect(reads.length).toBeLessThanOrEqual(2);
      expect(createHash).not.toHaveBeenCalled();
      expect(closeSync).toHaveBeenCalledWith(MODELS[0].fd);
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it('closes an opened file when the bounded read throws', async () => {
    jest.mocked(readSync).mockImplementationOnce(() => {
      throw new Error('EIO /PRIVATE_MODEL');
    });
    await refused(
      runGoodsPhotoTesseract(normalizedHeader()),
      'goods_photo_parser_not_configured',
    );
    expect(closeSync).toHaveBeenCalledWith(MODELS[0].fd);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('kills a timed-out worker once, never retries, and waits for close before settling', async () => {
    const child = worker();
    const pending = runGoodsPhotoTesseract(normalizedHeader());
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
    const rejection = refused(pending, 'goods_photo_ocr_timeout');
    const retained = Buffer.from('PRIVATE_PARTIAL_OCR');
    child.stdout.emit('data', retained);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    child.emit('close', null);
    await rejection;
    expect(await settlement).toBe('rejected');
    expect(retained.every((byte) => byte === 0)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    ['stdout', 256 * 1024, 'goods_photo_ocr_output_limit'],
    ['stderr', 4096, 'goods_photo_ocr_unavailable'],
  ] as const)(
    'enforces cumulative %s cap, kills and cleans retained output only after close',
    async (stream, cap, code) => {
      const child = worker();
      const pending = runGoodsPhotoTesseract(normalizedHeader());
      const rejection = refused(pending, code);
      const output = stream === 'stdout' ? Buffer.alloc(cap, 65) : blankTsv();
      child.stdout.emit('data', output);
      const diagnostic = Buffer.alloc(cap, 66);
      if (stream === 'stderr') child.stderr.emit('data', diagnostic);
      expect(child.kill).not.toHaveBeenCalled();
      const overflow = Buffer.from('X');
      child[stream].emit('data', overflow);
      expect(child.kill).toHaveBeenCalledTimes(1);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      expect(overflow[0]).toBe(0);
      child.emit('close', null);
      await rejection;
      expect(output.every((byte) => byte === 0)).toBe(true);
      if (stream === 'stderr')
        expect(diagnostic.every((byte) => byte === 0)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('sanitizes ENOENT, waits for close and does not retry another binary', async () => {
    const child = worker();
    const pending = runGoodsPhotoTesseract(normalizedHeader());
    const rejection = refused(pending, 'goods_photo_parser_not_configured');
    child.emit(
      'error',
      Object.assign(new Error('ENOENT /PRIVATE_BINARY'), { code: 'ENOENT' }),
    );
    child.emit('close', -2);
    await rejection;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.kill).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('kills on an input pipe error and rejects even if a late close reports success', async () => {
    const child = worker();
    const pending = runGoodsPhotoTesseract(normalizedHeader());
    const rejection = refused(pending, 'goods_photo_ocr_unavailable');
    child.stdin.emit('error', new Error('EPIPE PRIVATE_DIAGNOSTIC'));
    child.emit('close', 0);
    await rejection;
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['nonzero exit', 'empty stdout', 'malformed TSV'])(
    'refuses %s without forwarding private output or retrying',
    async (kind) => {
      const child = worker();
      const pending = runGoodsPhotoTesseract(normalizedHeader());
      const output = Buffer.from('PRIVATE_OCR_TEXT');
      const diagnostic = Buffer.from('PRIVATE_NATIVE_DIAGNOSTIC');
      child.stderr.emit('data', diagnostic);
      if (kind !== 'empty stdout') child.stdout.emit('data', output);
      child.emit('close', kind === 'nonzero exit' ? 1 : 0);
      await refused(
        pending,
        kind === 'malformed TSV'
          ? 'goods_photo_ocr_output_invalid'
          : 'goods_photo_ocr_unavailable',
      );
      if (kind !== 'empty stdout')
        expect(output.every((byte) => byte === 0)).toBe(true);
      expect(diagnostic.every((byte) => byte === 0)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
});
