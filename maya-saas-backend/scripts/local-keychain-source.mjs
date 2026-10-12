// Exact local credential source. No ambient lookup, shell, or fallback.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
export const KEYCHAIN_HELPER_ID = 'ru.mayaos.local.credentials';
export const KEYCHAIN_ITEMS = Object.freeze({
  deepseek: 'ru.mayaos.dev.local-model.deepseek.v1',
  yclientsPartner: 'ru.mayaos.dev.local-read.yclients-partner.v1',
});
const fail = () => {
  throw Error('local_keychain_refused');
};
const need = (value) => {
  if (!value) fail();
};
export function validateKeychainSource(source) {
  const keys = [
    'kind',
    'reference',
    'owner',
    'reader',
    'sha256',
    'cdhash',
    'storageApprovalRef',
  ];
  need(
    source &&
      typeof source === 'object' &&
      Object.keys(source).length === keys.length &&
      keys.every((k) => Object.hasOwn(source, k)),
  );
  need(
    source.kind === 'macos-keychain' &&
      typeof source.reference === 'string' &&
      path.isAbsolute(source.reference) &&
      path.normalize(source.reference) === source.reference &&
      !/[\x00-\x1f\x7f]/.test(source.reference),
  );
  need(
    source.reference.endsWith(
      '/MayaLocalCredentials.app/Contents/MacOS/MayaLocalCredentials',
    ),
  );
  need(
    Number.isSafeInteger(source.owner) &&
      source.owner > 0 &&
      source.reader === source.owner,
  );
  need(
    /^[a-f0-9]{64}$/.test(source.sha256 ?? '') &&
      /^[a-f0-9]{40}$/.test(source.cdhash ?? ''),
  );
  need(
    typeof source.storageApprovalRef === 'string' &&
      /^[a-zA-Z0-9_./:@-]{1,256}$/.test(source.storageApprovalRef),
  );
}
export function assertKeychainHelper(source) {
  validateKeychainSource(source);
  need(process.platform === 'darwin' && process.getuid() === source.owner);
  need(fs.realpathSync(source.reference) === source.reference);
  const stat = fs.lstatSync(source.reference);
  need(
    stat.isFile() &&
      stat.nlink === 1 &&
      stat.uid === source.owner &&
      (stat.mode & 0o022) === 0 &&
      (stat.mode & 0o100) !== 0,
  );
  const bytes = fs.readFileSync(source.reference);
  need(createHash('sha256').update(bytes).digest('hex') === source.sha256);
  try {
    execFileSync(
      '/usr/bin/codesign',
      [
        '--verify',
        '--strict',
        '-R',
        `=identifier "${KEYCHAIN_HELPER_ID}" and cdhash H"${source.cdhash}"`,
        source.reference,
      ],
      { stdio: 'ignore', timeout: 5000, env: { PATH: '/usr/bin:/bin' } },
    );
  } catch {
    fail();
  }
}
export function credentialShape(kind, value) {
  return (
    typeof value === 'string' &&
    (kind === 'deepseek'
      ? /^[A-Za-z0-9_-]{16,512}$/
      : kind === 'yclientsPartner'
        ? /^[\x21-\x2b\x2d-\x7e]{16,4096}$/
        : /$a/
    ).test(value)
  );
}
// The caller supplies an assertion from the existing claimed admission, not a
// caller-authored admitted=true flag. Same-UID owner trust remains explicit.
export async function readKeychainCredential(
  source,
  kind,
  { assertCurrent, signal, timeoutMs = 10000 },
) {
  return readCredentialFromHelper(
    source,
    kind,
    { assertCurrent, signal, timeoutMs },
    { verify: assertKeychainHelper, spawn },
  );
}
// Dependency injection is for local tests; production entry above fixes OS I/O.
export async function readCredentialFromHelper(
  source,
  kind,
  { assertCurrent, signal, timeoutMs },
  { verify, spawn: launch },
) {
  validateKeychainSource(source);
  need(
    Object.hasOwn(KEYCHAIN_ITEMS, kind) && typeof assertCurrent === 'function',
  );
  need(source.storageApprovalRef !== 'PREPARED_NOT_AUTHORIZED');
  need(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 10000);
  assertCurrent();
  signal?.throwIfAborted();
  verify(source);
  let child,
    timer,
    poll,
    chunks = [],
    size = 0,
    settled = false,
    refused = false,
    cancel;
  try {
    return await new Promise((resolve, reject) => {
      const refuse = () => {
        if (settled) return;
        refused = true;
        child?.kill('SIGKILL');
        if (!child) {
          settled = true;
          reject(Error('local_keychain_refused'));
        }
      };
      cancel = () => refuse();
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(poll);
        signal?.removeEventListener('abort', cancel);
      };
      try {
        child = launch(source.reference, ['--read', kind], {
          env: { PATH: '/usr/bin:/bin' },
          stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
        });
      } catch {
        refuse();
        return;
      }
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) refuse();
      timer = setTimeout(refuse, timeoutMs);
      poll = setInterval(() => {
        try {
          assertCurrent();
        } catch {
          refuse();
        }
      }, 100);
      child.once('error', refuse);
      const stream = child.stdio[3];
      if (!stream) refuse();
      stream?.on('error', refuse);
      stream?.on('data', (chunk) => {
        size += chunk.length;
        if (refused || settled || size > 4096) {
          chunk.fill(0);
          refuse();
          return;
        }
        chunks.push(chunk);
      });
      child.once('close', (code, exitSignal) => {
        cleanup();
        if (settled) return;
        let bytes;
        try {
          need(!refused && code === 0 && exitSignal === null);
          assertCurrent();
          signal?.throwIfAborted();
          verify(source);
          bytes = Buffer.concat(chunks);
          const value = bytes.toString('utf8');
          need(
            credentialShape(kind, value) && Buffer.from(value).equals(bytes),
          );
          settled = true;
          resolve(value);
        } catch {
          settled = true;
          reject(Error('local_keychain_refused'));
        } finally {
          bytes?.fill(0);
        }
      });
    });
  } finally {
    clearTimeout(timer);
    clearInterval(poll);
    if (cancel) signal?.removeEventListener('abort', cancel);
    for (const chunk of chunks) chunk.fill(0);
    chunks = [];
  }
}
