import fs from 'node:fs';
import { credentialShape } from './local-keychain-source.mjs';
// Fixed fd4 in the retained runtime; fd3 remains the existing diagnostics IPC.
export async function readPartnerPipe(fd = 4) {
  const stat = fs.fstatSync(fd);
  if (!stat.isFIFO() && !stat.isSocket())
    throw Error('credential_pipe_required');
  const stream = fs.createReadStream(null, {
    fd,
    autoClose: true,
    highWaterMark: 1024,
  });
  let chunks = [],
    size = 0;
  const timer = setTimeout(
    () => stream.destroy(Error('credential_pipe_timeout')),
    10000,
  );
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 4096) {
        chunk.fill(0);
        throw Error('credential_pipe_refused');
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    try {
      const value = bytes.toString('utf8');
      if (
        !credentialShape('yclientsPartner', value) ||
        !Buffer.from(value).equals(bytes)
      )
        throw Error('credential_pipe_refused');
      return value;
    } finally {
      bytes.fill(0);
    }
  } finally {
    clearTimeout(timer);
    stream.destroy();
    for (const chunk of chunks) chunk.fill(0);
  }
}
export async function writePartnerPipe(stream, value) {
  if (!stream || !credentialShape('yclientsPartner', value))
    throw Error('credential_pipe_refused');
  const bytes = Buffer.from(value);
  value = undefined;
  try {
    await new Promise((resolve, reject) => {
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        stream.off('error', fail);
        stream.off('close', fail);
        if (error) reject(Error('credential_pipe_refused'));
        else resolve();
      };
      const fail = () => finish(true);
      const timer = setTimeout(() => {
        fail();
        stream.destroy();
      }, 10000);
      stream.once('error', fail);
      stream.once('close', fail);
      stream.end(bytes, (error) => finish(Boolean(error)));
    });
  } finally {
    bytes.fill(0);
  }
}
