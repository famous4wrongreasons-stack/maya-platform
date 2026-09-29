import { ConfigService } from '@nestjs/config';
import { releaseProof } from '../../test/widgets-live/support/widget-release-proof';
import { WidgetReleasePolicy } from './widget-release-policy.service';
import {
  MAX_RELEASE_MS,
  RELEASE_STATE,
  releaseHash,
} from './widget-release.contract';
import { FeatureRegistryService } from './feature-registry.service';
import { MAYA_FEATURE_READINESS } from '../common/feature-catalog';
import { widgetProofEnvironment } from './widget-release-environment';
const db = 'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_ar1';
describe('AR-1 signed release policy', () => {
  const p = releaseProof(db);
  it('AR1-SIGNED admits the full signed synthetic denominator, exact actor and candidate', () => {
    expect(
      p.policy.read(
        p.command('tenant'),
        'tenant',
        'grant',
        'operator',
        new Date(),
      ).c?.matrix,
    ).toHaveLength(165);
  });
  it.each([
    'tenantId',
    'operatorId',
    'buildDigest',
    'candidateSha',
    'expectedVersion',
  ] as const)('AR1-FORGED rejects unsigned change to %s', (field) => {
    const c = p.command('tenant');
    c.authorization.payload[field] = 'forged';
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
  it.each(['tenant', 'operator', 'operation'] as const)(
    'AR1-CONTEXT rejects %s substitution',
    (which) => {
      expect(() =>
        p.policy.read(
          p.command('tenant'),
          which === 'tenant' ? 'other' : 'tenant',
          which === 'operation' ? 'revoke' : 'grant',
          which === 'operator' ? 'other' : 'operator',
          new Date(),
        ),
      ).toThrow();
    },
  );
  it.each([
    'expired',
    'future',
    'over24h',
    'changed-build',
    'changed-candidate',
    'reviewer',
  ] as const)('AR1-NEGATIVE %s', (which) => {
    const c = p.command('tenant');
    const a = c.authorization.payload;
    if (which === 'expired')
      a.expiresAt = new Date(Date.now() - 1).toISOString();
    if (which === 'future')
      a.notBefore = new Date(Date.now() + 2000).toISOString();
    if (which === 'over24h')
      a.grantExpiresAt = new Date(
        Date.now() + MAX_RELEASE_MS + 5000,
      ).toISOString();
    if (which === 'changed-build') a.buildDigest = 'b'.repeat(64);
    if (which === 'changed-candidate') a.candidateSha = 'b'.repeat(40);
    if (which === 'reviewer') a.reviewerId = a.approverId;
    c.authorization = p.signOwner(a);
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
  it.each([
    'false',
    'missing',
    'duplicate',
    'u-no-duties',
    'integration-missing',
  ] as const)('AR1-THRESHOLD rejects %s', (which) => {
    const c = p.command('tenant');
    const cert = c.certificate.payload;
    if (which === 'false') cert.matrix[0].state = 'false' as never;
    if (which === 'missing') cert.matrix.pop();
    if (which === 'duplicate') cert.matrix[0] = cert.matrix[1];
    if (which === 'u-no-duties') cert.matrix[0].state = 'U';
    if (which === 'integration-missing') cert.integrationDigest = '';
    c.certificate = p.signCertificate(cert);
    c.authorization = p.signOwner({
      ...c.authorization.payload,
      certificateDigest: releaseHash(c.certificate),
    });
    expect(() =>
      p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
  it('AR1-RUNNING independently refuses signed evidence for stale running candidate, bytes, or expired certificate', () => {
    for (const field of ['candidateSha', 'buildDigest', 'expiresAt'] as const) {
      const c = p.command('tenant'),
        cert = c.certificate.payload;
      if (field === 'candidateSha') cert.candidateSha = 'b'.repeat(40);
      if (field === 'buildDigest') cert.buildDigest = 'b'.repeat(64);
      if (field === 'expiresAt')
        cert.expiresAt = new Date(Date.now() - 1).toISOString();
      c.certificate = p.signCertificate(cert);
      c.authorization = p.signOwner({
        ...c.authorization.payload,
        candidateSha: cert.candidateSha,
        buildDigest: cert.buildDigest,
        certificateDigest: releaseHash(c.certificate),
      });
      expect(() =>
        p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
      ).toThrow();
    }
  });
  it('AR1-PRODUCTION production execution is refused even with trusted signatures', () => {
    const c = p.command('tenant');
    p.config.set('NODE_ENV', 'production');
    try {
      expect(() =>
        p.policy.read(c, 'tenant', 'grant', 'operator', new Date()),
      ).toThrow('production_not_authorized');
    } finally {
      p.config.set('NODE_ENV', 'test');
    }
  });
  it('AR1-READER signed grant expires; wrong tenant and revoked/unsigned rows fail closed', () => {
    const command = p.command('tenant'),
      now = new Date();
    const row = {
      enabled: true,
      expiresAt: new Date(command.authorization.payload.grantExpiresAt!),
      configJson: {
        contract: RELEASE_STATE,
        version: releaseHash('version'),
        appliedAt: now.toISOString(),
        command,
      },
    };
    expect(p.policy.allows('tenant', row, now)).toBe(true);
    expect(p.policy.allows('other', row, now)).toBe(false);
    expect(p.policy.allows('tenant', row, row.expiresAt)).toBe(false);
    expect(p.policy.allows('tenant', { ...row, enabled: false }, now)).toBe(
      false,
    );
    expect(p.policy.allows('tenant', { ...row, configJson: null }, now)).toBe(
      false,
    );
  });
  it('AR1-TRIAL widget trial remains forbidden even if readiness changes', () => {
    const prior = MAYA_FEATURE_READINESS['widgets.runtime'];
    MAYA_FEATURE_READINESS['widgets.runtime'] = {
      ...prior,
      implementationStatus: 'platform_ready',
    };
    try {
      expect(
        new FeatureRegistryService().trialGrantable('widgets.runtime'),
      ).toBe(false);
    } finally {
      MAYA_FEATURE_READINESS['widgets.runtime'] = prior;
    }
  });
  it.each([
    'postgresql://proof@127.0.0.1:5432/maya_widget_gate_proof_ar1',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_local',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_prod',
    'postgresql://proof@127.0.0.1:55729/maya_widget_gate_proof_ar1?host=real',
    'postgresql://proof@remote:55729/maya_widget_gate_proof_ar1',
  ])('AR1-PROOF-FENCE rejects redirected or foreign DB %s', (url) => {
    expect(
      widgetProofEnvironment(
        new ConfigService({ NODE_ENV: 'test', DATABASE_URL: url }),
      ),
    ).toBe(false);
  });
  it('AR1-DEFAULT missing trust/config never grants', () => {
    expect(() =>
      new WidgetReleasePolicy(
        new ConfigService({ NODE_ENV: 'production' }),
      ).read(p.command('tenant'), 'tenant', 'grant', 'operator', new Date()),
    ).toThrow();
  });
});
