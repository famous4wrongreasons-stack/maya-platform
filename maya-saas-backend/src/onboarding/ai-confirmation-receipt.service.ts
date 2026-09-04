import { createHash, timingSafeEqual } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import {
  Prisma,
  type AiOnboardingDraft,
  type PrismaClient,
} from '@prisma/client';

import { PACKAGE5_WAVE2_REGISTRATIONS } from '../action-engine/package5-wave2-executable.contract';
import { PACKAGE5_WAVE3_REGISTRATIONS } from '../action-engine/package5-wave3-executable.contract';
import { PACKAGE5_WAVE4_REGISTRATIONS } from '../action-engine/package5-wave4-executable.contract';
import { EncryptionService } from '../encryption/encryption.service';
import {
  TrialActivationBootstrapService,
  type TrialActivationBootstrapCommand,
} from '../package5-wave2/trial-activation-bootstrap.service';

type Tx = Prisma.TransactionClient;
const CONTRACT = 'package5.ai-draft-confirmation/1';
const KEY = /^[A-Za-z0-9._:-]{1,120}$/;
const REGISTRATIONS = [
  ...PACKAGE5_WAVE2_REGISTRATIONS.filter((r) => r.family !== 'A25'),
  ...PACKAGE5_WAVE3_REGISTRATIONS.filter((r) => r.family === 'A17'),
  ...PACKAGE5_WAVE4_REGISTRATIONS.filter((r) => r.family === 'A28'),
];

export interface AiConfirmationChildIntent {
  key: string;
  actionClass: string;
  targetRef: string | null;
  dependsOn: string[];
  /** Private, normalized server material; never serialized by the draft API. */
  input: Prisma.InputJsonValue;
}

export interface AiConfirmationChild {
  key: string;
  family: string;
  actionClass: string;
  sourceIntentRef: string;
  targetKind: string;
  targetRef: string | null;
  inputHash: string;
  dependsOn: string[];
}

export interface AiConfirmationReceipt {
  contract: typeof CONTRACT;
  policyVersion: 1;
  draftRevision: number;
  draftSnapshotHash: string;
  trialActivationId: string;
  expectedTenantId: string;
  ownerUserId: string;
  authorityHash: string;
  intentHash: string;
  manifestHash: string;
  confirmationId: string;
  approvedAt: string;
  children: AiConfirmationChild[];
}

export interface AiConfirmationMaterial {
  /** Input-intent fingerprint excludes generated bcrypt/encryption randomness. */
  approvedInput: Prisma.InputJsonValue;
  bootstrap: Omit<
    TrialActivationBootstrapCommand,
    'activationTokenHash' | 'tenant'
  > & {
    tenant: Omit<TrialActivationBootstrapCommand['tenant'], 'trialEndsAt'> & {
      trialEndsAt: string;
    };
  };
  children: AiConfirmationChildIntent[];
}

export interface AiConfirmationClaims {
  draftId: string;
  draftToken: string;
  activationToken: string;
}

function canonical(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, normalize(x)]),
      );
    return v;
  };
  return JSON.stringify(normalize(value));
}

