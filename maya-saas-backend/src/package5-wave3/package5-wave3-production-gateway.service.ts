import { ConflictException, Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';
import { staffScheduleSourceRevision } from '../crm/staff-schedule.utils';
import { EncryptionService } from '../encryption/encryption.service';
import {
  type Package5Wave3ProviderGateway,
  type StaffDaySlot,
  wave3Hash,
} from './package5-wave3.service';

@Injectable()
export class Package5Wave3ProductionGatewayService implements Package5Wave3ProviderGateway {
  constructor(
    private readonly crm: CrmService,
    private readonly encryption: EncryptionService,
  ) {}

  async readStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
    sourceIdentityHash?: string;
  }) {
    const source = await this.scheduleSource(input);
    const day = await this.crm.getStaffScheduleDay(input.tenantId, {
      staffId: input.externalStaffId,
      date: input.localDate,
      source,
    });
    return {
      revision: staffScheduleSourceRevision(day.revision, source.sourceHash),
      sourceIdentityHash: source.sourceHash,
      stateHash: this.staffDayHash(
        { ...input, sourceIdentityHash: source.sourceHash },
        day.slots,
      ),
    };
  }

  async replaceStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
    slots: StaffDaySlot[];
    expectedProviderRevision: string;
    requestIdentityHash: string;
    sourceIdentityHash: string | null;
  }) {
    if (!input.sourceIdentityHash)
      throw new ConflictException(
        'Original staff schedule source witness missing',
      );
    const source = await this.scheduleSource({
      ...input,
      sourceIdentityHash: input.sourceIdentityHash,
    });
    const applied = await this.crm.applyStaffScheduleDayChange(input.tenantId, {
      staffId: input.externalStaffId,
      date: input.localDate,
      slots: input.slots,
      expectedRevision: input.expectedProviderRevision,
      source,
    });
    return { stateHash: this.staffDayHash(input, applied.slots) };
  }

  async reconcileStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
    desiredStateHash: string;
    expectedProviderRevision: string;
    requestIdentityHash: string | null;
    sourceIdentityHash: string | null;
  }) {
    // Never qualify a historical UNKNOWN against today's source or re-dispatch it.
    if (!input.sourceIdentityHash) return 'STILL_UNKNOWN' as const;
    let current: Awaited<
      ReturnType<Package5Wave3ProductionGatewayService['readStaffDay']>
    >;
    try {
      current = await this.readStaffDay({
        ...input,
        sourceIdentityHash: input.sourceIdentityHash,
      });
    } catch {
      return 'STILL_UNKNOWN' as const;
    }
    if (current.stateHash === input.desiredStateHash)
      return 'PROVEN_SUCCEEDED' as const;
    if (current.revision === input.expectedProviderRevision)
      return 'PROVEN_NOT_EXECUTED' as const;
    return 'STILL_UNKNOWN' as const;
  }

  async verifyCrm(input: { tenantId: string; provider: string }) {
    const observed = await this.crm.readImportPreviewReadOnly(input.tenantId);
    this.assertProvider(input.provider, observed.connection.provider);
    return { snapshotHash: this.importEvidence(observed.preview).snapshotHash };
  }

  async readCrmImport(input: { tenantId: string; provider: string }) {
    const observed = await this.crm.readImportPreviewReadOnly(input.tenantId);
    this.assertProvider(input.provider, observed.connection.provider);
    return this.importEvidence(observed.preview);
  }

  fingerprintEncryptedValue(input: {
    namespace: string;
    encryptedValue: string;
  }) {
    return this.encryption.opaqueReference(
      input.namespace,
      this.encryption.decrypt(input.encryptedValue),
    );
  }

  async projectConfirmedImport(tenantId: string, expectedSnapshotHash: string) {
    const observed = await this.crm.readImportPreviewReadOnly(tenantId);
    const evidence = this.importEvidence(observed.preview);
    if (evidence.snapshotHash !== expectedSnapshotHash)
      throw new ConflictException(
        'CRM import snapshot changed before projection',
      );
    await this.crm.applyCanonicalImportProjection(tenantId, observed.preview);
    return observed;
  }

  importEvidence(preview: {
    company: unknown;
    services: { items: Array<{ id: string }> };
    staff: { items: Array<{ id: string }> };
    team: { items: Array<{ id: string }> };
    warnings: string[];
  }) {
    const stable = <T extends { id: string }>(items: T[]) =>
      [...items].sort((left, right) =>
        String(left.id).localeCompare(String(right.id)),
      );
    const team = stable(preview.team.items);
    return {
      snapshotHash: wave3Hash({
        company: preview.company,
        services: stable(preview.services.items),
        staff: stable(preview.staff.items),
        team,
        warnings: [...preview.warnings].sort(),
      }),
      teamChildHashes: team.map((member) => wave3Hash(member)),
    };
  }

  private staffDayHash(
    input: {
      staffId: string;
      branchId: string;
      localDate: string;
      sourceIdentityHash?: string | null;
    },
    slots: StaffDaySlot[],
  ) {
    return wave3Hash({
      staffId: input.staffId,
      branchId: input.branchId,
      localDate: input.localDate,
      sourceIdentityHash: input.sourceIdentityHash,
      slots: [...slots].sort((left, right) =>
        left.from.localeCompare(right.from),
      ),
    });
  }

  private scheduleSource(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    sourceIdentityHash?: string;
  }) {
    return this.crm.resolveStaffScheduleSource(
      input.tenantId,
      input.externalStaffId,
      {
        provider: input.provider,
        staffId: input.staffId,
        branchId: input.branchId,
        ...(input.sourceIdentityHash
          ? { sourceHash: input.sourceIdentityHash }
          : {}),
      },
    );
  }

  private assertProvider(expected: string, actual: string) {
    if (expected !== actual)
      throw new ConflictException('CRM provider changed during observation');
  }
}
