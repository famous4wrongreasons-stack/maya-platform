import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MAYA_AI_TOOL_CATALOG, MayaAiToolName } from './ai-tool.catalog';
import type {
  AiToolDefinition,
  ValidatedAiToolArguments,
} from './ai-tool.types';

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

@Injectable()
export class AiToolRegistryService {
  private readonly definitions = new Map<string, AiToolDefinition>(
    MAYA_AI_TOOL_CATALOG.map((definition) => [definition.name, definition]),
  );

  list(): AiToolDefinition[] {
    return MAYA_AI_TOOL_CATALOG.map((definition) => ({ ...definition }));
  }

  get(toolName: string): AiToolDefinition {
    const definition = this.definitions.get(toolName);
    if (!definition) {
      throw new NotFoundException({
        message: 'AI tool not found.',
        error: { code: 'ai_tool_not_found' },
      });
    }
    if (definition.riskTier === 'restricted') {
      throw new NotFoundException({
        message: 'AI tool not found.',
        error: { code: 'ai_tool_not_found' },
      });
    }
    return definition;
  }

  validateArguments(
    toolName: string,
    input: unknown,
  ): ValidatedAiToolArguments {
    const args = this.assertObject(input);
    switch (toolName as MayaAiToolName) {
      case 'catalog.services.read':
      case 'appointments.own.list':
      case 'loyalty.own.read':
      case 'customers.count':
        this.assertAllowedKeys(args, []);
        return {};
      case 'analytics.employee.read':
      case 'analytics.business.read':
      case 'expenses.read':
        return this.parseDateRange(args);
      case 'appointments.own.cancel':
        this.assertAllowedKeys(args, ['appointment_id']);
        return {
          appointment_id: this.assertEntityId(
            args.appointment_id,
            'appointment_id',
          ),
        };
      case 'loyalty.internal.adjust':
        this.assertAllowedKeys(args, ['target_user_id', 'delta', 'reason']);
        return {
          target_user_id: this.assertEntityId(
            args.target_user_id,
            'target_user_id',
          ),
          delta: this.assertDelta(args.delta),
          reason: this.assertSafeReason(args.reason),
        };
      default:
        throw new NotFoundException({
          message: 'AI tool not found.',
          error: { code: 'ai_tool_not_found' },
        });
    }
  }

  buildApprovalPreview(
    toolName: string,
    args: ValidatedAiToolArguments,
  ): { summary: string; payload: Record<string, unknown> } {
    if (toolName === 'appointments.own.cancel') {
      return {
        summary: 'Cancel the selected appointment.',
        payload: {
          action: 'cancel_appointment',
          appointment_id: args.appointment_id,
        },
      };
    }
    if (toolName === 'loyalty.internal.adjust') {
      return {
        summary: 'Adjust the selected internal loyalty balance.',
        payload: {
          action: 'adjust_internal_loyalty',
          target_user_id: args.target_user_id,
          delta: args.delta,
          reason: args.reason,
        },
      };
    }
    throw new BadRequestException({
      message: 'This AI tool does not support approvals.',
      error: { code: 'ai_tool_approval_not_supported' },
    });
  }

  private parseDateRange(args: Record<string, unknown>) {
    this.assertAllowedKeys(args, ['from', 'to', 'branch_id']);
    const hasFrom = args.from !== undefined;
    const hasTo = args.to !== undefined;
    if (hasFrom !== hasTo) {
      this.invalidArguments('from and to must be provided together');
    }
    const to = hasTo ? this.parseDate(args.to, 'to') : new Date();
    const from = hasFrom
      ? this.parseDate(args.from, 'from')
      : new Date(to.getTime() - DEFAULT_RANGE_MS);
    if (
      from.getTime() > to.getTime() ||
      to.getTime() - from.getTime() > MAX_RANGE_MS
    ) {
      this.invalidArguments('date range must be ordered and at most 366 days');
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ...(args.branch_id === undefined
        ? {}
        : {
            branch_id: this.assertEntityId(args.branch_id, 'branch_id'),
          }),
    };
  }

  private assertObject(input: unknown): Record<string, unknown> {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Object.prototype
    ) {
      this.invalidArguments('arguments must be a JSON object');
    }
    return input as Record<string, unknown>;
  }

  private assertAllowedKeys(
    args: Record<string, unknown>,
    allowedKeys: string[],
  ): void {
    const unknownKey = Object.keys(args).find(
      (key) => !allowedKeys.includes(key),
    );
    if (unknownKey) {
      this.invalidArguments(`unknown argument: ${unknownKey}`);
    }
  }

  private assertEntityId(value: unknown, field: string): string {
    if (typeof value !== 'string' || !ENTITY_ID_PATTERN.test(value)) {
      this.invalidArguments(`${field} is invalid`);
    }
    return value;
  }

  private assertDelta(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value === 0 ||
      value < -1_000_000 ||
      value > 1_000_000
    ) {
      this.invalidArguments('delta must be a non-zero integer within limits');
    }
    return value;
  }

  private assertSafeReason(value: unknown): string {
    if (typeof value !== 'string') {
      this.invalidArguments('reason is required');
    }
    const reason = value.trim();
    if (reason.length < 2 || reason.length > 160) {
      this.invalidArguments('reason length must be between 2 and 160');
    }
    if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(reason)) {
      this.invalidArguments('reason must not contain email addresses');
    }
    if (/\+?\d[\d\s()-]{6,}\d/.test(reason)) {
      this.invalidArguments('reason must not contain phone numbers');
    }
    return reason;
  }

  private parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string') {
      this.invalidArguments(`${field} must be an ISO date-time`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      this.invalidArguments(`${field} must be an ISO date-time`);
    }
    return date;
  }

  private invalidArguments(message: string): never {
    throw new BadRequestException({
      message: 'AI tool arguments are invalid.',
      error: { code: 'ai_tool_arguments_invalid', detail: message },
    });
  }
}
