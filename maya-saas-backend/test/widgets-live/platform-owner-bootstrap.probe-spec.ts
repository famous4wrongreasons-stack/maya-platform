import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { spawn } from 'node:child_process';
import { type Writable } from 'node:stream';
import request from 'supertest';
import { bootstrapPlatformOwner } from '../../scripts/platform-owner-bootstrap';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

describe('first global operator bootstrap [HTTP] [PostgreSQL] [compiled CLI]', () => {
  let raw: PrismaClient, db: FixtureContext, http: HttpHarness, fx: Fixtures;
  const password = 'synthetic-bootstrap-password-only';
  const input = () => ({
    email: 'bootstrap-operator@maya.test',
    expectedDatabase: new URL(process.env.DATABASE_URL!).pathname.slice(1),
  });
  beforeAll(async () => {
    assertProofDatabase();
    // This suite is destructive to ONLY its owned disposable first-bootstrap DB.
    if (
      !input().expectedDatabase.startsWith(
        'maya_widget_gate_proof_platform_bootstrap_',
      )
    )
      throw new Error('dedicated_bootstrap_proof_database_required');
    raw = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterEach(async () => {
    if (!raw) return;
    await raw.auditLog.deleteMany({
      where: { action: 'platform.operator.bootstrap' },
    });
    await raw.authSession.deleteMany({ where: { user: { tenantId: null } } });
    await raw.user.deleteMany({ where: { tenantId: null } });
  });
  afterAll(async () => {
    await fx?.teardown();
    await http?.close();
    await db?.close();
    await raw?.$disconnect();
  });
  const counts = async () => ({
    users: await raw.user.count(),
    audits: await raw.auditLog.count(),
    sessions: await raw.authSession.count(),
    memberships: await raw.membership.count(),
    tenants: await raw.tenant.count(),
    entitlements: await raw.tenantEntitlement.count(),
    clients: await raw.client.count(),
    appointments: await raw.appointment.count(),
  });
  it('dry-run and wrong database leave every observed table unchanged', async () => {
    const before = await counts();
    expect(await bootstrapPlatformOwner(raw, input())).toMatchObject({
      status: 'ELIGIBLE',
      created: false,
    });
    await expect(
      bootstrapPlatformOwner(
        raw,
        { ...input(), expectedDatabase: 'wrong_database', password },
        true,
      ),
    ).rejects.toThrow('database_mismatch');
    expect(await counts()).toEqual(before);
  });
  it('creates a distinct global user and atomic platform audit; normal login establishes its own session; tenant session cannot operate release', async () => {
    const tenant = await fx.tenant(
      'Bootstrap boundary',
      CalendarSource.INTERNAL,
    );
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    const original = await raw.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    const before = await counts();
    const result = await bootstrapPlatformOwner(
      raw,
      { ...input(), email: owner.email, password },
      true,
    );
    expect(result).toMatchObject({
      status: 'CREATED',
      sessionIssued: false,
      entitlementGranted: false,
    });
    expect(await counts()).toEqual({
      ...before,
      users: before.users + 1,
      audits: before.audits + 1,
    });
    expect(await raw.user.findUnique({ where: { id: owner.id } })).toEqual(
      original,
    );
    const global = await raw.user.findFirstOrThrow({
      where: { tenantId: null },
    });
    expect(global.id).not.toBe(owner.id);
    expect(global).toMatchObject({
      role: 'platform_owner',
      status: 'active',
      branchId: null,
    });
    expect(await bcrypt.compare(password, global.passwordHash)).toBe(true);
    const audit = await raw.auditLog.findFirstOrThrow({
      where: { action: 'platform.operator.bootstrap' },
    });
    expect(audit).toMatchObject({
      scope: 'platform',
      tenantId: null,
      userId: null,
      entityId: global.id,
      metadataJson: {
        authenticatedPlatformActor: false,
        executor: 'offline_database_operator',
      },
    });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(owner.email);
    const login = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: owner.email, password });
    expect(login.status).toBe(201);
    expect(
      await raw.authSession.findFirst({ where: { userId: global.id } }),
    ).toMatchObject({ tenantId: null });
    const token = (login.body as { access_token: string }).access_token;
    const route = '/api/platform/widget-release/' + tenant.id;
    expect(
      (
        await request(http.app.getHttpServer())
          .get(route + '/status')
          .set('Authorization', 'Bearer ' + token)
      ).status,
    ).toBe(200);
    // Account existence alone still cannot grant: certificate and execution authority missing.
    expect(
      (
        await request(http.app.getHttpServer())
          .post(route + '/grant')
          .set('Authorization', 'Bearer ' + token)
          .send({})
      ).status,
    ).toBeGreaterThanOrEqual(400);
    const tenantToken = await http.login(
      tenant.slug,
      owner.email,
      owner.password,
    );
    expect(
      (
        await request(http.app.getHttpServer())
          .get(route + '/status')
          .set('Authorization', 'Bearer ' + tenantToken)
      ).status,
    ).toBe(403);
    expect(
      (await raw.user.findUniqueOrThrow({ where: { id: owner.id } })).role,
    ).toBe('tenant_owner');
    expect(await raw.tenantEntitlement.count()).toBe(before.entitlements);
  });
  it('concurrent execution creates exactly one operator and audit; replay never resets credentials', async () => {
    const calls = await Promise.allSettled([
      bootstrapPlatformOwner(raw, { ...input(), password }, true),
      bootstrapPlatformOwner(
        raw,
        { ...input(), password: 'different-synthetic-password' },
        true,
      ),
    ]);
    expect(calls.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = calls.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(String(failure.reason)).toContain('operator_already_initialized');
    expect(await raw.user.count({ where: { role: 'platform_owner' } })).toBe(1);
    expect(
      await raw.auditLog.count({
        where: { action: 'platform.operator.bootstrap' },
      }),
    ).toBe(1);
    const before = await raw.user.findFirstOrThrow({
      where: { tenantId: null },
    });
    await expect(
      bootstrapPlatformOwner(
        raw,
        { ...input(), password: 'replacement-synthetic-password' },
        true,
      ),
    ).rejects.toThrow('operator_already_initialized');
    expect(await raw.user.findUnique({ where: { id: before.id } })).toEqual(
      before,
    );
  });
  it('suspended operator and retained initialization audit both require recovery, never a replacement bootstrap', async () => {
    await bootstrapPlatformOwner(raw, { ...input(), password }, true);
    await raw.user.updateMany({
      where: { tenantId: null },
      data: { status: 'suspended' },
    });
    await expect(bootstrapPlatformOwner(raw, input())).rejects.toThrow(
      'operator_already_initialized',
    );
    await raw.user.deleteMany({ where: { tenantId: null } });
    await expect(
      bootstrapPlatformOwner(raw, { ...input(), password }, true),
    ).rejects.toThrow('operator_already_initialized');
    expect(await raw.user.count({ where: { tenantId: null } })).toBe(0);
  });
  it('never promotes a global account with a different role', async () => {
    const user = await raw.user.create({
      data: {
        email: input().email.toUpperCase(),
        passwordHash: 'fixture',
        role: 'client',
        tenantId: null,
      },
    });
    await expect(
      bootstrapPlatformOwner(raw, { ...input(), password }, true),
    ).rejects.toThrow('global_email_exists');
    expect(await raw.user.findUnique({ where: { id: user.id } })).toEqual(user);
  });
  it('audit failure rolls the new account back atomically', async () => {
    const before = await counts();
    await raw.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ADD CONSTRAINT "bootstrap_proof_fail_audit" CHECK (action <> 'platform.operator.bootstrap')`,
    );
    try {
      await expect(
        bootstrapPlatformOwner(raw, { ...input(), password }, true),
      ).rejects.toThrow();
      expect(await counts()).toEqual(before);
    } finally {
      await raw.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" DROP CONSTRAINT "bootstrap_proof_fail_audit"',
      );
    }
  });
  function cli(mode: string, payload: unknown) {
    return new Promise<{ code: number | null; out: string; err: string }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['dist/scripts/platform-owner-bootstrap.js', mode, '--input-fd', '3'],
          { env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] },
        );
        let out = '',
          err = '';
        child.stdout!.on('data', (data) => {
          out += String(data);
        });
        child.stderr!.on('data', (data) => {
          err += String(data);
        });
        child.on('error', reject);
        (child.stdio[3] as Writable).end(JSON.stringify(payload));
        child.on('close', (code) => resolve({ code, out, err }));
      },
    );
  }
  it('compiled CLI consumes anonymous input; emits no email/password and creates no session or grant', async () => {
    expect((await cli('--dry-run', input())).code).toBe(0);
    const before = await counts();
    const result = await cli('--execute', { ...input(), password });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      status: 'CREATED',
      sessionIssued: false,
      entitlementGranted: false,
    });
    expect(result.out + result.err).not.toContain(password);
    expect(result.out + result.err).not.toContain(input().email);
    expect(await counts()).toEqual({
      ...before,
      users: before.users + 1,
      audits: before.audits + 1,
    });
    const replay = await cli('--execute', { ...input(), password });
    expect(replay.code).toBe(1);
    expect(JSON.parse(replay.err)).toEqual({
      status: 'REFUSED',
      code: 'operator_already_initialized',
    });
  });
});
