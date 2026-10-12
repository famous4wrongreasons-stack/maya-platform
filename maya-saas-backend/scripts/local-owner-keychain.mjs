import assert from 'node:assert/strict';
import path from 'node:path';
import { startCoreBroker } from './conversation-qualification/core-conversation-broker.mjs';
import { readOwnerChatLaunch } from './local-owner-chat-launch.mjs';
import {
  readKeychainCredential,
  credentialShape,
} from './local-keychain-source.mjs';

// This composes existing permit/claim owners. It cannot issue or renew a permit.
export async function startOwnerKeychainSession(planPath, planSha256, signal) {
  const launch = readOwnerChatLaunch(planPath, planSha256, null);
  const source = launch.manifest.admissionContext.credentialSource;
  assert.equal(source.kind, 'macos-keychain', 'owner_keychain_source_required');
  signal?.throwIfAborted();
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let broker;
  try {
    // Broker claims the one-use permit before it loads the model key.
    broker = await startCoreBroker(
      {
        mode: 'admitted-local',
        ...launch.common,
        output: path.join(launch.root, 'broker'),
      },
      null,
      signal,
    );
    await broker.ready;
    void broker.closed.then(cancel, cancel);
    signal?.throwIfAborted();
    const current = readOwnerChatLaunch(planPath, planSha256, 'broker');
    current.assertCurrent();
    const remaining = Date.parse(broker.snapshot().expiresAt) - Date.now();
    const partner = await readKeychainCredential(source, 'yclientsPartner', {
      assertCurrent: () => current.admission(current.binding),
      signal: abort.signal,
      timeoutMs: Math.min(10000, remaining),
    });
    current.assertCurrent();
    signal?.throwIfAborted();
    abort.signal.throwIfAborted();
    return { broker, partner };
  } catch {
    await broker?.stop('owner_keychain_session_refused');
    throw Error('owner_keychain_session_refused');
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

// The existing adapter factory consumes a server-owned closure. It never sees
// Keychain paths and no token is installed in ConfigService/process.env.
export function installLocalPartnerCredential(factory, value, assertCurrent) {
  assert.ok(
    credentialShape('yclientsPartner', value) &&
      typeof assertCurrent === 'function',
    'partner_credential_refused',
  );
  assertCurrent();
  let secret = value;
  value = undefined;
  factory.installPartnerTokenReader(() => {
    assertCurrent();
    if (!secret) throw Error('partner_credential_unavailable');
    return secret;
  });
  return () => {
    secret = undefined;
  };
}
