import 'reflect-metadata';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TENANT_SCOPE_KEY } from '../decorators/tenant-scoped.decorator';
import { HistoryErasureController } from './history-erasure.controller';
import { HistoryErasureOwner } from '../widgets/consent/history-erasure.owner';

describe('K12 privacy history erasure controller', () => {
  it('is a tenant-scoped private POST outside the two widget interaction routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, HistoryErasureController)).toBe(
      'privacy/conversations',
    );
    expect(
      Reflect.getMetadata(TENANT_SCOPE_KEY, HistoryErasureController),
    ).toEqual({ requireTenant: true, paramKey: undefined });
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, HistoryErasureController),
    ).toBeUndefined();
    const method: unknown = Object.getOwnPropertyDescriptor(
      HistoryErasureController.prototype,
      'erase',
    )?.value;
    if (typeof method !== 'function')
      throw new Error('privacy erasure handler must exist for metadata checks');
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(
      ':conversationId/erasure',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(200);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, method)).toBeUndefined();
  });

  it('passes the canonical current actor and exact confirmation to the one owner', async () => {
    const reply = Object.freeze({
      contract: 'maya.privacy.history-erasure/1',
      outcome: 'COMPLETED',
      requestId: 'r',
      conversationId: 'c',
      erasedAt: 'persisted',
    });
    const erase = jest.fn().mockResolvedValue(reply);
    const owner = { erase } as unknown as HistoryErasureOwner;
    const controller = new HistoryErasureController(owner);
    const actor = {
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
    } as AuthenticatedUser;
    const body = { requestId: 'request-uuid' };
    expect(await controller.erase(actor, 'conversation-uuid', body)).toBe(
      reply,
    );
    expect(erase).toHaveBeenCalledTimes(1);
    expect(erase).toHaveBeenCalledWith(actor, 'conversation-uuid', body);
  });
});
