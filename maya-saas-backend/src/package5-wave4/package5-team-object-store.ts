import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const TEAM_CHUNK_BYTES = 6291456;
export interface TeamStorageIntent { objectStoreKey: string; contentSha256: string; declaredSize: number; mime: string; kind: string }
export interface TeamStorageEvidence { objectStoreKey: string; contentSha256: string; actualSize: number; mime: string; receiptHash: string }
const equivalentMime = (mime: string) => ({ 'audio/x-wav':'audio/wav','audio/wave':'audio/wav','audio/x-m4a':'audio/mp4','image/heif':'image/heic','video/x-m4v':'video/mp4' }[mime] ?? mime);
/** Private extension of the existing Wave 4 local object store. This module
 * supplies storage mechanics only; the Team owner/AE and AC6 own every effect. */
export class Package5TeamObjectStore {
  readonly root: string;
  constructor(uploadRoot: string) { this.root = resolve(uploadRoot, '..', 'team-private'); }
  private key(key: string) { if (!/^team-v1\/[a-f0-9]{64}$/.test(key)) throw Error('Exact server-allocated team object key required'); return key.slice(8); }
  private final(key: string) { return join(this.root, 'objects', this.key(key)); }
  private stage(key: string) { return join(this.root, 'staging', this.key(key)); }
  private async directory(path: string) {
    if (path !== this.root && !path.startsWith(this.root + '/')) throw Error('Team private directory scope');
    await mkdir(path, { recursive: true, mode: 0o700 });
    await this.verifyDirectory(path);
  }
  private async verifyDirectory(path: string) {
    if (path !== this.root && !path.startsWith(this.root + '/')) throw Error('Team private directory scope');
    for (let current = path; current.startsWith(this.root); current = dirname(current)) {
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw Error('Private team storage requires unlinked owner-only directories');
      if (current === this.root) break;
    }
  }
  private async digest(path: string) {
    let file; try { await this.verifyDirectory(dirname(path)); file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) { if (error && typeof error === 'object' && Reflect.get(error,'code') === 'ENOENT') return null; throw error; }
    try {
      const stat = await file.stat(); if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > 1073741824) throw Error('Invalid private team object');
      const hash = createHash('sha256'); let size = 0;
      for await (const chunk of file.createReadStream({ autoClose: false })) { hash.update(chunk); size += chunk.length; }
      if (size !== stat.size) throw Error('Private team object changed during observation');
      return { contentSha256: hash.digest('hex'), actualSize: size };
    } finally { await file.close(); }
  }
  private async receipt(input: TeamStorageIntent, path: string): Promise<TeamStorageEvidence | null> {
    const observed = await this.digest(path); if (!observed) return null;
    if (observed.contentSha256 !== input.contentSha256 || observed.actualSize !== input.declaredSize) throw Error('Exact team object content mismatch');
    const receiptHash = createHash('sha256').update(`maya.team-storage/1\0${input.objectStoreKey}\0${observed.contentSha256}\0${observed.actualSize}`).digest('hex');
    return { ...observed, objectStoreKey: input.objectStoreKey, mime: input.mime, receiptHash };
  }
  async putChunk(input: TeamStorageIntent, index: number, bytes: Buffer) {
    const total = Math.ceil(input.declaredSize / TEAM_CHUNK_BYTES);
    if (!Number.isSafeInteger(index) || index < 0 || index >= total || bytes.length !== Math.min(TEAM_CHUNK_BYTES, input.declaredSize - index * TEAM_CHUNK_BYTES)) throw Error('Exact bounded team chunk required');
    const directory = this.stage(input.objectStoreKey); await this.directory(directory);
    const path = join(directory, `chunk-${index}`), temporary = join(directory, `incoming-${randomUUID()}`);
    const expectedHash = createHash('sha256').update(bytes).digest('hex'), prior = await this.digest(path);
    if (prior) {
      if (prior.contentSha256 !== expectedHash || prior.actualSize !== bytes.length) throw Error('TEAM_CHUNK_IDEMPOTENCY_CONFLICT');
      return { index, size: bytes.length, contentSha256: expectedHash };
    }
    const file = await open(temporary, 'wx', 0o600); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try { await link(temporary, path); } catch (error) {
      if (!error || typeof error !== 'object' || Reflect.get(error,'code') !== 'EEXIST') throw error;
      const current = await this.digest(path);
      if (!current || current.contentSha256 !== createHash('sha256').update(bytes).digest('hex') || current.actualSize !== bytes.length) throw Error('TEAM_CHUNK_IDEMPOTENCY_CONFLICT');
    }
    // Quarantine scratch is retained under the same reservation for AC6. No
    // request cancellation/unconfirmed finalize may unlink a published object.
    return { index, size: bytes.length, contentSha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async inspectStaged(input: TeamStorageIntent): Promise<TeamStorageEvidence> {
    const directory = this.stage(input.objectStoreKey), assembly = join(directory, 'assembled');
    if (!await this.digest(assembly)) {
      await this.directory(directory); const temporary = join(directory, `assembly-${randomUUID()}`), file = await open(temporary, 'wx', 0o600);
      try {
        let size = 0;
        for (let index = 0; index < Math.ceil(input.declaredSize / TEAM_CHUNK_BYTES); index++) {
          const chunk = await open(join(directory, `chunk-${index}`), constants.O_RDONLY | constants.O_NOFOLLOW);
          try { const stat = await chunk.stat(); if (!stat.isFile() || stat.size !== Math.min(TEAM_CHUNK_BYTES, input.declaredSize - index * TEAM_CHUNK_BYTES)) throw Error('Team staging is incomplete');
            for await (const bytes of chunk.createReadStream({ autoClose: false })) { await file.writeFile(bytes); size += bytes.length; }
          } finally { await chunk.close(); }
        }
        if (size !== input.declaredSize) throw Error('Team staged size mismatch'); await file.sync();
      } finally { await file.close(); }
      try { await link(temporary, assembly); } catch (error) { if (!error || typeof error !== 'object' || Reflect.get(error,'code') !== 'EEXIST') throw error; }
    }
    const evidence = await this.receipt(input, assembly); if (!evidence) throw Error('Team staging is incomplete');
    // file-type is the existing pinned production dependency of Nest, not a new
    // provider/service. Detection consumes the quarantined file, never a URL.
    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(assembly);
    let mime = detected?.mime ?? 'application/octet-stream';
    if (input.kind === 'audio') {
      const requested = equivalentMime(input.mime);
      const container = requested === 'audio/webm' ? 'video/webm' : requested === 'audio/mp4' ? 'video/mp4' : requested;
      if (equivalentMime(mime) !== requested && equivalentMime(mime) !== container) throw Error('Verified team MIME does not match reservation');
      // A detected container alone does not prove an audio-only recording. Keep
      // local inspection bounded and prohibit network protocols or conversion.
      const result = await promisify(execFile)('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file',
        '-analyzeduration', '1000000', '-probesize', '1048576', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', assembly],
      { timeout: 10000, maxBuffer: 65536 });
      const info = JSON.parse(result.stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string }> };
      if (!info.streams?.length || info.streams.some(stream => stream.codec_type !== 'audio' || !stream.codec_name || stream.codec_name === 'unknown')) throw Error('Team voice must contain audio streams only');
      mime = input.mime;
    }
    if (!detected && input.mime === 'text/plain') {
      const file = await open(assembly, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { const bytes = await file.readFile(); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (/\0/.test(text)) throw Error('Text attachment contains binary data'); mime = 'text/plain'; } finally { await file.close(); }
    }
    if (equivalentMime(mime) !== equivalentMime(input.mime)) throw Error('Verified team MIME does not match reservation');
    return { ...evidence, mime: input.mime };
  }
  /** Final publish is called only by the admitted finalize executor. */
  async publish(input: TeamStorageIntent): Promise<TeamStorageEvidence> {
    const existing = await this.head(input); if (existing) return existing;
    const staged = await this.inspectStaged(input); await this.directory(join(this.root, 'objects'));
    try { await link(join(this.stage(input.objectStoreKey), 'assembled'), this.final(input.objectStoreKey)); }
    catch (error) { if (!error || typeof error !== 'object' || Reflect.get(error,'code') !== 'EEXIST') throw error; }
    const directory = await open(join(this.root, 'objects'), constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
    const observed = await this.head(input); if (!observed || observed.receiptHash !== staged.receiptHash) throw Error('Team final object receipt unresolved'); return observed;
  }
  head(input: TeamStorageIntent) { return this.receipt(input, this.final(input.objectStoreKey)); }
  async read(input: TeamStorageIntent) {
    if (!await this.head(input)) throw Error('Team attachment unavailable');
    const file = await open(this.final(input.objectStoreKey), constants.O_RDONLY | constants.O_NOFOLLOW);
    return file.createReadStream();
  }
  /** Called only with the committed AC6 item claim and exact locked owner hash.
   * Missing known files are a resumed purge; links/unknown entries fail closed. */
  async eraseClaimed(input: TeamStorageIntent) {
    const current = await this.head(input);
    const directory = this.stage(input.objectStoreKey); let entries: string[];
    try { entries = await readdir(directory); } catch (error) { if (error && typeof error === 'object' && Reflect.get(error,'code') === 'ENOENT') entries = []; else throw error; }
    for (const entry of entries) {
      if (!/^(?:assembled|chunk-\d+|(?:incoming|assembly)-[0-9a-f-]{36})$/.test(entry)) throw Error('Unrecognized team quarantine entry');
      const path = join(directory, entry), stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Claimed team purge cannot follow links');
    }
    if (current) await unlink(this.final(input.objectStoreKey));
    for (const entry of entries) { try { await unlink(join(directory, entry)); } catch (error) { if (!error || typeof error !== 'object' || Reflect.get(error,'code') !== 'ENOENT') throw error; } }
    return true;
  }
}
