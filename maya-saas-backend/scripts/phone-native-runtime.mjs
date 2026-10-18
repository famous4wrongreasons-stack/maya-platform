// Ordinary AppModule + restrictive fetch only. Never replace chat, tool registry,
// AE, Client resolver, confirmation, receipt writers or presentation semantics.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  createNativeExecutionVerifier,
  executionHash,
} from './phone-native-execution.mjs';
import {
  guardedNativeExecution,
  immutableNativeFile,
} from './phone-native-run-guard.mjs';
import { EXECUTION_EGRESS_CONTRACT } from './phone-native-create-egress.mjs';
import { nativeModelTransport } from './phone-native-model.mjs';

export async function installNativeExecution({
  app,
  backend,
  installed,
  stateDirectory,
  operatorUid = 0,
  nativeFetch = fetch,
}) {
  const require = createRequire(path.join(backend, 'package.json'));
  const config = app.get(require('@nestjs/config').ConfigService);
  const readers = Object.fromEntries(
    [
      'authorization',
      'pricing',
      'session',
      'scope',
      'modelCredential',
      'partnerCredential',
    ].map((name) => {
      const entry = installed[name];
      assert(entry && Object.keys(entry).sort().join(',') === 'file,sha256');
      return [name, immutableNativeFile(entry.file, entry.sha256, operatorUid)];
    }),
  );
  const json = (name) => JSON.parse(readers[name]().toString('utf8'));
  const verifier = createNativeExecutionVerifier({
    app,
    backend,
    readAuthorization: () => json('authorization'),
    readPricing: () => json('pricing'),
    operatorToken: () => readers.session().toString('utf8'),
  });
  assert(
    !process.env.YCLIENTS_BASE_URL ||
      process.env.YCLIENTS_BASE_URL === 'https://api.yclients.com/api/v1',
  );
  const proof = await verifier.check(),
    a = proof.payload,
    scope = json('scope');
  assert.deepEqual(scope, {
    contract: EXECUTION_EGRESS_CONTRACT,
    runId: a.runId,
    maxReschedules: 1,
    maxCancels: 1,
    candidate: a.candidateSha,
    profile: a.profileId,
    tenantId: a.tenantId,
    companyId: a.companyId,
    executionAuthorizationDigest: proof.digest,
    credentialDigest: scope.credentialDigest,
    notBefore: a.notBefore,
    expiresAt: a.expiresAt,
    maxReads: a.maxReads,
    maxCreates: 1,
  });
  const checkLocal = () => {
    for (const read of Object.values(readers)) read();
    assert.equal(executionHash(json('authorization')), proof.digest);
    assert(
      Date.now() >= Date.parse(a.notBefore) &&
        Date.now() < Date.parse(a.expiresAt),
    );
  };
  let provider,
    model,
    timer,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    verifier.close();
    model?.close();
    provider?.close();
    provider?.server.closeAllConnections();
    if (provider?.server.listening)
      await new Promise((resolve) => provider.server.close(resolve));
  };
  try {
    provider = await guardedNativeExecution({
      scopeFile: installed.scope.file,
      scopeSha256: installed.scope.sha256,
      ledgerDirectory: stateDirectory,
      operatorUid,
      async assertCurrent() {
        checkLocal();
        assert.equal((await verifier.check()).digest, proof.digest);
        return true;
      },
      nativeFetch,
    });
    await new Promise((resolve, reject) => {
      provider.server.once('error', reject);
      provider.server.listen(0, '127.0.0.1', resolve);
    });
    const localProvider = 'http://127.0.0.1:' + provider.server.address().port;
    model = nativeModelTransport({
      proof,
      ledgerPath: path.join(stateDirectory, proof.digest + '.model.jsonl'),
      checkLocal,
      async assertCurrent() {
        await provider.check();
        assert.equal((await verifier.check(true)).digest, proof.digest);
        return true;
      },
      async dispatch(url, init) {
        const credential = readers.modelCredential().toString('utf8');
        assert(/^[A-Za-z0-9_-]{16,512}$/.test(credential));
        return nativeFetch(url, {
          ...init,
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + credential,
          },
        });
      },
    });
    app
      .get(
        require(path.join(backend, 'dist/src/crm/crm-adapter.factory.js'))
          .CrmAdapterFactory,
      )
      .installPartnerTokenReader(() => {
        assert(!closed);
        checkLocal();
        const value = readers.partnerCredential().toString('utf8');
        assert(/^[A-Za-z0-9_-]{16,4096}$/.test(value));
        return value;
      });
    for (const [key, value] of Object.entries({
      AI_CORE_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'NATIVE_RELAY_NOT_A_PROVIDER_CREDENTIAL',
      DEEPSEEK_AI_CORE_MODEL: a.model,
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      AI_CORE_MAX_OUTPUT_TOKENS: '2048',
    }))
      config.set(key, value);
    let polling = false;
    timer = setInterval(() => {
      if (polling || closed) return;
      polling = true;
      void provider
        .check()
        .catch(close)
        .finally(() => {
          polling = false;
        });
    }, 1000);
    timer.unref();
    return {
      async checkCurrent() {
        assert(!closed);
        await provider.check();
        return true;
      },
      async fetch(raw, init) {
        assert(!closed);
        checkLocal();
        const url = new URL(String(raw));
        assert(!url.username && !url.password && !url.hash);
        if (
          [
            'https://api.deepseek.com/chat/completions',
            'https://api.deepseek.com/v1/chat/completions',
          ].includes(url.href)
        )
          return model.fetch(url.href, init);
        assert.equal(url.origin, 'https://api.yclients.com');
        // Server-derived membership context; the provider credential is never
        // sufficient to assert who is acting. Background writes remain closed.
        await verifier.check(true);
        return nativeFetch(localProvider + url.pathname + url.search, {
          ...init,
          redirect: 'error',
        });
      },
      close,
      snapshot() {
        return {
          contract: a.contract,
          runId: a.runId,
          closed,
          provider: provider.snapshot(),
          model: model.snapshot(),
        };
      },
    };
  } catch {
    await close();
    throw new Error('phone_native_start_refused');
  }
}
