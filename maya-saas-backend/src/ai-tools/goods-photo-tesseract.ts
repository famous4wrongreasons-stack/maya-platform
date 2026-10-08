/** Fixed local Tesseract CLI edge. No package installation, network fallback,
 * caller paths/languages/configuration or original-document files. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';

const MAX_OUTPUT = 256 * 1024;
const MODEL_FILES = [
  {
    name: 'eng.traineddata',
    bytes: 4113088,
    sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
  },
  {
    name: 'rus.traineddata',
    bytes: 3861738,
    sha256: 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225',
  },
] as const;
const TSV_HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
function fail(code: string): never {
  throw new ServiceUnavailableException(code);
}

function modelsDirectory(): string {
  const directory = resolve(process.cwd(), 'ocr-assets');
  try {
    const directoryStat = lstatSync(directory);
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      realpathSync(directory) !== directory
    )
      throw new Error('model_directory');
    for (const model of MODEL_FILES) {
      const fd = openSync(
        resolve(directory, model.name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size !== model.bytes)
          throw new Error('model_size');
        // Fixed-size reads also bound a malformed or concurrently growing asset.
        const bytes = Buffer.alloc(model.bytes + 1);
        let length = 0;
        while (length < bytes.length) {
          const count = readSync(
            fd,
            bytes,
            length,
            bytes.length - length,
            length,
          );
          if (!count) break;
          length += count;
        }
        if (
          length !== model.bytes ||
          createHash('sha256')
            .update(bytes.subarray(0, length))
            .digest('hex') !== model.sha256
        )
          throw new Error('model_hash');
      } finally {
        closeSync(fd);
      }
    }
  } catch {
    fail('goods_photo_parser_not_configured');
  }
  return directory;
}

/** Translate measured TSV pixel boxes, never split or fabricate word positions. */
export function tesseractWords(
  tsv: string,
  imageWidth: number,
  imageHeight: number,
): unknown {
  const invalid = (): never => fail('goods_photo_ocr_output_invalid');
  if (
    !Number.isSafeInteger(imageWidth) ||
    !Number.isSafeInteger(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    imageWidth * imageHeight > 12_000_000 ||
    Buffer.byteLength(tsv) > MAX_OUTPUT
  )
    invalid();
  const lines = tsv.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.shift() !== TSV_HEADER || lines.length > 6000) invalid();
  let pages = 0;
  const words: {
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    confidence: number;
  }[] = [];
  for (const line of lines) {
    const fields = line.split('\t');
    if (
      fields.length !== 12 ||
      fields.slice(0, 10).some((value) => !/^(0|[1-9]\d{0,6})$/.test(value))
    )
      invalid();
    const [
      level,
      page,
      block,
      paragraph,
      lineNumber,
      wordNumber,
      left,
      top,
      width,
      height,
    ] = fields.slice(0, 10).map(Number);
    if (
      level < 1 ||
      level > 5 ||
      page !== 1 ||
      left + width > imageWidth ||
      top + height > imageHeight
    )
      invalid();
    if (level === 1) {
      pages += 1;
      if (
        pages !== 1 ||
        block ||
        paragraph ||
        lineNumber ||
        wordNumber ||
        left ||
        top ||
        width !== imageWidth ||
        height !== imageHeight
      )
        invalid();
    }
    if (level !== 5) {
      if (fields[10] !== '-1' || fields[11] !== '') invalid();
      continue;
    }
    if (
      !pages ||
      !block ||
      !paragraph ||
      !lineNumber ||
      !wordNumber ||
      width <= 0 ||
      height <= 0 ||
      !/^(?:\d{1,3})(?:\.\d{1,8})?$/.test(fields[10])
    )
      invalid();
    const confidence = Number(fields[10]);
    if (/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(fields[11])) invalid();
    const text = fields[11].trim();
    if (
      confidence > 100 ||
      !text ||
      text.length > 256 ||
      /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(text) ||
      words.length >= 4000
    )
      invalid();
    words.push({
      text,
      left: left / imageWidth,
      top: top / imageHeight,
      width: width / imageWidth,
      height: height / imageHeight,
      confidence: confidence / 100,
    });
  }
  if (pages !== 1) invalid();
  return {
    contract: 'maya.tesseract.words/1',
    image_width: imageWidth,
    image_height: imageHeight,
    revision: 1,
    languages: ['rus', 'eng'],
    words,
  };
}

export async function runGoodsPhotoTesseract(png: Buffer): Promise<unknown> {
  if (
    png.length < 24 ||
    png.length > 16 * 1024 * 1024 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    fail('goods_photo_ocr_output_invalid');
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  if (!width || !height || width * height > 12_000_000)
    fail('goods_photo_ocr_output_invalid');
  const executable =
    process.platform === 'linux'
      ? '/usr/bin/tesseract'
      : process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? '/opt/homebrew/bin/tesseract'
          : '/usr/local/bin/tesseract'
        : null;
  if (!executable) fail('goods_photo_parser_not_configured');
  const directory = modelsDirectory();
  const chunks: Buffer[] = [];
  let joined: Buffer | undefined;
  try {
    await new Promise<void>((resolveDone, reject) => {
      const child = spawn(
        executable,
        [
          'stdin',
          'stdout',
          '--tessdata-dir',
          directory,
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
      let failure: string | undefined,
        bytes = 0,
        stderrBytes = 0;
      const stop = (code: string) => {
        failure ??= code;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(() => stop('goods_photo_ocr_timeout'), 15_000);
      child.on('error', () => {
        failure ??= 'goods_photo_parser_not_configured';
      });
      child.stdin.on('error', () => stop('goods_photo_ocr_unavailable'));
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT || failure) {
          chunk.fill(0);
          stop('goods_photo_ocr_output_limit');
        } else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.length;
        chunk.fill(0);
        if (stderrBytes > 4096) stop('goods_photo_ocr_unavailable');
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (failure || code !== 0 || !bytes)
          reject(
            new ServiceUnavailableException(
              failure ?? 'goods_photo_ocr_unavailable',
            ),
          );
        else resolveDone();
      });
      child.stdin.end(png);
    });
    joined = Buffer.concat(chunks);
    return tesseractWords(joined.toString('utf8'), width, height);
  } finally {
    joined?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}
