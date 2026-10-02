import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { mergeMap } from 'rxjs/operators';
import { SelectorLifecycleService } from './selector-lifecycle.service';

/** Server response handoff. No client request member is delivery evidence. */
@Injectable()
export class SelectorDeliveryInterceptor implements NestInterceptor {
  constructor(private readonly lifecycle: SelectorLifecycleService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        const visit = async (value: unknown, depth: number): Promise<void> => {
          if (depth > 8 || typeof value !== 'object' || value === null) return;
          if (Array.isArray(value)) {
            for (const item of value) await visit(item, depth + 1);
            return;
          }
          const row = value as Record<string, unknown>;
          const integrity = row.integrity as
            Record<string, unknown> | undefined;
          if (
            (row.kind === 'SERVICE_SELECTOR' ||
              row.kind === 'STAFF_SELECTOR') &&
            typeof row.widget_id === 'string' &&
            typeof integrity?.body_hash === 'string' &&
            typeof integrity?.envelope_seal === 'string'
          )
            await this.lifecycle.delivered({
              widget_id: row.widget_id,
              body_hash: integrity!.body_hash as string,
              envelope_seal: integrity!.envelope_seal as string,
            });
          // Only the canonical response containers that carry widget envelopes.
          for (const key of [
            'resolution',
            'receipt',
            'envelope',
            'next_envelope',
            'widgets',
            'widget_resolution',
          ])
            if (Object.hasOwn(row, key)) await visit(row[key], depth + 1);
        };
        await visit(body, 0);
        return body;
      }),
    );
  }
}
