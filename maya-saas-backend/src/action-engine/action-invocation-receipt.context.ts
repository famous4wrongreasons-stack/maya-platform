import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActionExecution, Prisma } from '@prisma/client';
import type { TrustedActionExecutionRequestV1 } from './action-engine.contract';

/** An initiator can attach an audit/compatibility receipt at admission. It
 * cannot choose policy, execute an action, or classify its business outcome. */
export interface ActionInvocationReceiptContext {
  observe(execution: ActionExecution): Promise<void>;
  admit(
    request: TrustedActionExecutionRequestV1,
    persist: (
      request: TrustedActionExecutionRequestV1,
      transaction?: Prisma.TransactionClient,
    ) => Promise<ActionExecution>,
    transaction?: Prisma.TransactionClient,
  ): Promise<ActionExecution>;
}

const receipts = new AsyncLocalStorage<ActionInvocationReceiptContext>();

export async function attachExistingInvocationReceipt(
  execution: ActionExecution,
): Promise<void> {
  await receipts.getStore()?.observe(execution);
}

export function withActionInvocationReceipt<T>(
  context: ActionInvocationReceiptContext,
  operation: () => Promise<T>,
): Promise<T> {
  return receipts.run(context, operation);
}

export function admitWithInvocationReceipt(
  request: TrustedActionExecutionRequestV1,
  persist: (
    request: TrustedActionExecutionRequestV1,
    transaction?: Prisma.TransactionClient,
  ) => Promise<ActionExecution>,
  transaction?: Prisma.TransactionClient,
): Promise<ActionExecution> {
  const context = receipts.getStore();
  return context
    ? context.admit(request, persist, transaction)
    : persist(request, transaction);
}
