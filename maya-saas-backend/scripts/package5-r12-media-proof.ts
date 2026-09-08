import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Package5TeamObjectStore,
  type TeamStorageIntent,
} from '../src/package5-wave4/package5-team-object-store';

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'maya-r12-media-'));
  try {
    const store = new Package5TeamObjectStore(join(root, 'uploads'));
    const generate = async (name: string, video: boolean) => {
      const path = join(root, name);
      const args = [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.1',
      ];
      if (video)
        args.push(
          '-f',
          'lavfi',
          '-i',
          'color=c=black:s=16x16:d=0.1',
          '-c:v',
          'libvpx-vp9',
        );
      args.push(
        '-c:a',
        name.endsWith('.webm') ? 'libopus' : 'aac',
        '-t',
        '0.1',
        path,
      );
      execFileSync('ffmpeg', args, { timeout: 15000, stdio: 'pipe' });
      return readFile(path);
    };
    const webm = await generate('audio.webm', false),
      mp4 = await generate('audio.mp4', false),
      video = await generate('video.webm', true);
    const stage = async (
      bytes: Buffer,
      mime: string,
    ): Promise<TeamStorageIntent> => {
      const value = {
        objectStoreKey:
          'team-v1/' + createHash('sha256').update(randomUUID()).digest('hex'),
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
        declaredSize: bytes.length,
        kind: 'audio',
        mime,
      };
      await store.putChunk(value, 0, bytes);
      return value;
    };
    for (const [bytes, mime] of [
      [webm, 'audio/webm'],
      [mp4, 'audio/mp4'],
      [mp4, 'audio/x-m4a'],
    ] as const) {
      const intent = await stage(bytes, mime);
      assert.equal((await store.inspectStaged(intent)).mime, mime);
      assert.equal(await store.head(intent), null); // inspection never publishes
    }
    for (const [bytes, mime] of [
      [webm, 'audio/mp4'],
      [mp4, 'audio/webm'],
      [video, 'audio/webm'],
      [webm.subarray(0, 36), 'audio/webm'],
    ] as const) {
      const intent = await stage(bytes, mime);
      await assert.rejects(store.inspectStaged(intent));
      assert.equal(await store.head(intent), null);
    }
    assert.equal((await stat(store.root)).mode & 0o777, 0o700);
    const privateIntent = await stage(webm, 'audio/webm');
    await chmod(store.root, 0o755);
    await assert.rejects(store.inspectStaged(privateIntent), /owner-only/);
    await chmod(store.root, 0o700);
    assert.equal((await store.inspectStaged(privateIntent)).mime, 'audio/webm');
    console.log(
      JSON.stringify({
        package: 'R12',
        status: 'PASS',
        audioContainers: 3,
        mismatchVideoTruncationRejected: 4,
        publicPermissionDenied: true,
        finalObjectsPublished: 0,
        productionEffects: 0,
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