/** Durable orchestration receipt only. Business writes remain canonical children. */
export class AiConfirmationReceiptService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
  ) {}

  async claim(
    input: AiConfirmationClaims & {
      expectedDraftRevision: number;
      blueprint: Prisma.InputJsonValue;
      material: AiConfirmationMaterial;
    },
  ) {
    this.assertPrivateMaterial(input.material);
    if (
      !Number.isSafeInteger(input.expectedDraftRevision) ||
      input.expectedDraftRevision < 0
    )
      throw new ConflictException('Exact draft revision required');
    return this.serializable(async (tx) => {
      const { draft, activation } = await this.claims(tx, input);
      const intentHash = this.intentFingerprint(input.material);
      if (draft.confirmationReceiptJson !== null) {
        const restored = await this.open(tx, draft);
        if (
          restored.receipt.draftRevision !== input.expectedDraftRevision ||
          restored.receipt.intentHash !== intentHash ||
          restored.receipt.draftSnapshotHash !==
            (await this.hash(tx, input.blueprint))
        )
          throw new ConflictException(
            'Changed confirmation cannot reuse receipt',
          );
        return { ...restored, resumed: true };
      }
      if (
        draft.status !== 'draft' ||
        draft.revision !== input.expectedDraftRevision ||
        activation.status !== 'pending'
      )
        throw new ConflictException(
          'Draft revision or activation is not current',
        );
      const ids = this.reservedIds(activation.activationTokenHash);
      const authorityHash = this.fingerprint({
        draftId: draft.id,
        draftTokenHash: draft.draftTokenHash,
        activationId: activation.id,
        activationTokenHash: activation.activationTokenHash,
        ownerUserId: ids.ownerUserId,
      });
      const confirmationId = await this.hash(tx, [
        CONTRACT,
        draft.id,
        draft.revision,
        ids.tenantId,
        authorityHash,
        intentHash,
      ]);
      const seen = new Set<string>();
      if (input.material.children.length > 273)
        throw new ConflictException(
          'Confirmation plan exceeds existing bounds',
        );
      const children = input.material.children.map(
        (child): AiConfirmationChild => {
          const registration = REGISTRATIONS.find(
            (r) => r.actionClass === child.actionClass,
          );
          if (
            !registration ||
            !KEY.test(child.key) ||
            seen.has(child.key) ||
            child.dependsOn.some((key) => !seen.has(key))
          )
            throw new ConflictException(
              'Exact ordered canonical child required',
            );
          seen.add(child.key);
          return {
            key: child.key,
            family: registration.family,
            actionClass: child.actionClass,
            sourceIntentRef: `aic1:${confirmationId}:${child.key}`,
            targetKind: registration.targetKind,
            targetRef: child.targetRef,
            inputHash: this.fingerprint(child.input),
            dependsOn: child.dependsOn,
          };
        },
      );
      const receipt: AiConfirmationReceipt = {
        contract: CONTRACT,
        policyVersion: 1,
        draftRevision: draft.revision,
        draftSnapshotHash: await this.hash(tx, input.blueprint),
        trialActivationId: activation.id,
        expectedTenantId: ids.tenantId,
        ownerUserId: ids.ownerUserId,
        authorityHash,
        intentHash,
        manifestHash: await this.hash(tx, children),
        confirmationId,
        approvedAt: (await this.clock(tx)).toISOString(),
        children,
      };
      const encrypted = this.encryption.encrypt(
        canonical({ confirmationId, material: input.material }),
      );
      const result = await tx.aiOnboardingDraft.updateMany({
        where: {
          id: draft.id,
          status: 'draft',
          revision: input.expectedDraftRevision,
          confirmationReceiptJson: { equals: Prisma.DbNull },
        },
        data: {
          status: 'confirming',
          blueprintJson: input.blueprint,
          confirmationReceiptJson: receipt as unknown as Prisma.InputJsonValue,
          confirmationMaterialEncrypted: encrypted,
        },
      });
      if (result.count !== 1)
        throw new ConflictException('Draft was concurrently claimed');
      return {
        ...(await this.open(
          tx,
          await tx.aiOnboardingDraft.findUniqueOrThrow({
            where: { id: draft.id },
          }),
        )),
        resumed: false,
      };
    });
  }

  async readWithClaims(input: AiConfirmationClaims) {
    return this.serializable(async (tx) =>
      this.open(tx, (await this.claims(tx, input)).draft),
    );
  }

  async readWithOwner(draftId: string, tenantId: string, actorUserId: string) {
    return this.serializable(async (tx) => {
      const draft = await tx.aiOnboardingDraft.findUniqueOrThrow({
        where: { id: draftId },
      });
      const stored = await this.open(tx, draft);
      if (
        stored.receipt.expectedTenantId !== tenantId ||
        stored.receipt.ownerUserId !== actorUserId
      )
        throw new ForbiddenException('Exact confirmation owner required');
      const actor = await tx.membership.findUnique({
        where: { userId_tenantId: { userId: actorUserId, tenantId } },
        include: { user: true },
      });
      const activation = await tx.trialActivation.findUnique({
        where: { id: stored.receipt.trialActivationId },
      });
      if (
        !actor ||
        actor.status !== 'active' ||
        actor.user.status !== 'active' ||
        !['tenant_owner', 'business_owner'].includes(actor.role) ||
        activation?.status !== 'completed' ||
        activation.tenantId !== tenantId
      )
        throw new ForbiddenException(
          'Current canonical owner authority required',
        );
      return stored;
    });
  }

  async bootstrap(
    input: AiConfirmationClaims,
    bootstrapper: TrialActivationBootstrapService,
  ) {
    const stored = await this.readWithClaims(input);
    const command = stored.material.bootstrap;
    const result = await bootstrapper.activate({
      ...command,
      activationTokenHash: this.tokenHash(input.activationToken),
      tenant: {
        ...command.tenant,
        trialEndsAt: new Date(command.tenant.trialEndsAt),
      },
    });
    if (
      result.tenantId !== stored.receipt.expectedTenantId ||
      result.ownerUserId !== stored.receipt.ownerUserId
    )
      throw new ConflictException('Bootstrap outcome mismatch');
    return result;
  }

  async childOutcomes(receipt: AiConfirmationReceipt) {
    const outcomes = [];
    for (const child of receipt.children) {
      const [row] = await this.prisma.$queryRaw<Array<{ source: string }>>(
        Prisma.sql`SELECT ai_confirmation_child_source_v1(${JSON.stringify(child)}::jsonb, ${receipt.expectedTenantId}) AS source`,
      );
      const registration = REGISTRATIONS.find(
        (r) => r.actionClass === child.actionClass,
      )!;
      const matches = await this.prisma.actionExecution.findMany({
        where: {
          tenantId: receipt.expectedTenantId,
          sourceRef: row.source,
          capability: registration.executableCapability,
        },
        take: 2,
      });
      if (matches.length > 1)
        throw new ConflictException('Ambiguous canonical child execution');
      if (
        matches[0] &&
        (matches[0].actorUserId !== receipt.ownerUserId ||
          matches[0].actionClass !== child.actionClass ||
          (child.targetRef && matches[0].targetRef !== child.targetRef))
      )
        throw new ForbiddenException('Child authority mismatch');
      outcomes.push({ child, execution: matches.length ? matches[0] : null });
    }
    return outcomes;
  }

  async finish(draftId: string, tenantId: string, actorUserId: string) {
    const stored = await this.readWithOwner(draftId, tenantId, actorUserId);
    const outcomes = await this.childOutcomes(stored.receipt);
    if (outcomes.some((x) => x.execution?.state !== 'SUCCEEDED'))
      throw new ConflictException('Confirmation children are incomplete');
    return this.prisma.aiOnboardingDraft.update({
      where: { id: draftId },
      data: { status: 'confirmed', confirmedTenantId: tenantId },
    });
  }

  private async open(tx: Tx, draft: AiOnboardingDraft) {
    if (!draft.confirmationReceiptJson || !draft.confirmationMaterialEncrypted)
      throw new ConflictException(
        'No V1 confirmation receipt; historical replay forbidden',
      );
    const receipt =
      draft.confirmationReceiptJson as unknown as AiConfirmationReceipt;
    const envelope = JSON.parse(
      this.encryption.decrypt(draft.confirmationMaterialEncrypted),
    ) as { confirmationId: string; material: AiConfirmationMaterial };
    const material = envelope.material;
    this.assertPrivateMaterial(material);
    const activation = draft.trialActivationId
      ? await tx.trialActivation.findUnique({
          where: { id: draft.trialActivationId },
        })
      : null;
    if (!activation)
      throw new ConflictException('Confirmation activation missing');
    const ids = this.reservedIds(activation.activationTokenHash);
    const authorityHash = this.fingerprint({
      draftId: draft.id,
      draftTokenHash: draft.draftTokenHash,
      activationId: activation.id,
      activationTokenHash: activation.activationTokenHash,
      ownerUserId: ids.ownerUserId,
    });
    if (
      receipt.contract !== CONTRACT ||
      receipt.authorityHash !== authorityHash ||
      receipt.ownerUserId !== ids.ownerUserId ||
      receipt.expectedTenantId !== ids.tenantId ||
      receipt.trialActivationId !== activation.id ||
      receipt.confirmationId !==
        (await this.hash(tx, [
          CONTRACT,
          draft.id,
          draft.revision,
          ids.tenantId,
          authorityHash,
          receipt.intentHash,
        ])) ||
      envelope.confirmationId !== receipt.confirmationId ||
      receipt.intentHash !== this.intentFingerprint(material) ||
      receipt.draftSnapshotHash !==
        (await this.hash(tx, draft.blueprintJson)) ||
      receipt.manifestHash !== (await this.hash(tx, receipt.children)) ||
      receipt.children.length !== material.children.length
    )
      throw new ConflictException('Confirmation material integrity failed');
    for (let i = 0; i < receipt.children.length; i++) {
      const child = receipt.children[i],
        input = material.children[i];
      if (
        child.key !== input.key ||
        child.actionClass !== input.actionClass ||
        child.targetRef !== input.targetRef ||
        canonical(child.dependsOn) !== canonical(input.dependsOn) ||
        child.inputHash !== this.fingerprint(input.input)
      )
        throw new ConflictException('Confirmation child material changed');
    }
    return { draft, receipt, material };
  }

  private async claims(tx: Tx, input: AiConfirmationClaims) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "AiOnboardingDraft" WHERE id=${input.draftId} FOR UPDATE`,
    );
    const draft = await tx.aiOnboardingDraft.findUniqueOrThrow({
      where: { id: input.draftId },
    });
    this.assertToken(input.draftToken, draft.draftTokenHash);
    const activation = draft.trialActivationId
      ? await tx.trialActivation.findUnique({
          where: { id: draft.trialActivationId },
        })
      : null;
    if (!activation)
      throw new ForbiddenException('Draft-bound activation required');
    this.assertToken(input.activationToken, activation.activationTokenHash);
    const now = await this.clock(tx);
    if (draft.expiresAt <= now || activation.expiresAt <= now)
      throw new GoneException('Original confirmation claims expired');
    return { draft, activation };
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private assertToken(token: string, expected: string) {
    if (
      typeof token !== 'string' ||
      token.length < 32 ||
      token.length > 256 ||
      !/^[0-9a-f]{64}$/.test(expected) ||
      !timingSafeEqual(
        Buffer.from(this.tokenHash(token), 'hex'),
        Buffer.from(expected, 'hex'),
      )
    )
      throw new ForbiddenException('Verified confirmation claim required');
  }
  reservedIds(activationTokenHash: string) {
    const digest = createHash('sha256')
      .update(`package5.wave2.trial-bootstrap:${activationTokenHash}`)
      .digest('hex')
      .slice(0, 28);
    return {
      tenantId: `p5t_${digest}`,
      ownerUserId: `p5o_${digest}`,
      branchId: `p5b_${digest}`,
    };
  }
  fingerprint(value: unknown) {
    return this.encryption.opaqueReference(CONTRACT, canonical(value));
  }
  private intentFingerprint(material: AiConfirmationMaterial) {
    // The approved credential intent is fingerprinted in approvedInput / child
    // credentialIntentHash. Fresh bcrypt salts, encryption IVs and the server
    // bootstrap clock must not create a different logical confirmation.
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          key === 'passwordHash'
            ? 'SERVER_PREPARED_CREDENTIAL'
            : key === 'encryptedName' && typeof entry === 'string'
              ? this.fingerprint(this.encryption.decrypt(entry))
              : normalize(entry),
        ]),
      );
    };
    return this.fingerprint(
      normalize({
        ...material,
        bootstrap: {
          ...material.bootstrap,
          tenant: {
            ...material.bootstrap.tenant,
            trialEndsAt: 'SERVER_DERIVED_EXISTING_TRIAL_PERIOD',
          },
        },
      }),
    );
  }
  private assertPrivateMaterial(material: AiConfirmationMaterial) {
    const inspect = (v: unknown): void => {
      if (!v || typeof v !== 'object') return;
      for (const [key, value] of Object.entries(v)) {
        if (
          /^(password|temporaryPassword|draftToken|activationToken|trialActivationToken|apiToken|accessToken|refreshToken|bearer|authorization|credential)$/i.test(
            key,
          )
        )
          throw new ForbiddenException(
            'Raw secret is forbidden in confirmation material',
          );
        inspect(value);
      }
    };
    inspect(material);
    if (
      !material.bootstrap?.owner.passwordHash ||
      !Array.isArray(material.children) ||
      canonical(material).length > 500_000
    )
      throw new ConflictException(
        'Bounded private confirmation material required',
      );
  }
  private async hash(tx: Tx, value: unknown) {
    const [row] = await tx.$queryRaw<Array<{ hash: string }>>(
      Prisma.sql`SELECT ai_confirmation_hash_v1(${JSON.stringify(value)}::jsonb) AS hash`,
    );
    return row.hash;
  }
  private async clock(tx: Tx) {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
    );
    return row.now;
  }
  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new ConflictException('Confirmation contention requires retry');
  }
}
