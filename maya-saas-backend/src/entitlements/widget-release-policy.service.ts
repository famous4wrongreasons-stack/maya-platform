import {
  profileCertificate,
  PROFILE_CERT,
  NO_HANDOFF_PROFILE,
  PROFILE_DIGEST,
  type ProfileCertificate,
} from './widget-release-profile.contract';
import { widgetProofEnvironment } from './widget-release-environment';
import {
  productionAuthorization,
  PRODUCTION_RELEASE_AUTH,
  type ProductionReleaseAuthorization,
} from './widget-release-production.contract';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  authorization,
  canonical,
  certificate,
  digest,
  exact,
  identifier,
  instant,
  MAX_RELEASE_MS,
  object,
  RELEASE_STATE,
  releaseDeny,
  releaseHash,
  type ReleaseAuthorization,
  type ReleaseCertificate,
  type ReleaseCommand,
  type Signed,
} from './widget-release.contract';

export interface VerifiedReleaseView {
  readonly scope: 'full165.closed-input' | typeof NO_HANDOFF_PROFILE;
  readonly version: string;
  readonly certificateDigest: string;
  readonly profileDigest: string | null;
}

type TrustKey = {
  principalId: string;
  purpose: 'owner' | 'security';
  publicKey: string;
};
export interface ReleaseOverride {
  enabled: boolean;
  expiresAt: Date | null;
  configJson?: unknown;
  reason?: string | null;
}
/** Default-deny trust. The HTTP caller cannot supply a key, running build, or environment. */
@Injectable()
export class WidgetReleasePolicy {
  constructor(private readonly config: ConfigService = new ConfigService()) {}
  private fingerprint: string | undefined;
  buildDigest(): string {
    // Production admission rechecks bytes, including after an earlier successful read.
    if (
      this.fingerprint &&
      this.config.get<string>('NODE_ENV') !== 'production'
    )
      return this.fingerprint;
    const root = resolve(__dirname, '..'),
      extension = __filename.endsWith('.ts') ? '.ts' : '.js';
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        return e.isDirectory()
          ? files(p)
          : p.endsWith(extension) && !p.includes('.spec.')
            ? [p]
            : [];
      });
    const hash = createHash('sha256');
    for (const p of files(root).sort())
      hash
        .update(relative(root, p))
        .update('\0')
        .update(readFileSync(p))
        .update('\0');
    hash.update(readFileSync(resolve(process.cwd(), 'package-lock.json')));
    return (this.fingerprint = hash.digest('hex'));
  }
  environment(): 'synthetic' | 'staging' | 'production' {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      if (
        this.config.get<string>('WIDGET_RELEASE_ENVIRONMENT') !== 'production'
      )
        return releaseDeny('production_not_authorized');
      return 'production';
    }
    const environment = this.config.get<string>('WIDGET_RELEASE_ENVIRONMENT');
    if (environment !== 'synthetic' && environment !== 'staging')
      return releaseDeny('environment');
    const db = new URL(this.config.get<string>('DATABASE_URL') ?? 'invalid:');
    if (environment === 'synthetic' && !widgetProofEnvironment(this.config))
      releaseDeny('synthetic_database');
    if (
      environment === 'staging' &&
      (!['postgres:', 'postgresql:'].includes(db.protocol) ||
        [...db.searchParams.keys()].some((k) => k !== 'schema') ||
        !/^\/maya_widget_release_staging_[a-z0-9_]+$/.test(db.pathname))
    )
      releaseDeny('staging_database');
    return environment;
  }
  private productionTenant(tenantId: string): void {
    const tenants: unknown = JSON.parse(
      this.config.get<string>('WIDGET_RELEASE_PRODUCTION_TENANTS_JSON') ?? '[]',
    );
    if (
      !Array.isArray(tenants) ||
      !tenants.length ||
      new Set(tenants).size !== tenants.length
    )
      releaseDeny('production_tenant');
    for (const tenant of tenants) identifier(tenant);
    if (!tenants.includes(tenantId)) releaseDeny('production_tenant');
  }
  private readAuthorization(value: unknown) {
    return this.signed<ReleaseAuthorization | ProductionReleaseAuthorization>(
      value,
      'owner',
      this.environment() === 'production'
        ? productionAuthorization
        : authorization,
    );
  }
  private signed<T>(
    value: unknown,
    purpose: TrustKey['purpose'],
    parse: (v: unknown) => T,
  ): { payload: T; principalId: string; signed: Signed<T> } {
    const v = exact(value, ['payload', 'keyId', 'signature']);
    identifier(v.keyId);
    if (
      typeof v.signature !== 'string' ||
      !/^[A-Za-z0-9_-]{86}$/.test(v.signature)
    )
      releaseDeny('signature');
    const trust = object(
      JSON.parse(
        this.config.get<string>(
          this.environment() === 'production'
            ? 'WIDGET_RELEASE_PRODUCTION_TRUST_JSON'
            : 'WIDGET_RELEASE_TRUST_JSON',
        ) ?? '{}',
      ),
    );
    const key = exact(trust[v.keyId], ['principalId', 'purpose', 'publicKey']);
    identifier(key.principalId);
    if (key.purpose !== purpose || typeof key.publicKey !== 'string')
      releaseDeny('trust');
    const publicKey = createPublicKey(key.publicKey);
    if (publicKey.asymmetricKeyType !== 'ed25519') releaseDeny('trust');
    const bytes = Buffer.from(canonical(v.payload));
    if (
      bytes.length > 128 * 1024 ||
      !verify(null, bytes, publicKey, Buffer.from(v.signature, 'base64url'))
    )
      releaseDeny('signature');
    return {
      payload: parse(v.payload),
      principalId: key.principalId,
      signed: v as unknown as Signed<T>,
    };
  }
  read(
    value: unknown,
    tenantId: string,
    operation: 'grant' | 'revoke',
    operatorId: string,
    now: Date,
  ) {
    const input = object(value);
    exact(
      input,
      operation === 'grant'
        ? ['authorization', 'certificate']
        : ['authorization'],
    );
    const signed = this.readAuthorization(input.authorization),
      a = signed.payload;
    if (
      a.environment !== this.environment() ||
      a.tenantId !== tenantId ||
      a.operation !== operation ||
      a.operatorId !== operatorId ||
      a.approverId !== signed.principalId
    )
      releaseDeny('authority_binding');
    if (
      instant(a.notBefore) > now.getTime() ||
      instant(a.expiresAt) <= now.getTime()
    )
      releaseDeny('authorization_expired');
    let c: ReleaseCertificate | ProfileCertificate | undefined;
    if (operation === 'grant') {
      if (a.contract === PRODUCTION_RELEASE_AUTH)
        this.productionTenant(tenantId);
      c = this.checkCertificate(input.certificate, a, now);
      if (
        instant(a.grantExpiresAt) <= now.getTime() ||
        instant(a.grantExpiresAt) - now.getTime() > MAX_RELEASE_MS ||
        instant(a.grantExpiresAt) > instant(c.expiresAt)
      )
        releaseDeny('grant_window');
    }
    return {
      a,
      c,
      command: input as unknown as ReleaseCommand,
      authorizationHash: releaseHash(signed.signed),
    };
  }
  private checkCertificate(
    value: unknown,
    a: ReleaseAuthorization | ProductionReleaseAuthorization,
    now: Date,
  ) {
    const { payload: c, principalId } = this.signed(
      value,
      'security',
      (value) =>
        object(value).contract === PROFILE_CERT
          ? profileCertificate(value)
          : certificate(value),
    );
    if (
      principalId !== a.reviewerId ||
      releaseHash(value) !== a.certificateDigest ||
      c.environment !== a.environment ||
      c.candidateSha !== a.candidateSha ||
      c.buildDigest !== a.buildDigest
    )
      releaseDeny('certificate_binding');
    if (
      a.contract === PRODUCTION_RELEASE_AUTH &&
      (c.contract !== PROFILE_CERT ||
        c.scope !== a.profileId ||
        c.profileDigest !== a.profileDigest ||
        c.evidenceDigest !== a.evidenceDigest)
    )
      releaseDeny('production_certificate_binding');
    if (
      a.candidateSha !==
        this.config.get<string>('WIDGET_RELEASE_CANDIDATE_SHA') ||
      a.buildDigest !== this.buildDigest()
    )
      releaseDeny('running_candidate');
    if (
      instant(c.issuedAt) > now.getTime() ||
      instant(c.expiresAt) <= now.getTime()
    )
      releaseDeny('certificate_expired');
    return c;
  }
  allows(tenantId: string, row: ReleaseOverride, now: Date): boolean {
    return this.view(tenantId, row, now) !== null;
  }
  view(
    tenantId: string,
    row: ReleaseOverride,
    now: Date,
  ): VerifiedReleaseView | null {
    // Preserve the sole pre-existing proof fixture exception; never a production override.
    try {
      if (
        widgetProofEnvironment(this.config) &&
        row.reason === 'widgets-live proof-database fixture' &&
        row.configJson == null
      )
        return Object.freeze({
          scope: 'full165.closed-input',
          version: 'proof-fixture',
          certificateDigest: 'proof-fixture',
          profileDigest: null,
        });
      const state = object(row.configJson);
      if (
        state.contract !== RELEASE_STATE ||
        typeof state.appliedAt !== 'string' ||
        !row.enabled ||
        !row.expiresAt
      )
        return null;
      const command = object(state.command);
      const signed = this.readAuthorization(command.authorization),
        a = signed.payload;
      if (
        a.tenantId !== tenantId ||
        a.operation !== 'grant' ||
        a.approverId !== signed.principalId ||
        a.environment !== this.environment()
      )
        return null;
      if (a.contract === PRODUCTION_RELEASE_AUTH)
        this.productionTenant(tenantId);
      if (
        instant(state.appliedAt) < instant(a.notBefore) ||
        instant(state.appliedAt) >= instant(a.expiresAt) ||
        instant(a.grantExpiresAt) - instant(state.appliedAt) > MAX_RELEASE_MS ||
        row.expiresAt.toISOString() !== a.grantExpiresAt ||
        row.expiresAt <= now
      )
        return null;
      const cert = this.checkCertificate(command.certificate, a, now);
      digest(state.version);
      return Object.freeze({
        scope: cert.scope,
        version: state.version,
        certificateDigest: a.certificateDigest,
        profileDigest: cert.contract === PROFILE_CERT ? PROFILE_DIGEST : null,
      });
    } catch {
      return null;
    }
  }
}
