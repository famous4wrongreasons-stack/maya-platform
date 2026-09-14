import { ConflictException, Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';
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
  }) {
    const day = await this.crm.getStaffScheduleDay(input.tenantId, {
      staffId: input.externalStaffId,
      date: input.localDate,
    });
    return {
      revision: day.revision,
      stateHash: this.staffDayHash(input, day.slots),
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
  }) {
    const applied = await this.crm.applyStaffScheduleDayChange(input.tenantId, {
      staffId: input.externalStaffId,
      date: input.localDate,
      slots: input.slots,
      expectedRevision: input.expectedProviderRevision,
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
    requestIdentityHash: string;
  }) {
    const current = await this.readStaffDay(input);
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
    },
    slots: StaffDaySlot[],
  ) {
    return wave3Hash({
      staffId: input.staffId,
      branchId: input.branchId,
      localDate: input.localDate,
      slots: [...slots].sort((left, right) =>
        left.from.localeCompare(right.from),
      ),
    });
  }

  private assertProvider(expected: string, actual: string) {
    if (expected !== actual)
      throw new ConflictException('CRM provider changed during observation');
  }
}
