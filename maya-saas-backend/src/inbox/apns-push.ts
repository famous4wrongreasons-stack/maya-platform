import { createPrivateKey, createSign } from 'crypto';
import { readFileSync } from 'fs';
import * as http2 from 'http2';
import { Logger } from '@nestjs/common';

type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  key: string;
  production: boolean;
};

function loadApnsConfig(): ApnsConfig | null {
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  const bundleId = String(
    process.env.APNS_BUNDLE_ID || 'ru.mayaos.app',
  ).trim();
  const keyPath = String(process.env.APNS_KEY_PATH || '').trim();
  const keyInline = String(process.env.APNS_KEY_P8 || '').trim();
  let key = keyInline.replace(/\\n/g, '\n');
  if (!key && keyPath) {
    try {
      key = readFileSync(keyPath, 'utf8');
    } catch {
      return null;
    }
  }
  if (!keyId || !teamId || !bundleId || !key.includes('PRIVATE KEY')) {
    return null;
  }
  return {
    keyId,
    teamId,
    bundleId,
    key,
    production: String(process.env.APNS_PRODUCTION || '').trim() === '1',
  };
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeApnsJwt(cfg: ApnsConfig): string {
  const header = base64url(
    JSON.stringify({ alg: 'ES256', kid: cfg.keyId }),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ iss: cfg.teamId, iat: now }),
  );
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(cfg.key);
  const sig = createSign('SHA256').update(unsigned).sign(key);
  return `${unsigned}.${base64url(sig)}`;
}

async function sendOne(
  cfg: ApnsConfig,
  jwt: string,
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  const host = cfg.production
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
  const path = `/3/device/${deviceToken}`;
  const payload = JSON.stringify({
    aps: {
      alert: { title, body: body.slice(0, 180) },
      sound: 'default',
      'mutable-content': 1,
    },
    ...data,
  });

  return await new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on('error', () => {
      resolve(false);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    });
    const req = client.request({
      ':method': 'POST',
      ':path': path,
      authorization: `bearer ${jwt}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('end', () => {
      resolve(status >= 200 && status < 300);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    });
    req.on('error', () => {
      resolve(false);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    });
    req.end(payload);
  });
}

/**
 * Best-effort APNs delivery for native Maya OS devices.
 * No-op when APNS_* env is missing — tokens stay stored for later.
 */
export async function sendInboxApns(opts: {
  tokens: Array<{ platform: string; token: string }>;
  title: string;
  body: string;
  deepLink?: string | null;
  type: string;
  logger: Logger;
}): Promise<{ sent: number; skipped: number }> {
  const cfg = loadApnsConfig();
  const ios = opts.tokens.filter(
    (row) =>
      String(row.platform).toLowerCase() === 'ios' &&
      String(row.token || '').trim().length > 20,
  );
  if (ios.length === 0) return { sent: 0, skipped: opts.tokens.length };
  if (!cfg) {
    opts.logger.warn(
      `inbox APNs not configured (${ios.length} ios tokens waiting). Set APNS_KEY_ID/TEAM_ID/KEY_P8.`,
    );
    return { sent: 0, skipped: ios.length };
  }

  let jwt: string;
  try {
    jwt = makeApnsJwt(cfg);
  } catch (error) {
    opts.logger.warn(
      `inbox APNs jwt failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return { sent: 0, skipped: ios.length };
  }

  let sent = 0;
  for (const row of ios) {
    const ok = await sendOne(cfg, jwt, row.token.trim(), opts.title, opts.body, {
      type: opts.type,
      deep_link: opts.deepLink || '/app/?panel=chat',
    });
    if (ok) sent += 1;
  }
  opts.logger.log(
    `inbox APNs type=${opts.type} sent=${sent}/${ios.length} title=${opts.title.slice(0, 40)}`,
  );
  return { sent, skipped: ios.length - sent };
}
