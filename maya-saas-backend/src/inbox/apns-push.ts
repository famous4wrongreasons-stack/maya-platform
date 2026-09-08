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

export type CanonicalApnsResult =
  | { outcome: 'accepted'; providerReference: string }
  | { outcome: 'rejected'; reason: string }
  | { outcome: 'unknown'; reason: string };

export interface PreparedCanonicalApnsSender {
  send(input: {
    deviceToken: string;
    title: string;
    body: string;
    deepLink?: string | null;
    type: string;
  }): Promise<CanonicalApnsResult>;
}

function loadApnsConfig(): ApnsConfig | null {
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  const bundleId = String(process.env.APNS_BUNDLE_ID || 'ru.mayaos.app').trim();
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
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(cfg.key);
  const sig = createSign('SHA256').update(unsigned).sign(key);
  return `${unsigned}.${base64url(sig)}`;
}

async function sendOneCanonical(
  cfg: ApnsConfig,
  jwt: string,
  input: {
    deviceToken: string;
    title: string;
    body: string;
    deepLink?: string | null;
    type: string;
  },
): Promise<CanonicalApnsResult> {
  const host = cfg.production
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
  const payload = JSON.stringify({
    aps: {
      alert: { title: input.title, body: input.body.slice(0, 180) },
      sound: 'default',
      'mutable-content': 1,
    },
    type: input.type,
    deep_link: input.deepLink || '/app/?panel=chat',
  });

  return await new Promise((resolve) => {
    let settled = false;
    let status = 0;
    let providerReference = '';
    let responseBody = '';
    const finish = (result: CanonicalApnsResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    };
    const client = http2.connect(`https://${host}`);
    client.on('error', () =>
      finish({ outcome: 'unknown', reason: 'apns_connection_error' }),
    );
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${input.deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    req.setEncoding('utf8');
    req.setTimeout(4_000, () => {
      req.close();
      finish({ outcome: 'unknown', reason: 'apns_timeout' });
    });
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
      providerReference = String(headers['apns-id'] || '').trim();
    });
    req.on('data', (chunk: string) => {
      responseBody += chunk;
    });
    req.on('end', () => {
      if (status >= 200 && status < 300) {
        finish(
          providerReference
            ? { outcome: 'accepted', providerReference }
            : { outcome: 'unknown', reason: 'apns_reference_missing' },
        );
        return;
      }
      let reason = `apns_http_${status || 'unknown'}`;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: unknown };
        if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
          reason = parsed.reason.trim();
        }
      } catch {
        // The status code still determines whether the outcome is definitive.
      }
      finish(
        status >= 400 && status < 500
          ? { outcome: 'rejected', reason }
          : { outcome: 'unknown', reason },
      );
    });
    req.on('error', () =>
      finish({ outcome: 'unknown', reason: 'apns_stream_error' }),
    );
    req.end(payload);
  });
}

/**
 * Validates configuration and signing before the durable dispatch boundary.
 * The returned sender performs exactly one provider request per call.
 */
export function prepareInboxApnsCanonical(): PreparedCanonicalApnsSender {
  const cfg = loadApnsConfig();
  if (!cfg) throw new Error('APNs is not configured');
  const jwt = makeApnsJwt(cfg);
  return {
    send: (input) => sendOneCanonical(cfg, jwt, input),
  };
}

/** Legacy fire-and-forget sender retired by R06. CD owns every APNS attempt. */
export function sendInboxApns(opts: {
  tokens: Array<{ platform: string; token: string }>;
  title: string;
  body: string;
  deepLink?: string | null;
  type: string;
  logger: Logger;
}): Promise<{ sent: number; skipped: number }> {
  void opts;
  return Promise.reject(
    new Error('R06_CANONICAL_COMMUNICATION_DELIVERY_REQUIRED'),
  );
}
