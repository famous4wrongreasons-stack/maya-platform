import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { asJson } from '../common/json.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import {
  AiToolReceiptService,
  type AiReceiptInvocation,
} from './ai-tool-receipt.service';
import type {
  AiToolDefinition,
  AiToolPrincipal,
  AiToolSurface,
  ValidatedAiToolArguments,
} from './ai-tool.types';
import type { ApprovalDecisionDto } from './dto/approval-decision.dto';
import type { ExecuteAiToolDto } from './dto/execute-ai-tool.dto';

const APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_CANONICAL_INPUT_BYTES = 8 * 1024;
const LAST_VERIFIED_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;
const EXECUTION_STATUS = {
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

interface ApprovalRecord {
  id: string;
  tenantId: string;
  requestedByUserId: string | null;
  toolName: string;
  surface: string;
  riskTier: string;
  approvalPolicy: string;
  status: string;
  summary: string;
  payloadHash: string;
  payloadPreviewJson: unknown;
  encryptedArguments: string;
  idempotencyKey: string;
  expiresAt: Date;
  decidedAt: Date | null;
  executedAt: Date | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AiToolRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly registry: AiToolRegistryService,
    private readonly policy: AiToolPolicyService,
    private readonly handler: AiToolHandlerService,
    private readonly encryption: EncryptionService,
    private readonly auditLog: AuditLogService,
    private readonly receipts: AiToolReceiptService = new AiToolReceiptService(
      prisma,
      encryption,
    ),
  ) {}

  async listTools(user: AuthenticatedUser, surface: AiToolSurface) {
    const tenantId = this.requireTenant(user);
    const tools = await this.policy.listAllowed(
      tenantId,
      user.userId,
      user.role,
      surface,
    );

    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        risk_tier: tool.riskTier,
        approval_policy: tool.approvalPolicy,
        idempotency: tool.idempotency,
        timeout_ms: tool.timeoutMs,
      })),
    };
  }

  async execute(
    user: AuthenticatedUser,
    toolName: string,
    dto: ExecuteAiToolDto,
  ) {
    const principal = this.principal(user, dto.surface);
    const definition = this.registry.get(toolName);
    const validated = this.registry.validateArguments(toolName, dto.arguments);
    await this.policy.assertCanExecute(principal, definition);
    // 🔴 Доводка ДО подписи: то, что подписано и показано человеку, обязано
    // совпадать с тем, что будет исполнено. Разрешение «сегодня» в местную
    // дату происходит здесь — при повторной проверке уже сохранённых
    // аргументов оно тождественно, поэтому хеш карточки не разъезжается.
    const args = await this.handler.normalizeArguments(
      toolName,
      principal,
      validated,
    );
    const inputHash = this.inputHash(toolName, args, principal);

    if (definition.approvalPolicy !== 'none') {
      const idempotencyKey = this.requireIdempotencyKey(dto.idempotencyKey);
      return this.requestApproval(
        principal,
        definition,
        args,
        inputHash,
        idempotencyKey,
      );
    }

    return this.executeNow({
      principal,
      definition,
      args,
      inputHash,
      idempotencyKey:
        definition.idempotency === 'required'
          ? this.requireIdempotencyKey(dto.idempotencyKey)
          : (dto.idempotencyKey ?? randomUUID()),
      approval: null,
    });
  }

  async listApprovals(user: AuthenticatedUser, surface: AiToolSurface) {
    const principal = this.principal(user, surface);
    await this.expireDueApprovals(principal.tenantId);
    const approvals = await this.prisma.aiApprovalRequest.findMany({
      where: {
        tenantId: principal.tenantId,
        surface,
        status: {
          in: [
            APPROVAL_STATUS.PENDING,
            APPROVAL_STATUS.APPROVED,
            APPROVAL_STATUS.EXECUTING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      approvals: approvals
        .filter((approval) => {
          const definition = this.safeDefinition(approval.toolName);
          return (
            approval.requestedByUserId === principal.userId ||
            (definition !== null &&
              this.policy.canDecide(
                definition,
                approval.requestedByUserId,
                principal,
              ))
          );
        })
        .map((approval) => this.serializeApproval(approval)),
    };
  }

  async approve(
    user: AuthenticatedUser,
    approvalId: string,
    dto: ApprovalDecisionDto,
  ) {
    const approval = await this.findApproval(user, approvalId);
    const principal = this.principal(
      user,
      this.assertSurface(approval.surface),
    );
    const definition = this.registry.get(approval.toolName);
    this.policy.assertCanDecide(
      definition,
      approval.requestedByUserId,
      principal,
    );
    this.assertPayloadHash(approval, dto.payloadHash);

    if (approval.status === APPROVAL_STATUS.COMPLETED) {
      return this.replayCompletedApproval(approval);
    }
    if (
      approval.status === APPROVAL_STATUS.APPROVED ||
      approval.status === APPROVAL_STATUS.EXECUTING
    )
      return this.executeApproved(approval);
    this.assertPendingApproval(approval);

    const now = new Date();
    if (approval.expiresAt.getTime() <= now.getTime()) {
      await this.markExpired(approval);
      this.approvalConflict('ai_approval_expired');
    }

    const transitioned = await this.prisma.aiApprovalRequest.updateMany({
      where: {
        id: approval.id,
        tenantId: approval.tenantId,
        status: APPROVAL_STATUS.PENDING,
        expiresAt: { gt: now },
      },
      data: {
        status: APPROVAL_STATUS.APPROVED,
        decidedByUserId: principal.userId,
        decidedByTenantId: principal.tenantId,
        decidedAt: now,
      },
    });
    if (transitioned.count !== 1) {
      const decided = await this.prisma.aiApprovalRequest.findUnique({
        where: {
          id_tenantId: { id: approval.id, tenantId: approval.tenantId },
        },
      });
      if (decided && decided.payloadHash === approval.payloadHash) {
        if (decided.status === APPROVAL_STATUS.COMPLETED)
          return this.replayCompletedApproval(decided);
        if (
          decided.status === APPROVAL_STATUS.APPROVED ||
          decided.status === APPROVAL_STATUS.EXECUTING
        )
          return this.executeApproved(decided);
      }
      this.approvalConflict('ai_approval_already_decided');
    }

    await this.auditLog.log({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'ai.approval_approved',
      entityType: 'ai_approval',
      entityId: approval.id,
      metadata: {
        tool_name: approval.toolName,
        risk_tier: approval.riskTier,
        approval_policy: approval.approvalPolicy,
        surface: approval.surface,
      },
    });

    const approved = await this.prisma.aiApprovalRequest.findUniqueOrThrow({
      where: {
        id_tenantId: { id: approval.id, tenantId: approval.tenantId },
      },
    });
    return this.executeApproved(approved);
  }

  async reject(
    user: AuthenticatedUser,
    approvalId: string,
    dto: ApprovalDecisionDto,
  ) {
    const approval = await this.findApproval(user, approvalId);
    const principal = this.principal(
      user,
      this.assertSurface(approval.surface),
    );
    const definition = this.registry.get(approval.toolName);
    const canReject =
      approval.requestedByUserId === principal.userId ||
      this.policy.canDecide(definition, approval.requestedByUserId, principal);
    if (!canReject) {
      throw new ForbiddenException({
        message: 'AI approval is not available to this principal.',
        error: { code: 'ai_approval_forbidden' },
      });
    }
    this.assertPayloadHash(approval, dto.payloadHash);
    this.assertPendingApproval(approval);

    const transitioned = await this.prisma.aiApprovalRequest.updateMany({
      where: {
        id: approval.id,
        tenantId: approval.tenantId,
        status: APPROVAL_STATUS.PENDING,
      },
      data: {
        status: APPROVAL_STATUS.REJECTED,
        decidedByUserId: principal.userId,
        decidedByTenantId: principal.tenantId,
        decidedAt: new Date(),
      },
    });
    if (transitioned.count !== 1) {
      this.approvalConflict('ai_approval_already_decided');
    }

    await this.auditLog.log({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'ai.approval_rejected',
      entityType: 'ai_approval',
      entityId: approval.id,
      metadata: {
        tool_name: approval.toolName,
        risk_tier: approval.riskTier,
        approval_policy: approval.approvalPolicy,
        surface: approval.surface,
      },
    });

    return {
      status: APPROVAL_STATUS.REJECTED,
      approval: this.serializeApproval({
        ...approval,
        status: APPROVAL_STATUS.REJECTED,
        decidedAt: new Date(),
      }),
    };
  }

  async expireDueApprovals(tenantId: string): Promise<number> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const result = await this.prisma.aiApprovalRequest.updateMany({
      where: {
        tenantId: scopedTenantId,
        status: APPROVAL_STATUS.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: APPROVAL_STATUS.EXPIRED,
        errorCode: 'ai_approval_expired',
      },
    });
    return result.count;
  }

  private async approvalData(principal:AiToolPrincipal,definition:AiToolDefinition,args:ValidatedAiToolArguments,inputHash:string,idempotencyKey:string,now:Date):Promise<Prisma.AiApprovalRequestUncheckedCreateInput> {
    const preview = this.registry.buildApprovalPreview(definition.name, args);
    const previewPayload = await this.handler.enrichApprovalPreview(
      definition.name,
      principal,
      args,
      preview.payload,
    );
    return {tenantId:principal.tenantId,requestedByUserId:principal.userId,requestedByTenantId:principal.tenantId,toolName:definition.name,surface:principal.surface,riskTier:definition.riskTier,approvalPolicy:definition.approvalPolicy,status:APPROVAL_STATUS.PENDING,summary:preview.summary,payloadHash:inputHash,payloadPreviewJson:asJson(previewPayload),encryptedArguments:this.encryption.encrypt(JSON.stringify(args)),idempotencyKey,createdAt:now,expiresAt:new Date(now.getTime()+APPROVAL_TTL_MS)};
  }

  /** Internal R13 atomic admission adapter. Existing registry/policy/approval
   * owns the card. This method cannot execute, approve or regenerate a bundle. */
  async admitExpenseIntakeApproval(tx:Prisma.TransactionClient,user:AuthenticatedUser,value:unknown,id:string,idempotencyKey:string,now:Date){
    const principal=this.principal(user,'telegram'),definition=this.registry.get('expenses.create');
    const args=this.registry.validateArguments(definition.name,value);
    if(typeof args.occurred_on!=='string'||!Object.prototype.hasOwnProperty.call(args,'branch_id'))throw new ConflictException('Explicit expense day and branch/null required');
    await this.policy.assertCanExecute(principal,definition);
    if(typeof args.branch_id==='string'&&!await tx.branch.findFirst({where:{id:args.branch_id,tenantId:principal.tenantId}}))throw new ForbiddenException('Exact canonical expense branch required');
    const inputHash=this.inputHash(definition.name,args,principal);
    const approval=await tx.aiApprovalRequest.create({data:{...await this.approvalData(principal,definition,args,inputHash,idempotencyKey,now),id}});
    await this.auditLog.log({tenantId:principal.tenantId,userId:principal.userId,action:'ai.approval_requested',entityType:'ai_approval',entityId:id,metadata:{tool_name:definition.name,risk_tier:definition.riskTier,approval_policy:definition.approvalPolicy,surface:principal.surface}},tx);
    return this.serializeApproval(approval);
  }

  async readExpenseIntakeApprovals(tx:Prisma.TransactionClient,user:AuthenticatedUser,ids:string[]){
    const principal=this.principal(user,'telegram');await this.policy.assertCanExecute(principal,this.registry.get('expenses.create'));
    const rows=await tx.aiApprovalRequest.findMany({where:{tenantId:principal.tenantId,requestedByUserId:principal.userId,id:{in:ids},toolName:'expenses.create',surface:'telegram'}});
    if(rows.length!==ids.length)throw new ForbiddenException('Exact expense approval bundle required');
    return Promise.all(ids.map(async id=>{const approval=rows.find(row=>row.id===id)!,invocation=await tx.aiToolExecution.findFirst({where:{tenantId:principal.tenantId,approvalRequestId:id,actorUserId:principal.userId,toolName:'expenses.create'}});if(!invocation)return{...this.serializeApproval(approval),canonical_actions:[]};const observed=await this.receipts.inspect({id:invocation.id,principal,toolName:'expenses.create',inputHash:approval.payloadHash,idempotencyKey:invocation.idempotencyKey});return{...this.serializeApproval(approval),canonical_actions:observed.executions.map(e=>({execution_id:e.id,state:e.state,action_class:e.actionClass,outcome:e.finalOutcomeCode}))};}));
  }

  private async requestApproval(
    principal: AiToolPrincipal,
    definition: AiToolDefinition,
    args: ValidatedAiToolArguments,
    inputHash: string,
    idempotencyKey: string,
  ) {
    const existing = await this.prisma.aiApprovalRequest.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: principal.tenantId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      this.assertSameApproval(existing, definition, principal, inputHash);
      if (existing.status === APPROVAL_STATUS.COMPLETED) {
        return this.replayCompletedApproval(existing);
      }
      if (
        existing.status === APPROVAL_STATUS.APPROVED ||
        existing.status === APPROVAL_STATUS.EXECUTING
      )
        return this.executeApproved(existing);
      return {
        status: 'approval_required',
        approval: this.serializeApproval(existing),
        replayed: true,
      };
    }

    const now = new Date();
    let approval: ApprovalRecord;
    try {
      approval = await this.prisma.aiApprovalRequest.create({
        data: await this.approvalData(principal,definition,args,inputHash,idempotencyKey,now),
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const raced = await this.prisma.aiApprovalRequest.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey,
          },
        },
      });
      if (!raced) {
        throw error;
      }
      this.assertSameApproval(raced, definition, principal, inputHash);
      approval = raced;
    }

    await this.auditLog.log({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'ai.approval_requested',
      entityType: 'ai_approval',
      entityId: approval.id,
      metadata: {
        tool_name: definition.name,
        risk_tier: definition.riskTier,
        approval_policy: definition.approvalPolicy,
        surface: principal.surface,
      },
    });

    return {
      status: 'approval_required',
      approval: this.serializeApproval(approval),
      replayed: false,
    };
  }

  private async executeApproved(approval: ApprovalRecord) {
    if (!approval.requestedByUserId) {
      this.approvalConflict('ai_approval_requester_unavailable');
    }
    const requester = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: approval.requestedByUserId,
          tenantId: approval.tenantId,
        },
      },
      select: {
        role: true,
        status: true,
        user: { select: { id: true, status: true } },
      },
    });
    if (
      !requester ||
      requester.status !== 'active' ||
      requester.user.status !== 'active' ||
      !this.isUserRole(requester.role)
    ) {
      this.approvalConflict('ai_approval_requester_unavailable');
    }

    const surface = this.assertSurface(approval.surface);
    const principal = this.policy.buildPrincipal(
      approval.tenantId,
      requester.user.id,
      requester.role,
      surface,
    );
    const definition = this.registry.get(approval.toolName);
    const args = this.registry.validateArguments(
      approval.toolName,
      this.parseJson(this.encryption.decrypt(approval.encryptedArguments)),
    );
    await this.policy.assertCanExecute(principal, definition);
    const inputHash = this.inputHash(definition.name, args, principal);
    if (inputHash !== approval.payloadHash) {
      this.approvalConflict('ai_approval_payload_mismatch');
    }

    return this.executeNow({
      principal,
      definition,
      args,
      inputHash,
      idempotencyKey: approval.idempotencyKey,
      approval,
    });
  }

  private async executeNow(params: {
    principal: AiToolPrincipal;
    definition: AiToolDefinition;
    args: ValidatedAiToolArguments;
    inputHash: string;
    idempotencyKey: string;
    approval: ApprovalRecord | null;
  }) {
    if (params.definition.riskTier !== 'read')
      return this.executeCanonicalTool(params);
    const existing = await this.prisma.aiToolExecution.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: params.principal.tenantId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) {
      this.assertSameExecution(existing, params);
      if (
        existing.status === EXECUTION_STATUS.COMPLETED &&
        existing.encryptedResult
      ) {
        return {
          status: EXECUTION_STATUS.COMPLETED,
          execution_id: existing.id,
          tool_name: existing.toolName,
          result: this.parseJson(
            this.encryption.decrypt(existing.encryptedResult),
          ),
          replayed: true,
        };
      }
      this.executionConflict(
        existing.status === EXECUTION_STATUS.FAILED
          ? 'ai_tool_previous_execution_failed'
          : 'ai_tool_execution_in_progress',
      );
    }

    let execution: { id: string };
    try {
      execution = await this.prisma.aiToolExecution.create({
        data: {
          tenantId: params.principal.tenantId,
          actorUserId: params.principal.userId,
          actorTenantId: params.principal.tenantId,
          approvalRequestId: params.approval?.id ?? null,
          approvalTenantId: params.approval?.tenantId ?? null,
          toolName: params.definition.name,
          surface: params.principal.surface,
          riskTier: params.definition.riskTier,
          status: EXECUTION_STATUS.EXECUTING,
          inputHash: params.inputHash,
          idempotencyKey: params.idempotencyKey,
        },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        this.executionConflict('ai_tool_execution_in_progress');
      }
      throw error;
    }

    if (params.approval) {
      const transitioned = await this.prisma.aiApprovalRequest.updateMany({
        where: {
          id: params.approval.id,
          tenantId: params.approval.tenantId,
          status: APPROVAL_STATUS.APPROVED,
        },
        data: { status: APPROVAL_STATUS.EXECUTING },
      });
      if (transitioned.count !== 1) {
        await this.prisma.aiToolExecution.update({
          where: { id: execution.id },
          data: {
            status: EXECUTION_STATUS.FAILED,
            errorCode: 'ai_approval_transition_conflict',
            completedAt: new Date(),
          },
        });
        this.approvalConflict('ai_approval_transition_conflict');
      }
    }

    await this.auditLog.log({
      tenantId: params.principal.tenantId,
      userId: params.principal.userId,
      action: 'ai.tool_execution_started',
      entityType: 'ai_tool_execution',
      entityId: execution.id,
      metadata: {
        tool_name: params.definition.name,
        risk_tier: params.definition.riskTier,
        surface: params.principal.surface,
        approval_required: Boolean(params.approval),
      },
    });

    try {
      const result = await this.withTimeout(
        this.handler.execute(
          params.definition.name,
          params.principal,
          params.args,
          params.idempotencyKey,
        ),
        params.definition.timeoutMs,
      );
      const encryptedResult = this.encryption.encrypt(JSON.stringify(result));
      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.aiToolExecution.update({
          where: { id: execution.id },
          data: {
            status: EXECUTION_STATUS.COMPLETED,
            encryptedResult,
            completedAt,
          },
        }),
        ...(params.approval
          ? [
              this.prisma.aiApprovalRequest.update({
                where: {
                  id_tenantId: {
                    id: params.approval.id,
                    tenantId: params.approval.tenantId,
                  },
                },
                data: {
                  status: APPROVAL_STATUS.COMPLETED,
                  executedAt: completedAt,
                },
              }),
            ]
          : []),
      ]);
      await this.auditLog.log({
        tenantId: params.principal.tenantId,
        userId: params.principal.userId,
        action: 'ai.tool_execution_completed',
        entityType: 'ai_tool_execution',
        entityId: execution.id,
        metadata: {
          tool_name: params.definition.name,
          risk_tier: params.definition.riskTier,
          surface: params.principal.surface,
        },
      });

      return {
        status: EXECUTION_STATUS.COMPLETED,
        execution_id: execution.id,
        tool_name: params.definition.name,
        result,
        replayed: false,
      };
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.prisma.$transaction([
        this.prisma.aiToolExecution.update({
          where: { id: execution.id },
          data: {
            status: EXECUTION_STATUS.FAILED,
            errorCode,
            completedAt: new Date(),
          },
        }),
        ...(params.approval
          ? [
              this.prisma.aiApprovalRequest.update({
                where: {
                  id_tenantId: {
                    id: params.approval.id,
                    tenantId: params.approval.tenantId,
                  },
                },
                data: { status: APPROVAL_STATUS.FAILED, errorCode },
              }),
            ]
          : []),
      ]);
      await this.auditLog.log({
        tenantId: params.principal.tenantId,
        userId: params.principal.userId,
        action: 'ai.tool_execution_failed',
        entityType: 'ai_tool_execution',
        entityId: execution.id,
        metadata: {
          tool_name: params.definition.name,
          risk_tier: params.definition.riskTier,
          surface: params.principal.surface,
          error_code: errorCode,
        },
      });
      const snapshot = await this.lastVerifiedSnapshot(params, errorCode).catch(
        () => null,
      );
      if (snapshot) {
        await this.auditLog.log({
          tenantId: params.principal.tenantId,
          userId: params.principal.userId,
          action: 'ai.tool_execution_stale_replayed',
          entityType: 'ai_tool_execution',
          entityId: execution.id,
          metadata: {
            tool_name: params.definition.name,
            risk_tier: params.definition.riskTier,
            surface: params.principal.surface,
            error_code: errorCode,
            snapshot_execution_id: snapshot.executionId,
          },
        });
        return {
          status: EXECUTION_STATUS.COMPLETED,
          execution_id: snapshot.executionId,
          tool_name: params.definition.name,
          result: snapshot.result,
          replayed: true,
          stale: true,
        };
      }
      throw error;
    }
  }

  /** Mutation handlers are initiators. Their compatibility receipt is attached
   * by canonical admission before any effect; only ActionExecution owns state. */
  private async executeCanonicalTool(params: {
    principal: AiToolPrincipal;
    definition: AiToolDefinition;
    args: ValidatedAiToolArguments;
    inputHash: string;
    idempotencyKey: string;
    approval: ApprovalRecord | null;
  }) {
    const key = {
      tenantId: params.principal.tenantId,
      idempotencyKey: params.idempotencyKey,
    };
    let execution = await this.prisma.aiToolExecution.findUnique({
      where: { tenantId_idempotencyKey: key },
    });
    const replayed = Boolean(execution);
    if (!execution) {
      try {
        execution = await this.prisma.aiToolExecution.create({
          data: {
            tenantId: params.principal.tenantId,
            actorUserId: params.principal.userId,
            actorTenantId: params.principal.tenantId,
            approvalRequestId: params.approval?.id ?? null,
            approvalTenantId: params.approval?.tenantId ?? null,
            toolName: params.definition.name,
            surface: params.principal.surface,
            riskTier: params.definition.riskTier,
            status: EXECUTION_STATUS.EXECUTING,
            inputHash: params.inputHash,
            idempotencyKey: params.idempotencyKey,
            encryptedResult: this.receipts.initial(
              params.inputHash,
              params.args,
            ),
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        execution = await this.prisma.aiToolExecution.findUnique({
          where: { tenantId_idempotencyKey: key },
        });
        if (!execution) throw error;
      }
    }
    this.assertSameExecution(execution, params);
    if (!this.receipts.read(execution.encryptedResult)) {
      // Historical completed output remains readable. An unresolved historic
      // invocation has no proven receipt and cannot authorize redispatch.
      if (
        execution.status === EXECUTION_STATUS.COMPLETED &&
        execution.encryptedResult
      )
        return {
          status: 'completed',
          execution_id: execution.id,
          tool_name: execution.toolName,
          result: this.parseJson(
            this.encryption.decrypt(execution.encryptedResult),
          ),
          replayed: true,
        };
      this.executionConflict('ai_tool_historical_receipt_unavailable');
    }
    const invocation: AiReceiptInvocation = {
      id: execution.id,
      principal: params.principal,
      toolName: params.definition.name,
      inputHash: params.inputHash,
      idempotencyKey: params.idempotencyKey,
    };
    const existing = await this.receipts.inspect(invocation);
    if (
      execution.status === EXECUTION_STATUS.FAILED &&
      existing.executions.length === 0
    )
      return {
        ...(await this.receipts.project(invocation, {
          handlerSettled: true,
          errorCode: execution.errorCode ?? undefined,
        })),
        replayed: true,
      };
    if (
      existing.executions.length > 0 &&
      existing.executions.every((item) =>
        ['SUCCEEDED', 'FAILED', 'NOT_EXECUTED'].includes(item.state),
      )
    )
      return { ...(await this.receipts.project(invocation)), replayed: true };
    if (params.approval) {
      const transitioned = await this.prisma.aiApprovalRequest.updateMany({
        where: {
          id: params.approval.id,
          tenantId: params.approval.tenantId,
          status: { in: [APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.EXECUTING] },
        },
        data: { status: APPROVAL_STATUS.EXECUTING },
      });
      if (transitioned.count !== 1)
        this.approvalConflict('ai_approval_transition_conflict');
    }
    const operation = this.receipts
      .run(invocation, (args) =>
        this.handler.execute(
          params.definition.name,
          params.principal,
          args,
          params.idempotencyKey,
        ),
      )
      .then(
        (result) =>
          this.receipts.project(invocation, {
            result,
            hasResult: true,
            handlerSettled: true,
          }),
        (error: unknown) =>
          this.receipts.project(invocation, {
            errorCode: this.errorCode(error),
            handlerSettled: true,
          }),
      );
    let result;
    try {
      // A timeout is a transport observation. The non-cancelled operation keeps
      // projecting its late canonical outcome, and cannot bury its receipt key.
      result = await this.withTimeout(operation, params.definition.timeoutMs);
    } catch (error) {
      try {
        result = await this.receipts.project(invocation, {
          errorCode: this.errorCode(error),
        });
      } catch {
        return {
          status: 'unknown',
          execution_id: execution.id,
          tool_name: params.definition.name,
          error: { code: 'ai_tool_canonical_receipt_temporarily_unavailable' },
          replayed,
        };
      }
    }
    await this.auditLog
      .log({
        tenantId: params.principal.tenantId,
        userId: params.principal.userId,
        action: `ai.tool_execution_${result.status}`,
        entityType: 'ai_tool_execution',
        entityId: execution.id,
        metadata: {
          tool_name: params.definition.name,
          surface: params.principal.surface,
        },
      })
      .catch(() => undefined);
    return { ...result, replayed };
  }

  private async lastVerifiedSnapshot(
    params: {
      principal: AiToolPrincipal;
      definition: AiToolDefinition;
      inputHash: string;
      approval: ApprovalRecord | null;
    },
    errorCode: string,
  ): Promise<{ executionId: string; result: unknown } | null> {
    if (
      params.approval ||
      params.definition.fallbackPolicy !== 'last_verified_snapshot'
    ) {
      return null;
    }
    const snapshot = await this.prisma.aiToolExecution.findFirst({
      where: {
        tenantId: params.principal.tenantId,
        actorUserId: params.principal.userId,
        toolName: params.definition.name,
        surface: params.principal.surface,
        inputHash: params.inputHash,
        status: EXECUTION_STATUS.COMPLETED,
        encryptedResult: { not: null },
        completedAt: {
          gte: new Date(Date.now() - LAST_VERIFIED_SNAPSHOT_TTL_MS),
        },
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        encryptedResult: true,
        completedAt: true,
      },
    });
    if (!snapshot?.encryptedResult || !snapshot.completedAt) {
      return null;
    }
    const decrypted = this.parseJson(
      this.encryption.decrypt(snapshot.encryptedResult),
    );
    if (
      !decrypted ||
      typeof decrypted !== 'object' ||
      Array.isArray(decrypted) ||
      (decrypted as Record<string, unknown>).verified !== true
    ) {
      return null;
    }
    return {
      executionId: snapshot.id,
      result: {
        ...(decrypted as Record<string, unknown>),
        freshness: {
          status: 'stale',
          snapshot_at: snapshot.completedAt.toISOString(),
          reason: errorCode,
        },
      },
    };
  }

  private async replayCompletedApproval(approval: ApprovalRecord) {
    const execution = await this.prisma.aiToolExecution.findUnique({
      where: {
        approvalRequestId_approvalTenantId: {
          approvalRequestId: approval.id,
          approvalTenantId: approval.tenantId,
        },
      },
    });
    if (!execution?.encryptedResult) {
      this.executionConflict('ai_tool_result_unavailable');
    }
    if (this.receipts.read(execution.encryptedResult)) {
      if (!execution.actorUserId)
        this.executionConflict('ai_tool_receipt_actor_unavailable');
      return {
        ...(await this.receipts.project({
          id: execution.id,
          principal: {
            tenantId: execution.tenantId,
            userId: execution.actorUserId,
            role: UserRole.CUSTOMER,
            surface: this.assertSurface(execution.surface),
          },
          toolName: execution.toolName,
          inputHash: execution.inputHash,
          idempotencyKey: execution.idempotencyKey,
        })),
        replayed: true,
      };
    }
    return {
      status: EXECUTION_STATUS.COMPLETED,
      execution_id: execution.id,
      tool_name: execution.toolName,
      result: this.parseJson(
        this.encryption.decrypt(execution.encryptedResult),
      ),
      replayed: true,
    };
  }

  private async findApproval(user: AuthenticatedUser, approvalId: string) {
    const tenantId = this.requireTenant(user);
    const approval = await this.prisma.aiApprovalRequest.findUnique({
      where: { id_tenantId: { id: approvalId, tenantId } },
    });
    if (!approval) {
      throw new NotFoundException({
        message: 'AI approval not found.',
        error: { code: 'ai_approval_not_found' },
      });
    }
    return approval;
  }

  private assertSameApproval(
    approval: ApprovalRecord,
    definition: AiToolDefinition,
    principal: AiToolPrincipal,
    inputHash: string,
  ): void {
    if (
      approval.toolName !== definition.name ||
      approval.requestedByUserId !== principal.userId ||
      approval.surface !== principal.surface ||
      approval.payloadHash !== inputHash
    ) {
      this.approvalConflict('ai_approval_idempotency_conflict');
    }
  }

  private assertSameExecution(
    execution: {
      toolName: string;
      actorUserId: string | null;
      surface: string;
      inputHash: string;
    },
    params: {
      principal: AiToolPrincipal;
      definition: AiToolDefinition;
      inputHash: string;
    },
  ): void {
    if (
      execution.toolName !== params.definition.name ||
      execution.actorUserId !== params.principal.userId ||
      execution.surface !== params.principal.surface ||
      execution.inputHash !== params.inputHash
    ) {
      this.executionConflict('ai_tool_idempotency_conflict');
    }
  }

  private assertPayloadHash(
    approval: ApprovalRecord,
    payloadHash: string,
  ): void {
    if (approval.payloadHash !== payloadHash.toLowerCase()) {
      this.approvalConflict('ai_approval_payload_mismatch');
    }
  }

  private assertPendingApproval(approval: ApprovalRecord): void {
    if (approval.status !== APPROVAL_STATUS.PENDING) {
      this.approvalConflict('ai_approval_already_decided');
    }
  }

  private async markExpired(approval: ApprovalRecord): Promise<void> {
    await this.prisma.aiApprovalRequest.updateMany({
      where: {
        id: approval.id,
        tenantId: approval.tenantId,
        status: APPROVAL_STATUS.PENDING,
      },
      data: {
        status: APPROVAL_STATUS.EXPIRED,
        errorCode: 'ai_approval_expired',
      },
    });
  }

  private inputHash(
    toolName: string,
    args: ValidatedAiToolArguments,
    principal: AiToolPrincipal,
  ): string {
    const canonical = this.canonicalJson({
      actor_user_id: principal.userId,
      arguments: args,
      surface: principal.surface,
      tool_name: toolName,
    });
    if (Buffer.byteLength(canonical, 'utf8') > MAX_CANONICAL_INPUT_BYTES) {
      throw new ConflictException({
        message: 'AI tool input is too large.',
        error: { code: 'ai_tool_input_too_large' },
      });
    }
    return createHash('sha256').update(canonical).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`,
        );
      return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private parseJson(value: string): unknown {
    return JSON.parse(value) as unknown;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ConflictException({
                  message: 'AI tool execution timed out.',
                  error: { code: 'ai_tool_timeout_unknown' },
                }),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (response && typeof response === 'object') {
        const payload = response as Record<string, unknown>;
        const nested = payload.error;
        if (nested && typeof nested === 'object') {
          const code = (nested as Record<string, unknown>).code;
          if (typeof code === 'string' && code.length <= 80) {
            return code;
          }
        }
      }
      return `http_${error.getStatus()}`;
    }
    return 'ai_tool_execution_failed';
  }

  private serializeApproval(approval: ApprovalRecord) {
    return {
      id: approval.id,
      tool_name: approval.toolName,
      surface: approval.surface,
      risk_tier: approval.riskTier,
      approval_policy: approval.approvalPolicy,
      status: approval.status,
      summary: approval.summary,
      payload_hash: approval.payloadHash,
      payload_preview: approval.payloadPreviewJson,
      expires_at: approval.expiresAt,
      decided_at: approval.decidedAt,
      executed_at: approval.executedAt,
      error_code: approval.errorCode,
      created_at: approval.createdAt,
      updated_at: approval.updatedAt,
    };
  }

  private principal(
    user: AuthenticatedUser,
    surface: AiToolSurface,
  ): AiToolPrincipal {
    return this.policy.buildPrincipal(
      this.requireTenant(user),
      user.userId,
      user.role,
      surface,
    );
  }

  private requireTenant(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException({
        message: 'Tenant membership is required.',
        error: { code: 'tenant_required' },
      });
    }
    return this.tenantContext.assertTenantId(user.tenantId);
  }

  private requireIdempotencyKey(value: string | undefined): string {
    if (!value) {
      throw new ConflictException({
        message: 'Idempotency key is required for this AI tool.',
        error: { code: 'ai_tool_idempotency_required' },
      });
    }
    return value;
  }

  private assertSurface(value: string): AiToolSurface {
    if (
      value === 'native' ||
      value === 'web' ||
      value === 'telegram' ||
      value === 'voice'
    ) {
      return value;
    }
    this.approvalConflict('ai_approval_surface_invalid');
  }

  private isUserRole(value: string): value is UserRole {
    return Object.values(UserRole).includes(value as UserRole);
  }

  private safeDefinition(toolName: string): AiToolDefinition | null {
    try {
      return this.registry.get(toolName);
    } catch {
      return null;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private approvalConflict(code: string): never {
    throw new ConflictException({
      message: 'AI approval cannot be completed.',
      error: { code },
    });
  }

  private executionConflict(code: string): never {
    throw new ConflictException({
      message: 'AI tool execution cannot be completed.',
      error: { code },
    });
  }
}
