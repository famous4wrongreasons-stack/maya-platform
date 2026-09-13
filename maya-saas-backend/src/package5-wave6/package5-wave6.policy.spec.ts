import { C8_RETENTION_CLASSES } from './chapter8-valuation-retention';
import { RC_PAYLOAD_CLASSES } from './package5-wave-rc-payloads';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  WAVE6_CLASSES,
  wave6Hash,
  wave6Request,
} from './package5-wave6.policy';
import { Package5Wave6MaintenanceService } from './package5-wave6.service';

describe('approved Wave 6 policy boundary', () => {
  it('pins six unchanged auth policies, eight R-C payload classes and the approved C7/C8 derived lifecycle', () => {
    expect(Object.keys(WAVE6_CLASSES)).toHaveLength(18);
    expect(WAVE6_CLASSES.purge_auth_sessions.retentionMs).toBe(30 * 86_400_000);
    for (const key of [
      'purge_phone_auth_codes',
      'purge_email_auth_codes',
      'purge_auth_flow_states',
      'purge_auth_rate_limit_buckets',
    ] as const) {
      expect(WAVE6_CLASSES[key].retentionMs).toBe(86_400_000);
    }
    expect(WAVE6_CLASSES.purge_ingestion_quarantine.retentionMs).toBe(0);
    expect(WAVE6_CLASSES.expire_measurement_revisions).toEqual({
      table: 'MeasurementRevision',
      stamp: 'admittedAt',
      expiry: 'expiresAt',
      terminal: null,
      retentionMs: 0,
      policyKey: 'chapter7.measurement-retention',
    });
    expect(
      wave6Hash(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(WAVE6_CLASSES).filter(
              ([key]) =>
                !Object.hasOwn(RC_PAYLOAD_CLASSES, key) &&
                !Object.hasOwn(C8_RETENTION_CLASSES, key) &&
                key !== 'expire_measurement_revisions',
            ),
          ),
        ),
      ),
    ).toBe('9fc9734d27a82ce042ec46eb26b454329749ea877811733dbc70c06bf799f9e7');
  });
  it('pins exactly the approved three C8 leaves independently of unchanged auth policies', () => {
    expect(Object.keys(C8_RETENTION_CLASSES).sort()).toEqual([
      'expire_c8_evaluation_revisions',
      'expire_c8_model_versions',
      'expire_c8_result_revisions',
    ]);
    for (const [key, rule] of Object.entries(C8_RETENTION_CLASSES)) {
      expect(WAVE6_CLASSES[key as keyof typeof WAVE6_CLASSES]).toEqual(rule);
      expect(rule.expiry).toBe('expiresAt');
      expect(rule.stamp).toBe('admittedAt');
      expect(rule.retentionMs).toBe(0);
    }
  });
  it('rejects untrusted clock, tenant, target, predicate and policy overrides', () => {
    for (const key of [
      'now',
      'cutoffAt',
      'expiresAt',
      'consumedAt',
      'revokedAt',
      'tenantId',
      'scope',
      'policyVersion',
      'retentionMs',
      'targetIds',
      'maxItems',
      'predicate',
    ]) {
      expect(() =>
        wave6Request({ actionClass: 'purge_auth_sessions', [key]: 'forged' }),
      ).toThrow('authority_override');
    }
    for (const actionClass of [
      '__proto__',
      'constructor',
      'purge_clients',
      'purge_auth_refresh_tokens',
    ]) {
      expect(() => wave6Request({ actionClass })).toThrow('not_allowlisted');
    }
    for (const batchSize of [0, -1, 1.2, 1001, 10000]) {
      expect(() =>
        wave6Request({ actionClass: 'purge_auth_sessions', batchSize }),
      ).toThrow();
    }
  });
  it('does not derive platform authority from a tenant user or public request', async () => {
    const context = new TenantContextService();
    const prisma = { $transaction: jest.fn() };
    const service = new Package5Wave6MaintenanceService(
      prisma as unknown as PrismaService,
      context,
    );
    await context.runAsAuthPrincipal(
      { tenantId: 'tenant', userId: 'user', role: 'tenant_owner' },
      async () => {
        await expect(
          service.prepare({ actionClass: 'purge_auth_sessions' }),
        ).rejects.toThrow('system_authority');
      },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
