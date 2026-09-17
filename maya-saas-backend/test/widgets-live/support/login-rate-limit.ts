// Login rate-limit hygiene for the harness's own logins (GATES-PLAN-V11 I-HAR).
//
// The HTTP level and the BIN runner obtain access tokens from the application's own `POST /api/auth/login`.
// Every call consumes one attempt of the `password_login` preflight policy for the caller's IP
// (`auth.password_login.preflight.ip.15m`, 50 attempts per 15 minutes; `src/auth/auth-rate-limit.service.ts`).
// All harness requests come from the loopback address, so repeated live runs and mutation batteries would exhaust
// that bucket and turn unrelated tests red with 429. Before each harness login the loopback subject's bucket of
// that one policy is deleted from the guarded proof database. Nothing else is touched: not the identity or tenant
// buckets, not another policy, not another address, and never a database the proof guard does not admit.
//
// The subject hash mirrors `AuthRateLimitService.hashSubject`. `harness.live-spec.ts` (HAR-1b) proves the mirror
// against a real login, so a change of the formula turns a harness test red instead of making this a silent no-op.

import { createHmac } from 'node:crypto';

import { assertProofDatabase } from './proof-db-guard';

export const PASSWORD_LOGIN_IP_PREFLIGHT_POLICY =
  'auth.password_login.preflight.ip.15m';
/** `normalizeIp` strips `::ffff:`, so an IPv4 loopback client is `127.0.0.1`; `::1` is the IPv6 loopback. */
export const LOOPBACK_SUBJECTS: readonly string[] = Object.freeze([
  '127.0.0.1',
  '::1',
]);

/** `AuthRateLimitService.hashSubject` for a global (tenant-less) policy. */
export function globalRateLimitSubjectHash(
  secret: string,
  policyKey: string,
  subject: string,
): string {
  return createHmac('sha256', secret)
    .update(`v1\0${policyKey}\0global\0${subject}`)
    .digest('hex');
}

interface BucketDelegate {
  authRateLimitBucket: {
    deleteMany(args: {
      where: {
        policyKey: string;
        tenantId: null;
        subjectHash: { in: string[] };
      };
    }): Promise<{ count: number }>;
  };
}

/** The loopback subjects' hashes under the harness's `AUTH_RATE_LIMIT_SECRET`. */
export function loopbackLoginPreflightHashes(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const secret = env.AUTH_RATE_LIMIT_SECRET?.trim();
  if (!secret)
    throw new Error(
      'widgets-live login hygiene: AUTH_RATE_LIMIT_SECRET is not set (the widgets-live literals were not applied)',
    );
  return LOOPBACK_SUBJECTS.map((subject) =>
    globalRateLimitSubjectHash(
      secret,
      PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
      subject,
    ),
  );
}

/** Deletes the loopback subjects' password-login preflight buckets. Returns the number of rows deleted. */
export async function resetLoopbackLoginPreflight(
  db: BucketDelegate,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  assertProofDatabase(env);
  const { count } = await db.authRateLimitBucket.deleteMany({
    where: {
      policyKey: PASSWORD_LOGIN_IP_PREFLIGHT_POLICY,
      tenantId: null,
      subjectHash: { in: loopbackLoginPreflightHashes(env) },
    },
  });
  return count;
}
